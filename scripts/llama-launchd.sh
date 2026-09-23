#!/usr/bin/env bash
# ハンズオン用 llama-server（launchd常駐）の並列数を参加人数に合わせて設定するスクリプト。
#
#   scripts/llama-launchd.sh status              現在の設定・メモリ使用量・稼働状況を表示
#   scripts/llama-launchd.sh estimate <人数>     必要メモリの見積もりだけを表示
#   scripts/llama-launchd.sh apply <人数> [--dry-run]
#       deploy/launchd/*.plist.template から plist を生成して ~/Library/LaunchAgents に配置し、
#       内容が変わったものだけ再読み込みする（既存plistは *.bak.<日時> に退避）
#
# 環境変数で上書き可能:
#   LLAMA_SERVER_BIN  llama-server のパス（既定: PATH上の llama-server）
#   MODELS_DIR        GGUFモデルの配置先（既定: $HOME/Models/llama.cpp）
#   CTX_PER_SLOT      1スロット（1人）あたりのコンテキスト長（既定: 4096）
#
# 見積もり式・係数は README「複数人ハンズオンでのサーバー容量設計」の実測値に合わせている。

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="$REPO_DIR/deploy/launchd"
AGENTS_DIR="$HOME/Library/LaunchAgents"
LLAMA_SERVER_BIN="${LLAMA_SERVER_BIN:-$(command -v llama-server || echo /opt/homebrew/bin/llama-server)}"
MODELS_DIR="${MODELS_DIR:-$HOME/Models/llama.cpp}"
CTX_PER_SLOT="${CTX_PER_SLOT:-4096}"

# ラベル:ポート。チャット用2つは参加人数に合わせて並列数を変える。
CHAT_SERVICES=("jp.co.occ.ted.llama-server:8080" "jp.co.occ.ted.llama-server-gemma3n:8081")
EMBED_SERVICE="jp.co.occ.ted.llama-server-embed:8082"

usage() {
  sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 1
}

require_number() {
  [[ "${1:-}" =~ ^[1-9][0-9]*$ ]] || { echo "参加人数は1以上の整数で指定してください: '${1:-}'" >&2; exit 1; }
}

# 必要メモリの見積もり（GiB）。README の計算式と同じ。
estimate() {
  local n="$1"
  awk -v n="$n" -v c="$CTX_PER_SLOT" -v mem="$(sysctl -n hw.memsize)" 'BEGIN {
    g4  = 5.49 + 0.24 + 0.04 * n + n * c * 0.015 / 1024
    g3n = 3.95 + 0.11 + 0.03 * n + n * c * 0.008 / 1024
    total = 5 + g4 + g3n
    physical = mem / 1024 / 1024 / 1024
    printf "参加人数 %d名（--parallel %d / --ctx-size %d）の見積もり\n", n, n, n * c
    printf "  gemma-4-E4B-it  (8080): 約 %.1f GiB\n", g4
    printf "  gemma-3n-E4B-it (8081): 約 %.1f GiB\n", g3n
    printf "  OS分を含む合計        : 約 %.1f GiB / 搭載メモリ %.0f GiB\n", total, physical
    # Metalが既定で使えるのは搭載メモリのおよそ2/3〜3/4。超える場合は警告する。
    if (total > physical * 0.9)       { print "  [NG] 搭載メモリを超える見込みです。人数かCTX_PER_SLOTを減らしてください"; exit 2 }
    else if (total > physical * 0.66) { print "  [注意] Metalの既定上限を超える可能性があります。iogpu.wired_limit_mb の引き上げを検討してください" }
    else                              { print "  [OK] 余裕を持って収まる見込みです" }
  }'
}

render() {
  local label="$1" parallel="$2" out="$3"
  sed -e "s|{{LLAMA_SERVER_BIN}}|$LLAMA_SERVER_BIN|g" \
      -e "s|{{MODELS_DIR}}|$MODELS_DIR|g" \
      -e "s|{{PARALLEL}}|$parallel|g" \
      -e "s|{{CTX_SIZE}}|$((parallel * CTX_PER_SLOT))|g" \
      "$TEMPLATE_DIR/$label.plist.template" > "$out"
  plutil -lint -s "$out"
}

check_models() {
  local missing=0 f
  for f in $(grep -ho '{{MODELS_DIR}}[^<]*' "$TEMPLATE_DIR"/*.plist.template | sort -u); do
    f="${f/\{\{MODELS_DIR\}\}/$MODELS_DIR}"
    [[ -f "$f" ]] || { echo "モデルファイルが見つかりません: $f" >&2; missing=1; }
  done
  [[ -x "$LLAMA_SERVER_BIN" ]] || { echo "llama-server が見つかりません: $LLAMA_SERVER_BIN" >&2; missing=1; }
  return "$missing"
}

wait_healthy() {
  local port="$1" i
  for ((i = 0; i < 120; i++)); do
    curl -fsS "http://127.0.0.1:$port/health" >/dev/null 2>&1 && { echo "  :$port 起動完了"; return 0; }
    sleep 1
  done
  echo "  :$port が120秒以内に応答しませんでした。/tmp/llama-server*.err.log を確認してください" >&2
  return 1
}

cmd_apply() {
  local n="$1" dry_run="$2"
  require_number "$n"
  estimate "$n" || exit $?
  check_models
  echo

  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  local tmp="$TMP_DIR"
  local entry label port parallel changed=()
  for entry in "${CHAT_SERVICES[@]}" "$EMBED_SERVICE"; do
    label="${entry%%:*}"
    render "$label" "$n" "$tmp/$label.plist"
    if cmp -s "$tmp/$label.plist" "$AGENTS_DIR/$label.plist"; then
      echo "変更なし: $label"
    else
      echo "変更あり: $label"
      [[ -f "$AGENTS_DIR/$label.plist" ]] && diff -u "$AGENTS_DIR/$label.plist" "$tmp/$label.plist" | sed 's/^/    /' || true
      changed+=("$entry")
    fi
  done

  if [[ "$dry_run" == 1 ]]; then echo; echo "--dry-run のため何も変更していません"; return; fi
  [[ ${#changed[@]} -eq 0 ]] && { echo; echo "すべて設定済みです"; return; }

  echo
  local stamp; stamp="$(date +%Y%m%d%H%M%S)"
  for entry in "${changed[@]}"; do
    label="${entry%%:*}"; port="${entry##*:}"
    [[ -f "$AGENTS_DIR/$label.plist" ]] && cp "$AGENTS_DIR/$label.plist" "$AGENTS_DIR/$label.plist.bak.$stamp"
    cp "$tmp/$label.plist" "$AGENTS_DIR/$label.plist"
    launchctl bootout "gui/$(id -u)" "$AGENTS_DIR/$label.plist" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$AGENTS_DIR/$label.plist"
    echo "再読み込み: $label"
  done
  for entry in "${changed[@]}"; do wait_healthy "${entry##*:}"; done
  echo
  cmd_status
}

cmd_status() {
  local entry label port plist pid parallel ctx rss health
  printf "%-36s %-6s %-9s %-9s %-10s %s\n" LABEL PORT PARALLEL CTX RSS HEALTH
  for entry in "${CHAT_SERVICES[@]}" "$EMBED_SERVICE"; do
    label="${entry%%:*}"; port="${entry##*:}"; plist="$AGENTS_DIR/$label.plist"
    parallel="-"; ctx="-"
    if [[ -f "$plist" ]]; then
      parallel="$(sed -n 's/.*--parallel<\/string><string>\([0-9]*\)<.*/\1/p' "$plist")"
      ctx="$(sed -n 's/.*--ctx-size<\/string><string>\([0-9]*\)<.*/\1/p' "$plist")"
    fi
    pid="$(launchctl list | awk -v l="$label" '$3 == l { print $1 }')"
    rss="-"
    [[ -n "$pid" && "$pid" != "-" ]] && rss="$(ps -o rss= -p "$pid" | awk '{ printf "%.2fGiB", $1 / 1024 / 1024 }')"
    health="$(curl -fsS -m 2 "http://127.0.0.1:$port/health" 2>/dev/null || echo down)"
    printf "%-36s %-6s %-9s %-9s %-10s %s\n" "$label" "$port" "${parallel:--}" "${ctx:--}" "$rss" "$health"
  done
}

case "${1:-}" in
  status) cmd_status ;;
  estimate) require_number "${2:-}"; estimate "$2" ;;
  apply)
    [[ -n "${2:-}" ]] || usage
    cmd_apply "$2" "$([[ "${3:-}" == "--dry-run" ]] && echo 1 || echo 0)"
    ;;
  *) usage ;;
esac

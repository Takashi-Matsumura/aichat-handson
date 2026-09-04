// 分類軸の定義。ai-usalysis-demo の src/config/categories.ts を無改造で移植したもの。
// 本家はDBの category_options テーブルから動的取得するが、このハンズオン版はDBを持たないため
// この定数を分類軸の唯一の真実として直接参照する（管理画面での編集機能は持たない）。

export const BUSINESS_CATEGORIES = [
  "営業", "総務", "人事", "経理", "法務", "開発",
  "情報システム", "品質管理", "教育", "経営管理", "顧客対応", "その他",
] as const;

export const USAGE_PURPOSES = [
  "文章作成", "文章改善", "要約", "翻訳", "情報検索", "アイデア出し",
  "プログラミング", "データ分析", "資料作成", "問い合わせ対応", "意思決定支援", "その他",
] as const;

export const TASK_TYPES = [
  "質問応答", "文書生成", "文書要約", "翻訳", "コード生成", "データ分析", "アイデア出し", "その他",
] as const;

export const IMPROVEMENT_TYPES = [
  "時間短縮", "品質向上", "属人化解消", "知識共有", "判断支援", "自動化候補", "RAG候補", "教育候補",
] as const;

export const SENSITIVITY_LEVELS = [
  "公開可能", "社内限定", "機密情報を含む可能性あり", "個人情報を含む可能性あり", "保存禁止の可能性あり", "判定不能",
] as const;

export const AUTOMATION_POTENTIALS = ["高", "中", "低", "対象外", "判定不能"] as const;

export const CLASSIFICATION_DIMENSIONS = {
  business_category: BUSINESS_CATEGORIES,
  usage_purpose: USAGE_PURPOSES,
  task_type: TASK_TYPES,
  improvement_type: IMPROVEMENT_TYPES,
  sensitivity_level: SENSITIVITY_LEVELS,
  automation_potential: AUTOMATION_POTENTIALS,
} as const;

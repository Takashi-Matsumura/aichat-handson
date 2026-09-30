import type { NextConfig } from "next";

// 全レスポンスに付けるセキュリティヘッダー。
// CSPは他サイトへの埋め込み(クリックジャッキング)禁止の frame-ancestors だけにとどめる。
// script-src 等まで絞ると、KaTeX のインラインスタイルや Next.js のインラインスクリプトに
// nonce 対応が必要になり、表示を壊すおそれがあるため。
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: { "/agent-skill.md": ["./docs/connect/agent-skill.md"] },
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/demo/api/:path*", destination: "/api/gongzhi/demo-rejected" },
        { source: "/zh", destination: "/community/zh/index.html" },
        { source: "/zh/board", destination: "/community/zh/board/index.html" },
        { source: "/zh/connect", destination: "/community/zh/connect/index.html" },
      ],
      afterFiles: [], fallback: [],
    };
  },
};
export default config;

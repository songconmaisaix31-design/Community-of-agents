import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/demo/api/:path*", destination: "/api/gongzhi/demo-rejected" },
        { source: "/zh", destination: "/community/zh/index.html" },
      ],
      afterFiles: [], fallback: [],
    };
  },
};
export default config;

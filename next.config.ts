import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/demo/api/:path*", destination: "/api/gongzhi/demo-rejected" },
        { source: "/", destination: "/hugo/index.html" },
        { source: "/demo/space", destination: "/hugo/demo/space/index.html" },
        { source: "/network", destination: "/hugo/network/index.html" },
      ],
      afterFiles: [], fallback: [],
    };
  },
};
export default config;

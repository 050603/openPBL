import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@openmaic/dsl",
    "@openmaic/importer",
    "@openmaic/renderer",
    "mathml2omml",
    "pptxgenjs",
  ],
  serverExternalPackages: [
    "sharp",
    "unpdf",
    "undici",
    "jszip",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
  ],
  // OpenMAIC 原版客户端调用 /api/generate/* 路径，openPBL 把路由迁移到了 /api/openmaic/generate/*。
  // 通过 rewrite 保持原版客户端代码无需改动即可工作。
  async rewrites() {
    return [
      {
        source: "/api/generate/:path*",
        destination: "/api/openmaic/generate/:path*",
      },
      {
        source: "/api/classroom",
        destination: "/api/openmaic/classroom",
      },
      {
        source: "/api/classroom-media/:path*",
        destination: "/api/openmaic/classroom-media/:path*",
      },
      {
        source: "/logos/:path*",
        destination: "/openmaic/logos/:path*",
      },
      {
        source: "/avatars/:path*",
        destination: "/openmaic/avatars/:path*",
      },
      {
        source: "/logo-horizontal.png",
        destination: "/openmaic/logo-horizontal.png",
      },
      {
        source: "/openmaic-mark.png",
        destination: "/openmaic/openmaic-mark.png",
      },
    ];
  },
};

export default nextConfig;

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
  async rewrites() {
    return [
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

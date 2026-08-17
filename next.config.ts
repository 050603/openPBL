import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local production commands set NEXT_DIST_DIR=.next-build so `next build`
  // cannot remove chunks owned by a concurrently running `.next/dev` server.
  // Containers explicitly keep `.next` because their copy paths use it.
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  // Uploads live on a runtime volume and must never be copied into the
  // standalone image. Node file tracing cannot infer this from a dynamic
  // stored filename, so keep project/runtime data out of these route traces.
  outputFileTracingExcludes: {
    "/api/uploads": [
      "./.openpbl-data/**/*",
      "./coverage/**/*",
      "./deploy/**/*",
      "./docs/**/*",
      "./e2e/**/*",
      "./output/**/*",
      "./packages/**/*",
      "./public/**/*",
      "./src/**/*",
      "./tests/**/*",
      "./*.md",
      "./*.ts",
      "./*.yml",
      "./*.yaml",
    ],
    "/api/uploads/[id]": [
      "./.openpbl-data/**/*",
      "./coverage/**/*",
      "./deploy/**/*",
      "./docs/**/*",
      "./e2e/**/*",
      "./output/**/*",
      "./packages/**/*",
      "./public/**/*",
      "./src/**/*",
      "./tests/**/*",
      "./*.md",
      "./*.ts",
      "./*.yml",
      "./*.yaml",
    ],
  },
  // Interactive Python scenes load these executable assets through a
  // same-origin route. They are read with fs at request time, so explicitly
  // retain them in the standalone image.
  outputFileTracingIncludes: {
    "/api/openmaic/interactive-runtime/*": [
      "./node_modules/codemirror/**/*",
      "./node_modules/katex/dist/**/*",
      "./node_modules/pyodide/**/*",
    ],
  },
  // Stage 9: standalone output for minimal Docker images.
  // Produces `.next/standalone` with only the files needed to run the
  // production server (no `node_modules` install required at runtime).
  output: "standalone",
  // dev 模式下关闭 React Strict Mode。PixiStage 的 useEffect 会加载 PIXI
  // v8 的 Assets.load（模块级单例 cache），StrictMode 的双 mount 会污染
  // cache 状态导致 Promise.all 永久挂起，伴学工作室卡在 0%。
  // 生产环境本来就只 mount 一次，关闭 StrictMode 不影响生产行为。
  reactStrictMode: true,
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
    "pino",
    "pino-pretty",
    "prom-client",
    "redis",
    "ws",
  ],
  images: {
    // Prefer AVIF, fall back to WebP for browsers that don't support AVIF.
    formats: ["image/avif", "image/webp"],
    // Cache optimized images for up to 24 hours on the server.
    minimumCacheTTL: 86400,
  },
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
  async headers() {
    return [
      {
        // Expose the request id on every response so clients can correlate
        // logs with a request. The static placeholder here guarantees the
        // header is always present; per-request UUIDs are stamped by route
        // handlers via `setRequestContext` / middleware (when present), and
        // any value set on the Response by a handler overrides this default.
        source: "/:path*",
        headers: [
          {
            key: "X-Request-Id",
            value: "unset",
          },
          // ---- Security headers (Stage 3 API hardening) ----
          // HSTS: enforce HTTPS for 1 year, include subdomains, preload-ready.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          // Prevent MIME-type sniffing.
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Disallow framing of the app (clickjacking protection). The
          // OpenMAIC interactive iframe content is served from the same
          // origin via `srcdoc`/blob URLs and is not affected.
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // Control referrer information sent on outbound navigations.
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Permissions policy: disable camera/microphone/geolocation by
          // default. Individual pages can re-enable via the Permissions-Policy
          // header if needed.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
          // Content Security Policy. Allows same-origin scripts/styles,
          // inline styles (Tailwind / styled-components need this), data:
          // images, and https: media. `connect-src` includes ws:/wss: so the
          // realtime WebSocket (Stage 4) can connect.
          // `worker-src` 允许 blob: —— PIXI v8 的 WorkerManager 用
          // URL.createObjectURL(new Blob(...)) 创建图片解码 worker，
          // 禁止 blob: worker 会导致 Assets.load 永久挂起。
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              process.env.NODE_ENV === "development"
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "media-src 'self' data: blob: https:",
              "font-src 'self' data:",
              process.env.NODE_ENV === "development"
                ? "connect-src 'self' https: ws: wss:"
                : "connect-src 'self' wss:",
              "frame-src 'self' blob: data:",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stage 9: standalone output for minimal Docker images.
  // Produces `.next/standalone` with only the files needed to run the
  // production server (no `node_modules` install required at runtime).
  output: "standalone",
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
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Content Security Policy. Allows same-origin scripts/styles,
          // inline styles (Tailwind / styled-components need this), data:
          // images, and https: media. `connect-src` includes ws:/wss: so the
          // realtime WebSocket (Stage 4) can connect.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "media-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https: ws: wss:",
              "frame-src 'self' blob: data:",
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

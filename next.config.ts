import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @napi-rs/canvas 는 네이티브 .node 바이너리 — 번들링하면 런타임 로드 실패(285)
  serverExternalPackages: ["@napi-rs/canvas"],
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;

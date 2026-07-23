import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Código del deploy visible junto al logo (pedido del usuario 2026-07-23):
    // en Vercel es el commit del build — verificable contra git; local = "local".
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
  },
};

export default nextConfig;

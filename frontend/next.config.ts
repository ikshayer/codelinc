import type { NextConfig } from "next";

const engineUrl = process.env.CAREWINDOW_ENGINE_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Same-origin proxy to the deterministic CareWindow engine (backend `npm run serve`).
  async rewrites() {
    return [{ source: "/api/engine/:path*", destination: `${engineUrl}/api/:path*` }];
  },
};

export default nextConfig;

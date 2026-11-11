import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Application styles are plain CSS; Webpack keeps local builds stable on Windows. */
  experimental: { cpus: 1 },
};

export default nextConfig;

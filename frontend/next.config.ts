import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Allow an isolated verification build while the development server is open.
  distDir: process.env.CNC_BUILD_DIR || ".next",
};

export default nextConfig;

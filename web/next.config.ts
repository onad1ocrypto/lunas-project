import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // allow the sandbox preview host to load dev resources (HMR etc.)
  allowedDevOrigins: ["*.e2b.app", "*.e2b.dev"],
  devIndicators: false,
};

export default nextConfig;

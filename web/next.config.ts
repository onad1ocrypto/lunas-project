import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/* Build stamp: proves which commit a deployed bundle came from (footer shows it).
   tools/deploy.sh injects the exact sha as a Vercel project env var before deploying. */
let BUILD_SHA = process.env.BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "";
if (!BUILD_SHA) {
  try {
    BUILD_SHA = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    BUILD_SHA = "dev";
  }
}
BUILD_SHA = BUILD_SHA.slice(0, 7);

const nextConfig: NextConfig = {
  // allow the sandbox preview host to load dev resources (HMR etc.)
  allowedDevOrigins: ["*.e2b.app", "*.e2b.dev"],
  devIndicators: false,
  env: { BUILD_SHA },
};

export default nextConfig;

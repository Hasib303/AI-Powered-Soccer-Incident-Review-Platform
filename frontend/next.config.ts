import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained Node.js server bundle into `.next/standalone`.
  // The Docker image copies that directory and runs `node server.js`,
  // which keeps the final image small (no node_modules in the runner stage).
  output: "standalone",
};

export default nextConfig;

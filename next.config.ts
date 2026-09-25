import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: { unoptimized: true },
  typedRoutes: false,
  // ssh2 is Node-only (native optional deps, streams); keep it external so the standalone server requires it at runtime
  serverExternalPackages: ["ssh2"],
};

export default nextConfig;

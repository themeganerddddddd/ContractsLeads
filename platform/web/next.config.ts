import type { NextConfig } from "next";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.VERCEL) {
  config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  turbopack: { root: path.resolve(process.cwd(), "..") },
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;

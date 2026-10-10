import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native Node addons: loaded with Node's require at runtime, never bundled.
  serverExternalPackages: ["@contentauth/c2pa-node", "@dynamic-labs-wallet/node", "@dynamic-labs-wallet/node-evm", "onnxruntime-node", "pg", "sharp"],
};

export default nextConfig;

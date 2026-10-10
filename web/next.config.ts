import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No on-screen dev badge (for recording the demo on localhost); real errors still show their overlay.
  devIndicators: false,
  // Native Node addons: loaded with Node's require at runtime, never bundled.
  serverExternalPackages: ["@contentauth/c2pa-node", "@dynamic-labs-wallet/node", "@dynamic-labs-wallet/node-evm", "onnxruntime-node", "pg", "sharp"],
  // The photo check's native ONNX runtime: the tracer copies the .node binding but not the shared
  // library it links (libonnxruntime.so.1), so ship the Linux x64 folder with that route, and leave
  // out the other platforms' binaries.
  outputFileTracingIncludes: {
    "/api/captures/verify": ["./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v*/linux/x64/**/*"],
  },
  outputFileTracingExcludes: {
    "/api/captures/verify": [
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v*/darwin/**/*",
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v*/win32/**/*",
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v*/linux/arm64/**/*",
    ],
  },
};

export default nextConfig;

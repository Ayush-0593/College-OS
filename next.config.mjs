/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Exclude uploaded files from the server bundle trace so the .next/
  // build doesn't try to fingerprint large user files.
  outputFileTracingExcludes: {
    "*": ["./uploads/**"],
  },
  experimental: {
    // Keep these out of the webpack bundle. They ship their own JS, WASM,
    // or native bindings, and webpack mangles them:
    //   - webpack-bundled pdf-parse v1.10.100 throws "bad XRef entry"
    //     on PDFs the same library parses fine in plain Node
    //   - webpack-bundled onnxruntime-node loses the path to its
    //     native .node binding and errors with
    //     "Cannot find module .../onnxruntime_binding.node"
    // Letting Next require() them at runtime uses Node's resolver and
    // matches plain-Node behavior.
    //
    // Note: in Next.js 14 the top-level `serverExternalPackages` is
    // silently ignored -- only `experimental.serverComponentsExternalPackages`
    // is wired into the externals list (see
    // node_modules/next/dist/build/webpack-config.js, the
    // `optOutBundlingPackages` constant). In Next 15+ the top-level
    // name is the one to use.
    serverComponentsExternalPackages: [
      "pdf-parse",
      "tesseract.js",
      // @xenova/transformers pulls in onnxruntime-node, which ships
      // platform-specific native bindings; both must be external.
      "@xenova/transformers",
      "onnxruntime-node",
    ],
  },
};

export default nextConfig;

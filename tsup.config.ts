import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // React is a peer. Bundling it would give the host two Reacts and the
  // provider's context would never reach a component.
  external: ["react", "react/jsx-runtime"],
  treeshake: true,
});

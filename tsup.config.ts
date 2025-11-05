import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: true,               // emits dist/index.d.ts
  format: ["esm", "cjs"],  // emits dist/index.js and dist/index.cjs
  sourcemap: true,
  splitting: false,
  clean: true,
  outDir: "dist"
});
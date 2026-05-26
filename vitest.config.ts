import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.{test,spec}.{js,mjs,ts,mts}"],
    coverage: {
      reporter: ["text", "html"],
      include: ["module/**/*.{js,mjs,ts,mts}"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "module"),
    },
  },
});

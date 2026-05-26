import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "node:path";

/**
 * Vite build configuration for the Aster Foundry VTT system.
 *
 * Layout:
 *   - Source entry:   module/aster.mjs  (imports ./style.scss bridge)
 *   - SCSS bridge:    module/style.ts   (re-exports scss/aster.scss so Vite emits CSS)
 *   - Output root:    dist/
 *
 * Symlink `Data/systems/aster` -> `<repo>/dist` so Foundry sees a live build.
 */
export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    root: ".",
    base: "./",

    publicDir: false,

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "module"),
      },
    },

    css: {
      devSourcemap: true,
    },

    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: isDev ? "inline" : true,
      minify: isDev ? false : "esbuild",
      target: "es2022",
      cssCodeSplit: false,

      lib: {
        entry: path.resolve(__dirname, "module/aster.mjs"),
        formats: ["es"],
        fileName: () => "module/aster.mjs",
      },

      rollupOptions: {
        output: {
          assetFileNames: (assetInfo) => {
            const name = assetInfo.name ?? "";
            if (name.endsWith(".css")) return "aster.css";
            return "assets/[name][extname]";
          },
        },
      },
    },

    plugins: [
      viteStaticCopy({
        targets: [
          { src: "system.json", dest: "." },
          { src: "template.json", dest: "." },
          { src: "LICENSE.txt", dest: "." },
          { src: "CHANGELOG.md", dest: "." },
          // src에 디렉터리를 통째로 지정하면 dest 아래에 한 단계만 복사됩니다.
          { src: "templates", dest: "." },
          { src: "lang", dest: "." },
          { src: "lib", dest: "." },
        ],
      }),
    ],
  };
});

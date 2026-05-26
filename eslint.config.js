// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier";

/**
 * Flat ESLint config.
 * - Base JS rules
 * - TS rules (only on .ts/.mts)
 * - Foundry browser globals
 * - Prettier compatibility (turns off stylistic rules that conflict)
 */
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "foundry/**", "css/**", "lib/**", "coverage/**"],
  },

  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        // Foundry VTT globals (V13). fvtt-types provides full typing, but
        // ESLint still needs these declared as known runtime globals so
        // no-undef doesn't fire on plain .mjs files.
        foundry: "readonly",
        game: "readonly",
        ui: "readonly",
        canvas: "readonly",
        CONFIG: "readonly",
        CONST: "readonly",
        Hooks: "readonly",
        Roll: "readonly",
        ChatMessage: "readonly",
        Macro: "readonly",
        Item: "readonly",
        Actor: "readonly",
        Actors: "readonly",
        Items: "readonly",
        ActorSheet: "readonly",
        ItemSheet: "readonly",
        Handlebars: "readonly",
        loadTemplates: "readonly",
        renderTemplate: "readonly",
        mergeObject: "readonly",
        duplicate: "readonly",
        DEFAULT_TOKEN: "readonly",
        $: "readonly",
        jQuery: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      eqeqeq: ["error", "smart"],
      "prefer-const": "warn",
      "no-var": "error",
    },
  },

  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.{ts,mts,cts}"],
  })),

  {
    files: ["**/*.{ts,mts,cts}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-unused-vars": "off",
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },

  {
    files: ["tools/**/*", "*.config.{js,ts,mjs,mts}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off",
    },
  },

  prettier,
);

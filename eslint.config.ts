// eslint.config.js (ESLint v9 flat config)
import globals from "globals";
import tseslint from "typescript-eslint";

// Top-level ignore applies to everything (JS in dist, etc.)
export default [
  {
    ignores: ["dist/**", "node_modules/**", "example/**", "__tests__/**", "coverage/**"],
  },

  // TypeScript ESLint recommended presets
  ...tseslint.configs.recommended,

  // Your project-specific tweaks
  {
    files: ["**/*.{ts,mts,cts}"],
    // If this is a Node project, use node globals. For browser libs, use globals.browser.
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
      // (Optional) parserOptions if you need them:
      // parserOptions: { project: false },
    },
    rules: {
      // your rules here
    },
  },
];
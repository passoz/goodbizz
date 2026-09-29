import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", "drizzle/", "node_modules/", "coverage/", "estudo*/", "*.config.js"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "no-console": "off",
    },
  },
  {
    files: ["**/*.test.ts", "tests/**/*.ts", "benches/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);

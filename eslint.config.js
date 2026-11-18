import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const platformAgnostic = [
  "packages/protocol/**/*.ts",
  "packages/core/**/*.ts",
  "packages/agent/**/*.ts",
  "packages/storage-memory/**/*.ts",
  "packages/storage-sqlite/**/*.ts",
  "packages/telemetry/**/*.ts",
];

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "coverage/**", ".turbo/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: platformAgnostic,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "node:*",
                "react-native",
                "react-native/*",
                "fs",
                "path",
                "better-sqlite3",
                "cactus-react-native",
                "@larkx/cactus",
                "@larkx/cactus/*",
                "expo",
                "expo/*",
              ],
              message:
                "Platform-independent LarkX packages cannot import Node, filesystem, React Native, or a model provider.",
            },
          ],
        },
      ],
    },
  },
);

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `_name` marks a value left out on purpose (rest destructuring, unused tuple slots)
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      // Images are GitHub avatars already asked for at the size shown (sizedAvatar) or
      // player uploads stored as data URLs: next/image would only send them through
      // Vercel's (billed) image optimizer for no gain.
      "@next/next/no-img-element": "off",
    },
  },
  {
    // Plain Node scripts (CommonJS), run with `node scripts/<name>.js`
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

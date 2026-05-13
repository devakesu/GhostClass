import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginNext from "@next/eslint-plugin-next";
import globals from "globals";

import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  {
    ignores: [".next/*", "node_modules/*", "lint-staged.config.js", "public/sw.js", "Temp/*", "mobile/*"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended, // Injects security rules
  sonarjs.configs.recommended,  // Injects complexity/quality rules
  {
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    plugins: {
      "@next/next": pluginNext,
      "react-hooks": pluginReactHooks,
      "unused-imports": unusedImports // Registers unused-imports plugin
    },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
      
      // QUALITY & SECURITY LOCKDOWN
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      
      // DEAD CODE REMOVAL
      "no-unused-vars": "off", // Handled by unused-imports
      "@typescript-eslint/no-unused-vars": "warn",
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": [
        "warn",
        { "vars": "all", "varsIgnorePattern": "^_", "args": "after-used", "argsIgnorePattern": "^_" }
      ],
      
      // SONARJS TWEAKS
      "sonarjs/cognitive-complexity": ["warn", 15],
      "sonarjs/assertions-in-tests": "warn",
      "sonarjs/no-clear-text-protocols": "warn",
      "sonarjs/slow-regex": "warn",
      "sonarjs/no-nested-functions": "warn",
      "sonarjs/regex-complexity": "warn",
      "sonarjs/concise-regex": "warn",
      "sonarjs/prefer-single-boolean-return": "warn",
      "sonarjs/no-commented-code": "warn",
      "sonarjs/no-dead-store": "warn",
      "sonarjs/no-exclusive-tests": "warn",
      "sonarjs/no-globals-shadowing": "warn",
      "sonarjs/no-hardcoded-ip": "warn",
      "sonarjs/no-identical-functions": "warn",
      "sonarjs/no-ignored-exceptions": "warn",
      "sonarjs/no-nested-conditional": "warn",
      "sonarjs/no-nested-template-literals": "warn",
      "sonarjs/no-redundant-assignments": "warn",
      "sonarjs/no-unenclosed-multiline-block": "warn",
      "sonarjs/no-unused-collection": "warn",
      "sonarjs/no-unused-vars": "warn",
      "sonarjs/pseudo-random": "warn",
      "sonarjs/public-static-readonly": "warn",
      "sonarjs/table-header": "warn",
      "sonarjs/unused-import": "warn",
      "sonarjs/use-type-alias": "warn",
      "sonarjs/void-use": "warn"
    },
    settings: {
      react: {
        version: "detect"
      }
    }
  },
  // --- FIX FOR SCRIPTS ---
  {
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
      "no-console": "off",
      "security/detect-non-literal-require": "off", // Usually safe in build scripts
      "security/detect-non-literal-fs-filename": "off" 
    }
  },
  // --- TEST FILE AUDIT SETTINGS ---
  {
    files: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
    rules: {
      // RELAX: Tests often have similar structures for different cases
      "sonarjs/no-identical-functions": "off", 
      "sonarjs/no-clear-text-protocols": "off",
      "sonarjs/no-hardcoded-ip": "off",
      
      // TIGHTEN: Ensure tests are actually testing something
      "sonarjs/assertions-in-tests": "error",
      "sonarjs/no-exclusive-tests": "error", // Prevents pushing 'it.only' or 'describe.only'
      
      // RELAX: Tests often use 'any' for quick mocking
      "@typescript-eslint/no-explicit-any": "off",
      
      // SECURITY: Ensure no real secrets are being used in mocks
      "security/detect-no-csrf-before-method": "off",
      "security/detect-object-injection": "off",
      
      // RELAX: Structural test nesting and inline aliases
      "sonarjs/no-nested-functions": "off",
      "sonarjs/use-type-alias": "off"
    }
  }
];
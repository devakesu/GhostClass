module.exports = {
  // 1. Type Check: Runs on the whole project (function form = ignore file args, run once)
  '**/*.{ts,tsx}': () => 'node node_modules/typescript/bin/tsc --noEmit',

  // 2. Linting: Runs on the whole project (function form = ignore file args, run once)
  '**/*.{js,jsx,ts,tsx}': () => {
    return 'node node_modules/eslint/bin/eslint.js . --fix';
  },
};
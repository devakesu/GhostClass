const fs = require("node:fs");

function getTscCommand() {
  if (fs.existsSync("node_modules/typescript/bin/tsc6")) {
    return "node node_modules/typescript/bin/tsc6 --noEmit";
  }
  if (fs.existsSync("node_modules/typescript/bin/tsc")) {
    return "node node_modules/typescript/bin/tsc --noEmit";
  }
  return "tsc --noEmit";
}

module.exports = {
  // 1. Type Check: Runs on the whole project (function form = ignore file args, run once)
  "**/*.{ts,tsx}": () => getTscCommand(),

  // 2. Linting: Runs on the whole project (function form = ignore file args, run once)
  "**/*.{js,jsx,ts,tsx}": () => {
    return "node node_modules/eslint/bin/eslint.js . --fix";
  },
};


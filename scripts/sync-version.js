const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// 1. Determine running mode and target version
const isPreCommit = process.argv.includes("--pre-commit");
let targetVersion = process.env.NEXT_PUBLIC_APP_VERSION;

if (!targetVersion && !isPreCommit && process.argv[2]) {
  targetVersion = process.argv[2];
}

// Pre-commit hook mode: automatically derive target version from package.json
const packageJsonPath = path.join(__dirname, "..", "package.json");
if (isPreCommit) {
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    targetVersion = packageJson.version;
  } else {
    console.log(
      " Husky Pre-commit: package.json not found. Skipping version sync.",
    );
    process.exit(0);
  }
}

// Fail-fast validation: ensure targetVersion is present and is a valid semver string
if (!targetVersion) {
  console.error(
    "❌ Error: Target version is missing. Please set NEXT_PUBLIC_APP_VERSION, provide a target version CLI argument, or run in --pre-commit mode.",
  );
  process.exit(1);
}

const semverRegex = /^\d+\.\d+\.\d+$/;
if (!semverRegex.test(targetVersion)) {
  console.error(
    `❌ Error: Invalid version format "${targetVersion}". Version must be a valid major.minor.patch semver string (e.g., "1.2.3").`,
  );
  process.exit(1);
}

console.log(`🚀 Syncing repository files to version v${targetVersion}...`);

const updatedFiles = [];

// Helper to write file and track changes
function updateFile(filePath, modifier) {
  if (fs.existsSync(filePath)) {
    const original = fs.readFileSync(filePath, "utf8");
    const modified = modifier(original);
    if (original !== modified) {
      fs.writeFileSync(filePath, modified);
      updatedFiles.push(filePath);
      console.log(`✓ Updated ${path.basename(filePath)}`);
    }
  }
}

// 1. Update package.json
updateFile(packageJsonPath, (content) => {
  const json = JSON.parse(content);
  json.version = targetVersion;
  return JSON.stringify(json, null, 2) + "\n";
});

// 2. Update package-lock.json
const packageLockPath = path.join(__dirname, "..", "package-lock.json");
updateFile(packageLockPath, (content) => {
  const json = JSON.parse(content);
  json.version = targetVersion;
  if (json.packages && json.packages[""]) {
    json.packages[""].version = targetVersion;
  }
  return JSON.stringify(json, null, 2) + "\n";
});

// 3. Update public/openapi/openapi.yaml
const openApiPath = path.join(
  __dirname,
  "..",
  "public",
  "openapi",
  "openapi.yaml",
);
updateFile(openApiPath, (content) => {
  return content.replace(
    /^ {2}version:\s*\d+\.\d+\.\d+/m,
    `  version: ${targetVersion}`,
  );
});

// 4. Update mobile/pubspec.yaml
const pubspecPath = path.join(__dirname, "..", "mobile", "pubspec.yaml");
updateFile(pubspecPath, (content) => {
  return content.replace(
    /^version:\s*\d+\.\d+\.\d+\+\d+/m,
    `version: ${targetVersion}+1`,
  );
});

// 6. Update environment files
[".example.env", ".env", ".env.local"].forEach((file) => {
  const filePath = path.join(__dirname, "..", file);
  updateFile(filePath, (content) => {
    const res = content.replace(
      /^(NEXT_PUBLIC_APP_VERSION=)\d+\.\d+\.\d+/gm,
      `$1${targetVersion}`,
    );
    return res.replace(
      /^(MIN_APP_VERSION=)\d+\.\d+\.\d+/gm,
      `$1${targetVersion}`,
    );
  });
});

// 7. Update mobile/lib/config/app_config.dart
const appConfigPath = path.join(
  __dirname,
  "..",
  "mobile",
  "lib",
  "config",
  "app_config.dart",
);
updateFile(appConfigPath, (content) => {
  return content.replace(
    /('APP_VERSION',\s*defaultValue:\s*')\d+\.\d+\.\d+(')/g,
    `$1${targetVersion}$2`,
  );
});

// In pre-commit mode, stage all updated files automatically
if (isPreCommit && updatedFiles.length > 0) {
  console.log(
    "🚀 Husky Pre-commit: Staging auto-synchronized version files...",
  );
  updatedFiles.forEach((file) => {
    try {
      /* eslint-disable-next-line */
      execFileSync("git", ["add", file]);
      console.log(`✓ Staged ${path.basename(file)}`);
    } catch {
      console.error(`❌ Failed to stage ${path.basename(file)}`);
    }
  });
}

console.log(`🎉 Version sync complete!`);

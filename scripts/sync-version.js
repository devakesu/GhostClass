const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// 1. Determine running mode and target version
let isPreCommit = process.argv.includes('--pre-commit');
let targetVersion = process.env.NEXT_PUBLIC_APP_VERSION;

if (!targetVersion && !isPreCommit && process.argv[2]) {
  targetVersion = process.argv[2];
}

// Helper to find the latest git tag
function getLatestGitTag() {
  try {
    /* eslint-disable-next-line */
    const output = execFileSync('git', ['tag', '--sort=-version:refname'], { encoding: 'utf8' });
    const tag = output.trim().split('\n')[0];
    return tag || null;
  } catch {
    return null;
  }
}

// Pre-commit hook mode: automatically derive target version from the latest git tag
if (isPreCommit) {
  const latestTag = getLatestGitTag();
  if (!latestTag) {
    console.log(' Husky Pre-commit: No Git tag found. Skipping version sync.');
    process.exit(0);
  }
  
  // Extract version from tag (e.g. v4.2.7 -> 4.2.7)
  targetVersion = latestTag.replace(/^v/, '').trim();
}

if (!targetVersion) {
  console.log('No target version resolved. Please set NEXT_PUBLIC_APP_VERSION, create a git tag, or pass version as argument.');
  process.exit(0);
}

// Clean and validate target version
targetVersion = targetVersion.replace(/^v/, '').trim();
const semverPattern = /^\d+\.\d+\.\d+$/;
if (!semverPattern.test(targetVersion)) {
  console.error(`Invalid version format: "${targetVersion}". Expected X.Y.Z (e.g. 4.2.7)`);
  process.exit(1);
}

// Read current package.json version to check if sync is needed
const packageJsonPath = path.join(__dirname, '..', 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (isPreCommit && packageJson.version === targetVersion) {
    // Already in sync, exit cleanly without touching files
    console.log(` Husky Pre-commit: Repository is already in sync with tag v${targetVersion}.`);
    process.exit(0);
  }
}

console.log(`🚀 Syncing repository files to version v${targetVersion}...`);

const updatedFiles = [];

// Helper to write file and track changes
function updateFile(filePath, modifier) {
  if (fs.existsSync(filePath)) {
    const original = fs.readFileSync(filePath, 'utf8');
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
  return JSON.stringify(json, null, 2) + '\n';
});

// 2. Update package-lock.json
const packageLockPath = path.join(__dirname, '..', 'package-lock.json');
updateFile(packageLockPath, (content) => {
  const json = JSON.parse(content);
  json.version = targetVersion;
  if (json.packages && json.packages['']) {
    json.packages[''].version = targetVersion;
  }
  return JSON.stringify(json, null, 2) + '\n';
});

// 3. Update public/openapi/openapi.yaml
const openApiPath = path.join(__dirname, '..', 'public', 'openapi', 'openapi.yaml');
updateFile(openApiPath, (content) => {
  return content.replace(/^ {2}version:\s*\d+\.\d+\.\d+/m, `  version: ${targetVersion}`);
});

// 4. Update mobile/pubspec.yaml
const pubspecPath = path.join(__dirname, '..', 'mobile', 'pubspec.yaml');
updateFile(pubspecPath, (content) => {
  return content.replace(/^version:\s*\d+\.\d+\.\d+\+\d+/m, `version: ${targetVersion}+1`);
});

// 6. Update environment files
['.example.env', '.env', '.env.local'].forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  updateFile(filePath, (content) => {
    let res = content.replace(
      /^(NEXT_PUBLIC_APP_VERSION=)\d+\.\d+\.\d+/gm,
      `$1${targetVersion}`
    );
    return res.replace(
      /^(NEXT_PUBLIC_MIN_APP_VERSION=)\d+\.\d+\.\d+/gm,
      `$1${targetVersion}`
    );
  });
});

// In pre-commit mode, stage all updated files automatically
if (isPreCommit && updatedFiles.length > 0) {
  console.log('🚀 Husky Pre-commit: Staging auto-synchronized version files...');
  updatedFiles.forEach(file => {
    try {
      /* eslint-disable-next-line */
      execFileSync('git', ['add', file]);
      console.log(`✓ Staged ${path.basename(file)}`);
    } catch {
      console.error(`❌ Failed to stage ${path.basename(file)}`);
    }
  });
}

console.log(`🎉 Version sync complete!`);

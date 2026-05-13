/* eslint-disable sonarjs/no-os-command-from-path */
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

// Helper function to get the latest semver tag from git
function getLatestSemverTag() {
  try {
    const tags = execSync('git tag -l').toString().trim();
    if (!tags) {
      return null;
    }
    
    const semverTags = tags.split('\n')
      .filter(tag => /^v\d+\.\d+\.\d+$/.test(tag))
      .map(tag => tag.substring(1)) // Remove 'v' prefix
      .sort((a, b) => compareSemver(a, b));
    
    return semverTags.length > 0 ? semverTags[semverTags.length - 1] : null;
  } catch (err) {
    console.warn(`${YELLOW}⚠️  Warning: Failed to retrieve latest git tag: ${err.message}${RESET}`);
    return null;
  }
}

// Helper function to compare semantic versions
function compareSemver(a, b) {
  // Validate inputs are valid semantic versions
  const semverPattern = /^\d+\.\d+\.\d+$/;
  if (!semverPattern.test(a) || !semverPattern.test(b)) {
    throw new Error(`Invalid semantic version format. Expected MAJOR.MINOR.PATCH (e.g., 1.2.3). Got: "${a}", "${b}"`);
  }
  
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if (aParts.at(i) > bParts.at(i)) return 1;
    if (aParts.at(i) < bParts.at(i)) return -1;
  }
  return 0;
}

// Helper function to normalize version to comply with X.Y.Z where X, Y, Z ∈ {0-9}
// If any component > 9, roll to next major/minor and reset subsequent components
function normalizeVersion(version) {
  const semverPattern = /^\d+\.\d+\.\d+$/;
  if (!semverPattern.test(version)) {
    throw new Error(`Invalid semantic version: ${version}. Expected MAJOR.MINOR.PATCH (e.g., 1.2.3)`);
  }
  
  const parts = version.split('.').map(Number);
  
  // Check if patch > 9
  if (parts[2] > 9) {
    console.log(`${YELLOW}   ℹ️  Patch version ${parts[2]} > 9, rolling to next minor version${RESET}`);
    parts[2] = 0;
    parts[1] += 1;
  }
  
  // Check if minor > 9
  if (parts[1] > 9) {
    console.log(`${YELLOW}   ℹ️  Minor version ${parts[1]} > 9, rolling to next major version${RESET}`);
    parts[1] = 0;
    parts[0] += 1;
    // Reset patch as a "subsequent component" when minor rolls over
    parts[2] = 0;
  }
  
  return parts.join('.');
}

// Helper function to increment patch version with rollover logic
// Version format: X.Y.Z where X, Y, Z ∈ {0-9}
// After X.Y.9 comes X.(Y+1).0
// After X.9.9 comes (X+1).0.0
function incrementPatch(version) {
  // Validate input is a valid semantic version
  const semverPattern = /^\d+\.\d+\.\d+$/;
  if (!semverPattern.test(version)) {
    throw new Error(`Invalid semantic version: ${version}. Expected MAJOR.MINOR.PATCH (e.g., 1.2.3)`);
  }
  
  // First normalize the input to ensure it satisfies the 0-9 constraint
  const normalized = normalizeVersion(version);
  const parts = normalized.split('.').map(Number);
  
  // Increment patch version
  parts[2] += 1;
  
  // Apply rollover logic: each component must be 0-9
  if (parts[2] > 9) {
    parts[2] = 0;
    parts[1] += 1;
    
    if (parts[1] > 9) {
      parts[1] = 0;
      parts[0] += 1;
    }
  }
  
  return parts.join('.');
}

try {
  console.log(`${YELLOW}🚀 Starting Auto-Version Bump...${RESET}`);

  // Detect if running in CI
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  
  // Detect if running in a PR context (GITHUB_HEAD_REF is set for pull_request events)
  const isPRContext = isCI && process.env.GITHUB_HEAD_REF;

  // 1. Get current branch name
  let branchName = 'unknown';
  
  if (isCI) {
    // In PR context, use GITHUB_HEAD_REF (the PR branch name)
    // Otherwise, use GITHUB_REF_NAME (the target/current branch)
    if (isPRContext) {
      branchName = process.env.GITHUB_HEAD_REF;
      console.log(`   ℹ️  Detected PR branch from GITHUB_HEAD_REF: ${branchName}`);
    } else {
      branchName = process.env.GITHUB_REF_NAME || 'unknown';
      console.log(`   ℹ️  Detected branch from GITHUB_REF_NAME: ${branchName}`);
    }
  } else {
    // Local development: use git command
    try {
      branchName = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    } catch {
      console.error(`${RED}❌ Failed to get git branch. Are you in a git repo?${RESET}`);
      process.exit(1);
    }
  }

  let newVersion;

  // 2. Determine version based on context
  if (isPRContext) {
    // PR context: Auto-increment patch from current package.json version
    console.log(`${YELLOW}   ℹ️  Running in PR context${RESET}`);
    
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.error(`${RED}❌ package.json not found${RESET}`);
      process.exit(1);
    }
    
    let packageJson;
    try {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (err) {
      console.error(`${RED}❌ Failed to parse package.json: Invalid JSON format${RESET}`);
      if (err && err.message) {
        console.error(err.message);
      }
      process.exit(1);
    }
    
    const currentVersion = String(packageJson.version || '').trim();
    
    // Validate the version field contains a valid semantic version
    // This regex checks format (X.Y.Z) but doesn't enforce 0-9 constraint per component
    // The normalizeVersion() function handles rollover for multi-digit components (e.g., 1.10.5 → 2.0.0)
    const semverPattern = /^\d+\.\d+\.\d+$/;
    if (!semverPattern.test(currentVersion)) {
      console.error(`${RED}❌ Invalid package.json version "${currentVersion}". Expected MAJOR.MINOR.PATCH (e.g., 1.2.3).${RESET}`);
      process.exit(1);
    }
    
    console.log(`   📦 Current PR branch version: ${GREEN}${currentVersion}${RESET}`);
    
    // Auto-increment patch version using rollover logic
    newVersion = incrementPatch(currentVersion);
    console.log(`   🎯 Auto-incrementing to: ${GREEN}${newVersion}${RESET}`);
    
  } else if (isCI && branchName === 'main') {
    console.log(`${YELLOW}   ℹ️  Running in CI on main branch${RESET}`);
    
    // Read current package.json version
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.error(`${RED}❌ package.json not found${RESET}`);
      process.exit(1);
    }
    
    let packageJson;
    try {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (err) {
      console.error(`${RED}❌ Failed to parse package.json: Invalid JSON format${RESET}`);
      if (err && err.message) {
        console.error(err.message);
      }
      process.exit(1);
    }
    
    const currentVersion = String(packageJson.version || '').trim();
    
    // Validate the version field contains a valid semantic version
    const semverPattern = /^\d+\.\d+\.\d+$/;
    if (!semverPattern.test(currentVersion)) {
      console.error(`${RED}❌ Invalid package.json version "${currentVersion}". Expected MAJOR.MINOR.PATCH (e.g., 1.2.3).${RESET}`);
      process.exit(1);
    }
    
    // Get latest semver tag
    const latestTag = getLatestSemverTag();
    
    console.log(`   📦 Current package.json version: ${GREEN}${currentVersion}${RESET}`);
    console.log(`   🏷️  Latest git tag: ${latestTag ? GREEN + latestTag + RESET : YELLOW + '<none>' + RESET}`);
    
    if (!latestTag) {
      // No tags exist, use package.json version (normalized)
      newVersion = normalizeVersion(currentVersion);
      if (newVersion !== currentVersion) {
        console.log(`   🎯 Using normalized package.json version (no tags exist): ${GREEN}${newVersion}${RESET}`);
      } else {
        console.log(`   🎯 Using package.json version (no tags exist): ${GREEN}${newVersion}${RESET}`);
      }
    } else {
      const comparison = compareSemver(currentVersion, latestTag);
      
      if (comparison > 0) {
        // package.json version > latest tag (from merged release branch)
        newVersion = normalizeVersion(currentVersion);
        if (newVersion !== currentVersion) {
          console.log(`   🎯 Using normalized package.json version (already bumped): ${GREEN}${newVersion}${RESET}`);
        } else {
          console.log(`   🎯 Using package.json version (already bumped): ${GREEN}${newVersion}${RESET}`);
        }
      } else if (comparison === 0) {
        // package.json version = latest tag (auto-increment patch)
        newVersion = incrementPatch(currentVersion);
        console.log(`   🎯 Auto-incrementing patch version: ${GREEN}${newVersion}${RESET}`);
      } else {
        // package.json version < latest tag (shouldn't happen, but handle it)
        newVersion = incrementPatch(latestTag);
        console.log(`${YELLOW}   ⚠  package.json < latest tag, incrementing from tag: ${GREEN}${newVersion}${RESET}`);
      }
    }
  } else {
    // Local branch: Extract version from branch name (format: X.Y.Z)
    // Branches with version format (e.g., "1.2.3") will bump to that version
    // Other branches (e.g., "feature/xyz", "copilot/xyz") will skip
    const versionRegex = /^(\d+\.\d+\.\d+)$/;
    const match = branchName.match(versionRegex);

    if (!match) {
      console.log(`${YELLOW}ℹ️  Branch '${branchName}' does not match version format (X.Y.Z).`);
      console.log(`   Skipping version bump.${RESET}\n`);
      process.exit(0);
    }

    newVersion = normalizeVersion(match[1]);
    if (newVersion !== match[1]) {
      console.log(`   🎯 Detected & Normalized Target Version: ${GREEN}${newVersion}${RESET} (from branch '${branchName}')`);
    } else {
      console.log(`   🎯 Detected Target Version: ${GREEN}${newVersion}${RESET} (from branch '${branchName}')`);
    }
  }

  // 3. Update package.json & package-lock.json
  try {
    // eslint-disable-next-line sonarjs/os-command
    execSync(`npm version ${newVersion} --no-git-tag-version --allow-same-version`, { stdio: 'ignore' });
    console.log(`${GREEN}   ✔ Updated package.json & package-lock.json${RESET}`);
  } catch {
    console.error(`${RED}   ❌ Failed to update package.json. Is the JSON valid?${RESET}`);
    process.exit(1);
  }

  // 4. Update Flutter manifest and runtime version metadata.
  const mobilePubspecPath = path.join(process.cwd(), 'mobile', 'pubspec.yaml');
  if (fs.existsSync(mobilePubspecPath)) {
    const mobilePubspec = fs.readFileSync(mobilePubspecPath, 'utf8');
    const lines = mobilePubspec.split(/\r?\n/);
    let foundVersion = false;
    let buildNumber = '1';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('version:')) {
        const parts = trimmed.split(':');
        if (parts.length >= 2) {
          const val = parts[1].trim();
          const plusParts = val.split('+');
          if (plusParts.length >= 2) {
            buildNumber = plusParts[1].trim();
          }
        }
        break;
      }
    }
    
    const nextVersionLine = `version: ${newVersion}+${buildNumber}`;
    const newLines = [];
    
    for (const line of lines) {
      if (!foundVersion && line.trim().startsWith('version:')) {
        newLines.push(nextVersionLine);
        foundVersion = true;
      } else {
        newLines.push(line);
      }
    }
    
    if (!foundVersion) {
      if (newLines.length > 0 && newLines[newLines.length - 1] === '') {
        newLines.pop();
        newLines.push(nextVersionLine);
        newLines.push('');
      } else {
        newLines.push(nextVersionLine);
      }
    }
    
    fs.writeFileSync(mobilePubspecPath, newLines.join('\n'));
    console.log(`${GREEN}   ✔ Updated mobile/pubspec.yaml${RESET}`);
  } else {
    console.log(`${YELLOW}   ⚠  mobile/pubspec.yaml not found, skipping.${RESET}`);
  }

  const mobileAppConfigPath = path.join(process.cwd(), 'mobile', 'lib', 'config', 'app_config.dart');
  if (fs.existsSync(mobileAppConfigPath)) {
    let mobileAppConfig = fs.readFileSync(mobileAppConfigPath, 'utf8');
    const appVersionRegex = /(static\s+String\s+get\s+appVersion\s+=>\s+')\d+\.\d+\.\d+(';)/m;

    if (appVersionRegex.test(mobileAppConfig)) {
      mobileAppConfig = mobileAppConfig.replace(appVersionRegex, `$1${newVersion}$2`);
      fs.writeFileSync(mobileAppConfigPath, mobileAppConfig);
      console.log(`${GREEN}   ✔ Updated mobile/lib/config/app_config.dart${RESET}`);
    } else {
      console.log(`${YELLOW}   ⚠  appVersion getter not found in mobile/lib/config/app_config.dart, skipping.${RESET}`);
    }
  } else {
    console.log(`${YELLOW}   ⚠  mobile/lib/config/app_config.dart not found, skipping.${RESET}`);
  }

  // 5. Update .env and .example.env
  const envFiles = ['.env', '.example.env'];
  const keyToUpdate = 'NEXT_PUBLIC_APP_VERSION';

  envFiles.forEach(fileName => {
    const filePath = path.join(process.cwd(), fileName);
    
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Regex to find the key and replace its value
      const keyRegex = new RegExp(`^${keyToUpdate}=.*$`, 'gm');
      const newLine = `${keyToUpdate}=${newVersion}`;

      if (keyRegex.test(content)) {
        content = content.replace(keyRegex, newLine);
      } else {
        const prefix = content.endsWith('\n') || content.length === 0 ? '' : '\n';
        content += `${prefix}${newLine}\n`;
      }

      fs.writeFileSync(filePath, content);
      console.log(`${GREEN}   ✔ Updated ${fileName}${RESET}`);
    } else {
      console.log(`${YELLOW}   ⚠  ${fileName} not found, skipping.${RESET}`);
    }
  });

  // 6. Update OpenAPI documentation version
  const openApiPath = path.join(process.cwd(), 'public', 'openapi', 'openapi.yaml');
  
  if (fs.existsSync(openApiPath)) {
    const openApiContent = fs.readFileSync(openApiPath, 'utf8');
    const lines = openApiContent.split(/\r?\n/);
    const newLines = [];
    
    for (const line of lines) {
      if (line.trim().startsWith('version:')) {
        const leadingWhitespace = line.substring(0, line.indexOf('version:'));
        newLines.push(`${leadingWhitespace}version: ${newVersion}`);
      } else {
        newLines.push(line);
      }
    }
    
    fs.writeFileSync(openApiPath, newLines.join('\n'));
    console.log(`${GREEN}   ✔ Updated public/openapi/openapi.yaml${RESET}`);
  } else {
    console.log(`${YELLOW}   ⚠  OpenAPI file not found, skipping.${RESET}`);
  }

  console.log(`\n${GREEN}✅ Successfully bumped all files to v${newVersion}.${RESET}\n`);

} catch (_err) {
  console.error(`\n${RED}❌ Script failed: ${_err.message}${RESET}`);
  process.exit(1);
}
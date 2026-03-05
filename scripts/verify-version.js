const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

// Helper to extract NEXT_PUBLIC_APP_VERSION from any file content
function extractVersion(filePath) {
  if (!fs.existsSync(filePath)) return null;
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Ignore comments
    if (trimmed.startsWith('#')) continue;
    
    // Strict check for the specific key
    if (trimmed.startsWith('NEXT_PUBLIC_APP_VERSION')) {
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        // Return value stripped of quotes and spaces
        return parts[1].trim().replace(/^["']|["']$/g, ''); 
      }
    }
  }
  return undefined; // File exists but key is missing
}

try {
  console.log(`${YELLOW}🔍 Verifying version consistency...${RESET}`);

  // 1. Source of Truth: package.json
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkgVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;

  // 2. Lockfile
  const lockPath = path.join(process.cwd(), 'package-lock.json');
  const lockVersion = JSON.parse(fs.readFileSync(lockPath, 'utf8')).version;

  // 3. .env
  const envPath = path.join(process.cwd(), '.env');
  const envVersion = extractVersion(envPath);

  // 4. .example.env
  const exampleEnvPath = path.join(process.cwd(), '.example.env');
  const exampleEnvVersion = extractVersion(exampleEnvPath);

  // 5. OpenAPI spec
  const openApiPath = path.join(process.cwd(), 'public', 'openapi', 'openapi.yaml');
  let openApiVersion = null;
  if (fs.existsSync(openApiPath)) {
    const openApiContent = fs.readFileSync(openApiPath, 'utf8');
    const versionMatch = openApiContent.match(/^\s*version:\s*(\d+\.\d+\.\d+)$/m);
    openApiVersion = versionMatch ? versionMatch[1] : undefined;
  }

  // 6. Git Branch
  let branchName = 'unknown';
  try {
    branchName = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  } catch (_err) { /* ignore if no git */ }
  const normalizedBranch = branchName.replace(/^(v|release\/)/, '');


  // --- LOGGING STATUS ---
  console.log(`   📦 package.json:     ${pkgVersion}`);
  console.log(`   🔐 package-lock.json: ${lockVersion}`);
  
  if (envVersion === null) console.log(`   📄 .env:             ${RED}MISSING FILE${RESET}`);
  else if (envVersion === undefined) console.log(`   📄 .env:             ${RED}KEY MISSING${RESET}`);
  else console.log(`   📄 .env:             ${envVersion}`);

  if (exampleEnvVersion === null) console.log(`   📝 .example.env:     ${RED}MISSING FILE${RESET}`);
  else if (exampleEnvVersion === undefined) console.log(`   📝 .example.env:     ${RED}KEY MISSING${RESET}`);
  else console.log(`   📝 .example.env:     ${exampleEnvVersion}`);

  if (openApiVersion === null) console.log(`   📚 openapi.yaml:     ${RED}MISSING FILE${RESET}`);
  else if (openApiVersion === undefined) console.log(`   📚 openapi.yaml:     ${RED}VERSION MISSING${RESET}`);
  else console.log(`   📚 openapi.yaml:     ${openApiVersion}`);

  console.log(`   🌿 Git Branch:       ${branchName}`);


  // --- VALIDATION LOGIC ---
  const errors = [];

  // Check 1: Lockfile
  if (pkgVersion !== lockVersion) {
    errors.push(`Lockfile mismatch: Run 'npm install' to sync package-lock.json.`);
  }

  // Check 2: .env (skip for automation branches like copilot/*, dependabot/*, renovate/*)
  const isCopilotBranch = branchName.startsWith('copilot/');
  const isDependabotBranch = branchName.startsWith('dependabot/');
  const isRenovateBranch = branchName.startsWith('renovate/');
  const isAutomationBranch = isCopilotBranch || isDependabotBranch || isRenovateBranch;
  
  const warnings = [];
  
  if (!isAutomationBranch) {
    if (envVersion === null) {
      errors.push(`Critical: .env file is missing.`);
    } else if (envVersion === undefined) {
      errors.push(`Critical: 'NEXT_PUBLIC_APP_VERSION' is missing from .env`);
    } else if (envVersion !== pkgVersion) {
      errors.push(`Mismatch: .env version (${envVersion}) !== package.json (${pkgVersion})`);
    }
  }

  // Check 3: .example.env
  if (exampleEnvVersion === null) {
    warnings.push(`Warning: .example.env file is missing (Good practice to keep it).`);
  } else if (exampleEnvVersion === undefined) {
    errors.push(`Critical: 'NEXT_PUBLIC_APP_VERSION' is missing from .example.env`);
  } else if (exampleEnvVersion !== pkgVersion) {
    errors.push(`Mismatch: .example.env version (${exampleEnvVersion}) !== package.json (${pkgVersion})`);
  }

  // Check 4: OpenAPI spec
  if (openApiVersion === null) {
    warnings.push(`Warning: openapi.yaml file is missing.`);
  } else if (openApiVersion === undefined) {
    errors.push(`Critical: 'version' is missing from openapi.yaml`);
  } else if (openApiVersion !== pkgVersion) {
    errors.push(`Mismatch: openapi.yaml version (${openApiVersion}) !== package.json (${pkgVersion})`);
  }

  // Check 5: Branch validation (for non-protected, non-automation branches)
  const protectedBranches = ['main', 'master', 'dev', 'development', 'staging', 'HEAD', 'unknown'];
  
  if (!protectedBranches.includes(branchName) && !isAutomationBranch && normalizedBranch !== pkgVersion) {
    errors.push(`Branch mismatch: Branch '${branchName}' implies version '${normalizedBranch}', but package is '${pkgVersion}'`);
  }

  // --- FINAL RESULT ---
  if (warnings.length > 0) {
    console.warn(`\n${YELLOW}⚠️  WARNINGS:${RESET}`);
    warnings.forEach(w => console.warn(`${YELLOW} - ${w}${RESET}`));
  }
  
  if (errors.length > 0) {
    console.error(`\n${RED}⛔ VALIDATION FAILED:${RESET}`);
    errors.forEach(e => console.error(`${RED} - ${e}${RESET}`));
    process.exit(1); // Fail commit
  }

  console.log(`${GREEN}✅ All versions synchronized.${RESET}\n`);
  process.exit(0);

} catch (_err) {
  console.error(`${RED}❌ Script Error: ${_err.message}${RESET}`);
  process.exit(1);
}
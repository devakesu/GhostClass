#!/usr/bin/env node

/**
 * sync-secrets.js - Push local .env values to GitHub Actions Secrets and Variables
 * Works on Windows, macOS, and Linux
 *
 * Run manually: SYNC_SECRETS=1 node scripts/sync-secrets.js
 *
 * Non-sensitive build-time values (NEXT_PUBLIC_*, SOURCE_DATE_EPOCH, SENTRY_ORG,
 * SENTRY_PROJECT) are synced as GitHub Actions Variables so they are visible in
 * build logs. Only truly sensitive values are synced as Secrets.
 *
 * NOTE: NEXT_PUBLIC_APP_VERSION is intentionally NOT synced here.
 * The release workflow derives the version directly from the git tag
 * (calculate-version job → needs.calculate-version.outputs.version),
 * so a GitHub Variable/Secret for it would always be stale after an auto-bump.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

const log = {
  success: (msg) => console.log(`${colors.green}${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.cyan}${msg}${colors.reset}`),
};

// Check if gh CLI is installed
function isGhInstalled() {
  try {
    execSync('gh --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Check if authenticated with gh
function isGhAuthenticated() {
  try {
    execSync('gh auth status', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Get repository name
function getRepo() {
  try {
    const result = execSync('gh repo view --json nameWithOwner -q .nameWithOwner', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return result.trim();
  } catch {
    return null;
  }
}

// Parse .env file
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const envConfig = {};
  const content = fs.readFileSync(filePath, 'utf8');

  content.split(/\r?\n/).forEach((line) => {
    // Skip comments and empty lines
    if (!line || line.trim().startsWith('#')) return;

    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove quotes if present
      value = value.replace(/^["']|["']$/g, '');

      envConfig[key] = value;
    }
  });

  return envConfig;
}

// Set GitHub secret
function setSecret(repo, name, value) {
  try {
    const command = `gh secret set ${name} --repo ${repo} --app actions`;
    execSync(command, {
      input: value,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return { success: true };
  } catch (error) {
    let message;
    if (error instanceof Error) {
      const stderr = error.stderr
        ? String(error.stderr).trim()
        : '';
      message = stderr ? `${error.message}: ${stderr}` : error.message;
    } else {
      message = String(error);
    }
    return { success: false, error: message };
  }
}

// Set GitHub Actions variable (non-sensitive — not masked in logs)
function setVariable(repo, name, value) {
  const result = spawnSync('gh', ['variable', 'set', name, '--repo', repo, '--body', value], {
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (result.status === 0 && !result.error) {
    return { success: true };
  }
  let message;
  if (result.error instanceof Error) {
    const stderr = result.stderr ? String(result.stderr).trim() : '';
    message = stderr ? `${result.error.message}: ${stderr}` : result.error.message;
  } else {
    const stderr = result.stderr ? String(result.stderr).trim() : '';
    message = stderr || `Process exited with code ${result.status}`;
  }
  return { success: false, error: message };
}

// Main function
function main() {
  log.info('🚀 GitHub Actions Sync (Variables + Secrets)\n');

  // Auto-skip in CI environments
  if (process.env.CI) {
    log.info('⏭️  Secret sync skipped in CI environment.\n');
    return;
  }
  // Check prerequisites - FAIL if not met
  if (!isGhInstalled()) {
    log.error('❌ ERROR: GitHub CLI (gh) is not installed.');
    log.error('📥 Install from: https://cli.github.com/');
    log.error('\nSync failed - GitHub CLI is required.');
    process.exit(1);
  }

  if (!isGhAuthenticated()) {
    log.error('❌ ERROR: Not authenticated with GitHub CLI.');
    log.error('🔐 Run: gh auth login');
    log.error('\nSync failed - authentication required.');
    process.exit(1);
  }

  const repo = getRepo();
  if (!repo) {
    log.error('❌ ERROR: Could not detect repository.');
    log.error('💡 Make sure you are in a Git repository with GitHub remote.');
    log.error('💡 Or run: gh repo set-default');
    log.error('\nSync failed - repository detection failed.');
    process.exit(1);
  }

  // Parse .env file - FAIL if not found
  const envPath = path.join(process.cwd(), '.env');
  const envConfig = parseEnvFile(envPath);

  if (!envConfig) {
    log.error('❌ ERROR: .env file not found.');
    log.error(`📁 Expected location: ${envPath}`);
    log.error('\nSync failed - .env file is required.');
    process.exit(1);
  }

  log.success(`🔄 Syncing to: ${repo}\n`);

  // ── GitHub Actions VARIABLES (non-sensitive; visible in build logs) ──────────
  const variablesToSync = [
    // SOURCE_DATE_EPOCH is intentionally excluded: the release workflow derives
    // it from the git commit timestamp (git log -1 --format=%ct) so it is always
    // accurate per tag without any manual sync needed.
    'SENTRY_ORG',
    'SENTRY_PROJECT',
    'NEXT_PUBLIC_APP_NAME',
    // NEXT_PUBLIC_APP_VERSION is intentionally excluded: the release workflow derives
    // it from the git tag (calculate-version job), not from a GitHub Variable.
    // Syncing it here would leave the variable stale after every auto-version bump.
    'NEXT_PUBLIC_APP_DOMAIN',
    'NEXT_PUBLIC_AUTHOR_NAME',
    'NEXT_PUBLIC_AUTHOR_URL',
    'NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE',
    'NEXT_PUBLIC_BACKEND_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_DEV_URL',
    'NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_GITHUB_URL',
    'NEXT_PUBLIC_DONATE_URL',
    'NEXT_PUBLIC_DEFAULT_DOMAIN',
    'NEXT_PUBLIC_SENTRY_DSN',
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    'NEXT_PUBLIC_GA_ID',
    // Optional overrides (skipped gracefully if not set in .env)
    'NEXT_PUBLIC_ATTENDANCE_TARGET_MIN',
    'NEXT_PUBLIC_SENTRY_REPLAY_RATE',
    'NEXT_PUBLIC_FORCE_STRICT_CSP',
    // Note: NEXT_PUBLIC_ENABLE_SW_IN_DEV is intentionally excluded — it is a
    // local-dev-only flag (enables the SW outside production mode) that is NOT
    // a Dockerfile ARG and is NOT passed as a build-arg in release.yml.
    // It only belongs in a developer's local .env file; syncing it to GitHub
    // Variables would have no effect on any CI/CD workflow.
    // Egress proxy deployment config (non-sensitive; used as vars.* in workflow)
    'CF_WORKER_NAME',
    'AWS_REGION',
    'AWS_LAMBDA_FUNCTION_NAME',
    // Supabase browser proxy deployment config (non-sensitive; used as vars.* in workflow)
    'CF_SUPABASE_PROXY_WORKER_NAME',
    'AWS_SUPABASE_LAMBDA_FUNCTION_NAME',
    // Supabase browser proxy URLs (NEXT_PUBLIC_* — baked into browser bundle at build time)
    // Leave empty in .env when supabase.co is reachable directly.
    'NEXT_PUBLIC_SUPABASE_CF_PROXY_URL',
    'NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL',
    // Mobile App Metadata
    'NEXT_PUBLIC_ANDROID_PACKAGE_NAME',
    'FIREBASE_APP_ID_ANDROID',
    'FIREBASE_APP_ID_IOS',
    'PLAY_INTEGRITY_PROJECT_NUMBER',
    'PLAY_INTEGRITY_CERT_SHA256',
  ];

  // ── GitHub Actions SECRETS (sensitive; masked in logs) ───────────────────────
  const secretsToSync = [
    'SENTRY_AUTH_TOKEN',
    'COOLIFY_BASE_URL',
    'COOLIFY_APP_ID',
    'COOLIFY_API_TOKEN',
    // Egress proxy secrets — same name in both .env (Coolify runtime) and GitHub Actions
    // so the workflow can inject the correct PROXY_SECRET into each worker.
    'CF_PROXY_SECRET',         // Cloudflare Worker PROXY_SECRET
    'AWS_SECONDARY_SECRET',    // AWS Lambda PROXY_SECRET
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'MOBILE_API_SECRET',
    'REQUEST_PRIVATE_KEY',
    'REQUEST_PUBLIC_KEY',
    'GOOGLE_SERVICE_ACCOUNT_JSON',
    'SENTRY_HASH_SALT',
    'CRON_SECRET',
    'GA_API_SECRET',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    // Supabase deployment secrets (used by deploy-supabase.yaml)
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_DB_PASSWORD',
    'SUPABASE_PROJECT_ID',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  const errors = [];
  const missing = [];

  // Sync variables
  log.info('📋 Syncing Variables (non-sensitive)...');
  for (const varName of variablesToSync) {
    const varValue = envConfig[varName];

    if (varValue === undefined || varValue === null || varValue === '') {
      log.warning(`⊘ Skipping ${varName} (not set in .env)`);
      missing.push(varName);
      skipCount++;
      continue;
    }

    const result = setVariable(repo, varName, varValue);

    if (result.success) {
      log.success(`✓ Variable: ${varName}`);
      successCount++;
    } else {
      log.error(`✗ Failed to set variable ${varName}`);
      log.error(`  Error: ${result.error}`);
      errors.push({ name: varName, error: result.error });
      errorCount++;
    }
  }

  // Sync secrets
  console.log();
  log.info('🔐 Syncing Secrets (sensitive)...');
  for (const secretName of secretsToSync) {
    const secretValue = envConfig[secretName];

    if (secretValue === undefined || secretValue === null || secretValue === '') {
      log.warning(`⊘ Skipping ${secretName} (not set in .env)`);
      missing.push(secretName);
      skipCount++;
      continue;
    }

    const result = setSecret(repo, secretName, secretValue);

    if (result.success) {
      log.success(`✓ Secret:   ${secretName}`);
      successCount++;
    } else {
      log.error(`✗ Failed to sync secret ${secretName}`);
      log.error(`  Error: ${result.error}`);
      errors.push({ name: secretName, error: result.error });
      errorCount++;
    }
  }

  // Summary
  console.log('\n' + colors.cyan + '═══════════════════════════════════════' + colors.reset);
  log.info('📊 Sync Summary');
  console.log(colors.cyan + '═══════════════════════════════════════' + colors.reset);
  log.success(`  ✓ Successfully synced: ${successCount} (${variablesToSync.length} variables + ${secretsToSync.length} secrets possible)`);
  
  if (skipCount > 0) {
    log.warning(`  ⊘ Skipped (not in .env): ${skipCount}`);
  }
  
  if (errorCount > 0) {
    log.error(`  ✗ Failed: ${errorCount}`);
  }
  
  console.log(colors.cyan + '═══════════════════════════════════════' + colors.reset);

  // Show missing secrets (warnings only)
  if (missing.length > 0) {
    log.warning('\n⚠️  Missing secrets in .env:');
    missing.forEach((name) => {
      log.warning(`   - ${name}`);
    });
  }

  // Show errors in detail
  if (errors.length > 0) {
    log.error('\n❌ Failed to sync the following secrets:');
    errors.forEach(({ name, error }) => {
      log.error(`   - ${name}`);
      log.error(`     ${error}`);
    });
    
    log.error('\n💡 Troubleshooting:');
    log.error('   1. Check GitHub CLI permissions: gh auth refresh -s admin:org');
    log.error('   2. Verify repository access: gh repo view');
    log.error('   3. Check secret names for special characters');
    
    log.error('\n🚨 Sync FAILED - Please fix errors above\n');
    process.exit(1);
  }

  // Success!
  log.success('\n✅ All variables and secrets synced successfully!\n');
  process.exit(0);
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  log.error('\n❌ Unexpected error:');
  const message = error instanceof Error ? error.message : String(error);
  log.error(message);
  log.error('\n🚨 Sync FAILED\n');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  log.error('\n❌ Unexpected error:');
  const message = error instanceof Error ? error.message : String(error);
  log.error(message);
  log.error('\n🚨 Sync FAILED\n');
  process.exit(1);
});

main();
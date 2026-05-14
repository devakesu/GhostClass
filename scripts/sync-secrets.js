#!/usr/bin/env node

/**
 * sync-secrets.js - DEPRECATED
 * 
 * GhostClass has migrated to centralized secret management using Infisical.
 * Manual synchronization of `.env` values to GitHub Actions and Coolify is no longer necessary.
 * 
 * Infisical's native Integrations automatically keep GitHub Actions (Secrets & Variables)
 * and Coolify project environments fully synchronized in the background whenever values are updated.
 * 
 * Local Development Setup:
 * 1. Install the Infisical CLI: https://infisical.com/docs/cli/overview
 * 2. Authenticate: infisical login
 * 3. Run development server: npm run infisical:dev (or infisical run -- npm run dev)
 */

const colors = {
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

console.log(`${colors.yellow}⚠️  NOTICE: sync-secrets.js has been deprecated.${colors.reset}\n`);
console.log(`GhostClass now uses ${colors.cyan}Infisical${colors.reset} for centralized environment variable management.`);
console.log(`GitHub Actions secrets/variables and Coolify runtime environments are automatically`);
console.log(`synchronized via native Infisical integrations.\n`);
console.log(`To run locally with injected secrets, use:\n  ${colors.cyan}infisical run -- npm run dev${colors.reset}\n`);
console.log(`For full environment configuration documentation, refer to SECURITY.md and .example.env.`);

process.exit(0);
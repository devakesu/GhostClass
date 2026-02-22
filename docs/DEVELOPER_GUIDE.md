# Developer Guide

Complete guide for development, contribution, and release workflows for GhostClass.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [GPG Signing Configuration](#gpg-signing-configuration)
- [Bot PAT Configuration](#bot-pat-configuration)
- [Testing](#testing)
- [Contributing](#contributing)
- [Versioning & Releases](#versioning--releases)
- [Release Verification](#release-verification)
- [Known Issues](#known-issues)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

- **Node.js**: v20.19.2+ or v22.12.0+
- **npm**: v11+
- **Git**: Latest version
- **GPG**: For commit signing (optional for local development, required for automated workflows)
- **Docker**: For containerized deployment (optional)

### Quick Start

```bash
# 1. Fork and clone the repository
git clone https://github.com/devakesu/GhostClass.git
cd GhostClass

# 2. Install dependencies (--legacy-peer-deps is required)
npm install --legacy-peer-deps

# 3. Set up environment
cp .example.env .env
# Edit .env with your configuration

# 4. Start development server
npm run dev

# 5. Run tests
npm run test
```

---

## Development Setup

### Local Environment

Development server options:

```bash
# HTTP development server (default)
npm run dev

# HTTPS development server (requires certificates in ./certificates/)
npm run dev:https
```

### Optional Environment Variables

These variables are **not required** for local development but enable additional behaviour when set.

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_ENABLE_SW_IN_DEV` | `""` (disabled) | Set `"true"` to enable the service worker in development mode (useful for testing PWA/offline behaviour). |
| `ENABLE_PUBLIC_BROWSER_SOURCEMAPS` | `""` (disabled) | Set `"true"` to serve JS source maps publicly in production builds (opt-in — see note below). |
| `FORCE_STRICT_CSP` / `NEXT_PUBLIC_FORCE_STRICT_CSP` | `""` (disabled) | Set `"true"` to enforce a stricter CSP in development (removes most uses of `'unsafe-inline'` but still allows it in `script-src-elem` and certain dev style directives so Next.js hydration and dev tooling continue to work; useful for reproducing CSP violations locally). **Note:** `'unsafe-eval'` is NOT removed in dev mode even when set — Next.js HMR requires it. It is only absent in a real production build. Use `npm run build && npm start` to test the production CSP. |
| `NEXT_PUBLIC_ATTENDANCE_TARGET_MIN` | `75` | Minimum attendance target percentage (1–100). Applies in both development and production. Adjust to match your institution's minimum attendance requirements. |

> **`ENABLE_PUBLIC_BROWSER_SOURCEMAPS` note:** By default, JavaScript source maps are *not* served publicly. They are always uploaded to Sentry separately for private error symbolication. Set this variable to `"true"` only when you need browser DevTools or Lighthouse to resolve production stack traces locally. Exposing source maps makes it easier for attackers to analyse deployed code, so treat this as a debugging aid rather than a permanent setting.

### Development Workflow

- **Create a feature branch from `main`:**

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

- **Make changes and commit with clear messages:**

```bash
git add .
git commit -m "feat: add new feature"
```

- **Run linter and tests before pushing:**

```bash
npm run lint
npm run test
```

- **Push and create a Pull Request:**

```bash
git push origin feature/your-feature-name
# Open PR on GitHub
```

**Important**: Version bumping is automatic! When you create a PR and merge it to `main`, the Auto Version Bump workflow will increment the version and create a release for you. See [Versioning & Releases](#versioning--releases) for details.

### Code Style

- Follow the existing code style
- Use ESLint and Prettier configurations
- Write meaningful commit messages (use conventional commits)
- Add tests for new features
- Update documentation when needed

---

## GPG Signing Configuration

Configure GPG signing for verified commits in automated workflows.

### Why GPG Signing?

- ✅ **Verified commits** - Shows GitHub's "Verified" badge
- ✅ **Trust & authenticity** - Proves commits came from authorized workflows
- ✅ **Security compliance** - Required for some security standards
- ✅ **OpenSSF Scorecard** - Improves security score

### Quick Setup

```bash
# 1. Generate RSA key (NOT ECC)
gpg --full-generate-key
# Choose: RSA and RSA, 4096 bits

# 2. Get your key ID
gpg --list-secret-keys --keyid-format=long

# 3. Export keys
gpg --armor --export-secret-keys YOUR_KEY_ID  # For repository secrets
gpg --armor --export YOUR_KEY_ID              # For GitHub profile
```

Then add to:

- **GitHub Profile**: Settings → SSH and GPG keys → New GPG key (public key)
- **Repository Secrets**: Settings → Secrets → Actions (private key + passphrase)

### Detailed Instructions

#### Step 1: Generate GPG Key

⚠️ **Important**: Use **RSA 4096-bit keys**, NOT ECC/EdDSA keys. ECC keys can cause "Inappropriate ioctl for device" errors in GitHub Actions.

```bash
gpg --full-generate-key
```

When prompted:

- **Key type**: `(1) RSA and RSA (default)` ⚠️ **Use RSA, NOT ECC**
- **Key size**: `4096`
- **Expiration**: `0` (no expiration) or set based on your security policy
- **Name**: Your name or "GhostClass Bot"
- **Email**: Use your verified GitHub email

#### Step 2: Export Keys

```bash
# List keys to get the key ID
gpg --list-secret-keys --keyid-format=long

# Example output:
# sec   rsa4096/ABC123DEF456 2024-01-01 [SC]
# uid   [ultimate] Your Name <your-email@example.com>

# Export private key (for repository secrets)
gpg --armor --export-secret-keys ABC123DEF456

# Export public key (for GitHub profile)
gpg --armor --export ABC123DEF456
```

#### Step 3: Add to GitHub Profile

1. Go to **GitHub** → **Settings** → **SSH and GPG keys**
2. Click **New GPG key**
3. Paste your **public key** (output from `gpg --armor --export`)
4. Click **Add GPG key**
5. Verify the email from your GPG key is listed and verified in **Settings** → **Emails**

#### Step 4: Add to Repository Secrets

Go to repository **Settings** → **Secrets and variables** → **Actions**:

| Secret Name | Value | Required |
| --- | --- | --- |
| `GPG_PRIVATE_KEY` | Output from `gpg --armor --export-secret-keys` | ✅ Yes |
| `GPG_PASSPHRASE` | Your GPG key passphrase | ✅ Yes |

**Note**: For automated workflows, you can generate a key without a passphrase using:

```bash
gpg --batch --gen-key <<EOF
Key-Type: RSA
Key-Length: 4096
Name-Real: GitHub Actions Bot
Name-Email: github-actions[bot]@users.noreply.github.com
Expire-Date: 0
%no-protection
EOF
```

#### Security Considerations

For non-expiring, unprotected GPG keys used in automation:

- Treat the `GPG_PRIVATE_KEY` secret as highly sensitive
- Rotate keys every 12-24 months
- Revoke immediately if compromise is suspected
- Monitor access to repository secrets
- Enable alerts for unusual activity

#### Troubleshooting GPG

##### Error: Inappropriate ioctl for device

- Cause: Using ECC/EdDSA key type in CI/CD
- Solution: Regenerate key using RSA 4096-bit

##### Error: gpg: signing failed: No such file or directory

- Cause: Missing GPG secret or incorrect passphrase
- Solution: Verify `GPG_PRIVATE_KEY` and `GPG_PASSPHRASE` secrets are set correctly

##### Warning: Email not verified

- Cause: GPG key email not verified in GitHub account
- Solution: Go to Settings → Emails and verify the email address

---

## Bot PAT Configuration

Enable workflows to trigger after automated version bump commits.

### Why is This Needed?

By default, when a GitHub Actions workflow creates a commit using `GITHUB_TOKEN`, that commit **does not trigger other workflows** (intentional GitHub behavior to prevent infinite loops).

For GhostClass:

- Auto Version Bump workflow commits version changes
- Without BOT_PAT:
  - Tests/Pipeline workflows won't run on those commits ❌
  - Commit verification still depends on GPG signing; Dependabot PRs do not have access to GPG secrets, so their bump commits may appear as **unverified** (not GPG-signed) ❌
  - Manual workflow trigger or new commit required to run checks
- With BOT_PAT:
  - All workflows trigger properly ✅
  - BOT_PAT only controls whether workflows are triggered; commits are shown as **Verified** only when signed with the configured GPG keys, and Dependabot bump commits may still remain unverified
  - Automated CI/CD pipeline for version bumps and releases works seamlessly ✅

### Setup Instructions

#### Step 1: Create Personal Access Token

1. Go to **GitHub Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
   - Direct link: [github.com/settings/tokens](https://github.com/settings/tokens)

2. Click **Generate new token** → **Generate new token (classic)**

3. Configure token:

   - **Note**: `GhostClass Bot PAT` (descriptive name)
   - **Expiration**: 90 days or 1 year (set calendar reminder to renew)
   - **Scopes**: Select **only**:
     - ✅ `repo` (Full control of private repositories)
     - ✅ `workflow` (Update GitHub Action workflows) - **REQUIRED** for workflows to trigger after version bump commits

   - ⚠️ **Copy token immediately** - you won't see it again!

#### Step 2: Add to Repository Secrets

1. Go to repository **Settings** → **Secrets and variables** → **Actions**

2. Click **New repository secret**

3. Add secret:
   - **Name**: `BOT_PAT`
   - **Value**: The token you just created

4. Click **Add secret**

### Benefits

- ✅ Tests run automatically after version bump commits
- ✅ All checks complete properly on PRs
- ✅ Maintains OpenSSF Scorecard compliance
- ✅ Graceful fallback to `GITHUB_TOKEN` if not configured

### Verification

After setup:

1. Create a test PR from a branch in the main repository
2. The Auto Version Bump workflow should:
   - Increment the version
   - Commit changes to your PR
   - Trigger Tests and Pipeline workflows automatically

3. Check workflow runs in **Actions** tab to confirm

---

## Testing

### Unit & Component Tests (Vitest)

```bash
# Run all tests
npm run test

# Watch mode (re-run on file changes)
npm run test:watch

# UI mode (interactive test viewer)
npm run test:ui

# Coverage report
npm run test:coverage
```

### End-to-End Tests (Playwright)

```bash
# Run e2e tests (headless)
npm run test:e2e

# Interactive UI (debug tests)
npm run test:e2e:ui

# Headed mode (see browser)
npm run test:e2e:headed
```

### Test Structure

```text
src/
├── lib/__tests__/          # Library unit tests
├── components/__tests__/   # Component tests
└── hooks/__tests__/        # Hook tests
e2e/
├── homepage.spec.ts        # Homepage e2e tests
└── smoke.spec.ts           # Smoke tests
```

### Writing Tests

**Unit tests** (Vitest):

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from './myFunction';

describe('myFunction', () => {
  it('should return expected result', () => {
    expect(myFunction('input')).toBe('expected');
  });
});
```

**E2E tests** (Playwright):

```typescript
import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});
```

---

## Contributing

### Contribution Workflow

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a feature branch** from `main`
4. **Make your changes** with clear commit messages
5. **Write or update tests** for your changes
6. **Run linter and tests** before committing
7. **Push to your fork** and create a Pull Request
8. **Wait for review** and address feedback
9. **Merge**: Once approved, your PR will be merged and version bumping will happen automatically

### Pull Request Guidelines

- **Title**: Use conventional commit format (e.g., `feat: add new feature`)
- **Description**: Explain what changed and why
- **Tests**: Ensure all tests pass
- **Documentation**: Update docs if needed
- **Small PRs**: Keep changes focused and reviewable

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

```text
feat(auth): add two-factor authentication
fix(api): resolve rate limiting issue
docs: update installation instructions
```

---

## Versioning & Releases

### Semantic Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** version (x.0.0): Breaking changes or major features
- **MINOR** version (0.x.0): New features, backward-compatible
- **PATCH** version (0.0.x): Bug fixes, backward-compatible

### Automated Version Bumping

**Version bumping is automatic!** When you merge a PR to `main`, the pipeline:

1. Runs the version bump script
2. Compares `package.json` version with the latest git tag
3. Determines the new version:
   - **Auto-increment patch**: If `package.json` version = latest tag
   - **Use package.json version**: If `package.json` version > latest tag
   - **No change**: If version is already correct

4. Updates version files if needed:
   - `package.json`, `package-lock.json`
   - `.env`, `.example.env` (NEXT_PUBLIC_APP_VERSION)
   - `public/api-docs/openapi.yaml`

5. Creates and pushes a git tag (e.g., `v1.5.6`)

6. Triggers the release workflow:
   - Builds multi-platform Docker images
   - Signs images with Sigstore cosign
   - Generates SBOM and attestations
   - Creates GitHub Release
   - Deploys to production automatically

### Version Bump Scenarios

#### Scenario A: Feature Branch (Automatic Patch Bump)

```bash
# Create feature branch
git checkout -b feature/new-dashboard

# Make changes, commit, push, create PR
# When merged to main → Auto-increments patch version
# Example: v1.5.5 → v1.5.6
```

#### Scenario B: Version Branch (Controlled Version)

For minor or major version bumps, use a **version branch** with format `x.x.x`:

```bash
# Create version branch (format: x.x.x)
git checkout -b 1.6.0

# Run the version bump script
npm run bump-version

# The script extracts version from branch name and updates:
# - package.json, package-lock.json
# - .env, .example.env
# - openapi.yaml

# Review changes
git diff

# Commit and push
git add .
git commit -m "chore: bump version to v1.6.0"
git push origin 1.6.0

# Create PR and merge to main
# When merged → Uses v1.6.0 (no auto-increment)
```

**Branch naming convention**: `x.x.x` (e.g., `1.6.0`, `2.0.0`, `10.3.5`)

**Version Bump Guidelines:**

- **Patch** (0.0.x): Bug fixes, security patches, minor documentation updates
- **Minor** (0.x.0): New features, enhancements, non-breaking API additions
- **Major** (x.0.0): Breaking changes, major refactors, incompatible API changes

### Release Artifacts

Each release includes:

**Docker Images** (pushed to GitHub Container Registry):

```bash
# Pull by version tag
docker pull ghcr.io/devakesu/ghostclass:vX.Y.Z
docker pull ghcr.io/devakesu/ghostclass:X.Y.Z

# Latest (updated for manual releases only)
docker pull ghcr.io/devakesu/ghostclass:latest
```

**Platforms**: `linux/amd64`, `linux/arm64`

**Attached Files**:

- `sbom.json` - Software Bill of Materials (CycloneDX format)
- `sbom.json.bundle` - Cosign signature bundle for SBOM
- `checksums.txt` - SHA256 checksums for all artifacts
- `VERIFY.md` - Detailed verification instructions

### Release Workflow Details

**Automated Release Process:**

1. **Version Detection**: Pipeline workflow detects merged PR to `main`
2. **Version Update**: Creates PR with version changes if needed (merged immediately)
3. **Git Tag**: Creates and pushes version tag (e.g., `vX.Y.Z`)
4. **Release Trigger**: Explicitly triggers release workflow via `workflow_dispatch`
5. **Build**: Builds multi-platform Docker images
6. **Sign**: Signs images with Sigstore cosign (keyless OIDC)
7. **Attestations**: Generates build provenance and SBOM attestations
8. **GitHub Release**: Creates release with all artifacts
9. **Deploy**: Automatically deploys to production via Coolify

**Key Benefits:**

- ✅ Single Docker build per release (no duplicates)
- ✅ Version tag matches Docker image tag
- ✅ Automatic deployment for tag-based releases
- ✅ All commits and tags GPG signed
- ✅ Complete artifact attestation chain

---

## Release Verification

### Prerequisites: Verification Tools

Install verification tools:

```bash
# Install cosign (for signature verification)
brew install sigstore/tap/cosign  # macOS
# OR
go install github.com/sigstore/cosign/v2/cmd/cosign@latest

# Install GitHub CLI (for attestation verification)
brew install gh  # macOS
# OR see https://cli.github.com/
```

### Verify Docker Image Signature

Using cosign with keyless verification (OIDC):

```bash
cosign verify \
  --certificate-identity-regexp="^https://github.com/devakesu/GhostClass" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/devakesu/ghostclass:vX.Y.Z
```

**Expected output**: Verification success with certificate details.

### Verify Build Attestation

Using GitHub CLI:

```bash
gh attestation verify oci://ghcr.io/devakesu/ghostclass:vX.Y.Z --owner devakesu
```

**Expected output**: Attestation verification success with build provenance.

### Verify SBOM Signature

Download SBOM and signature from GitHub Release:

```bash
# Download files
wget https://github.com/devakesu/GhostClass/releases/download/vX.Y.Z/sbom.json
wget https://github.com/devakesu/GhostClass/releases/download/vX.Y.Z/sbom.json.bundle

# Verify SBOM signature
cosign verify-blob --bundle sbom.json.bundle sbom.json
```

### Verify Checksums

```bash
# Download checksums and artifacts
wget https://github.com/devakesu/GhostClass/releases/download/vX.Y.Z/checksums.txt
wget https://github.com/devakesu/GhostClass/releases/download/vX.Y.Z/sbom.json
wget https://github.com/devakesu/GhostClass/releases/download/vX.Y.Z/sbom.json.bundle

# Verify checksums (extract valid lines only)
grep -E '^[0-9a-f]{64}  ' checksums.txt | sha256sum -c
```

### Complete Verification Example

```bash
# 1. Verify image signature
cosign verify \
  --certificate-identity-regexp="^https://github.com/devakesu/GhostClass" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/devakesu/ghostclass:vX.Y.Z

# 2. Verify attestation
gh attestation verify oci://ghcr.io/devakesu/ghostclass:vX.Y.Z --owner devakesu

# 3. Download and verify SBOM
wget https://github.com/devakesu/GhostClass/releases/download/vX.Y.Z/sbom.json
wget https://github.com/devakesu/GhostClass/releases/download/vX.Y.Z/sbom.json.bundle
cosign verify-blob --bundle sbom.json.bundle sbom.json

# 4. Verify checksums
wget https://github.com/devakesu/GhostClass/releases/download/vX.Y.Z/checksums.txt
grep -E '^[0-9a-f]{64}  ' checksums.txt | sha256sum -c
```

---

## Release Checklist

**Before merging to main:**

- [ ] All tests pass (`npm run test`)
- [ ] E2E tests pass (`npm run test:e2e`)
- [ ] Linter passes (`npm run lint`)
- [ ] Documentation is updated
- [ ] Security vulnerabilities addressed
- [ ] Breaking changes documented (for major versions)

**After release:**

- [ ] Verify GitHub Release created successfully
- [ ] Verify Docker images available in GHCR
- [ ] Verify image signatures with cosign
- [ ] Verify build attestations
- [ ] Test pulling and running the released image
- [ ] Check deployment succeeded (if auto-deployed)
- [ ] Verify OpenSSF Scorecard "Signed-Releases" passes

---

## Known Issues

### Production Vulnerability: minimatch ReDoS (GHSA-3ppc-4f35-3m26)

**Status:** ✅ Fixed via package.json override + `--legacy-peer-deps`

**Description:**

- `@sentry/nextjs @ 9.20.0` depends on `@sentry/node` which requires `minimatch < 10.2.2`
- minimatch < 10.2.2 contains a ReDoS vulnerability (GHSA-3ppc-4f35-3m26)
- **Risk Level:** MEDIUM
  - **Attack Surface:** Low (Sentry configuration is application-controlled, not user-input)
  - **Exploitability:** Requires crafted patterns in app code using Sentry filtering

**Version note (Sentry downgrade 10.x → 9.x):**

The project is pinned to `@sentry/nextjs @ 9.20.0`. The 10.x line introduced breaking changes with the Next.js 16 App Router + edge runtime integration, causing instability in error reporting. Until the Sentry configuration can be safely migrated, we remain on 9.20.0 with the `minimatch` override below.

**Fix Applied:**

- ✅ Minimatch 10.2.2 available (fixes ReDoS)
- ✅ Added `"minimatch": "^10.2.2"` override to `package.json` (forces patched version across all transitive dependencies)
- ✅ All build stages use `--legacy-peer-deps` flag (bypasses peer dependency conflict from override):
  - **Local development:** `npm install --legacy-peer-deps` ✅
  - **GitHub Actions (test.yml):** `npm ci --legacy-peer-deps` (2 jobs) ✅
  - **Docker production:** `npm ci --legacy-peer-deps` ✅

**Next Steps:**

1. **Short-term** (Current): Use package.json override + `--legacy-peer-deps` flag (applied consistently everywhere)
2. **Long-term** (Watch for Sentry SDK update): Wait for `@sentry/nextjs` to release a version that bumps `minimatch >= 10.2.2` in its dependencies
   - Once Sentry releases a patched version, run: `npm install @sentry/nextjs@latest`
   - Package.json override can be removed once Sentry's transitive dependency is fixed

**Verification:**

```bash
# Check production-only vulnerabilities (dev deps excluded)
npm audit --omit=dev

# Check all vulnerabilities (including dev)
npm audit

# Verify --legacy-peer-deps is used across all builds
# Local: npm install --legacy-peer-deps
# CI: grep 'npm ci --legacy-peer-deps' .github/workflows/test.yml
# Docker: grep 'npm ci' Dockerfile | grep legacy-peer-deps
```

### Dev Dependencies: ESLint/TypeScript Vulnerability Status

**Status**: ✅ Resolved — `npm audit` reports **0 vulnerabilities** across all dependencies.

- `ajv@6.14.0` is still installed as an internal dependency of ESLint (`eslint@9.39.2`), however the advisory GHSA-2g4f-4pwh-qvx6 is no longer flagged by npm audit
- `minimatch` is fully patched via the `^10.2.2` override in `package.json`
- `@redocly/*` packages are patched via selective `ajv@^8.18.0` overrides
- No ESLint 10 upgrade or `typescript-eslint` v9 was required to reach zero vulnerabilities

**Verification**:

```bash
npm audit
# → found 0 vulnerabilities
```

---

## Troubleshooting

### npm Audit

```bash
npm audit
# → found 0 vulnerabilities
```

All known vulnerabilities are resolved. No `--omit=dev` workaround is needed.

### Common Issues

#### Problem: Version bump not triggering

- Check BOT_PAT secret is configured
- Verify GPG secrets are set correctly
- Check workflow runs in Actions tab for errors

#### Problem: Tests failing after version bump

- Version bump PR merges immediately (tests already passed on feature PR)
- If tests fail on feature PR, fix before merging

#### Problem: Docker image not deploying

- Verify Coolify webhook is configured
- Check release workflow completed successfully
- Review deployment logs in Coolify

#### Problem: GPG signature verification failing

- Ensure GPG public key is added to GitHub profile
- Verify GPG_PRIVATE_KEY secret is correct
- Check email in GPG key matches verified GitHub email

#### Problem: Cosign verification failing

- Verify image name and tag are correct (lowercase)
- Check certificate identity regexp matches repository URL
- Ensure OIDC issuer is `https://token.actions.githubusercontent.com`

---

## Additional Resources

- **Contributing Guidelines**: [CONTRIBUTING.md](CONTRIBUTING.md)
- **Security Policy**: [../SECURITY.md](../SECURITY.md)
- **Project README**: [../README.md](../README.md)
- **EzyGo Integration**: [EZYGO_INTEGRATION.md](EZYGO_INTEGRATION.md)
- **Edge Cases Testing**: [EDGE_CASES_TESTS.md](EDGE_CASES_TESTS.md)

---

**Questions or Issues?**

- Open an issue on GitHub
- Check existing documentation
- Review workflow runs in Actions tab
- Join community discussions (if available)

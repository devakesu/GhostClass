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
- [Supabase Browser Proxy (ISP Bypass)](#supabase-browser-proxy-isp-bypass)
- [Known Issues](#known-issues)
- [Cron Job Setup](#cron-job-setup)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

- **Node.js**: v22.12.0+
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

### Development URLs

| URL | Description |
| --- | --- |
| `http://localhost:3000` | App root |
| `http://localhost:3000/api-docs` | Scalar API reference (available in all environments) |
| `http://localhost:3000/api/docs` | Scalar API reference shortcut — **development only**, returns 404 in production |
| `http://localhost:3000/api/health` | Basic health check |
| `http://localhost:3000/api/health/ezygo` | EzyGo integration health (includes rate-limiter + circuit-breaker metrics in dev) |
| `http://localhost:3000/build-info` | Build provenance and version metadata |

### Optional Environment Variables

These variables are **not required** for local development but enable additional behaviour when set.

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_ENABLE_SW_IN_DEV` | `""` (disabled) | Set `"true"` to enable the service worker in development mode (useful for testing PWA/offline behaviour). |
| `FORCE_STRICT_CSP` / `NEXT_PUBLIC_FORCE_STRICT_CSP` | `""` (disabled) | Set `"true"` to enforce a stricter CSP in development (removes most uses of `'unsafe-inline'` but still allows it in `script-src-elem` and certain dev style directives so Next.js hydration and dev tooling continue to work; useful for reproducing CSP violations locally). **Note:** `'unsafe-eval'` is NOT removed in dev mode even when set — Next.js HMR requires it. It is only absent in a real production build. Use `npm run build && npm start` to test the production CSP. |
| `NEXT_PUBLIC_ATTENDANCE_TARGET_MIN` | `75` | Minimum attendance target percentage (1–100). Applies in both development and production. Adjust to match your institution's minimum attendance requirements. |

> **Source maps:** Production source maps are always generated and uploaded to Sentry (with `sourcesContent` embedded so stack traces resolve correctly), then deleted from the build output automatically. They are never publicly served.

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

By default, when a GitHub Actions workflow creates a commit using `GITHUB_TOKEN`, that commit **does not trigger other workflows** (intentional GitHub behaviour to prevent infinite loops).

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
- **MINOR** version (x.y.0): New features, backward-compatible
- **PATCH** version (x.y.z): Bug fixes, backward-compatible

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
   - `public/openapi/openapi.yaml`

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

### GitHub Actions Configuration

The release workflow requires values to be configured in **Settings → Secrets and variables → Actions** on your repository. Build-time values are split into two categories:

#### Variables (non-sensitive, publicly visible in build logs)

Navigate to the **Variables** tab and create the following:

| Variable | Example value | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_NAME` | `GhostClass` | App name shown in UI and emails |
| `NEXT_PUBLIC_APP_DOMAIN` | `ghostclass.devakesu.com` | Production domain (no `https://`) |
| `NEXT_PUBLIC_APP_URL` | *(derived by pipeline)* | Auto-constructed from domain |
| `NEXT_PUBLIC_BACKEND_URL` | `https://…/api/v1/…/` | EzyGo API base URL |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xyz.supabase.co` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbG…` | Supabase anonymous key (public, in JS bundle) |
| `NEXT_PUBLIC_GITHUB_URL` | `https://github.com/…` | Public repository URL |
| `NEXT_PUBLIC_SENTRY_DSN` | `https://…@…ingest…` | Sentry DSN (compiled into JS bundle) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `0x4AAAA…` | Cloudflare Turnstile site key (in HTML) |
| `NEXT_PUBLIC_GA_ID` | `G-XXXXXXXXXX` | Google Analytics measurement ID |
| `NEXT_PUBLIC_AUTHOR_NAME` | `@handle` | Author display name |
| `NEXT_PUBLIC_AUTHOR_URL` | `https://example.com` | Author URL |
| `NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE` | `January 1, 2026` | Legal docs effective date |
| `SENTRY_ORG` | `devakesu` | Sentry organisation slug |
| `SENTRY_PROJECT` | `ghostclass` | Sentry project slug |

Optional Variables (omit to use defaults):

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_REPLAY_RATE` | `0` | Session replay sample rate (0.0–1.0) |
| `NEXT_PUBLIC_GA_ID` | *(blank)* | Omit to disable Google Analytics |
| `NEXT_PUBLIC_ATTENDANCE_TARGET_MIN` | `75` | Minimum attendance target users can set |
| `NEXT_PUBLIC_DONATE_URL` | *(blank)* | Donation link shown in footer |
| `NEXT_PUBLIC_DEFAULT_DOMAIN` | *(blank)* | Fallback domain used by `getAppDomain()` when `NEXT_PUBLIC_APP_DOMAIN` is not set |
| `NEXT_PUBLIC_FORCE_STRICT_CSP` | *(blank)* | Set `"true"` to force strict CSP in production builds |
| `NEXT_PUBLIC_SUPABASE_CF_PROXY_URL` | *(blank)* | CF Worker URL for browser→Supabase requests (ISP bypass Tier 1); omit for direct connection |
| `NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL` | *(blank)* | Lambda URL for browser→Supabase requests (ISP bypass Tier 2 fallback); omit for direct connection |

> **Why Variables and not Secrets?** All values above are non-sensitive and already embedded in the browser JavaScript bundle or HTML. Storing them as Secrets causes GitHub Actions log masking to redact their values from build output, making logs unreadable (e.g. the package name becomes `***@1.9.5`).

#### Secrets (sensitive — masked in logs)

Navigate to the **Secrets** tab and create the following:

| Secret | Description |
| --- | --- |
| `SENTRY_AUTH_TOKEN` | Sentry auth token for source map upload during Docker build (`sntrys_…`) |
| `BOT_PAT` | Classic PAT with `repo` + `workflow` scopes for auto-version-bump commits |
| `GPG_PRIVATE_KEY` | Armoured GPG private key for commit/tag signing |
| `GPG_PASSPHRASE` | GPG key passphrase (omit secret if key uses `%no-protection`) |
| `COOLIFY_BASE_URL` | Deployment server base URL for deployment trigger |
| `COOLIFY_APP_ID` | App UUID on deployment server |
| `COOLIFY_API_TOKEN` | Deployment server API bearer token |
| `CF_PROXY_SECRET` | PROXY_SECRET for the Cloudflare Worker egress proxy — injected into the Worker at deploy time and used at runtime to sign requests from the app |
| `AWS_SECONDARY_SECRET` | PROXY_SECRET for the AWS Lambda egress proxy — injected into the Lambda at deploy time and used at runtime to sign requests from the app |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for deploying the CF Worker egress proxy (`deploy-egress-proxies.yml`) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID for CF Worker deployment |
| `AWS_ACCESS_KEY_ID` | AWS access key ID for deploying the Lambda egress proxy |
| `AWS_SECRET_ACCESS_KEY` | AWS secret access key corresponding to `AWS_ACCESS_KEY_ID` |

> **`NEXT_PUBLIC_APP_VERSION` is not a Variable** — the pipeline derives it automatically from the git tag via the `calculate-version` job. Setting it manually would cause it to go stale after every auto-bump.
> **`SOURCE_DATE_EPOCH` is not a Variable** — the pipeline derives it from the git commit timestamp (`git log -1 --format=%ct`) in the `prep` step. This guarantees the same tag always produces the same image digest (reproducible builds) without any manual sync needed.

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
9. **Deploy**: Automatically deploys to production via the server

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

## Supabase Browser Proxy (ISP Bypass)

When `supabase.co` is blocked by ISPs (or any regional DNS/routing failure), browser clients cannot connect directly to Supabase. GhostClass ships two deployable proxy workers that transparently forward browser → Supabase traffic through your own infrastructure:

| | Tier 1 | Tier 2 |
| --- | --- | --- |
| **Type** | Cloudflare Worker | AWS Lambda + API Gateway |
| **Source** | `workers/supabase-proxy/index.js` | `workers/supabase-proxy-aws/index.mjs` |
| **Free quota** | 100k req / day | 1M req / month |
| **Latency** | Lowest (CF global PoPs) | Higher (single region) |
| **Auto-deploy** | `deploy-egress-proxies.yml` | `deploy-egress-proxies.yml` |

The Next.js **server** always connects to Supabase directly (`server.ts`, `admin.ts`) — only the browser Supabase JS client is affected.

### Architecture

```text
Browser  ──►  CF Worker / Lambda  ──►  <project>.supabase.co
                  (proxy)
Next.js server  ──►  <project>.supabase.co  (direct, always)
```

### Security Model

Unlike the EzyGo egress proxies (server-side, use `x-proxy-secret`), the Supabase proxies are called **directly by the browser**. A shared secret would be visible in DevTools, so the security model uses **Origin header checking** instead:

- Requests from your app's domain are forwarded.
- Requests from other origins are rejected with 403.
- Supabase's own auth (anon key + Row Level Security) governs all data access.

### One-time Setup

#### Tier 1 — Cloudflare Worker

1. Cloudflare Dashboard → **Workers & Pages → Create Worker** → name it e.g. `ghostclass-supabase-proxy`.
2. Paste `workers/supabase-proxy/index.js` as the worker code and **Deploy**.
3. Worker auto-deploys on every push to `main` via CI (see below). The `--var` flags inject `SUPABASE_URL` and `ALLOWED_ORIGIN` automatically from GitHub Actions Variables.

#### Tier 2 — AWS Lambda

1. AWS Console → Lambda → **Create function** → Author from scratch.
   - Runtime: **Node.js 22.x**, Architecture: **arm64**.
   - Function name: e.g. `ghostclass-supabase-proxy`.
2. API Gateway → **HTTP API** → route `ANY /{proxy+}` → Lambda integration. Do **not** place Lambda in a VPC.
3. Lambda auto-deploys on every push to `main` via CI (see below). Env vars (`SUPABASE_URL`, `ALLOWED_ORIGIN`) are updated by the workflow automatically.

### GitHub Actions Variables required

Add these in **Repository → Settings → Secrets and variables → Actions → Variables**:

| Variable | Example value | Description |
| --- | --- | --- |
| `CF_SUPABASE_PROXY_WORKER_NAME` | `ghostclass-supabase-proxy` | Name of the CF Worker |
| `AWS_SUPABASE_LAMBDA_FUNCTION_NAME` | `ghostclass-supabase-proxy` | Lambda function name |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Already required for the app build |
| `NEXT_PUBLIC_APP_DOMAIN` | `yourapp.com` | Already required for CSP |

No new **secrets** are needed — the existing `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` are reused.

### Activating the proxies for users

Set one or both GitHub Actions Variables (build-time), then trigger a new build:

```env
# Tier 1 — CF Worker (preferred: lowest latency)
NEXT_PUBLIC_SUPABASE_CF_PROXY_URL=https://ghostclass-supabase-proxy.<cf-username>.workers.dev

# Tier 2 — AWS Lambda (fallback, independent infra)
NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL=https://<api-gw-id>.execute-api.ap-south-1.amazonaws.com
```

The browser client automatically tries CF → AWS → direct on network errors or 5xx. Setting only one tier is valid — the other will be skipped.

When the ISP block is lifted, **clear both** vars (set to empty) and redeploy. No code change needed.

---

## Known Issues

### Production Vulnerability: minimatch ReDoS (GHSA-3ppc-4f35-3m26)

**Status:** ✅ Fixed via package.json override + `--legacy-peer-deps`

**Description:**

- `@sentry/nextjs@9.20.0` depends on `@sentry/node` which requires `minimatch < 10.2.2`
- minimatch < 10.2.2 contains a ReDoS vulnerability (GHSA-3ppc-4f35-3m26)
- **Risk Level:** MEDIUM
  - **Attack Surface:** Low (Sentry configuration is application-controlled, not user-input)
  - **Exploitability:** Requires crafted patterns in app code using Sentry filtering

**Version note (Sentry downgrade 10.x → 9.x):**

The project is pinned to `@sentry/nextjs@9.20.0`. The 10.x line introduced breaking changes with the Next.js 16 App Router + edge runtime integration, causing instability in error reporting. Until the Sentry configuration can be safely migrated, we remain on 9.20.0 with the `minimatch` override below.

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
- No ESLint 10 upgrade or `typescript-eslint` v9 was required to reach zero vulnerabilities

**Verification**:

```bash
npm audit
# → found 0 vulnerabilities
```

---

## Cron Job Setup

GhostClass has a server-side attendance sync job at `GET /api/cron/sync` that polls EzyGo for all active users and writes updated attendance data to Supabase. It must be triggered by an external scheduler.

### Authentication

The endpoint uses Bearer token auth. Set a strong random secret in your runtime environment:

```bash
# Generate CRON_SECRET (add to your server env vars)
openssl rand -base64 32
```

```env
# .env (runtime secret — never bake into the image)
CRON_SECRET=<your-generated-secret>
```

### Calling the Endpoint

```bash
curl -s \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app.com/api/cron/sync
```

A successful response returns HTTP 200 with a JSON summary:

```json
{
  "success": true,
  "processed": 42,
  "failed": 0,
  "skipped": 0,
  "duration_ms": 3120
}
```

Partial failures (some users synced, some not) return HTTP 207 with per-user error details.

### Recommended Frequency

| Use case | Interval |
| --- | --- |
| Typical deployment | Every 30 minutes |
| Low-traffic / cost-sensitive | Hourly |
| High-traffic / near-real-time | Every 15 minutes |

Avoid sub-5-minute intervals — EzyGo rate-limits outbound requests and the batch fetcher serialises up to `CONCURRENCY_LIMIT=2` users at a time.

### GitHub Actions Schedule

Add a workflow to `.github/workflows/cron-sync.yml`:

```yaml
name: Attendance Sync
on:
  schedule:
    - cron: '*/30 * * * *'   # every 30 minutes
  workflow_dispatch:           # allow manual runs

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger sync
        run: |
          curl -sf \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ vars.NEXT_PUBLIC_APP_URL }}/api/cron/sync"
```

Add `CRON_SECRET` as a **GitHub Secret** and `NEXT_PUBLIC_APP_URL` as a **GitHub Variable**.

### Alternative Schedulers

Any HTTP scheduler works — Vercel Cron Jobs, EasyCron, cron-job.org, AWS EventBridge, a simple systemd timer, etc. The only requirement is the `Authorization: Bearer <CRON_SECRET>` header on a `GET` request to `/api/cron/sync`.

### Rate-Limit Quota

The endpoint is protected by Upstash Redis rate limiting. If you receive HTTP 429, wait for the next window (the `Retry-After` header gives the exact wait time in seconds) before retrying.

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

- Verify server webhook is configured
- Check release workflow completed successfully
- Review deployment logs on the server

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

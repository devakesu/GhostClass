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
- [Mobile Development](#mobile-development)
- [Known Issues](#known-issues)
- [Cron Job Setup](#cron-job-setup)
- [Feature Implementation Details](#feature-implementation-details)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

### Mobile Prerequisites

- **Node.js**: v22.12.0+
- **npm**: v11+
- **Flutter SDK**: 3.41+
- **Dart SDK**: 3.11.5+
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
# Secrets are mapped in 3 Infisical folders: /build-time, /runtime, /ci
infisical login
# Provision local environment variables in-memory

# 4. Start development server
infisical run -- npm run dev

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
| `FORCE_STRICT_CSP` / `NEXT_PUBLIC_FORCE_STRICT_CSP` | `""` (disabled) | Set `"true"` to enforce a stricter CSP in development (removes most uses of `'unsafe-inline'` but still allows it in `script-src-elem` and certain dev style directives so Next.js hydration and dev tooling continue to work; useful for reproducing CSP violations locally). **Note:** `'unsafe-eval'` is NOT removed in dev mode even when set — Next.js HMR requires it. It is only absent in a real production build. Use `npm run build && npm start` to test the production CSP. |
| `NEXT_PUBLIC_ATTENDANCE_TARGET_MIN` | `75` | Minimum attendance target percentage (1–100). Applies in both development and production. Adjust to match your institution's minimum attendance requirements. |
| `NEXT_PUBLIC_ENABLE_SW_IN_DEV` | `false` | Set `"true"` to enable Service Worker registration in development mode. Useful for testing PWA features locally. |
| `TEST_CLIENT_IP` | `""` | Fallback client IP used in development/testing to bypass local network IP detection. Example: `203.0.113.45`. |

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

#### Mobile APK signing secrets

The Flutter Android release workflow also expects these repository secrets so it can create a signed APK before publishing release artifacts:

| Secret Name | Purpose |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded `ghostclass.jks` keystore contents |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Release key alias |
| `ANDROID_KEY_PASSWORD` | Release key password |

These secrets are consumed in the mobile release job before `flutter build apk --release` runs.

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
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | Supabase publishable key (public, in JS bundle) |
| `NEXT_PUBLIC_GITHUB_URL` | `https://github.com/…` | Public repository URL |
| `NEXT_PUBLIC_SENTRY_DSN` | `https://…@…ingest…` | Sentry DSN (compiled into JS bundle) |
| `NEXT_PUBLIC_MOBILE_SENTRY_DSN` | `https://…@…ingest…` | Sentry DSN for mobile app (compiled into APK); falls back to `NEXT_PUBLIC_SENTRY_DSN` if unset |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `0x4AAAA…` | Cloudflare Turnstile site key (in HTML) |
| `NEXT_PUBLIC_GA_ID` | `G-XXXXXXXXXX` | Google Analytics measurement ID |
| `NEXT_PUBLIC_AUTHOR_NAME` | `@handle` | Author display name |
| `NEXT_PUBLIC_AUTHOR_URL` | `https://example.com` | Author URL |
| `SENTRY_ORG` | `devakesu` | Sentry organisation slug |
| `SENTRY_PROJECT` | `ghostclass` | Sentry project slug |
| `NEXT_PUBLIC_ANDROID_PACKAGE_NAME` | `com.ghostclass.app` | Android package name for app linking |

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
| `PROXY_RATE_LIMIT_REQUESTS` | `120` | Optional backend proxy limiter request budget for `/api/backend/*` |
| `PROXY_RATE_LIMIT_WINDOW` | `60` | Optional backend proxy limiter window in seconds for `/api/backend/*` |
| `ALLOW_APP_DOMAIN_LOCALHOST_FALLBACK` | `false` | Optional release workflow fallback toggle for non-tag/manual dispatches when `NEXT_PUBLIC_APP_DOMAIN` is unset |
| `GPG_COMMITTER_NAME` | `GhostClass Bot` | Name used for GPG-signed commits in automated workflows |
| `GPG_COMMITTER_EMAIL` | `bot@ghostclass.dev` | Email used for GPG-signed commits (must match GPG key) |

#### Mobile Security (Runtime Secrets)

| Secret | Description |
| --- | --- |
| `JWE_PRIVATE_KEY` | RSA Private Key for request/response encryption (required for mobile) |
| `ENFORCE_APP_CHECK` | Set to `"true"` to enforce Firebase App Check |

> **Why Variables and not Secrets?** All values above are non-sensitive and already embedded in the browser JavaScript bundle or HTML. Storing them as Secrets causes GitHub Actions log masking to redact their values from build output, making logs unreadable (e.g. the package name becomes `***@1.9.5`).

#### Secrets (sensitive — masked in logs)

Navigate to the **Secrets** tab and create the following:

| Secret | Description |
| --- | --- |
| `SENTRY_AUTH_TOKEN` | Sentry auth token for source map upload during Docker build (`sntrys_…`) |
| `MOBILE_SENTRY_AUTH_TOKEN` | Optional separate Sentry auth token for Flutter mobile debug symbol uploads |
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
| `CODECOV_TOKEN` | Optional Codecov token (recommended for private repos or stricter upload authentication) |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI access token used by `deploy-supabase.yaml` |
| `SUPABASE_DB_PASSWORD` | Database password used during `supabase db push` |
| `SUPABASE_PROJECT_ID` | Supabase project reference for `supabase link` |
| `FIREBASE_GOOGLE_SERVICES_JSON_BASE64` | Base64-encoded `google-services.json` injected during CI builds |
| `FIREBASE_GOOGLE_SERVICE_INFO_PLIST_BASE64` | Base64-encoded `GoogleService-Info.plist` injected during CI builds |
| `MOBILE_APP_SECRETS_BASE64` | Base64-encoded `app_secrets.dart` injected during CI builds |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded release keystore binary for mobile artifact signing |
| `ANDROID_KEYSTORE_PASSWORD` | Password for the release keystore |
| `ANDROID_KEY_ALIAS` | Key alias within the release keystore |
| `ANDROID_KEY_PASSWORD` | Password for the specific release key alias |

**🔒 Gitignored Production Artifacts Guidance Note**: To maintain secure boundaries and prevent repository leaks, critical files such as backend `.env.production` definitions, Firebase configurations (`google-services.json`, `GoogleService-Info.plist`), and native mobile signing assets (`app_secrets.dart`, release keystores, `key.properties`) are strictly ignored via `.gitignore`. The CI/CD pipeline dynamically materializes these files at compilation time by decoding base64-encoded versions supplied through the secure repository secrets above.

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

### Status: ✅ All Resolved

`npm audit` reports **0 vulnerabilities** across all dependencies.

- **Sentry SDK**: The project has been successfully migrated to `@sentry/nextjs@10.x`. Previous stability issues with the Next.js 16 App Router and Edge Runtime have been resolved.
- **minimatch**: The ReDoS vulnerability (GHSA-3ppc-4f35-3m26) is fully patched via the `^10.2.2` override in `package.json`.
- **ESLint/TypeScript**: All dev dependencies are up-to-date and vulnerability-free.

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
# Infisical Secret Mapping (Store in `/runtime` folder — injected dynamically into memory at boot time)
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

## Mobile Development

The `mobile/` directory contains the Flutter application for Android and iOS. It is a first-class member of this monorepo alongside the Next.js web app.

### Prerequisites

- **Flutter SDK** — 3.41+ ([install guide](https://docs.flutter.dev/get-started/install))
- **Dart SDK** — 3.11.5+ (bundled with Flutter)
- **Android Studio** — For Android emulator, Gradle, and the Android build toolchain
- **Xcode** (macOS only) — For iOS simulator and iOS builds
- **Firebase CLI** — For `flutterfire configure` and App Check setup

Verify your Flutter installation:

```bash
flutter doctor
```

### Setup

#### 1. Install Flutter dependencies

```bash
cd mobile
flutter pub get
```

#### 2. Create `lib/config/app_secrets.dart`

This file is **gitignored** — you must create it manually. It contains API endpoints, Sentry DSN, and other runtime secrets.

See [mobile/README.md](../mobile/README.md#secrets-setup) for the full file schema.

#### 3. Local Vendored Packages

GhostClass uses local vendored packages for security-critical plugins to ensure trust and allow for local patches. Ensure the `mobile/packages/` directory is present:

- `firebase_app_check`: Standardized Firebase App Check for cross-platform integrity.

These are already linked via `path` in `pubspec.yaml`. No separate setup is required other than ensuring the files exist in the `packages/` directory.

#### 4. Place Firebase config files

<!-- markdownlint-disable MD060 -->
| File                      | Path                                        | Platform |
| ------------------------- | ------------------------------------------- | -------- |
| `google-services.json`    | `mobile/android/app/google-services.json`   | Android  |
| `GoogleService-Info.plist` | `mobile/ios/Runner/GoogleService-Info.plist` | iOS      |
<!-- markdownlint-enable MD060 -->

Both files are **gitignored**. Download them from your Firebase project console or run:

```bash
cd mobile
flutterfire configure
```

#### 4. Configure Firebase App Check (development)

For local development, use the **Debug** App Check provider. Add your debug token to the Firebase console under **App Check → Apps → [your app] → Debug tokens**.

On Android, the debug token is printed to logcat on first launch:

```bash
adb logcat | grep "DebugAppCheckProvider"
```

### Running the App

```bash
cd mobile

# List available devices
flutter devices

# Run on a specific device (debug mode)
flutter run -d <device-id>

# Run with verbose output
flutter run -v
```

### Mobile Security Architecture

GhostClass Mobile implements a zero-trust security model to ensure institution-level blocks and forensic analysis cannot compromise user data.

#### 1. Hardware-Backed Storage

We use `flutter_secure_storage` to store sensitive data (EzyGo bearer tokens, encryption keys).

- **Android**: Data is encrypted using AES-GCM-NoPadding in the Android Keystore.
- **iOS**: Data is stored in the Keychain with `kSecAttrAccessibleAfterFirstUnlock`.

#### 2. Network Security (JWE)

All traffic between the mobile app and the GhostClass API is encrypted bi-directionally using **JSON Web Encryption (JWE)**:

- **Encryption**: RSA-OAEP-256 (for key wrap) + AES-GCM-256 (for payload).
- **Format**: JWE compact serialization (5-part token).
- **Security**: Ensures that even if TLS is intercepted (e.g., via a company root CA), the attendance data remains unreadable.

#### 3. Device Integrity (App Check)

We enforce Firebase App Check to verify app binary genuineness and device integrity.

#### 4. Stealth Headers

The app injects custom, non-standard headers to mimic legitimate browser traffic and bypass simple User-Agent based fingerprinting used by institutional ISPs.

### Code Generation

Riverpod providers use `build_runner` code generation. After modifying any `@riverpod` annotated provider, regenerate:

```bash
cd mobile
dart run build_runner build --delete-conflicting-outputs

# Or watch mode during development
dart run build_runner watch --delete-conflicting-outputs
```

### Analysis & Testing

```bash
cd mobile

# Static analysis
flutter analyze

# Run unit + widget tests
flutter test

# With coverage
flutter test --coverage
```

#### 🛡️ Mobile Testing Strategy & CI/CD Gates

- **Unit & Logic Parity**: Verifies cross-platform implementation of attendance calculations, JWE wrapping interceptors, and SecureStorage integrations.
- **Coverage Gates**: Mandatory GitHub Actions workflows enforce an **80% global code coverage threshold** on all pull requests and commits. Mission-critical security/math libraries enforce **100% module-level coverage**.
- **Exception Simulation**: Integrates `mocktail` to inject extreme API edge cases and simulated App Check attestation failures during testing.

**Before submitting a PR with mobile changes**, run `flutter analyze` to ensure there are no analysis issues.

### Building

```bash
cd mobile

# Android debug APK
flutter build apk --debug

# Android release App Bundle (for Play Store)
flutter build appbundle --release --obfuscate --split-debug-info=build/symbols

# iOS release (macOS + Xcode required)
flutter build ios --release
```

> **Note**: Release builds require properly signed credentials. Place `android/key.properties` and the corresponding keystore file (both **gitignored**) before building a signed release APK or AAB.

### Architecture Notes

- **State**: Riverpod 3 with code-generated providers. Each feature domain has its own provider file under `lib/providers/`.
- **Networking**: All requests go through `ApiService` (Dio + `JweInterceptor`). The interceptor fetches the JWE public key from the backend on first use, then wraps every request body in JWE before sending and decrypts every response body on receipt.
- **Secrets storage**: `SecureStorageService` wraps `flutter_secure_storage`. The EzyGo bearer token, Supabase session, and any sensitive keys are stored here — never in `shared_preferences`.
- **Security guard**: `SecurityGuard.check()` is called at app startup to verify device integrity via Firebase App Check.

---

## Additional Resources

- **Contributing Guidelines**: [CONTRIBUTING.md](CONTRIBUTING.md)
- **Security Policy**: [../SECURITY.md](../SECURITY.md)
- **Project README**: [../README.md](../README.md)
- **Mobile App README**: [../mobile/README.md](../mobile/README.md)
- **EzyGo Integration**: [EZYGO_INTEGRATION.md](EZYGO_INTEGRATION.md)
- **Edge Cases Testing**: [EDGE_CASES_TESTS.md](EDGE_CASES_TESTS.md)

---

**Questions or Issues?**

- Open an issue on GitHub
- Check existing documentation
- Review workflow runs in Actions tab
- Join community discussions (if available)

---

## Feature Implementation Details

### Disable Courses

Courses can be disabled on a per-semester basis so they no longer affect aggregate attendance statistics. This is useful when a student has passed a challenge exam or otherwise no longer needs to attend a course.

#### How It Works

1. **Toggle** — Each course card shows a status indicator (green dot **Enabled** / red dot **Disabled**) next to the course code.
2. **Persistence** — The disabled state is stored in the `disabled_courses` JSONB column on the `user_settings` table, keyed by `year-semester`.
3. **Parity** — Both Web (TanStack Query) and Mobile (Riverpod) synchronize this state from Supabase and apply it during the attendance aggregation phase.

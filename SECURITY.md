# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in GhostClass, please report it
responsibly:

**Email**: [admin@ghostclass.devakesu.com](mailto:admin@ghostclass.devakesu.com)

Please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

We take security seriously and will respond to reports as quickly as possible.

## Security Features

GhostClass implements multiple layers of security:

### Authentication & Authorization

- **Supabase Auth** - Industry-standard authentication with JWT tokens
- **Row Level Security (RLS)** - Database-level access control ensuring users
  only access their data
- **Session Management** - Secure session handling with automatic expiration

### Data Protection

- **HttpOnly Cookies** - Multiple `httpOnly` cookies with distinct `SameSite`
  policies. The session token (`ezygo_access_token`) uses `SameSite=Lax` —
  intentional to allow the cookie on PWA standalone launches (top-level
  navigations); `Strict` would block it on bookmarks and installed-app launch,
  causing an infinite redirect loop. The CSRF token cookie uses
  `SameSite=Strict` since it only needs to be present on same-site requests
  where the header can be validated. All mutations require a valid CSRF token
  regardless.
- **Secure Headers** - HSTS, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy
- **Input Validation** - Zod schemas validate all user input
- **Origin Validation** - Strict origin checking in production
- **AES-256-GCM Encryption** - Secure token encryption at rest

### API Security

- **Rate Limiting** - Upstash Redis-based rate limiting per IP/user
- **Circuit Breaker Pattern** - Graceful handling of upstream API failures
- **Request Deduplication** - Prevents duplicate concurrent requests
- **Bot Protection** - Cloudflare Turnstile on public endpoints
- **CSRF Protection** - Custom token-based CSRF protection for web; App Check
  attestation for mobile requests. `MOBILE_API_SECRET` is maintained as a
  **server-only** HMAC key for signing security nonces (stateless replay
  protection).
- **Device Attestation (Mobile)** - Firebase App Check with Play Integrity
  (Android) and DeviceCheck (iOS)
- **Anti-Tapjacking (Mobile)** - Android `FLAG_SECURE` implementation to prevent
  screenshot/overlay attacks on sensitive screens

### Supply Chain Security

- **Signed Docker Images** - All images signed with Sigstore cosign (keyless
  OIDC)
- **SLSA Level 3 Provenance** - Build provenance attestations
- **GitHub Attestations** - Native GitHub artifact attestations
- **SBOM (CycloneDX)** - Software Bill of Materials for all releases
- **Reproducible Builds** - Deterministic builds with SOURCE_DATE_EPOCH
- **Vulnerability Scanning** - Trivy scanning on every build

### CI/CD Security

- **Script Injection Prevention** - Environment variables used for all untrusted
  GitHub Actions inputs
- **Least Privilege Permissions** - Workflows use minimum required permissions
  with explicit grants
- **GPG Signing** - Commits and tags cryptographically signed (except Dependabot
  PRs)
- **Secret Management** - GitHub secrets isolated per workflow with no
  cross-contamination
- **Dependabot Isolation** - Special handling for Dependabot PRs without secret
  access

### Environment Security

- **Environment Variable Validation** - Runtime validation of required secrets
- **Two-Tier Secret Management** - Separate build-time and runtime secrets
- **Production Safety Checks** - Strict validation in production mode

### Egress Proxy Chain

- **EzyGo Server-Side Egress** - All server-to-EzyGo API requests route through
  a two-tier egress proxy chain: a Cloudflare Worker (`CF_PROXY_URL`, Tier 1)
  falling back to an AWS Lambda (`AWS_SECONDARY_URL`, Tier 2), then direct. This
  masks the origin server IP and bypasses ISP-level blocks. Implemented via
  `egressFetch()` / `egressAxios` in `src/lib/utils.server.ts`.
- **Supabase Browser Proxy (ISP Bypass)** - Browser-to-Supabase requests
  auto-fail-over through the same pattern: CF Worker
  (`NEXT_PUBLIC_SUPABASE_CF_PROXY_URL`) → Lambda
  (`NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL`) → direct. Implemented in
  `src/lib/supabase/client.ts`.
- **Proxy Secret Validation** - All proxy workers validate an `x-proxy-secret`
  header on every incoming request; requests without a valid secret are rejected
  with `403`. Secrets are never embedded in the client bundle
  (`CF_PROXY_SECRET`, `AWS_SECONDARY_SECRET`, and `MOBILE_API_SECRET` are
  server-only runtime variables).

## Dependency Security Overrides

GhostClass uses npm overrides to enforce minimum secure versions of transitive
dependencies. All overrides are documented below with their security rationale:

### Current Overrides (package.json)

#### serialize-javascript: ^7.0.5

- **Reason**: Cross-site scripting vulnerability in versions <3.1.0
- **CVEs**: CVE-2020-7660
- **Scope**: Dev-only (used by Webpack/build toolchain)
- **Status**: ✅ Patched

#### tar: ^7.5.15

- **Reason**: Path traversal vulnerabilities in versions ≤7.5.14
- **CVEs**: CVE-2021-32803, CVE-2021-32804, CVE-2021-37701, CVE-2021-37712,
  CVE-2021-37713 / GHSA-qffp-2rhf-9h96
- **Scope**: Dev-only (used by supabase CLI for unpacking)
- **Status**: ✅ Patched

#### js-yaml: ^4.1.1

- **Reason**: Code execution via `load()` function in versions <4.0.0
- **CVEs**: CVE-2021-23343
- **Scope**: Dev-only (used by ESLint → @eslint/eslintrc)
- **Status**: ✅ Patched

#### rollup: ^4.60.3

- **Reason**: Security and stability improvements in v4.x
- **Scope**: Dev-only (used by Vite/Vitest for bundling)
- **Status**: ✅ Up-to-date

#### glob: ^13.0.6

- **Reason**: Performance improvements and security hardening in v13+
- **Scope**: Dev-only (used by build tools: Sentry, Serwist)
- **Status**: ✅ Up-to-date

#### source-map: ^0.8.0

- **Reason**: Dependency resolution conflicts and stability improvements
- **Scope**: Dev-only (used by Vite/Terser for sourcemap generation)
- **Status**: ✅ Up-to-date

#### minimatch: ^10.2.5

- **Reason**: ReDoS vulnerability in versions <3.0.5
- **CVEs**: GHSA-3ppc-4f35-3m26
- **Scope**: Dev-only (used by @sentry/nextjs and other build tools)
- **Status**: ✅ Patched

#### flatted: ^3.4.2

- **Reason**: Security improvements and dependency resolution
- **Scope**: Transitive dependency (used by various dev tools)
- **Status**: ✅ Up-to-date

#### @tootallnate/once: ^3.0.1

- **Reason**: Memory leak prevention and event listener security hardening in
  legacy HTTP agent wrappers
- **Scope**: Dev-only / transitive dependency
- **Status**: ✅ Up-to-date

#### postcss: ^8.5.14

- **Reason**: Security hardening and dependency stability
- **Scope**: Transitive dependency (used by Tailwind CSS)
- **Status**: ✅ Up-to-date

#### sharp: ^0.35.0

- **Reason**: Native memory safety hardening and libvips security patches
- **Scope**: Production dependency (used by Next.js image optimization)
- **Status**: ✅ Up-to-date

#### uuid: ^14.0.1

- **Reason**: CSPRNG generation hardening and prototype protection in v14+
- **Scope**: Production & transitive dependency
- **Status**: ✅ Up-to-date

### Egress Worker Overrides (workers/package.json)

#### undici: ^8.4.2

- **Reason**: HTTP request smuggling and header injection protection in Worker
  fetch engine
- **Scope**: Proxy worker dependency
- **Status**: ✅ Patched

#### ws: ^8.20.1

- **Reason**: Resource exhaustion DoS vulnerability fix (CVE-2024-37890)
- **Scope**: Proxy worker dependency
- **Status**: ✅ Patched

### Maintenance Policy

- Overrides are reviewed during each major release
- Transitive dependencies are audited via `npm audit`
- OpenSSF Scorecard tracks vulnerability status
- Security patches applied within 7 days of disclosure

## Known Issues

No active known issues. `npm audit` reports **0 vulnerabilities** across all
dependencies.

All previously tracked issues have been resolved:

| Issue                                                       | Resolution                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| `ajv <8.18.0` ReDoS (GHSA-2g4f-4pwh-qvx6) in ESLint         | Advisory resolved — no longer flagged by `npm audit`.      |
| `minimatch` ReDoS (GHSA-3ppc-4f35-3m26) in `@sentry/nextjs` | Fixed via `minimatch: ^10.2.5` override in `package.json`. |

See [Dependency Security Overrides](#dependency-security-overrides) for the
current override list.

## GitHub Actions Security

### Script Injection Prevention

GhostClass workflows are hardened against script injection attacks using
environment variables for all untrusted inputs.

#### Vulnerable Pattern (❌ DO NOT USE)

```yaml
run: |
  VERSION_TAG="${{ github.event.inputs.version_tag }}"
  git checkout "refs/tags/${VERSION_TAG}"
```

**Risk**: Attacker-controlled inputs like branch names, tag names, or workflow
inputs can contain shell metacharacters (`;`, `|`, `$()`, etc.) that execute
arbitrary commands.

#### Secure Pattern (✅ ALWAYS USE)

```yaml
env:
  INPUT_VERSION_TAG: ${{ github.event.inputs.version_tag }}
run: |
  VERSION_TAG="$INPUT_VERSION_TAG"
  git checkout "refs/tags/${VERSION_TAG}"
```

**Protection**: Environment variables treat the entire input as literal data,
preventing command injection.

#### Protected Workflows

##### release.yml

- Dynamic versions injected from Infisical are processed via intermediate
  environment mapping (`env.VERSION_TAG`, `env.VERSION`) during markdown
  verification and release generation loops.
- `github.repository` and `github.repository_owner` are passed via localized
  `env:` blocks to prevent repository name manipulation during container image
  publishing and artifact attestation steps.

#### References

- [GitHub Security Lab: Preventing pwn requests](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/)
- [GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-an-intermediate-environment-variable)
- [OpenSSF Scorecard: Token Permissions Check](https://github.com/ossf/scorecard/blob/main/docs/checks.md#token-permissions)

## Verifying Docker Image Signatures

All Docker images are signed using Sigstore cosign with keyless (OIDC) signing.

### Prerequisites

Install cosign:

```bash
# macOS
brew install cosign

# Linux
COSIGN_VERSION="3.0.6"
COSIGN_CHECKSUM="130310708579d469f6920d046c86e680a6519183" # Correct for v3.0.6
wget "https://github.com/sigstore/cosign/releases/download/v${COSIGN_VERSION}/cosign-linux-amd64"
# Verification logic: cosign-linux-amd64 binary is self-verified via OIDC during build
chmod +x cosign-linux-amd64
sudo mv cosign-linux-amd64 /usr/local/bin/cosign

# Windows
scoop install cosign
```

### Quick Verification

Verify an image using regex pattern (recommended):

```bash
cosign verify \
  --certificate-identity-regexp="^https://github.com/devakesu/GhostClass/.github/workflows/" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/devakesu/ghostclass:latest
```

### Strict Verification

For maximum security, verify against specific workflow:

```bash
# Latest release (release.yml)
cosign verify \
  --certificate-identity="https://github.com/devakesu/GhostClass/.github/workflows/release.yml@refs/heads/main" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/devakesu/ghostclass:latest

# Specific version tag (release.yml)
cosign verify \
  --certificate-identity="https://github.com/devakesu/GhostClass/.github/workflows/release.yml@refs/heads/main" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/devakesu/ghostclass:vX.Y.Z
```

### Deployment Integration (Coolify)

Add signature verification to your deployment script:

```bash
#!/bin/bash
set -euo pipefail

IMAGE="ghcr.io/devakesu/ghostclass:latest"

echo "Verifying image signature..."
cosign verify \
  --certificate-identity-regexp="^https://github.com/devakesu/GhostClass/.github/workflows/" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  "${IMAGE}"

echo "✓ Signature verified - deploying..."
docker pull "${IMAGE}"
```

### GitHub Attestations

View build attestations:

```bash
# View provenance
gh attestation verify oci://ghcr.io/devakesu/ghostclass:latest \
  --owner devakesu

# View SBOM
gh attestation verify oci://ghcr.io/devakesu/ghostclass:latest \
  --owner devakesu \
  --signer-repo devakesu/GhostClass
```

Or browse attestations on GitHub:

[https://github.com/devakesu/GhostClass/attestations](https://github.com/devakesu/GhostClass/attestations)

### Web Interface

View build provenance and security information directly in your browser:

**Live Deployment**: Visit `/build-info` on any running instance to see:

- Build ID with links to GitHub Actions workflow runs
- Commit SHA and deployment timestamp
- Security audit status (Trivy scan results)
- SLSA attestation status and links
- Direct links to source code, build logs, and attestations

**Footer Link**: Click the "verified" badge in the footer to access build
transparency information.

The web interface provides a user-friendly way to verify build provenance
without requiring command-line tools, making security information accessible to
all users.

## Deployment Security Checklist

Before deploying to production:

### Required Configuration

- [ ] All required environment variables are set
- [ ] Database RLS policies are enabled
- [ ] Docker image signature verified
- [ ] HTTPS is enforced
- [ ] Secure headers configured

### Security Controls

- [ ] Origin validation enabled
- [ ] Rate limiting configured (Upstash Redis)
- [ ] Circuit breaker thresholds set appropriately
- [ ] Cloudflare Turnstile enabled
- [ ] CSRF protection enabled

### Monitoring & Logging

- [ ] Sentry error tracking configured
- [ ] Security event logging enabled
- [ ] Health check endpoint accessible
- [ ] Vulnerability scanning in CI/CD

### Network Security

- [ ] Container behind reverse proxy/firewall
- [ ] No direct external access to container
- [ ] Internal network isolation
- [ ] TLS certificates valid

## Security Best Practices

### For Contributors

- Never commit secrets or API keys
- Use environment variables for sensitive data
- Follow secure coding practices
- Report security issues privately
- Keep dependencies updated

### For Deployers

- Use verified Docker images only
- Keep container runtime updated
- Monitor security advisories
- Implement proper network segmentation
- Enable all security features before production

## Security Monitoring

GhostClass participates in:

- **OpenSSF Scorecard** - Automated security best practices checking
- **Dependabot** - Automated dependency vulnerability scanning
- **Trivy** - Container image vulnerability scanning
- **Sentry** - Real-time error tracking and monitoring

View our security score:
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/devakesu/GhostClass/badge)](https://scorecard.dev/viewer/?uri=github.com/devakesu/GhostClass)

## Additional Resources

- **SLSA Framework**: [https://slsa.dev](https://slsa.dev)
- **Sigstore Project**: [https://sigstore.dev](https://sigstore.dev)
- **OpenSSF Scorecard**: [https://scorecard.dev](https://scorecard.dev)
- **GitHub Security**:
  [https://docs.github.com/en/code-security](https://docs.github.com/en/code-security)

---

For development setup and contribution guidelines, see
[CONTRIBUTING.md](docs/CONTRIBUTING.md).

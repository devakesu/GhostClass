# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in GhostClass, please report it responsibly:

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
- **Row Level Security (RLS)** - Database-level access control ensuring users only access their data
- **Session Management** - Secure session handling with automatic expiration

### Data Protection

- **HttpOnly Cookies** - Multiple `httpOnly` cookies with distinct `SameSite` policies. The session token (`ezygo_access_token`) uses `SameSite=Lax` — intentional to allow the cookie on PWA standalone launches (top-level navigations); `Strict` would block it on bookmarks and installed-app launch, causing an infinite redirect loop. The CSRF token cookie uses `SameSite=Strict` since it only needs to be present on same-site requests where the header can be validated. All mutations require a valid CSRF token regardless.
- **Secure Headers** - HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **Input Validation** - Zod schemas validate all user input
- **Origin Validation** - Strict origin checking in production
- **AES-256-GCM Encryption** - Secure token encryption at rest

### API Security

- **Rate Limiting** - Upstash Redis-based rate limiting per IP/user
- **Circuit Breaker Pattern** - Graceful handling of upstream API failures
- **Request Deduplication** - Prevents duplicate concurrent requests
- **Bot Protection** - Cloudflare Turnstile on public endpoints
- **CSRF Protection** - Custom token-based CSRF protection

### Supply Chain Security

- **Signed Docker Images** - All images signed with Sigstore cosign (keyless OIDC)
- **SLSA Level 3 Provenance** - Build provenance attestations
- **GitHub Attestations** - Native GitHub artifact attestations
- **SBOM (CycloneDX)** - Software Bill of Materials for all releases
- **Reproducible Builds** - Deterministic builds with SOURCE_DATE_EPOCH
- **Vulnerability Scanning** - Trivy scanning on every build

### CI/CD Security

- **Script Injection Prevention** - Environment variables used for all untrusted GitHub Actions inputs
- **Least Privilege Permissions** - Workflows use minimum required permissions with explicit grants
- **GPG Signing** - Commits and tags cryptographically signed (except Dependabot PRs)
- **Secret Management** - GitHub secrets isolated per workflow with no cross-contamination
- **Dependabot Isolation** - Special handling for Dependabot PRs without secret access

### Environment Security

- **Environment Variable Validation** - Runtime validation of required secrets
- **Two-Tier Secret Management** - Separate build-time and runtime secrets
- **Production Safety Checks** - Strict validation in production mode

### Egress Proxy Chain

- **EzyGo Server-Side Egress** - All server-to-EzyGo API requests route through a two-tier egress proxy chain: a Cloudflare Worker (`CF_PROXY_URL`, Tier 1) falling back to an AWS Lambda (`AWS_SECONDARY_URL`, Tier 2), then direct. This masks the origin server IP and bypasses ISP-level blocks. Implemented via `egressFetch()` / `egressAxios` in `src/lib/utils.server.ts`.
- **Supabase Browser Proxy (ISP Bypass)** - Browser-to-Supabase requests auto-fail-over through the same pattern: CF Worker (`NEXT_PUBLIC_SUPABASE_CF_PROXY_URL`) → Lambda (`NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL`) → direct. Implemented in `src/lib/supabase/client.ts`.
- **Proxy Secret Validation** - All proxy workers validate an `x-proxy-secret` header on every incoming request; requests without a valid secret are rejected with `403`. Secrets are never embedded in the client bundle (`CF_PROXY_SECRET` and `AWS_SECONDARY_SECRET` are server-only runtime variables).

## Dependency Security Overrides

GhostClass uses npm overrides to enforce minimum secure versions of transitive dependencies. All overrides are documented below with their security rationale:

### Current Overrides (package.json)

#### tar: ^7.5.6

- **Reason**: Path traversal vulnerabilities in versions <6.1.9
- **CVEs**: CVE-2021-32803, CVE-2021-32804, CVE-2021-37701, CVE-2021-37712, CVE-2021-37713
- **Scope**: Dev-only (used by supabase CLI for unpacking)
- **Status**: ✅ Patched

#### fast-xml-parser: ^5.3.4

- **Reason**: Prototype pollution and XXE (XML External Entity) vulnerabilities in versions <4.2.4
- **CVEs**: CVE-2023-26920 (prototype pollution), CVE-2022-39353 (XXE)
- **Scope**: Dev-only (used by @redocly/cli for OpenAPI parsing)
- **Status**: ✅ Patched

#### js-yaml: ^4.1.1

- **Reason**: Code execution via `load()` function in versions <4.0.0
- **CVEs**: CVE-2021-23343
- **Scope**: Dev-only (used by ESLint and Redocly CLI)
- **Status**: ✅ Patched

#### glob: ^13.0.6

- **Reason**: Performance improvements and security hardening in v13+
- **Scope**: Dev-only (used by build tools: Sentry, Serwist)
- **Status**: ✅ Up-to-date

#### source-map: ^0.7.6

- **Reason**: Dependency resolution conflicts and stability improvements
- **Scope**: Dev-only (used by Vite/Terser for sourcemap generation)
- **Status**: ✅ Up-to-date

#### @redocly/cli, @redocly/openapi-core, @redocly/respect-core → ajv: ^8.18.0 (selective override)

- **Reason**: ReDoS vulnerability when using `$data` option in @redocly packages' ajv dependency
- **CVEs**: CVE-2025-69873 / [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6)
- **Scope**: Dev-only (Redocly CLI for OpenAPI validation)
- **Status**: ✅ Patched via selective overrides
- **Note**: ESLint's internal ajv (v6) is no longer flagged by `npm audit` — the advisory was resolved without requiring a global override or ESLint upgrade

### Maintenance Policy

- Overrides are reviewed during each major release
- Transitive dependencies are audited via `npm audit`
- OpenSSF Scorecard tracks vulnerability status
- Security patches applied within 7 days of disclosure

## Known Issues

No active known issues. `npm audit` reports **0 vulnerabilities** across all dependencies.

All previously tracked issues have been resolved:

| Issue | Resolution |
| --- | --- |
| `ajv <8.18.0` ReDoS (GHSA-2g4f-4pwh-qvx6) in ESLint | Advisory resolved — no longer flagged by `npm audit`. `@redocly/*` selective overrides remain as defence-in-depth. |
| `minimatch` ReDoS (GHSA-3ppc-4f35-3m26) in `@sentry/nextjs` | Fixed via `minimatch: ^10.2.2` override in `package.json`. |

See [Dependency Security Overrides](#dependency-security-overrides) for the current override list.

## GitHub Actions Security

### Script Injection Prevention

GhostClass workflows are hardened against script injection attacks using environment variables for all untrusted inputs.

#### Vulnerable Pattern (❌ DO NOT USE)

```yaml
run: |
  VERSION_TAG="${{ github.event.inputs.version_tag }}"
  git checkout "refs/tags/${VERSION_TAG}"
```

**Risk**: Attacker-controlled inputs like branch names, tag names, or workflow inputs can contain shell metacharacters (`;`, `|`, `$()`, etc.) that execute arbitrary commands.

#### Secure Pattern (✅ ALWAYS USE)

```yaml
env:
  INPUT_VERSION_TAG: ${{ github.event.inputs.version_tag }}
run: |
  VERSION_TAG="$INPUT_VERSION_TAG"
  git checkout "refs/tags/${VERSION_TAG}"
```

**Protection**: Environment variables treat the entire input as literal data, preventing command injection.

#### Protected Workflows

##### auto-version-bump.yml

- `github.actor` → `ACTOR` environment variable
- `github.head_ref` → `HEAD_REF` environment variable
- `github.event.pull_request.head.repo.full_name` → `PR_HEAD_REPO` environment variable
- Prevents malicious branch names from executing code during Dependabot detection

##### release.yml

- `github.event.client_payload.version_tag` → `INPUT_VERSION_TAG_DISPATCH` environment variable
- `github.event.inputs.version_tag` → `INPUT_VERSION_TAG_MANUAL` environment variable
- `github.ref_name` → `REF_NAME` environment variable
- `github.ref_type` → `REF_TYPE` environment variable
- Prevents malicious tag names in repository_dispatch and manual workflow triggers

##### pipeline.yml

- `github.repository` → `REPO` environment variable
- `github.run_id` → `RUN_ID` environment variable
- Prevents repository name manipulation in GitHub API calls

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
COSIGN_VERSION="3.0.4"
COSIGN_CHECKSUM="10dab2fd2170b5aa0d5c0673a9a2793304960220b314f6a873bf39c2f08287aa"
wget "https://github.com/sigstore/cosign/releases/download/v${COSIGN_VERSION}/cosign-linux-amd64"
echo "${COSIGN_CHECKSUM}  cosign-linux-amd64" | sha256sum --check
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
  --certificate-identity="https://github.com/devakesu/GhostClass/.github/workflows/release.yml@refs/tags/vX.Y.Z" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/devakesu/ghostclass:latest

# Specific version tag (release.yml)
cosign verify \
  --certificate-identity="https://github.com/devakesu/GhostClass/.github/workflows/release.yml@refs/tags/vX.Y.Z" \
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

**Footer Link**: Click the "verified" badge in the footer to access build transparency information.

The web interface provides a user-friendly way to verify build provenance without requiring command-line tools, making security information accessible to all users.

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

View our security score: [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/devakesu/GhostClass/badge)](https://scorecard.dev/viewer/?uri=github.com/devakesu/GhostClass)

## Additional Resources

- **SLSA Framework**: [https://slsa.dev](https://slsa.dev)
- **Sigstore Project**: [https://sigstore.dev](https://sigstore.dev)
- **OpenSSF Scorecard**: [https://scorecard.dev](https://scorecard.dev)
- **GitHub Security**: [https://docs.github.com/en/code-security](https://docs.github.com/en/code-security)

---

For development setup and contribution guidelines, see [CONTRIBUTING.md](docs/CONTRIBUTING.md).

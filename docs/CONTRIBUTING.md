# Contributing to GhostClass

Thank you for your interest in contributing to GhostClass! This guide will help you understand our development workflow and contribution process.

> **👋 For External Contributors**: You don't need GPG keys, PAT tokens, or any special setup! Just fork, code, and submit a PR. The version bump workflow will guide you through a simple script. See [Quick Setup](#quick-setup) below.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Automatic Version Bumping](#automatic-version-bumping)
- [Pull Request Process](#pull-request-process)
- [Code Quality & Testing](#code-quality--testing)
- [Build Performance Tips](#build-performance-tips)
- [Commit Messages](#commit-messages)
- [For Maintainers Only](#for-maintainers-only)

## Getting Started

### Prerequisites

- **Node.js**: 20.19.0+ or 22.12.0+
- **npm**: 11+
- **Git**: Latest version

**That's it!** External contributors don't need GPG keys, GitHub PAT tokens, or access to secrets.

### Quick Setup

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/GhostClass.git
cd GhostClass

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Create feature branch
git checkout -b feature/your-feature-name

# 4. Start development server
npm run dev
```

**That's all you need to start developing!** For advanced maintainer setup (GPG, PAT tokens, deployment), see [For Maintainers Only](#for-maintainers-only) at the bottom of this guide.

## Development Workflow

### Available Commands

```bash
npm run dev              # Development server (HTTP)
npm run dev:https        # Development server (HTTPS, requires certificates)
npm run build            # Production build
npm run lint             # Run ESLint
npm run test             # Run unit tests
npm run test:e2e         # Run end-to-end tests
npm run test:coverage    # Generate coverage report
```

### Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Write or update tests
4. Run tests and linter:

   ```bash
   npm run test
   npm run lint
   ```

5. Commit with clear messages (see [Commit Messages](#commit-messages))
6. Push and create a Pull Request

**Important**: Version bumping is automatic! See [Automatic Version Bumping](#automatic-version-bumping) below.

## Automatic Version Bumping

GhostClass uses an automated version bumping system that handles versioning for you.

### For Same-Repository PRs (Contributors with Write Access)

When you create a PR from a branch in the main repository:

1. ✨ Auto-Bump Workflow checks your PR
2. 📦 Compares your branch version with `main`
3. 🔄 Auto-increments patch version if needed
4. 💾 Commits changes to your PR branch
5. 💬 Leaves confirmation comment

**You don't need to manually bump versions!** 🎉

**Files automatically updated:**

- `package.json` and `package-lock.json`
- `.example.env` (NEXT_PUBLIC_APP_VERSION)
- `public/api-docs/openapi.yaml`

> **Note for Maintainers**: The auto-bump workflow uses `BOT_PAT` secret to trigger workflows after version bump commits. If you're a repository maintainer, see [Bot PAT Configuration](DEVELOPER_GUIDE.md#bot-pat-configuration) for setup. External contributors don't need this - the workflow will guide you through a simple manual script instead.

### For Fork PRs (External Contributors)

If contributing from a forked repository:

1. Create your PR as normal
2. The bot will comment with instructions
3. Run the version bump script locally:

   ```bash
   CI=true GITHUB_HEAD_REF="$(git rev-parse --abbrev-ref HEAD)" node scripts/bump-version.js
   ```

4. Commit and push the changes:

   ```bash
   git add package.json package-lock.json .example.env public/api-docs/openapi.yaml
   git commit -m "chore: bump version"
   git push
   ```

### Version Format (Rollover System)

GhostClass uses `X.Y.Z` format where:

- **X** = Major (can exceed 9)
- **Y** = Minor (0-9, rolls over)
- **Z** = Patch (0-9, rolls over)

Examples:

```text
1.6.9 → 1.7.0   (patch rollover)
1.9.9 → 2.0.0   (minor rollover)
9.9.9 → 10.0.0  (major version can exceed 9)
```

## Pull Request Process

### Creating a PR

1. Push your branch to GitHub
2. Open a Pull Request against `main`
3. Fill in the PR template:
   - Description of changes
   - Related issue numbers
   - Testing notes
4. Wait for auto-bump (same-repo) or manually bump (fork)
5. Request review from maintainers

### PR Checklist

- [ ] Tests pass locally (`npm run test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Version bumped (automatic or manual)
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow conventions

### Review & Merge

1. Automated tests run on your PR
2. Maintainers review your code
3. Address feedback or requested changes
4. Once approved, maintainer merges
5. Auto-tagging and release workflows run automatically

## Code Quality & Testing

### Linting

```bash
npm run lint
```

### Testing

```bash
# Unit tests
npm run test                 # Run once
npm run test:watch           # Watch mode
npm run test:ui              # Interactive UI
npm run test:coverage        # Coverage report

# E2E tests
npm run test:e2e             # Headless mode
npm run test:e2e:ui          # Interactive UI
npm run test:e2e:headed      # See browser
```

### Code Style Guidelines

- Use TypeScript strictly
- Follow existing code patterns
- Write meaningful names
- Add comments for complex logic
- Keep functions small and focused
- Test edge cases and error conditions

## Build Performance Tips

Our Docker builds are optimized with layer caching and conditional ARM64 builds.

### Local Build Testing

```bash
# Build Docker image locally
docker build -t ghostclass:test .

# With build args
docker build \
  --build-arg APP_COMMIT_SHA=$(git rev-parse HEAD) \
  -t ghostclass:test .
```

### CI/CD Build Times

| Build Type | Platforms | Time | Use Case |
| --- | --- | --- | --- |
| Cached build | AMD64 | ~3-5 min | Incremental changes |
| Cold build | AMD64 | ~6-8 min | Fresh build |
| Multi-arch | AMD64 + ARM64 | ~10-15 min | Production releases |

### Performance Features

- **Layer caching**: GitHub Actions cache with `mode=max`
- **Conditional ARM64**: Only built for tag pushes or manual trigger
- **Multi-stage builds**: Optimized layer reuse
- **Dependency caching**: npm dependencies cached separately

To test with ARM64 locally:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghostclass:test .
```

## Commit Messages

Follow conventional commit format:

```text
<type>(<scope>): <subject>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code restructuring
- `test`: Adding/updating tests
- `chore`: Maintenance (deps, version bumps)
- `perf`: Performance improvement
- `ci`: CI/CD changes

### Examples

```bash
feat(auth): add JWT authentication support
fix(api): handle null response in user endpoint
docs: update contributing guide
chore: bump version to v1.7.0
```

For multi-line commits:

```text
feat(dashboard): add attendance calendar view

Implements a monthly calendar view showing attendance history.
Includes color-coded present/absent indicators and hover tooltips.

Closes #123
```

## Getting Help

- **Bug Reports**: Use [bug report template](.github/ISSUE_TEMPLATE)
- **Feature Requests**: Use [feature request template](.github/ISSUE_TEMPLATE)
- **Questions**: Open a [Discussion](https://github.com/devakesu/GhostClass/discussions)
- **Setup Issues**: Check [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)

---

## For Maintainers Only

> **⚠️ This section is for repository maintainers with write access only.**  
> External contributors can skip this section entirely.

### Required Setup (Maintainers)

To enable automated workflows and deployments, maintainers need:

1. **GPG Signing** - For verified commits in automated workflows
   - See [DEVELOPER_GUIDE.md → GPG Signing Configuration](DEVELOPER_GUIDE.md#gpg-signing-configuration)
   - Required secrets: `GPG_PRIVATE_KEY`, `GPG_PASSPHRASE`, `GPG_COMMITTER_NAME`, `GPG_COMMITTER_EMAIL`

2. **Bot PAT Token** - To trigger workflows after auto-bump commits
   - See [DEVELOPER_GUIDE.md → Bot PAT Configuration](DEVELOPER_GUIDE.md#bot-pat-configuration)
   - Required secret: `BOT_PAT`

3. **Deployment Secrets** - For production builds and releases
   - See [.example.env](.example.env) GITHUB SECRETS CONFIGURATION section
   - Includes: Sentry, Coolify, build variables, etc.

### Maintainer Tools

**Sync Secrets Script** (`npm run sync-secrets`)

- Syncs `.env` values to GitHub repository secrets
- Only needed when updating build-time environment variables
- Requires GitHub CLI (`gh`) with authentication
- External contributors don't need this

### Version Management

- Tag creation: Automatic after merge to main

For detailed maintainer workflows, see [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md).

---

## License

By contributing, you agree that your contributions will be licensed under the project's GPLv3 license.

---

Thank you for contributing to GhostClass! 🚀

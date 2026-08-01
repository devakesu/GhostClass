# Contributing to GhostClass

Thank you for your interest in contributing to GhostClass! This guide will help
you understand our development workflow and contribution process.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Versioning System](#versioning-system)
- [Pull Request Process](#pull-request-process)
- [Code Quality & Testing](#code-quality--testing)
- [Build Performance Tips](#build-performance-tips)
- [Commit Messages](#commit-messages)
- [For Maintainers Only](#for-maintainers-only)

## Getting Started

### Prerequisites

- **Docker Desktop** (with WSL2 backend enabled)
- **WSL2** (Linux distribution such as Ubuntu/Debian)
- **VS Code or Antigravity IDE / any IDE with WSL/Docker Support**

Complete step-by-step dev container environment setup:
**[Getting Started / Dev Container Setup](../README.md#-getting-started)**.

## Development Workflow

### Available Commands

#### Web Application

```bash
npm run dev              # Development server (HTTP)
npm run dev:https        # Development server (HTTPS, requires certificates)
npm run build            # Production build
npm run lint             # Run ESLint
npm run test             # Run unit tests
npm run test:e2e         # Run end-to-end tests
npm run test:coverage    # Generate coverage report
```

#### Mobile Application

```bash
cd mobile
flutter pub get          # Install dependencies
flutter run              # Run on device/emulator
flutter test             # Run Flutter tests
flutter build apk        # Build Android APK
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

**Important**: Centralized version values apply automatically! See
[Versioning System](#versioning-system) below.

## Versioning System

GhostClass derives its build versions dynamically via centralized Infisical
runtime and CI configurations (`NEXT_PUBLIC_APP_VERSION`). Contributors do not
need to manually compute or inject git semantic rollover tags when proposing
features. Maintainers synchronize version thresholds directly in the project
dashboard prior to production releases.

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

| Build Type   | Platforms     | Time       | Use Case            |
| ------------ | ------------- | ---------- | ------------------- |
| Cached build | AMD64         | ~3-5 min   | Incremental changes |
| Cold build   | AMD64         | ~6-8 min   | Fresh build         |
| Multi-arch   | AMD64 + ARM64 | ~10-15 min | Production releases |

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
- **Questions**: Open a
  [Discussion](https://github.com/devakesu/GhostClass/discussions)
- **Setup Issues**: Check [SECURITY.md](../SECURITY.md) and `.example.env`

---

## For Maintainers Only

> **⚠️ This section is for repository maintainers with write access only.**\
> External contributors can skip this section entirely.

### Maintainer Tools

#### Infisical Secret Orchestration

- Centralized management via Infisical Dashboard acts as the single source of
  truth, organized into `/build-time`, `/runtime`, and `/ci` folders.
- While GitHub Actions (`/build-time` and `/ci`) use Native Integrations,
  Coolify production runtime environments inject `/runtime` secrets dynamically
  into memory at boot time using the Infisical CLI wrapper.
- Eliminates manual script execution and plaintext storage on disk.
- External contributors don't need access to Infisical to submit code.

### Version Management

- App Versioning: Controlled directly via `NEXT_PUBLIC_APP_VERSION` injected
  dynamically at runtime/compile-time.
- Release Automation: Dynamic multi-arch bundles and attestation manual updates
  are published synchronously upon successful merges to the primary main trunk.

---

## License

By contributing, you agree that your contributions will be licensed under the
project's GPLv3 license.

---

Thank you for contributing to GhostClass! 🚀

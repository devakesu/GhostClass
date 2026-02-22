# Copilot Instructions for GhostClass

GhostClass is a Next.js 16 + React 19 + TypeScript web application that helps students track their attendance using data from the EzyGo attendance API. It features a bunk calculator, attendance calendar, tracking for disputed absences, and push notifications.

---

## Repository Layout

```
src/
  app/           # Next.js App Router pages and API routes
  components/    # Reusable React components (UI, attendance, layout, legal)
  hooks/         # Custom React hooks (data-fetching via TanStack Query)
  lib/           # Core library: logic, security, Supabase, Axios, Redis, crypto, logger
  providers/     # React context providers (React Query, user settings)
  types/         # TypeScript type definitions
  assets/        # Static images/icons
supabase/
  migrations/    # PostgreSQL schema (tables, RLS policies, triggers)
e2e/             # Playwright end-to-end tests
scripts/         # Node.js scripts for versioning and secret sync
docs/            # DEVELOPER_GUIDE.md, CONTRIBUTING.md, EZYGO_INTEGRATION.md
public/
  api-docs/      # OpenAPI 3.1 spec (openapi.yaml)
```

Key config files at root: `next.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `tsconfig.json`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 (strict) |
| Styling | Tailwind CSS v4, Radix UI primitives, Shadcn UI, Framer Motion, Lucide Icons |
| Data / State | TanStack Query v5, React Hook Form + Zod v4, Recharts v3 |
| Auth / DB | Supabase (PostgreSQL + RLS), `@supabase/ssr` |
| Security | AES-256-GCM encryption (`src/lib/crypto.ts`), CSRF tokens, Upstash Redis rate limiting, Cloudflare Turnstile, CSP Level 3 |
| HTTP | Axios v1 with interceptors, LRU Cache v11 |
| Error tracking | Sentry (`sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`) |
| PWA | Serwist (service worker in `src/sw.ts`) |
| Testing | Vitest (unit/component), Playwright (E2E) |
| API Docs | OpenAPI 3.1 + Scalar viewer at `/api-docs` |

---

## Development Commands

```bash
npm install          # Install dependencies (requires Node 20.19+ or 22.12+)
npm run dev          # Development server on http://localhost:3000 (uses --webpack for Serwist)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest unit/component tests (watch mode by default)
npm run test:coverage # Coverage report (lcov, html, json)
npm run test:e2e     # Playwright E2E tests (all configured projects; CI uses --project=chromium)
npm run docs:validate # Validate OpenAPI spec with Redocly
```

### Environment Setup

Copy `.example.env` to `.env` and populate. Key variables:

- `ENCRYPTION_KEY` – 64 hex chars (AES-256-GCM key). Generate: `openssl rand -hex 32`
- `REQUEST_SIGNING_SECRET` – 64 hex chars. Generate: `openssl rand -hex 32`. Must be **distinct** from `ENCRYPTION_KEY` (key-separation; required)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` (use test keys `1x00000000000000000000AA` / `1x0000000000000000000000000000000AA` locally)
- `NEXT_PUBLIC_BACKEND_URL` – EzyGo API base URL (do not change)

`NEXT_PUBLIC_*` variables are client-safe. All others are server-only runtime secrets.

---

## TypeScript Path Alias

`@/` resolves to `src/` (configured in `tsconfig.json` and `vitest.config.ts`).

```typescript
import { calculateAttendance } from '@/lib/logic/bunk';
import { createClient } from '@/lib/supabase/client';
```

---

## Testing

### Vitest (unit / component)

- Config: `vitest.config.ts` – environment is `jsdom`, globals enabled
- Setup: `vitest.setup.ts` – stubs env vars, mocks Next.js router, Next.js Image, and Supabase client before each test; cleans up after each test
- Test files: `**/*.{test,spec}.{ts,tsx}` anywhere under `src/`, excludes `e2e/`
- Coverage thresholds: lines 7%, functions 8%, branches 5%, statements 7%
- Tests follow **Arrange-Act-Assert** pattern
- Use `it.todo()` (not `it.skip()`) for tests that are deferred

**Important mock patterns:**
- Third-party spinner libs (`ldrs/react`, `Ring2`) must be mocked as simple `<div>` elements
- `@tanstack/react-query` mocks must include both `useQuery` (with `refetch: vi.fn().mockResolvedValue()`) and `useQueryClient`
- Framer Motion mocks must include `AnimatePresence`, `LazyMotion`, `domAnimation`, and `motion.div`
- Virtualizer mocks (`@tanstack/react-virtual`) must include `measureElement` and `measure` APIs
- Supabase mock includes both `auth.getUser` and `auth.getSession`
- Use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` for timing-sensitive tests; use `fireEvent` (not `userEvent`) when fake timers are active

### Playwright (E2E)

- Config: `playwright.config.ts`
- Test files: `e2e/*.spec.ts`
- CI runs Chromium only: `npm run test:e2e -- --project=chromium`

---

## Security Patterns

- **Never use `window.open()`** for link navigation. For links inside `<label>` elements, call `preventDefault()` + `stopPropagation()`, then programmatically create an anchor with `rel="noopener noreferrer"` and click it.
- All external links with `target="_blank"` must have `rel="noopener noreferrer"` (prevents reverse-tabnabbing).
- Always check `res.ok` before calling `res.json()` on fetch responses.
- Input validation uses Zod schemas.
- CSRF tokens managed via `src/lib/security/` and `src/hooks/use-csrf-token.ts`.
- `SUPABASE_SERVICE_ROLE_KEY` must never be used client-side.
- Sensitive tokens are AES-256-GCM encrypted at rest (`src/lib/crypto.ts`).

---

## Code Style

- **TypeScript strict mode** – no `any` unless absolutely necessary
- Follow existing file patterns; Shadcn UI components live in `src/components/ui/`
- Conventional commit format: `<type>(<scope>): <description>` (types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`)
- Keep components small and focused; separate data-fetching logic into custom hooks under `src/hooks/`
- Tailwind CSS v4 PostCSS config uses object plugin format: `{ '@tailwindcss/postcss': {} }` — not imported module array format

---

## Versioning & CI/CD

### Automatic Version Bumping

GhostClass uses an automated version bump workflow (`.github/workflows/auto-version-bump.yml`):

- **Same-repo PRs**: Version is auto-bumped by the workflow when a PR is opened/updated. No manual action needed.
- **Fork PRs**: Run `CI=true GITHUB_HEAD_REF="$(git rev-parse --abbrev-ref HEAD)" node scripts/bump-version.js`, then commit `package.json`, `package-lock.json`, `.example.env`, `public/api-docs/openapi.yaml`.
- Version format is `X.Y.Z` with rollover (e.g., `1.9.9 → 2.0.0`).

**Files that must be updated together when bumping version:**
`package.json`, `package-lock.json`, `.example.env` (NEXT_PUBLIC_APP_VERSION), `public/api-docs/openapi.yaml`.

### CI Workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `test.yml` | PR / push to main | Vitest coverage + Playwright E2E |
| `pipeline.yml` | PR / push / merge_group to main | Guard + auto-tag on merge |
| `auto-version-bump.yml` | PR opened/updated | Auto-bump version, comment on PR |
| `release.yml` | `repository_dispatch: release_requested` | Build multi-arch Docker, sign, attest, deploy |
| `deploy-supabase.yaml` | Manual | Push Supabase migrations |
| `provenance.yml` | Release / artifact publication | Generate and publish build provenance attestations |
| `scorecard.yml` | Scheduled / on push to main | Run OpenSSF Scorecard security checks |

**Dependabot PRs** do not have access to repository secrets (`GPG_PRIVATE_KEY`, etc.); workflows check `if: github.actor != 'dependabot[bot]'` to skip secret-dependent steps.

---

## Attendance Calculation (`src/lib/logic/bunk.ts`)

Core algorithm used by `src/components/attendance/course-card.tsx`:

- `calculateAttendance(present, total, targetPercentage)` returns `{ canBunk, requiredToAttend, targetPercentage, isExact }`
- Manual tracking modifiers: `extraPresent`, `extraAbsent` (add to total), `correctionPresent` (status swap, no total change)
- Attendance code `225` = Duty Leave; limited to **5 per course per semester** (enforced by DB trigger `check_225_attendance_limit()`)

---

## Key Known Errors & Workarounds

- **Service worker in standalone mode**: `@serwist/next` doesn't generate the SW with Next.js `output: "standalone"`. The Dockerfile uses `npx esbuild src/sw.ts` to compile it manually during Docker build.
- **Dev server uses `--webpack`**: Required for Serwist PWA compatibility (`npm run dev` includes `--webpack` flag).
- **ECC GPG key error in CI** ("Inappropriate ioctl for device"): Use RSA 4096-bit GPG keys, not ECC/EdDSA.
- **Dependabot workflow failures** ("Input required and not supplied: gpg_private_key"): Guard secret-dependent steps with `if: github.actor != 'dependabot[bot]'`.
- **`userEvent` with fake timers**: `userEvent` has built-in delays that conflict with `vi.useFakeTimers()`. Use `fireEvent` instead when fake timers are active.
- **`recharts` `ResponsiveContainer` warnings in tests**: Import chart dimension components directly; measure dimensions directly instead of using `ResponsiveContainer`.

---

## Database

Schema lives in `supabase/migrations/`. Push with:

```bash
npx supabase link --project-ref <your-project-id>
npx supabase db push
```

Key tables managed by Row Level Security (RLS). The `tracker` table has a trigger enforcing the 5 duty-leave limit per course/semester.

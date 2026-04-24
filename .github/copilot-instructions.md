# Copilot Instructions for GhostClass

GhostClass is a full-stack monorepo with two first-class clients sharing the same backend/security model:

- Web app: Next.js 16 + React 19 + TypeScript
- Mobile app: Flutter + Dart (Android/iOS)

The product helps students manage attendance using EzyGo data, with bunk calculation, calendar/history, disputed-absence tracking, scores, leave status, and notifications.

---

## Repository Layout

```text
src/                 # Next.js web app source
  app/               # App Router pages and API routes
  components/        # Reusable React components
  hooks/             # Custom hooks (TanStack Query, utilities)
  lib/               # Core logic/security/supabase/axios/crypto/logger
  providers/         # React context providers
  types/             # TS type definitions
  assets/            # Static assets
mobile/              # Flutter mobile application
  lib/               # Dart app code (screens/services/providers/router)
  android/           # Android host app
  ios/               # iOS host app
  packages/          # Vendored Flutter packages (Play Integrity wrapper)
  test/              # Flutter tests
supabase/            # DB config + SQL migrations
workers/             # CF Worker + AWS Lambda proxy services
e2e/                 # Playwright E2E tests (web)
scripts/             # Node scripts (versioning/secrets)
docs/                # Developer documentation
public/openapi/      # OpenAPI 3.1 source (`openapi.yaml`)
```

Key web config at root: `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `tsconfig.json`.

Key mobile config in `mobile/`: `pubspec.yaml`, `analysis_options.yaml`, `android/build.gradle.kts`, `ios/Runner.xcodeproj`.

---

## Tech Stack

### Web

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.x (App Router), React 19.2.x, TypeScript 6 (strict) |
| UI | Tailwind CSS v4, Radix UI, Shadcn UI, Framer Motion, Lucide |
| Data / Forms | TanStack Query v5, React Hook Form, Zod v4 |
| Charts | Recharts v3 |
| Auth / DB | Supabase (PostgreSQL + RLS), `@supabase/ssr` |
| Security | AES-256-GCM, CSRF, Upstash Redis rate limiting, Cloudflare Turnstile, CSP |
| HTTP | Axios v1 + interceptors, LRU Cache v11 |
| Monitoring | Sentry (`sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation.ts`) |
| PWA | Serwist (`src/sw.ts`) |
| Testing | Vitest + Playwright |

### Mobile

| Layer | Technology |
|---|---|
| Framework | Flutter 3.27+, Dart ^3.11.4 |
| State | Riverpod 3 (`flutter_riverpod`, `riverpod_annotation`, generator) |
| HTTP / Backend | Dio, Supabase Flutter |
| Routing | GoRouter |
| Security | Firebase App Check, Play Integrity (Android), DeviceCheck (iOS), JWE (`jose` + `pointycastle`), `flutter_secure_storage` |
| UI / Charts | Material 3, `google_fonts`, `flutter_animate`, `fl_chart`, `lucide_icons` |
| Monitoring | `sentry_flutter`, `sentry_dio` |

---

## Development Commands

### Web (repo root)

```bash
npm install
npm run dev                 # default: next dev --webpack
npm run dev:turbopack
npm run build
npm run lint
npm run test
npm run test:coverage
npm run test:e2e            # CI runs chromium project
```

### Mobile (`mobile/`)

```bash
flutter pub get
flutter analyze
flutter test
flutter test --coverage
flutter run
flutter build apk --debug
flutter build appbundle --release
flutter build ios --release   # macOS + Xcode required
```

---

## Environment and Secrets

### Web env

Copy `.example.env` to `.env` and fill required values.

Critical keys include:

- `ENCRYPTION_KEY` (64 hex chars, AES-256-GCM)
- `REQUEST_SIGNING_SECRET` (64 hex chars; must differ from `ENCRYPTION_KEY`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server-only)
- `NEXT_PUBLIC_BACKEND_URL`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`
- `CF_PROXY_URL` / `CF_PROXY_SECRET` and optional AWS failover proxy vars

### Mobile secrets

`mobile/lib/config/app_secrets.dart` is gitignored and must be created locally.

- Never commit `app_secrets.dart`
- Never hardcode production secrets in source
- Keep Firebase config files and App Check credentials environment-specific

---

## Path Alias

Web alias: `@/` resolves to `src/`.

```typescript
import { calculateAttendance } from '@/lib/logic/bunk';
import { createClient } from '@/lib/supabase/client';
```

---

## Testing Guidance

### Web tests

- Vitest uses `jsdom`, globals, and setup from `vitest.setup.ts`
- Test files: `**/*.{test,spec}.{ts,tsx}` under `src/` (excluding `e2e/`)
- Coverage thresholds: lines 7, functions 8, branches 5, statements 7
- Prefer Arrange-Act-Assert
- Use `it.todo()` for deferred coverage

Important mocking patterns:

- Mock spinner libs (`ldrs/react`, `Ring2`) as simple divs
- React Query mocks must include `useQuery` and `useQueryClient`
- Framer Motion mocks should include `AnimatePresence`, `LazyMotion`, `domAnimation`, `motion.div`
- Virtualizer mocks should include `measureElement` and `measure`
- Supabase auth mocks should include `auth.getUser` and `auth.getSession`
- With fake timers, prefer `fireEvent` over `userEvent`

### Mobile tests

- Run `flutter analyze` before opening PRs touching Dart code
- Run `flutter test` for logic/provider/widget changes
- Keep provider/business logic testable and separated from widget concerns

---

## Security Rules

### Shared

- Validate all untrusted input
- Do not leak secrets to client-visible code
- Keep cryptographic responsibilities in dedicated security modules

### Web-specific

- Do not use `window.open()` for link navigation
- For links inside labels: `preventDefault()` + `stopPropagation()`, then create/click anchor with `rel="noopener noreferrer"`
- External `target="_blank"` links must include `rel="noopener noreferrer"`
- Check `res.ok` before `res.json()` on fetch
- Server-side EzyGo calls must go through `egressFetch()` / `egressAxios` in `src/lib/utils.server.ts`

### Mobile-specific

- Keep EzyGo/Supabase/session material in `flutter_secure_storage`, not plain preferences
- Maintain App Check and integrity validation paths (Play Integrity / DeviceCheck)
- Preserve JWE request wrapping in networking layer (`api_service`, `jwe_interceptor`, `jwe_service`)
- Maintain Android anti-tapjacking/secure-screen protections in `MainActivity`

---

## App-Specific Architecture Notes

- Attendance calculation remains centered on `calculateAttendance` in web `src/lib/logic/bunk.ts` and mirrored logic in mobile `mobile/lib/logic/bunk.dart`
- Attendance code `225` (Duty Leave) is capped at 5/course/semester by DB trigger `check_225_attendance_limit()`
- Disabled courses are stored in `user_settings.disabled_courses` JSONB keyed by academic period
- EzyGo `/summery` typo fields are normalized by data hooks/types
- Cron sync normalizes date keys (`YYYYMMDD` and `YYYY-MM-DD`) before reconciliation

---

## Code Style and Conventions

### Web

- Strict TypeScript; avoid `any` unless unavoidable
- Keep UI components focused; move data-fetching/logic into hooks and `lib/`
- Keep Shadcn UI components under `src/components/ui/`
- Tailwind v4 PostCSS uses object plugin form: `{ '@tailwindcss/postcss': {} }`

### Mobile

- Follow `analysis_options.yaml` rules and keep analyzer clean
- Keep state in Riverpod providers, keep screens mostly compositional
- Keep service layer boundaries explicit (`services/` for API/security/storage)
- Prefer typed models and exceptions over dynamic maps in UI code

### Commits

- Conventional commits: `<type>(<scope>): <description>`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

---

## CI/CD and Versioning

### Version bumping

Automated via `.github/workflows/auto-version-bump.yml`.

- Same-repo PRs: workflow handles bump
- Fork PRs: run bump script manually, then commit versioned artifacts

Files that must stay in sync for version bumps:

- `package.json`
- `package-lock.json`
- `.example.env` (`NEXT_PUBLIC_APP_VERSION`)
- `public/openapi/openapi.yaml`

### Main workflows

| Workflow | Purpose |
|---|---|
| `test.yml` | Web unit coverage + web Playwright E2E |
| `pipeline.yml` | Guard + auto-tag on merge to main |
| `auto-version-bump.yml` | PR version bump automation |
| `release.yml` | Signed release build + deploy pipeline |
| `deploy-egress-proxies.yml` | Deploy CF/AWS proxies |
| `deploy-supabase.yaml` | Supabase migration deployment |
| `provenance.yml` | Build provenance attestations |
| `scorecard.yml` | OpenSSF scorecard checks |

Dependabot PRs do not have repository secrets; secret-dependent jobs must stay guarded.

---

## Known Gotchas

- Serwist + `output: "standalone"` needs explicit SW build step in Docker
- `npm run dev` uses webpack by default for PWA compatibility
- Use RSA 4096 GPG keys for CI signing (avoid ECC key issues in CI)
- Fake timers + `userEvent` can conflict in Vitest; use `fireEvent`
- Recharts `ResponsiveContainer` can be noisy in tests; prefer direct dimension control

---

## Database

Supabase schema/migrations are under `supabase/migrations/`.

```bash
npx supabase link --project-ref <your-project-id>
npx supabase db push
```

RLS policies are required for user-scoped data access; preserve policy intent when editing migrations.

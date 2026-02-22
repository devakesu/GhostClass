# GhostClass

[![Version](https://img.shields.io/github/v/release/devakesu/GhostClass?label=Version)](https://github.com/devakesu/GhostClass/releases/latest)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/devakesu/GhostClass/badge)](https://scorecard.dev/viewer/?uri=github.com/devakesu/GhostClass)
[![SLSA Level 3](https://slsa.dev/images/gh-badge-level3.svg)](https://slsa.dev)
[![Attestations](https://img.shields.io/badge/Attestations-View-brightgreen?logo=github)](https://github.com/devakesu/GhostClass/attestations)
[![Security Scan: Trivy](https://img.shields.io/badge/Security-Trivy%20Scanned-blue)](.github/workflows/pipeline.yml)
[![Build Status](https://img.shields.io/badge/Build-Passing-success)](.github/workflows/pipeline.yml)

[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2.3-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Node.js](https://img.shields.io/badge/Node.js-20.19.2%2B%20%7C%2022.12.0%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/Tests-Vitest%20%2B%20Playwright-green)](https://vitest.dev/)

## Overview

GhostClass is the ultimate academic survival tool for students who want to manage their attendance without the main character energy of a professor. Featuring a sleek dashboard with real-time analytics and visual performance charts, it helps you track your classes so you never accidentally ghost your degree. With a built-in "bunk calculator" to tell you exactly how many lectures you can skip before it becomes a canon event, and a dedicated tracker for suspicious absences, GhostClass ensures your attendance stays valid while you live your best life. Built as a better alternative to Ezygo, it presents your attendance data with a clean, intuitive interface. No more confusing numbers - just clear, actionable insights!

## 🎯 Key "Vibe" Features

- **The Bunk Calc** 🧮: Know exactly how many classes you can miss before the threshold comes for your neck.
- **Visual Receipts** 📊: Performance charts and a detailed calendar history so you can see your attendance glow-up in real-time.
- **Anti-Ghosting Tracker** 👻: A personalized list to watch wrongly marked absences like a hawk until they get updated.
- **Ezygo Integration** 🔄 - Use your existing ezygo credentials - no new accounts needed
- **Multi-Device Support** 🔐 - Login from multiple devices simultaneously without losing sessions
- **Real-time Updates** ⚡ - Get instant updates on your attendance status and skip calculations
- **Track Status Changes** 📝 – Get notified when your attendance is updated
- **Mobile Friendly** 📱 - Access your attendance data on any device, anywhere
- **API Documentation** 📚 - Interactive OpenAPI documentation at `/api-docs`
- **Build Transparency** 🔍 - View complete build provenance and SLSA attestations at `/build-info`

## 🛠️ Tech Stack

### Core Framework

- **Next.js 16.1.6** - React 19 with App Router
- **TypeScript 5.9.3** - Strict mode for type safety
- **Node.js** - v20.19.2+ or v22.12.0+

### Styling & UI

- **Tailwind CSS 4** - Utility-first styling with custom design system
- **Radix UI** - Accessible, unstyled component primitives
- **Shadcn UI** - Beautiful pre-styled components
- **Framer Motion** - Smooth animations and transitions
- **Lucide Icons** - Modern, customizable icon library

### Data & State Management

- **TanStack Query (React Query) v5** - Server state management with smart caching
- **React Hook Form + Zod v4** - Form validation with schema validation
- **Recharts v3** - Interactive data visualizations with responsive charts

### API & Documentation

- **OpenAPI 3.1** - API specification standard
- **Scalar** - Interactive API documentation viewer
- **Redocly CLI** - OpenAPI validation and linting

### Backend & Database

- **Supabase** - PostgreSQL database with Row Level Security
- **Supabase Auth** - Secure authentication system
- **Axios v1** - HTTP client for API requests with retry logic
- **LRU Cache v11** - In-memory caching for API responses

### Security & Monitoring

- **AES-256-GCM Encryption** - Secure token storage
- **CSRF Protection** - Custom token-based protection
- **Upstash Redis** - Rate limiting with `@upstash/ratelimit`
- **Sentry** - Error tracking and performance monitoring
- **GA4 Measurement Protocol** - Server-side analytics (CSP-compatible)
- **Cloudflare Turnstile** - Bot protection
- **OSSF Scorecard** - Security best practices monitoring

### DevOps & Deployment

- **Docker** - Containerized deployment with multi-stage builds
- **GitHub Actions** - CI/CD pipeline with reproducible builds
- **SLSA Level 3** - Supply chain security with provenance attestation
- **Trivy** - Container image vulnerability scanning
- **Coolify** - Self-hosted deployment platform
- **Playwright** - E2E testing
- **Vitest** - Unit and component testing

## 📁 Project Structure

```text
src/
├── instrumentation.ts        # Sentry server instrumentation
├── instrumentation-client.ts # Sentry browser instrumentation
├── proxy.ts                  # Service worker proxy configuration
├── sw.ts                     # Service worker with runtime caching
├── app/                      # Next.js app router pages and layouts
│   ├── (auth)/               # Authentication routes (login, signup)
│   ├── (protected)/          # Login-restricted routes (dashboard, profile, tracking)
│   │   ├── dashboard/        # Main dashboard with attendance overview
│   │   ├── profile/          # User profile and settings
│   │   ├── tracking/         # Manual attendance tracking interface
│   │   └── notifications/    # Notification center
│   ├── (public)/             # Public routes (home, contact, legal, build-info, help)
│   │   ├── build-info/       # Build provenance and transparency page
│   │   ├── contact/          # Contact form
│   │   ├── help/             # Help centre and FAQ
│   │   └── legal/            # Legal pages (privacy, terms, cookies)
│   ├── accept-terms/         # Terms acceptance page (authenticated)
│   ├── actions/              # Server actions (contact, user operations)
│   ├── api/                  # API routes
│   │   ├── auth/             # Authentication endpoints
│   │   ├── backend/          # Backend proxy endpoints
│   │   ├── cron/             # Scheduled jobs (sync, cleanup)
│   │   ├── health/           # Health check endpoint
│   │   ├── analytics/        # GA4 server-side tracking
│   │   └── provenance/       # Build provenance information
│   ├── api-docs/             # Scalar API documentation viewer
│   ├── config/               # App configuration files
│   ├── __tests__/            # App-level tests (robots, sitemap)
│   ├── error.tsx             # Error boundary page
│   ├── global-error.tsx      # Global error handler
│   ├── not-found.tsx         # 404 page
│   ├── robots.ts             # Dynamic robots.txt generation
│   ├── sitemap.ts            # Dynamic sitemap.xml generation
│   ├── globals.css           # Global styles and Tailwind directives
│   └── layout.tsx            # Root layout with providers
├── components/               # Reusable React components
│   ├── attendance/           # Attendance-specific components
│   │   ├── course-card.tsx         # Individual course display with bunk calculator
│   │   ├── attendance-calendar.tsx # Calendar view of daily attendance
│   │   ├── attendance-chart.tsx    # Performance charts
│   │   ├── AddAttendanceDialog.tsx # Dialog for adding manual attendance records
│   │   └── AddRecordTrigger.tsx    # Trigger button for the add-record dialog
│   ├── layout/               # Layout components (navbar, footer, sidebar)
│   ├── legal/                # Legal content components
│   ├── user/                 # User-related components
│   ├── ui/                   # Shadcn UI components
│   ├── __tests__/            # Component tests
│   ├── analytics-tracker.tsx # GA4 client-side event tracking
│   ├── contact-form.tsx      # Contact form with Turnstile
│   ├── error-boundary.tsx    # Error boundary wrapper
│   ├── error-fallback.tsx    # Error display UI
│   ├── institution-selector.tsx # Institution picker
│   ├── loading.tsx           # Loading spinner component
│   ├── not-found-content.tsx # 404 page content
│   ├── sw-register.tsx       # Service worker registration
│   └── toaster.tsx           # Toast notification provider
├── providers/                # React context providers
│   ├── attendance-settings.tsx  # Attendance target settings
│   ├── react-query.tsx       # TanStack Query provider
│   └── user-settings.ts      # User settings context
├── hooks/                    # Custom React hooks
│   ├── courses/              # Course data fetching hooks
│   ├── tracker/              # Tracking data hooks
│   ├── users/                # User data hooks
│   ├── notifications/        # Notification subscription hooks
│   ├── __tests__/            # Hook tests
│   └── use-csrf-token.ts     # CSRF token management hook
├── lib/                      # Core library code
│   ├── logic/                # Business logic
│   │   ├── bunk.ts                      # Attendance calculation algorithm
│   │   ├── attendance-reconciliation.ts # EzyGo sync reconciliation logic
│   │   └── index.ts                     # Export barrel
│   ├── supabase/             # Supabase client configuration
│   ├── security/             # Security utilities (CSRF, request signing)
│   ├── email-templates/      # React Email templates (conflict, mismatch, revision, contact)
│   ├── __examples__/         # Usage examples
│   ├── __tests__/            # Library tests
│   ├── analytics.ts          # GA4 Measurement Protocol
│   ├── axios.ts              # Axios instance with interceptors
│   ├── circuit-breaker.ts    # Circuit breaker pattern
│   ├── crypto.ts             # AES-256-GCM encryption
│   ├── csp.ts                # Content Security Policy
│   ├── email.ts              # Email service (Brevo/SendPulse)
│   ├── error-handling.ts     # Centralized error handler
│   ├── ezygo-batch-fetcher.ts # Rate-limited EzyGo API client
│   ├── global-init.tsx       # Global initialization
│   ├── logger.ts             # Winston logger with Sentry
│   ├── notifications.ts      # Push notification utilities
│   ├── ratelimit.ts          # Upstash Redis rate limiting
│   ├── redis.ts              # Redis client configuration
│   ├── utils.ts              # Utility functions
│   ├── utils.server.ts       # Server-only utility functions
│   └── validate-env.ts       # Runtime environment validation
├── types/                    # TypeScript type definitions
│   ├── index.ts              # Export barrel for all types
│   ├── assets.d.ts           # Asset module declarations
│   ├── images.d.ts           # Image type definitions
│   ├── attendance.d.ts       # Attendance data types
│   ├── course.d.ts           # Course types
│   ├── user.d.ts             # User types
│   ├── institution.d.ts      # Institution types
│   ├── profile.d.ts          # User profile types
│   ├── track_attendance.d.ts # Manual tracking types
│   └── user-settings.ts      # User settings types
└── assets/                   # Static assets (images, icons)
supabase/
├── config.toml               # Supabase local config
└── migrations/               # Database schema migrations
    ├── 20260217174834_remote_schema.sql       # Initial schema
    ├── 20260221160000_encrypt_pii_fields.sql  # PII field encryption
    ├── 20260221183457_revoke_anon_grants.sql  # Revoke anon role grants
    └── README.md
```

## 🧮 Attendance Calculation Algorithm

The core attendance calculation algorithm is implemented in [bunk.ts](src/lib/logic/bunk.ts) and is used throughout the application, particularly in the [course-card.tsx](src/components/attendance/course-card.tsx) component.

### Algorithm Flow

```typescript
function calculateAttendance(present, total, targetPercentage):
  
  1. Input Validation & Normalization
     - Ensure total > 0, present >= 0, present <= total
     - Clamp targetPercentage between 1-100 (default: 75)
     - Return zero result if invalid
  
  2. Calculate Current Percentage
     currentPercentage = (present / total) * 100
  
  3. Check if Exactly at Target
     if currentPercentage == targetPercentage:
       return { isExact: true, canBunk: 0, requiredToAttend: 0 }
  
  4. Below Target - Calculate Required Classes
     if currentPercentage < targetPercentage:
       if targetPercentage >= 100:
         required = total - present
       else:
         required = ceil((target * total - 100 * present) / (100 - target))
       return { requiredToAttend: required, canBunk: 0 }
  
  5. Above Target - Calculate Bunkable Classes
     if currentPercentage > targetPercentage:
       bunkableExact = (100 * present - target * total) / target
       bunkable = floor(bunkableExact)
       
       // Edge case: Almost at target (0 < exact < 0.9 and floor = 0)
       if bunkableExact in (0, 0.9) and bunkable == 0:
         isExact = true
       
       return { canBunk: bunkable, requiredToAttend: 0 }
```

### Course Card Integration

The course card combines official attendance data with manual tracking:

1. **Official Data**: Fetched from EzyGo API
   - `realPresent`: Official present count
   - `realTotal`: Official total classes
   - `realAbsent`: Official absent count

2. **Manual Tracking Modifiers**:
   - `extraPresent/extraAbsent`: Additional classes marked by user (adds to total)
   - `correctionPresent`: Wrongly marked absences corrected to present (status swap only)

3. **Final Calculation**:

   ```typescript
   finalPresent = realPresent + correctionPresent + extraPresent
   finalTotal = realTotal + extras (extraPresent + extraAbsent)
   displayPercentage = (finalPresent / finalTotal) * 100
   ```

4. **Dual Metrics Display**:
   - `safeMetrics`: Based on official data only (fail-safe)
   - `extraMetrics`: Includes manual tracking (what user sees)

### Duty Leave Business Rules

**Attendance Code 225 Limit**: Maximum 5 duty leave entries (attendance = 225) per course per semester.

- **Enforcement**: Database trigger validates before INSERT/UPDATE on `tracker` table
- **Scope**: Per user + course + semester + year combination
- **Error**: Raises exception when limit exceeded: `"Maximum 5 Duty Leaves exceeded for course: <course>"`
- **Implementation**: PostgreSQL trigger function `check_225_attendance_limit()` (see `supabase/migrations/`)

### Example Scenarios

#### Scenario 1: Need More Classes

```text
Present: 45, Total: 60, Target: 75%
Current: 75.0% → At target
Result: isExact = true
```

#### Scenario 2: Can Bunk Classes

```text
Present: 50, Total: 60, Target: 75%
Current: 83.33% → Above target
bunkableExact = (100*50 - 75*60) / 75 = 6.67
Result: canBunk = 6 classes
```

#### Scenario 3: Need to Attend

```text
Present: 40, Total: 60, Target: 75%
Current: 66.67% → Below target
required = ceil((75*60 - 100*40) / (100-75)) = 6
Result: requiredToAttend = 6 classes
```

*Formula derivation: To reach target% with x more classes attended:*

```text
(present + x) / (total + x) = target / 100
100(present + x) = target(total + x)
100*present + 100x = target*total + target*x
100x - target*x = target*total - 100*present
x(100 - target) = target*total - 100*present
x = (target*total - 100*present) / (100 - target)
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** - v20.19.2+ or v22.12.0+
- **npm** - v11+ (specified in `package.json` engines)
- **Docker** - For containerized deployment (optional)
- **Git** - Version control

For detailed development environment setup including GPG signing and Bot PAT configuration, see [DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md).

### Quick Start

1. Clone the Repository

   ```bash
   git clone https://github.com/devakesu/GhostClass.git
   ```

2. Navigate to Project Directory

   ```bash
   cd GhostClass
   ```

3. Install Dependencies

   ```bash
   npm install --legacy-peer-deps
   ```

   > **Note:** The `--legacy-peer-deps` flag is required to resolve peer dependency conflicts between packages (including `minimatch` constraints from the Sentry SDK and `eslint-config-next` / `typescript-eslint` compatibility ranges). This flag is applied consistently across local development, GitHub Actions CI (`npm ci --legacy-peer-deps`), and Docker builds to ensure reproducible, identical dependency trees.

4. Go to [Supabase.com](https://supabase.com) and create a new project.

   Login & Link:

   ```bash
    npx supabase login
    npx supabase link --project-ref <your-new-project-id>
    ```

   Create Database Tables: push the schema from this repo to your new remote database:

   ```bash
    npx supabase db push
    ```

   *(This creates all tables, policies, and triggers defined in `supabase/migrations`)*

5. Copy the example environment file

   ```bash
   cp .example.env .env
   ```

   Open `.env` and populate the keys.

6. Start Development Server

   ```bash
   npm run dev
   # or
   yarn dev
   ```

The application will be available at:

- **App**: `http://localhost:3000` 🎉
- **API Docs**: `http://localhost:3000/api-docs`

## ⚙️ Configuration

### Attendance Target Minimum

The default minimum attendance target has been updated from **50%** to **75%** to align with common institutional requirements. This affects:

- New user onboarding: Default target percentage set to 75%
- Validation: Minimum target enforced at 75% (configurable via `NEXT_PUBLIC_ATTENDANCE_TARGET_MIN`)
- Existing users: Any target below the minimum (75%) is automatically adjusted upward to meet the threshold

To customize the minimum target, set the environment variable:

```bash
NEXT_PUBLIC_ATTENDANCE_TARGET_MIN=75  # Default: 75%
```

**Note:** All existing users with targets below 75% will have their targets automatically adjusted to 75% on next login or settings sync. This ensures compliance with institutional attendance policies while preserving targets that already meet or exceed the minimum.

## ⚡ Performance Optimizations

GhostClass is optimized for maximum performance:

### Progressive Web App (PWA)

- Service worker with Serwist for offline functionality and caching
- **Production Build**: Service worker compiled via esbuild in Docker (standalone mode compatibility workaround)
  - `@serwist/next` doesn't generate SW with Next.js `output: "standalone"` mode
  - Docker build uses `npx esbuild src/sw.ts` to compile SW with runtime caching strategies
  - Runtime caching enables offline access only for previously cached pages and assets (precaching disabled since no build-time manifest is available; first-time visits still require a network connection)
- **Development**: Webpack bundler via `--webpack` flag (Serwist compatibility)
- Manifest file for installable web app experience
- Intelligent caching strategies:
  - Static assets: StaleWhileRevalidate for CSS/JS/workers
  - Images: CacheFirst with 30-day expiration (trusted sources only)
  - API requests: NetworkFirst (no explicit timeout; serves cache if network request fails)
  - Note: Only `/api/public/*` and `/api/static/*` API endpoints are cached; all other API endpoints, including `/api/user-settings` and `/api/attendance`, always use the network to ensure fresh user data

### Testing PWA Features Locally

By default, service workers are disabled in development to avoid caching issues. To test PWA functionality (offline mode, caching, install prompts) during development:

```bash
# Unix/Linux/macOS
NEXT_PUBLIC_ENABLE_SW_IN_DEV="true" npm run dev

# Windows Command Prompt
set NEXT_PUBLIC_ENABLE_SW_IN_DEV=true && npm run dev

# Windows PowerShell
$env:NEXT_PUBLIC_ENABLE_SW_IN_DEV="true"; npm run dev
```

This enables the service worker in development mode without requiring a production build.

### Code Splitting & Loading Strategy

- Next.js App Router automatic route-based code splitting for pages and layouts
- Recharts chart components (XAxis, YAxis, Tooltip) imported directly from `recharts`
- Lazy loaded Framer Motion with `domAnimation` features only
- Direct dimension measurement for charts (eliminates ResponsiveContainer warnings)

### Caching Strategy

- React Query with smart cache timing:
  - Profile data: 5min stale time, 30min garbage collection
  - General queries: 3min stale time, 10min garbage collection
  - Refetch on window focus disabled
  - Auto-refetch interval: 15 minutes
- EzyGo API: LRU cache with 60-second TTL and request deduplication
- Static assets: 1-year cache headers for fonts and `_next/static`
- Next.js Image optimization with AVIF/WebP formats

### Bundle Optimization

- Tree-shaking for `lucide-react`, `date-fns`, `framer-motion`
- Console logging stripped in production (`log`/`info` removed; `error`/`warn` preserved)
- Font optimization with `display: swap` (prevents FOIT)
- Priority loading for critical images (logo, avatar)
- Blur placeholders for instant image feedback
- Production source maps are **off by default**; opt in with `ENABLE_PUBLIC_BROWSER_SOURCEMAPS=true` (see below)

### Production Source Maps

By default, JavaScript source maps are **not** served publicly in production builds. Source maps are always uploaded to Sentry separately for private error symbolication.

To enable public source maps (useful for Lighthouse audits or open DevTools debugging):

```bash
# .env
ENABLE_PUBLIC_BROWSER_SOURCEMAPS=true
```

> ⚠️ **Security note:** Public source maps make it easier to analyse the exact deployed code. Enable only when the DevTools/Lighthouse benefit outweighs the trade-off.

### Development Experience

- Webpack bundler (for Serwist PWA compatibility)
- Origin validation skipped in dev mode
- Fast Refresh with React 19
- No NProgress blur on login page

## 🧪 Testing

GhostClass uses **Vitest** for unit/component tests and **Playwright** for E2E tests.

### Test Structure

```text
src/
├── components/__tests__/
│   └── error-boundary.test.tsx      # Error boundary component tests
├── hooks/
│   ├── __tests__/useUser.test.tsx   # User hook tests
│   └── courses/__tests__/courses.test.tsx  # Course hook tests
└── lib/
    ├── __tests__/
    │   ├── utils.test.ts            # Utility function tests
    │   └── crypto.test.ts           # Encryption/decryption tests
    └── logic/__tests__/
        └── bunk.test.ts             # Attendance calculation tests
e2e/
├── homepage.spec.ts                 # Homepage E2E tests
└── smoke.spec.ts                    # Smoke tests for critical paths
```

### Running Tests

```bash
# Unit & Component Tests (Vitest)
npm test                    # Run all tests once
npm run test:watch          # Watch mode - reruns on file changes
npm run test:ui             # Interactive UI for test debugging
npm run test:coverage       # Generate coverage report

# E2E Tests (Playwright)
npm run test:e2e           # Headless E2E tests
npm run test:e2e:ui        # Interactive E2E with Playwright UI

# Run All Tests
npm run test:all           # Unit + E2E tests

# Validate API Documentation
npm run docs:validate      # Lint OpenAPI spec
```

### Test Coverage

Current test suite includes:

- ✅ **Attendance Algorithm** (`bunk.test.ts`) - 100% coverage of calculation logic
- ✅ **Encryption/Decryption** (`crypto.test.ts`) - AES-256-GCM encryption tests
- ✅ **Utility Functions** (`utils.test.ts`) - Helper function validation
- ✅ **Error Boundaries** (`error-boundary.test.tsx`) - Error handling UI
- ✅ **Custom Hooks** - User and course data fetching
- ✅ **E2E Smoke Tests** - Critical user flows

**Coverage Goals:**

- Current enforced thresholds (configured in `vitest.config.ts`): lines **7%**, functions **8%**, branches **5%**, statements **7%**
- All new features require accompanying tests
- Critical paths (auth, attendance calculation, data sync) have priority coverage

View detailed coverage report:

```bash
npm run test:coverage
# Open coverage/index.html in browser
```

### Writing Tests

Tests follow the **Arrange-Act-Assert** pattern:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateAttendance } from '@/lib/logic/bunk';

describe('calculateAttendance', () => {
  it('should calculate required classes when below target', () => {
    // Arrange
    const present = 40;
    const total = 60;
    const target = 75;
    
    // Act
    const result = calculateAttendance(present, total, target);
    
    // Assert
    expect(result.requiredToAttend).toBe(6);
    expect(result.canBunk).toBe(0);
  });
});
```

For component tests using React Testing Library:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';

it('should display attendance percentage', () => {
  render(<CourseCard course={mockCourse} />);
  expect(screen.getByText('75.0%')).toBeInTheDocument();
});
```

## 🔒 Security

GhostClass implements multiple layers of security:

- **AES-256-GCM Encryption** - All sensitive tokens and authentication credentials encrypted at rest
- **Multi-Device Session Security** - Canonical password pattern enables concurrent logins without session invalidation
- **CSRF Protection** - Custom token-based CSRF protection on critical endpoints
- **Content Security Policy (CSP)** - CSP Level 3 with nonce-based script execution and hash whitelisting; integrates with Cloudflare Zaraz
- **Rate Limiting** - Upstash Redis-based rate limiting to prevent abuse
- **Row Level Security** - Supabase RLS policies ensure users only access their data
- **Secure Headers** - HSTS, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy
- **Input Validation** - Zod schemas validate all user input
- **HttpOnly Cookies** - Sensitive data stored in secure, httpOnly cookies
- **Origin Validation** - Strict origin checking in production (disabled in dev)
- **Cloudflare Turnstile** - Bot protection on public endpoints

To report security vulnerabilities, please email: [admin@ghostclass.devakesu.com](mailto:admin@ghostclass.devakesu.com)

## 🌍 Environment Variables

GhostClass uses a two-tier secret management strategy:

### Tier 1: Build-time (Public)

- `NEXT_PUBLIC_*` variables - Safe for client-side exposure
- `SENTRY_AUTH_TOKEN` - Secure BuildKit mount, not in image layers

### Tier 2: Runtime (Private)

- `ENCRYPTION_KEY` - AES-256-GCM encryption key
- `CRON_SECRET` - Cron job authentication
- `REQUEST_SIGNING_SECRET` - API request signature validation (anti-tampering; must be distinct from `ENCRYPTION_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` - Admin database access
- `UPSTASH_REDIS_REST_*` - Rate limiting credentials
- `TURNSTILE_SECRET_KEY` - Cloudflare Turnstile validation
- Email provider credentials

See [.example.env](.example.env) for complete list with descriptions.

**Important:** Never commit `.env` file to version control!

## 🚀 Deployment

GhostClass is deployed using Docker with reproducible builds:

### Docker Build

```bash
# Build with BuildKit
DOCKER_BUILDKIT=1 docker build -t ghostclass .

# Run container
docker run -p 3000:3000 --env-file .env ghostclass
```

**Service Worker Handling**: Docker build automatically compiles `src/sw.ts` using esbuild if `@serwist/next` doesn't generate it (standalone mode compatibility). This ensures full PWA functionality in production.

### CI/CD Pipeline

**Single-Build Architecture**: The deployment pipeline is optimized to build Docker images only once per release:

- **Pipeline Workflow** (`pipeline.yml`)
  - Runs on every PR, push, and merge queue (`merge_group`) event (guard job is a prerequisite that checks out code)
  - Manages automatic version bumping on main branch
  - Creates version tags that trigger releases
  - No Docker builds (actual validation happens in test.yml workflow)

- **Release Workflow** (`release.yml`)
  - Triggered automatically by version tag pushes
  - Builds multi-platform Docker images (`linux/amd64`, `linux/arm64`)
  - Signs images and generates attestations
  - Creates GitHub releases with artifacts
  - **Deploys versioned image to Coolify after successful release creation**

- **Key Benefits**
  - ✅ Single build per release (saves 10-15 minutes)
  - ✅ Correct version deployed (matches git tag)
  - ✅ One canonical image per version
  - ✅ Reproducible builds with `SOURCE_DATE_EPOCH`
  - ✅ Multi-stage build optimized for size (~500MB)

For more details, see [DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md#versioning--releases).

### Production Checklist

1. ✅ Set all required environment variables
2. ✅ Configure Supabase
3. ✅ Set up Sentry project for error tracking
4. ✅ Configure Cloudflare Turnstile
5. ✅ Set up Redis instance for rate limiting
6. ✅ Configure email service (Brevo or SendPulse)
7. ✅ Enable HTTPS with valid SSL certificate
8. ✅ Set up cron jobs for attendance sync
9. ✅ Configure legal terms version and effective date
10. ✅ Set up GPG signing and Bot PAT for automated workflows (see [DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md))

## 🤝 Contributing

We welcome contributions! GhostClass uses an **automatic version bumping system** that handles versioning for you.

### Getting Started

1. Fork the repository (or create a branch if you have write access)
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Push your branch and create a Pull Request
5. **Version is auto-bumped!** (for same-repo PRs) or follow the manual instructions (for forks)

### Documentation

- **[Developer Guide](docs/DEVELOPER_GUIDE.md)** - Complete guide for development, contribution, and release workflows
- **[Contributing Guide](docs/CONTRIBUTING.md)** - Quick contribution guidelines and versioning system
- **[Security Policy](SECURITY.md)** - Security features and image verification
- **[EzyGo Integration](docs/EZYGO_INTEGRATION.md)** - API rate limiting and batch fetcher documentation

### Automatic Version Bumping

- **Same-repo PRs**: Version is automatically bumped by the workflow ✨
- **Fork PRs**: Follow the bot's instructions to manually bump the version

For more details, see the [Contributing Guide](docs/CONTRIBUTING.md).

## 👥 Maintained by

- [Devanarayanan](https://github.com/devakesu/)
  
Credits: [Bunkr](https://github.com/ABHAY-100/Bunkr/)

## 📧 Contact

For any questions, feel free to reach out to me via email at
[contact@ghostclass.devakesu.com](mailto:contact@ghostclass.devakesu.com)
[fusion@devakesu.com](mailto:fusion@devakesu.com)

## 📄 License

This project is licensed under the **GNU General Public License v3.0** - see the [LICENSE](LICENSE) file for details.

***Thank you for your interest in GhostClass! Bunk classes & enjoy, but don't forget to study!! 😝🤝***

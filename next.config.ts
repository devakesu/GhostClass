import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

if (process.env.NODE_ENV === "production") {
  process.env.SERWIST_SUPPRESS_TURBOPACK_WARNING = "1";
}

// Simplified: Only disable SW in development, unless explicitly enabled
// In production builds, SW is ALWAYS enabled (disable: false)
const withSerwist = withSerwistInit({
  // Source TypeScript service worker implementation
  swSrc: "src/sw.ts",
  // Destination for the generated service worker.
  // NOTE:
  // - This file is generated at build time and MUST NOT be committed to version control.
  // - Ensure "public/sw.js" is listed in .gitignore so it is treated as a build artifact.
  // - The public/ directory contains both static assets (checked in) and generated assets
  //   like this service worker; document this structure (e.g., in README.md or public/README.md)
  //   so team members understand which files are safe to edit/commit.
  swDest: "public/sw.js",
  // By default, service workers are disabled outside production to avoid caching issues during development.
  // To test PWA / offline functionality locally, start Next.js in development mode with NEXT_PUBLIC_ENABLE_SW_IN_DEV="true"
  // Example: NEXT_PUBLIC_ENABLE_SW_IN_DEV="true" npm run dev
  // This behavior should be documented in README.md for team members testing PWA features.
  // Disable only if:
  // 1. We're explicitly NOT in production (npm run dev)
  // AND
  // 2. The dev SW flag is NOT set to true
  // This ensures production builds ALWAYS generate the service worker
  disable: process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV !== "true",
  // Ensure service worker is accessible at the root path for proper scope
  // This is critical for standalone builds where static files need explicit handling
  reloadOnOnline: true,
  cacheOnNavigation: true,
});

// Resolve the Supabase storage hostname at build time.
// Throwing here makes missing NEXT_PUBLIC_SUPABASE_URL a hard build failure rather than
// silently falling back to 'supabase.co', which would permit Next.js Image Optimization
// to proxy images from *any* Supabase project.
const supabaseImageHostname = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      '[next.config.ts] NEXT_PUBLIC_SUPABASE_URL is required at build time for ' +
      'images.remotePatterns. Set it in your environment before running next build.'
    );
  }
  return new URL(url).hostname;
})();

const nextConfig: NextConfig = {
  output: "standalone",
  compress: true, // Enable gzip compression for better performance
  // Serve source maps publicly in production only when explicitly opted in.
  // Even though the project is GPL open-source, public browser source maps increase bandwidth
  // and make it easier for attackers to analyse the exact deployed code.
  // Source maps are always uploaded to Sentry separately for private error symbolication.
  productionBrowserSourceMaps: process.env.ENABLE_PUBLIC_BROWSER_SOURCEMAPS === "true",

  async headers() {
    // 1. Define headers common to all environments
    const headersList = [
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        // Disable all hardware/sensor APIs and privacy-sensitive capabilities.
        // interest-cohort=() opts the site out of Google's FLoC/Topics API.
        value: [
          "camera=()",
          "microphone=()",
          "geolocation=()",
          "payment=()",
          "usb=()",
          "serial=()",
          "bluetooth=()",
          "accelerometer=()",
          "gyroscope=()",
          "magnetometer=()",
          "autoplay=()",
          "display-capture=()",
          "interest-cohort=()",
        ].join(", "),
      },
    ];

    // 2. Only add HSTS in Production to prevent local SSL errors
    if (process.env.NODE_ENV === 'production') {
      // 2-year max-age (63072000 seconds = 2 years) satisfies Lighthouse "max-age too low" audit (minimum recommended: 63072000).
      // preload qualifies the domain for HSTS preload lists (https://hstspreload.org).
      headersList.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
      // Isolates the top-level browsing context from cross-origin documents opened in pop-ups.
      // Prevents cross-origin window references that could be exploited for XS-Leaks.
      // 'same-origin' is safe here: Cloudflare Turnstile runs inside an iframe (not a pop-up)
      // and is unaffected by COOP. Supabase OAuth uses redirect flows, not pop-ups.
      headersList.push({
        key: "Cross-Origin-Opener-Policy",
        value: "same-origin",
      });
      // Prevents this page from loading cross-origin resources that don't opt in via CORP/CORS.
      // 'credentialless' is chosen over 'require-corp' because Cloudflare Turnstile
      // (challenges.cloudflare.com) serves its iframe without a CORP header; credentialless
      // permits it while still enabling Spectre mitigations and completing the COOP/COEP pair.
      headersList.push({
        key: "Cross-Origin-Embedder-Policy",
        value: "credentialless",
      });
      // Define the named reporting endpoint consumed by the CSP report-to directive.
      // The endpoint /api/csp-report receives violation reports sent by the browser.
      // report-to (Reporting API v1) and report-uri (legacy fallback) both point here.
      headersList.push({
        key: "Reporting-Endpoints",
        value: 'csp-endpoint="/api/csp-report"',
      });
    }

    return [
      {
        source: "/(.*)",
        headers: headersList,
      },
      // Cache fonts for 7 days with 30-day stale-while-revalidate (fonts are not content-hashed)
      {
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Prevent cross-origin reads of API JSON responses.
      // Complements the existing CORS / origin-validation middleware without breaking
      // same-origin fetch calls from the Next.js frontend.
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },

  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'framer-motion',
      'recharts',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
    ],
  },

  // Performance: Minimize JavaScript bundle
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'], // Preserve console.error and console.warn; strip log/info from production
    } : false,
  },
  
  generateBuildId: async () => {
    // Prefer the commit SHA injected by CI/CD for stable, traceable build IDs.
    // Fall back to a random UUID so that two builds without APP_COMMIT_SHA still get
    // different IDs — preventing Next.js static-asset cache collisions across deployments.
    return process.env.APP_COMMIT_SHA ?? crypto.randomUUID();
  },

  env: {
    NEXT_PUBLIC_GIT_COMMIT_SHA: process.env.APP_COMMIT_SHA || "unknown",
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: supabaseImageHostname,
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default withSentryConfig(withSerwist(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  sourcemaps: {
    disable: process.env.NODE_ENV !== "production",
  },
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
});
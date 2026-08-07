export const dynamic = "force-dynamic";

const DEFAULT_PACKAGE_NAME = "com.devakesu.apps.ghostclass";

/**
 * Serves the Digital Asset Links file required by Android App Links
 * at GET /.well-known/assetlinks.json
 *
 * Uses build-time environment variables NEXT_PUBLIC_ANDROID_PACKAGE_NAME
 * and NEXT_PUBLIC_ANDROID_SHA256_FINGERPRINTS (Infisical /build-time)
 * to ensure build transparency, auditability, and reproducibility.
 */
export function GET() {
  const packageName = process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME?.trim() ||
    process.env.ANDROID_PACKAGE_NAME?.trim() ||
    DEFAULT_PACKAGE_NAME;

  const rawFingerprints = process.env.NEXT_PUBLIC_ANDROID_SHA256_FINGERPRINTS ||
    process.env.ANDROID_SHA256_FINGERPRINTS ||
    "";

  const fingerprints = rawFingerprints
    .split(",")
    .map((fp) => fp.trim().toUpperCase())
    .filter(Boolean);

  const assetLinks = [
    {
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return Response.json(assetLinks, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}

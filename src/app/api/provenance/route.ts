import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Callers that present this header receive the full CI/build metadata.
// This header acts as a lightweight signal for monitoring tools and CI pipelines
// without requiring a secret token, while still deterring casual browser browsing.
const FULL_PROVENANCE_ACCEPT = "application/vnd.ghostclass.provenance+json";

export function GET(req: NextRequest) {
  const commitSha = process.env.APP_COMMIT_SHA ?? "dev";
  const buildTimestamp = process.env.BUILD_TIMESTAMP ?? new Date().toISOString();
  const auditStatus = process.env.AUDIT_STATUS ?? "UNKNOWN";
  const signatureStatus = process.env.SIGNATURE_STATUS ?? "UNSIGNED";
  const imageDigest = process.env.IMAGE_DIGEST ?? commitSha; // IMAGE_DIGEST is post-build only, fallback to commit SHA

  // Base response — safe to expose publicly
  const basePayload = {
    commit: commitSha, // Legacy field for backward compatibility
    commit_sha: commitSha,
    build_id: (process.env.GITHUB_RUN_ID || "") || commitSha,
    app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    image_digest: imageDigest,
    container: Boolean(commitSha !== "dev"),
    timestamp: buildTimestamp,
    audit_status: auditStatus,
    signature_status: signatureStatus,
  };

  // Extended CI/build metadata — gated behind a specific Accept header to reduce
  // unnecessary exposure of internal infrastructure details in casual browser requests.
  const acceptHeader = (req.headers.get("accept") ?? "").toLowerCase();
  const includeCI = acceptHeader.includes(FULL_PROVENANCE_ACCEPT.toLowerCase());

  const payload = includeCI
    ? {
        ...basePayload,
        github_run_id: process.env.GITHUB_RUN_ID ?? "",
        github_run_number: process.env.GITHUB_RUN_NUMBER ?? "",
        github_repo:
          process.env.GITHUB_REPOSITORY ??
          process.env.NEXT_PUBLIC_GITHUB_URL?.replace("https://github.com/", "") ??
          "",
      }
    : basePayload;

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const acceptHeader = req.headers.get("accept") ?? "";
  const isFullProvenance = acceptHeader.includes("application/vnd.ghostclass.provenance+json");

  const commitSha = process.env.APP_COMMIT_SHA ?? "dev";
  const githubRepo = process.env.GITHUB_REPOSITORY ?? process.env.NEXT_PUBLIC_GITHUB_URL?.replace("https://github.com/", "") ?? "";
  const githubRunId = process.env.GITHUB_RUN_ID ?? "";
  const githubRunNumber = process.env.GITHUB_RUN_NUMBER ?? "";
  const buildTimestamp = process.env.BUILD_TIMESTAMP ?? new Date().toISOString();
  const auditStatus = process.env.AUDIT_STATUS ?? "UNKNOWN";
  const signatureStatus = process.env.SIGNATURE_STATUS ?? "UNSIGNED";
  const imageDigest = process.env.IMAGE_DIGEST ?? commitSha;

  const response: any = {
    commit: commitSha,
    commit_sha: commitSha,
    build_id: githubRunId || commitSha,
    app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    image_digest: imageDigest,
    container: Boolean(commitSha !== "dev"),
    timestamp: buildTimestamp,
    audit_status: auditStatus,
    signature_status: signatureStatus,
  };

  // Only expose sensitive/CI fields if the special Accept header is provided
  if (isFullProvenance) {
    response.github_run_id = githubRunId;
    response.github_run_number = githubRunNumber;
    response.github_repo = githubRepo;
    response.node_env = process.env.NODE_ENV;
  }

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
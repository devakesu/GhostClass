import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { CopyButton, InlineCopyButton } from "./copy-button";

interface BuildMeta {
  commit_sha: string;
  build_id: string;
  app_version: string;
  timestamp: string;
  github_repo: string;
  github_run_id: string;
  github_run_number: string;
  image_digest?: string;
  signature_status: string;
  audit_status: string;
  container: boolean;
  node_env: string;
}

function isValidGitHubRepo(repo: string) {
  return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo);
}

function isValidRunId(id: string | undefined): id is string {
  if (!id) return false;
  return /^\d+$/.test(id);
}

function isValidCommitSha(sha: string | undefined): sha is string {
  if (!sha) return false;
  return /^[a-f0-9]{4,40}$/i.test(sha);
}

function getBuildMeta(): BuildMeta {
  const commitSha = process.env.APP_COMMIT_SHA ?? "dev";
  const githubRepo =
    process.env.GITHUB_REPOSITORY ??
    (process.env.NEXT_PUBLIC_GITHUB_URL?.replace("https://github.com/", "") ?? "");
  const githubRunId = process.env.GITHUB_RUN_ID ?? "";
  const githubRunNumber = process.env.GITHUB_RUN_NUMBER ?? "";
  const buildTimestamp = process.env.BUILD_TIMESTAMP ?? new Date().toISOString();
  const auditStatus = process.env.AUDIT_STATUS ?? "UNKNOWN";
  const signatureStatus = process.env.SIGNATURE_STATUS ?? "UNSIGNED";
  const imageDigest = process.env.IMAGE_DIGEST ?? commitSha;

  return {
    commit_sha: commitSha,
    build_id: githubRunId || commitSha,
    github_run_id: githubRunId,
    github_run_number: githubRunNumber,
    github_repo: githubRepo,
    app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    image_digest: imageDigest,
    container: commitSha !== "dev",
    node_env: process.env.NODE_ENV ?? "development",
    timestamp: buildTimestamp,
    audit_status: auditStatus,
    signature_status: signatureStatus,
  };
}

export default function BuildInfoPage() {
  const meta = getBuildMeta();
  const metaJson = JSON.stringify(meta, null, 2);
  const validRepo = meta.github_repo && isValidGitHubRepo(meta.github_repo);
  const validRunId = isValidRunId(meta.github_run_id);
  const validCommitSha = isValidCommitSha(meta.commit_sha);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4 -ml-2">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-4xl font-bold font-klick tracking-wide bg-linear-to-r from-primary to-purple-400 bg-clip-text text-transparent">
              Build Information
            </h1>
            {meta.app_version && (
              <span className="font-mono text-sm px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary self-end mb-1">
                v{meta.app_version}
              </span>
            )}
          </div>
          <p className="text-muted-foreground">
            Transparency and provenance details for this deployment
          </p>
        </div>

        <div className="space-y-6">
          {/* Terminal-style Info Card */}
          <Card className="bg-card/50 border-border/40 overflow-hidden">
            <div className="bg-neutral-900/80 px-4 py-2 border-b border-border/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500/80"></div>
                  <div className="h-3 w-3 rounded-full bg-yellow-500/80"></div>
                  <div className="h-3 w-3 rounded-full bg-green-500/80"></div>
                </div>
                <span className="text-xs font-mono text-muted-foreground ml-2">
                  provenance.json
                </span>
              </div>
              <CopyButton text={metaJson} label="Copy JSON" className="h-6 text-xs" />
            </div>

            <div className="p-6 font-mono text-sm space-y-3 bg-neutral-950/50">
              <div>
                <span className="text-cyan-400">&gt; VERSION:</span>{" "}
                <span className="text-green-400 font-semibold">
                  v{meta.app_version}
                </span>
              </div>

              <div>
                <span className="text-cyan-400">&gt; BUILD_ID:</span>{" "}
                {validRunId && validRepo ? (
                  <a
                    href={`https://github.com/${meta.github_repo}/actions/runs/${meta.github_run_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-400 hover:text-green-300 hover:underline"
                  >
                    #{meta.github_run_number || meta.build_id}
                  </a>
                ) : (
                  <span className="text-green-400">
                    #{meta.github_run_number || meta.build_id}
                  </span>
                )}{" "}
                <span className="text-neutral-600">
                  (
                  {validCommitSha && validRepo ? (
                    <a
                      href={`https://github.com/${meta.github_repo}/commit/${meta.commit_sha}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-cyan-400 hover:underline"
                    >
                      {meta.commit_sha.substring(0, 7)}
                    </a>
                  ) : (
                    meta.commit_sha?.substring(0, 7) || "unknown"
                  )}
                  )
                </span>
              </div>

              <div>
                <span className="text-cyan-400">&gt; DEPLOYED:</span>{" "}
                {meta.timestamp ? (
                  <>
                    {meta.timestamp.split("T")[0]}{" "}
                    <span className="text-neutral-500">
                      {meta.timestamp.split("T")[1]?.replace("Z", " UTC")}
                    </span>
                  </>
                ) : (
                  <span className="text-neutral-500">Local Mode</span>
                )}
              </div>

              <div>
                <span className="text-cyan-400">&gt; ENVIRONMENT:</span>{" "}
                <span
                  className={
                    meta.node_env === "production"
                      ? "text-blue-400"
                      : "text-yellow-400"
                  }
                >
                  {meta.node_env?.toUpperCase()}
                </span>
                {meta.container && (
                  <span className="text-neutral-500"> (Containerized)</span>
                )}
              </div>

              <div>
                <span className="text-cyan-400">&gt; SECURITY:</span>{" "}
                <span
                  className={
                    meta.audit_status?.includes("PASSED")
                      ? "text-green-400"
                      : meta.audit_status === "SKIPPED"
                        ? "text-yellow-400"
                        : "text-red-400"
                  }
                >
                  {meta.audit_status || "UNKNOWN"}
                </span>
              </div>

              <div>
                <span className="text-cyan-400">&gt; PROVENANCE:</span>{" "}
                {meta.signature_status === "SLSA_PROVENANCE_GENERATED" && validRepo ? (
                  <a
                    href={`https://github.com/${meta.github_repo}/attestations`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-b border-dashed text-blue-400 border-blue-400 hover:text-blue-300 hover:border-blue-300"
                    title="SLSA Level 3 Verified - Click to view attestations"
                  >
                    {meta.signature_status}
                  </a>
                ) : (
                  <span
                    className={`border-b border-dashed cursor-help ${
                      meta.signature_status === "SLSA_PROVENANCE_GENERATED"
                        ? "text-blue-400 border-blue-400"
                        : meta.signature_status === "UNSIGNED"
                          ? "text-yellow-400 border-yellow-400"
                          : "text-neutral-400 border-neutral-400"
                    }`}
                    title={
                      meta.signature_status === "SLSA_PROVENANCE_GENERATED"
                        ? "SLSA Level 3 Verified"
                        : "Development Mode"
                    }
                  >
                    {meta.signature_status || "UNKNOWN"}
                  </span>
                )}{" "}
                {meta.signature_status === "SLSA_PROVENANCE_GENERATED" && (
                  <span className="text-green-400">✔ Verified</span>
                )}
              </div>

              {meta.image_digest && meta.image_digest !== "dev" && (
                <div>
                  <span className="text-cyan-400">&gt; IMAGE_DIGEST:</span>{" "}
                  <span className="text-neutral-400 text-xs break-all">
                    {meta.image_digest}
                  </span>
                  <InlineCopyButton text={meta.image_digest} />
                </div>
              )}
            </div>
          </Card>

          {/* Info Cards Grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Source Code */}
            {validRepo && (
              <Card className="p-6 hover:border-primary/50 transition-colors">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    fill="currentColor"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  Source Code
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  View the source code and contribution history
                </p>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a href={`https://github.com/${meta.github_repo}`} target="_blank" rel="noopener noreferrer">
                    View on GitHub
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </a>
                </Button>
              </Card>
            )}

            {/* Build Logs */}
            {validRunId && validRepo && (
              <Card className="p-6 hover:border-primary/50 transition-colors">
                <h3 className="font-semibold mb-2">Build Logs</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  View the CI/CD pipeline logs for this build
                </p>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a
                    href={`https://github.com/${meta.github_repo}/actions/runs/${meta.github_run_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Build #{meta.github_run_number || meta.build_id}
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </a>
                </Button>
              </Card>
            )}

            {/* Attestations */}
            {meta.signature_status === "SLSA_PROVENANCE_GENERATED" && validRepo && (
              <Card className="p-6 hover:border-primary/50 transition-colors">
                <h3 className="font-semibold mb-2">Attestations</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  SLSA Level 3 cryptographic proofs and signatures
                </p>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a
                    href={`https://github.com/${meta.github_repo}/attestations`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Attestations
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </a>
                </Button>
              </Card>
            )}

            {/* Security Scorecard */}
            {validRepo && (
              <Card className="p-6 hover:border-primary/50 transition-colors">
                <h3 className="font-semibold mb-2">Security Scorecard</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  OpenSSF security best practices compliance
                </p>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a
                    href={`https://scorecard.dev/viewer/?uri=github.com/${meta.github_repo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Scorecard
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </a>
                </Button>
              </Card>
            )}
          </div>

          {/* What is this? */}
          <Card className="p-6 bg-muted/30">
            <h3 className="font-semibold mb-3">What is Build Provenance?</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Build provenance provides transparency about how this application was
                built and deployed. It includes:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  <strong>Source Code Verification:</strong> Links to exact commit and
                  build logs
                </li>
                <li>
                  <strong>SLSA Level 3 Compliance:</strong> Cryptographic attestations
                  proving build integrity
                </li>
                <li>
                  <strong>Security Audits:</strong> Automated vulnerability scanning
                  results
                </li>
                <li>
                  <strong>Reproducible Builds:</strong> Anyone can verify the build
                  matches the source
                </li>
              </ul>
              <p className="pt-2">
                Learn more about{" "}
                <a
                  href="https://slsa.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  SLSA (Supply-chain Levels for Software Artifacts)
                </a>
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

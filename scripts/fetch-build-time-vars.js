#!/usr/bin/env node

const fs = require("node:fs");
const { generateFirebaseJson } = require("./generate-firebase-json.js");

/**
 * Authenticates with Infisical using Universal Auth.
 */
async function authenticate(apiBaseUrl, clientId, clientSecret) {
  console.log(`🔑 Authenticating with Infisical (${apiBaseUrl})...`);
  const loginRes = await fetch(
    `${apiBaseUrl}/api/v1/auth/universal-auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    },
  );

  if (!loginRes.ok) {
    const errText = await loginRes.text();
    console.error(
      `❌ Authentication failed: ${loginRes.status} ${loginRes.statusText}\n${errText}`,
    );
    process.exit(1);
  }

  const { accessToken } = await loginRes.json();
  console.log(`✓ Authenticated successfully.`);
  return accessToken;
}

/**
 * Resolves project slug or ID to a verified UUID.
 */
async function resolveProjectId(apiBaseUrl, accessToken, projectSlugOrId) {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      projectSlugOrId,
    );

  if (!isUuid) {
    console.log(`🔍 Resolving project slug "${projectSlugOrId}" to ID...`);
    const projectRes = await fetch(
      `${apiBaseUrl}/api/v1/projects/slug/${projectSlugOrId}`,
      {
        headers: { "Authorization": `Bearer ${accessToken}` },
      },
    );

    if (projectRes.ok) {
      const projectData = await projectRes.json();
      const projectObj = projectData.project || projectData.workspace ||
        projectData;
      const resolvedId = projectObj.id || projectObj._id || projectSlugOrId;
      console.log(`✓ Resolved project slug to ID: ${resolvedId}`);
      return resolvedId;
    } else {
      const errText = await projectRes.text();
      console.log(
        `⚠ Failed to resolve slug via API, falling back to slug value: ${errText}`,
      );
      return projectSlugOrId;
    }
  }

  console.log(`✓ Using project ID: ${projectSlugOrId}`);
  return projectSlugOrId;
}

/**
 * Fetches the secret list from the targeted Infisical environment and path.
 */
async function fetchSecrets(
  apiBaseUrl,
  accessToken,
  projectId,
  envSlug,
  secretPath,
) {
  console.log(
    `📥 Fetching variables from path "${secretPath}" [env: ${envSlug}]...`,
  );
  const secretsUrl = `${apiBaseUrl}/api/v4/secrets?projectId=${
    encodeURIComponent(projectId)
  }&environment=${encodeURIComponent(envSlug)}&secretPath=${
    encodeURIComponent(secretPath)
  }&viewSecretValue=true`;

  const secretsRes = await fetch(secretsUrl, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });

  if (!secretsRes.ok) {
    const errText = await secretsRes.text();
    console.error(
      `❌ Failed to fetch secrets: ${secretsRes.status} ${secretsRes.statusText}\n${errText}`,
    );
    process.exit(1);
  }

  const { secrets } = await secretsRes.json();
  if (!secrets || !Array.isArray(secrets)) {
    console.error("❌ Invalid secrets response format.");
    process.exit(1);
  }

  console.log(`✓ Successfully fetched ${secrets.length} variables.`);
  return secrets;
}

/**
 * Helper to mask single or multi-line values in GitHub Actions logs.
 */
function maskValue(val) {
  if (!val) return;
  const str = String(val);
  for (const line of str.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      console.log(`::add-mask::${trimmed}`);
    }
  }
}

/**
 * Exports secrets to GITHUB_ENV and registers masks for sensitive values.
 */
function exportSecrets(secrets) {
  const githubEnvFile = process.env.GITHUB_ENV;

  // Define exactly which keys should be masked in GitHub logs
  const keysToMask = [
    "GOOGLE_SERVICES_JSON_BASE64",
    "MOBILE_SENTRY_AUTH_TOKEN",
    "FIREBASE_API_KEY_ANDROID",
    "FIREBASE_API_KEY_IOS",
    "NEXT_PUBLIC_MOBILE_SENTRY_DSN",
    "NEXT_PUBLIC_BACKEND_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_CF_PROXY_URL",
    "NEXT_PUBLIC_SUPABASE_AWS_PROXY_URL",
    "NEXT_PUBLIC_SENTRY_DSN",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "NEXT_PUBLIC_GA_ID",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_STORAGE_BUCKET",
  ];

  // Explicitly omit dev URLs/keys from masking
  const keysToOmitFromMasking = [
    "NEXT_PUBLIC_SUPABASE_DEV_URL",
    "NEXT_PUBLIC_SUPABASE_DEV_PUBLISHABLE_KEY",
  ];

  // Also mask any key matching sensitive token/secret patterns
  const sensitivePattern = /(_KEY|_SECRET|_TOKEN|_PASSWORD|_AUTH|_DSN|_BASE64)$/i;

  function shouldMask(key) {
    if (keysToOmitFromMasking.includes(key)) return false;
    if (keysToMask.includes(key)) return true;
    return sensitivePattern.test(key);
  }

  if (githubEnvFile) {
    console.log(`📝 Exporting variables to GITHUB_ENV...`);
    for (const secret of secrets) {
      if (
        shouldMask(secret.secretKey) &&
        secret.secretValue
      ) {
        maskValue(secret.secretValue);
      }
      if (secret.secretValue && String(secret.secretValue).includes("\n")) {
        const delimiter = `EOF_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        fs.appendFileSync(
          githubEnvFile,
          `${secret.secretKey}<<${delimiter}\n${secret.secretValue}\n${delimiter}\n`,
        );
      } else {
        fs.appendFileSync(
          githubEnvFile,
          `${secret.secretKey}=${secret.secretValue || ""}\n`,
        );
      }
      console.log(`   + ${secret.secretKey}`);
    }
    console.log(`🎉 Variables exported successfully!`);
  } else {
    console.log(`ℹ️ GITHUB_ENV is not set. Values loaded:`);
    for (const secret of secrets) {
      if (shouldMask(secret.secretKey)) {
        console.log(`   ${secret.secretKey}=[MASKED]`);
      } else {
        console.log(`   ${secret.secretKey}=${secret.secretValue}`);
      }
    }
  }
}

/**
 * Main application entrypoint.
 */
async function main() {
  const clientId = process.env.INFISICAL_CLIENT_ID;
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
  const projectSlugOrId = process.env.INFISICAL_PROJECT_SLUG ||
    process.env.INFISICAL_PROJECT_ID;
  const envSlug = process.env.INFISICAL_ENV_SLUG || "prod";
  const secretPath = process.env.INFISICAL_SECRET_PATH || "/build-time";
  const apiBaseUrl = process.env.INFISICAL_API_URL ||
    "https://app.infisical.com";

  if (!clientId || !clientSecret || !projectSlugOrId) {
    console.error(
      "❌ Missing required Infisical credentials (INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET) or project identifier.",
    );
    process.exit(1);
  }

  const accessToken = await authenticate(apiBaseUrl, clientId, clientSecret);
  const projectId = await resolveProjectId(
    apiBaseUrl,
    accessToken,
    projectSlugOrId,
  );
  const secrets = await fetchSecrets(
    apiBaseUrl,
    accessToken,
    projectId,
    envSlug,
    secretPath,
  );
  exportSecrets(secrets);
  generateFirebaseJson(secrets);
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});

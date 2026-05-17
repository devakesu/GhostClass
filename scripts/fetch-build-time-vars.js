#!/usr/bin/env node

const fs = require('fs');

async function main() {
  const clientId = process.env.INFISICAL_CLIENT_ID;
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
  const projectSlugOrId = process.env.INFISICAL_PROJECT_SLUG || process.env.INFISICAL_PROJECT_ID;
  const envSlug = process.env.INFISICAL_ENV_SLUG || 'prod';
  const secretPath = process.env.INFISICAL_SECRET_PATH || '/build-time';
  const apiBaseUrl = process.env.INFISICAL_API_URL || 'https://app.infisical.com';

  if (!clientId || !clientSecret || !projectSlugOrId) {
    console.error('❌ Missing required Infisical credentials (INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET) or project identifier.');
    process.exit(1);
  }

  console.log(`🔑 Authenticating with Infisical (${apiBaseUrl})...`);
  const loginRes = await fetch(`${apiBaseUrl}/api/v1/auth/universal-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret })
  });

  if (!loginRes.ok) {
    const errText = await loginRes.text();
    console.error(`❌ Authentication failed: ${loginRes.status} ${loginRes.statusText}\n${errText}`);
    process.exit(1);
  }

  const { accessToken } = await loginRes.json();
  console.log(`✓ Authenticated successfully.`);

  // Resolve project slug/id to projectId
  let projectId = projectSlugOrId;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectSlugOrId);

  if (!isUuid) {
    console.log(`🔍 Resolving project slug "${projectSlugOrId}" to ID...`);
    const projectRes = await fetch(`${apiBaseUrl}/api/v1/projects/slug/${projectSlugOrId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (projectRes.ok) {
      const projectData = await projectRes.json();
      const projectObj = projectData.project || projectData.workspace || projectData;
      projectId = projectObj.id || projectObj._id || projectId;
      console.log(`✓ Resolved project slug to ID: ${projectId}`);
    } else {
      const errText = await projectRes.text();
      console.log(`⚠ Failed to resolve slug via API, falling back to slug value as projectId: ${errText}`);
    }
  } else {
    console.log(`✓ Using project ID: ${projectId}`);
  }

  console.log(`📥 Fetching variables from path "${secretPath}" [env: ${envSlug}]...`);
  const secretsUrl = `${apiBaseUrl}/api/v4/secrets?projectId=${encodeURIComponent(projectId)}&environment=${encodeURIComponent(envSlug)}&secretPath=${encodeURIComponent(secretPath)}&viewSecretValue=true`;
  
  const secretsRes = await fetch(secretsUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!secretsRes.ok) {
    const errText = await secretsRes.text();
    console.error(`❌ Failed to fetch secrets: ${secretsRes.status} ${secretsRes.statusText}\n${errText}`);
    process.exit(1);
  }

  const { secrets } = await secretsRes.json();
  if (!secrets || !Array.isArray(secrets)) {
    console.error('❌ Invalid secrets response format.');
    process.exit(1);
  }

  console.log(`✓ Successfully fetched ${secrets.length} variables.`);

  const githubEnvFile = process.env.GITHUB_ENV;
  if (githubEnvFile) {
    console.log(`📝 Exporting variables to GITHUB_ENV...`);
    for (const secret of secrets) {
      fs.appendFileSync(githubEnvFile, `${secret.secretKey}=${secret.secretValue}\n`);
      console.log(`   + ${secret.secretKey}`);
    }
    console.log(`🎉 Variables exported successfully!`);
  } else {
    console.log(`ℹ️ GITHUB_ENV is not set. Values loaded:`);
    for (const secret of secrets) {
      console.log(`   ${secret.secretKey}=${secret.secretValue}`);
    }
  }
}

main().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});

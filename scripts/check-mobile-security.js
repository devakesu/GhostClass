#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const MOBILE_API_SERVICE = path.join(
  ROOT,
  "mobile",
  "lib",
  "services",
  "api_service.dart",
);

function fail(message) {
  console.error(`[mobile-security-check] ${message}`);
  process.exit(1);
}

function getMobileGhostClassCalls(source) {
  const calls = new Map();
  const callRegex = /_dio\.(get|post|put|patch|delete|head)\(\s*'\$_ghostclassBaseUrl([^']+)'/gi;

  for (const match of source.matchAll(callRegex)) {
    const method = String(match[1] || "").toUpperCase();
    const rawPath = String(match[2] || "");
    const normalizedPath = rawPath.split("?")[0].trim();

    if (!normalizedPath.startsWith("/")) continue;

    const key = `${method} ${normalizedPath}`;
    calls.set(key, { method, path: normalizedPath });
  }

  return Array.from(calls.values()).sort((a, b) => {
    const byPath = a.path.localeCompare(b.path);
    return byPath !== 0 ? byPath : a.method.localeCompare(b.method);
  });
}

function routeFileForEndpoint(endpointPath) {
  const parts = endpointPath.split("/").filter(Boolean);
  return path.join(ROOT, "src", "app", "api", ...parts, "route.ts");
}

function methodIsWithSecurityWrapped(routeSource, method) {
  const withSecurityExport = new RegExp(
    `export\\s+const\\s+${method}\\s*=\\s*withSecurity\\s*\\(`,
  );
  return withSecurityExport.test(routeSource);
}

function main() {
  if (!fs.existsSync(MOBILE_API_SERVICE)) {
    fail(`Missing file: ${MOBILE_API_SERVICE}`);
  }

  const apiServiceSource = fs.readFileSync(MOBILE_API_SERVICE, "utf8");
  const endpoints = getMobileGhostClassCalls(apiServiceSource);

  if (endpoints.length === 0) {
    fail("No GhostClass mobile endpoints were detected in api_service.dart");
  }

  const errors = [];

  for (const endpoint of endpoints) {
    const routeFile = routeFileForEndpoint(endpoint.path);
    if (!fs.existsSync(routeFile)) {
      errors.push(
        `Missing route file for ${endpoint.method} ${endpoint.path}: ${path.relative(ROOT, routeFile)}`,
      );
      continue;
    }

    const routeSource = fs.readFileSync(routeFile, "utf8");
    if (!methodIsWithSecurityWrapped(routeSource, endpoint.method)) {
      errors.push(
        `Route not wrapped with withSecurity: ${endpoint.method} ${endpoint.path} (${path.relative(ROOT, routeFile)})`,
      );
    }
  }

  if (errors.length > 0) {
    console.error("[mobile-security-check] Security guard failed:\n");
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `[mobile-security-check] OK (${endpoints.length} mobile GhostClass endpoint(s) verified)`,
  );
}

main();
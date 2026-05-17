const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. Get modified lines via git diff
function getGitDiffModifiedLines() {
  const diffOutput = execSync('git diff -U0', { encoding: 'utf8' });
  const files = {};
  let currentFile = null;

  diffOutput.split('\n').forEach(line => {
    if (line.startsWith('+++ b/')) {
      currentFile = line.substring(6);
      files[currentFile] = [];
    } else if (line.startsWith('@@ ') && currentFile) {
      // Format: @@ -line,count +line,count @@ or @@ -line +line @@
      const match = line.match(/@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (match) {
        const start = parseInt(match[1], 10);
        const count = match[2] ? parseInt(match[2], 10) : 1;
        for (let i = 0; i < count; i++) {
          files[currentFile].push(start + i);
        }
      }
    }
  });

  return files;
}

// 2. Parse LCOV file
function parseLcov(lcovPath, projectRoot, prefix = '') {
  if (!fs.existsSync(lcovPath)) return {};
  const content = fs.readFileSync(lcovPath, 'utf8');
  const records = {};
  let currentFile = null;

  content.split('\n').forEach(line => {
    line = line.trim();
    if (line.startsWith('SF:')) {
      let fullPath = line.substring(3);
      if (!path.isAbsolute(fullPath)) {
        fullPath = path.join(projectRoot, prefix, fullPath);
      }
      // Make path relative to projectRoot
      currentFile = path.relative(projectRoot, fullPath);
      records[currentFile] = { hits: {}, total: 0, covered: 0 };
    } else if (currentFile && line.startsWith('DA:')) {
      const parts = line.substring(3).split(',');
      const lineNum = parseInt(parts[0], 10);
      const hitCount = parseInt(parts[1], 10);
      records[currentFile].hits[lineNum] = hitCount;
      records[currentFile].total++;
      if (hitCount > 0) records[currentFile].covered++;
    }
  });

  return records;
}

const diffFiles = getGitDiffModifiedLines();
const workspaceRoot = '/workspace';
const mobileRoot = '/workspace/mobile';

// Load mobile and backend coverages
const mobileLcov = parseLcov(path.join(mobileRoot, 'coverage/lcov.info'), workspaceRoot, 'mobile');
// Backend Vitest uses lcov too
const backendLcov = parseLcov(path.join(workspaceRoot, 'coverage/lcov.info'), workspaceRoot, '');

console.log("\n=================== DIFF COVERAGE ANALYSIS ===================");

let totalDiffLines = 0;
let coveredDiffLines = 0;
let hasUncoveredFiles = false;

Object.entries(diffFiles).forEach(([file, lines]) => {
  // Ignore test files and configuration/work-flows
  if (
    file.includes('__tests__') ||
    file.includes('test/') ||
    file.endsWith('.json') ||
    file.endsWith('.yml') ||
    file.endsWith('.yaml') ||
    file.endsWith('Dockerfile') ||
    file.endsWith('.env') ||
    file.startsWith('.')
  ) {
    return;
  }

  const isMobile = file.startsWith('mobile/');
  const coverageData = isMobile ? mobileLcov[file] : (backendLcov[file] || mobileLcov[file]);

  if (lines.length === 0) return;

  console.log(`\n📄 File: ${file}`);
  console.log(`   Modified/Added Lines: ${lines.join(', ')}`);

  if (!coverageData) {
    console.log(`   ⚠️  No coverage report found for this file.`);
    totalDiffLines += lines.length;
    hasUncoveredFiles = true;
    return;
  }

  let fileTotal = 0;
  let fileCovered = 0;
  const uncovered = [];

  lines.forEach(lineNum => {
    const hits = coverageData.hits[lineNum];
    if (hits !== undefined) {
      fileTotal++;
      totalDiffLines++;
      if (hits > 0) {
        fileCovered++;
        coveredDiffLines++;
      } else {
        uncovered.push(lineNum);
      }
    }
  });

  const filePct = fileTotal === 0 ? 100 : (fileCovered / fileTotal) * 100;
  console.log(`   Diff Line Coverage: ${filePct.toFixed(2)}% (${fileCovered}/${fileTotal} lines)`);
  if (uncovered.length > 0) {
    console.log(`   ❌ Uncovered modified lines: ${uncovered.join(', ')}`);
  }
});

const overallPct = totalDiffLines === 0 ? 100 : (coveredDiffLines / totalDiffLines) * 100;
console.log("\n==============================================================");
console.log(`👉 OVERALL DIFF LINE COVERAGE: ${overallPct.toFixed(2)}% (${coveredDiffLines}/${totalDiffLines} lines)`);
console.log("==============================================================");

if (overallPct >= 90) {
  console.log("🎉 SUCCESS: Diff coverage meets or exceeds the required 90% threshold!");
  process.exit(0);
} else {
  console.log("❌ FAILURE: Diff coverage is below the required 90% threshold.");
  process.exit(1);
}

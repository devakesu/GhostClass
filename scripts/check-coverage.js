const fs = require("node:fs");
const path = require("node:path");

const coverageFile = path.join(
  process.cwd(),
  "coverage",
  "coverage-final.json",
);
if (!fs.existsSync(coverageFile)) {
  console.error("Coverage file not found");
  process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(coverageFile, "utf8"));
const lowCoverageFiles = [];
const allFiles = [];

for (const [file, data] of Object.entries(coverage)) {
  const s = data.s;
  const sTotal = Object.keys(s).length;
  const sCovered = Object.values(s).filter((v) => v > 0).length;
  const sPct = sTotal === 0 ? 100 : (sCovered / sTotal) * 100;

  const f = data.f;
  const fTotal = Object.keys(f).length;
  const fCovered = Object.values(f).filter((v) => v > 0).length;
  const fPct = fTotal === 0 ? 100 : (fCovered / fTotal) * 100;

  const b = data.b;
  const bTotal = Object.values(b).reduce((acc, curr) => acc + curr.length, 0);
  const bCovered = Object.values(b).reduce(
    (acc, curr) => acc + curr.filter((v) => v > 0).length,
    0,
  );
  const bPct = bTotal === 0 ? 100 : (bCovered / bTotal) * 100;

  const percentage = sPct;

  if (percentage < 50) {
    lowCoverageFiles.push({ file, percentage: percentage.toFixed(2) });
  }

  allFiles.push({ file, sPct, fPct, bPct });
}

allFiles.sort((a, b) => a.sPct - b.sPct);

console.log(`Total files checked: ${allFiles.length}`);

if (lowCoverageFiles.length > 0) {
  console.log("Files with < 50% statement coverage:");
  lowCoverageFiles.forEach((f) => console.log(`${f.file}: ${f.percentage}%`));
} else {
  console.log("All files have >= 50% statement coverage!");
}

console.log("\nBottom 10 files by statement coverage:");
allFiles.slice(0, 10).forEach((f) => {
  console.log(
    `${f.file.replace(process.cwd(), "")}: S:${f.sPct.toFixed(2)}% F:${
      f.fPct.toFixed(2)
    }% B:${f.bPct.toFixed(2)}%`,
  );
});

const fs = require('fs');
const path = require('path');

const lcovPath = path.join(__dirname, '../coverage/lcov.info');

if (!fs.existsSync(lcovPath)) {
  console.error("LCOV file not found at " + lcovPath);
  process.exit(1);
}

const content = fs.readFileSync(lcovPath, 'utf8');

const targetFiles = [
  'lib/logic/error_handler.dart',
  'lib/screens/login_screen.dart',
  'lib/screens/navigation_shell.dart',
  'lib/screens/splash_screen.dart',
  'lib/services/api_service.dart',
  'lib/services/push_notification_service.dart',
  'lib/services/security_service.dart',
  'lib/widgets/service_toast.dart'
];

const records = {};
let currentSF = null;

content.split('\n').forEach(line => {
  line = line.trim();
  if (line.startsWith('SF:')) {
    const fullPath = line.substring(3);
    // Find matching target file
    const matched = targetFiles.find(tf => fullPath.endsWith(tf));
    if (matched) {
      currentSF = matched;
      records[currentSF] = {
        lf: 0,
        lh: 0,
        uncovered: []
      };
    } else {
      currentSF = null;
    }
  } else if (currentSF) {
    if (line.startsWith('LF:')) {
      records[currentSF].lf = parseInt(line.substring(3), 10);
    } else if (line.startsWith('LH:')) {
      records[currentSF].lh = parseInt(line.substring(3), 10);
    } else if (line.startsWith('DA:')) {
      const parts = line.substring(3).split(',');
      const lineNum = parseInt(parts[0], 10);
      const hitCount = parseInt(parts[1], 10);
      if (hitCount === 0) {
        records[currentSF].uncovered.push(lineNum);
      }
    }
  }
});

console.log("=== FLUTTER COVERAGE REPORT ===");
let allMet = true;
targetFiles.forEach(file => {
  const rec = records[file];
  if (!rec) {
    console.log(`❌ ${file}: NO COVERAGE DATA FOUND`);
    allMet = false;
    return;
  }
  const pct = rec.lf === 0 ? 100 : (rec.lh / rec.lf) * 100;
  console.log(`${pct >= 90 ? '✅' : '❌'} ${file}: ${pct.toFixed(2)}% (${rec.lh}/${rec.lf} lines covered)`);
  if (rec.uncovered.length > 0 && pct < 90) {
    console.log(`   Uncovered lines: ${rec.uncovered.join(', ')}`);
  }
  if (pct < 90) {
    allMet = false;
  }
});

if (allMet) {
  console.log("\n🎉 SUCCESS: All modified Flutter files meet the >= 90% coverage threshold!");
} else {
  console.log("\n⚠️ WARNING: Some modified Flutter files do not meet the >= 90% coverage threshold!");
}

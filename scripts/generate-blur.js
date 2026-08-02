const sharp = require("sharp");
const path = require("node:path");

async function generateBlurPlaceholder() {
  const inputPath = path.join(__dirname, "../public/logo.png");

  // Resize on a transparent canvas, keep alpha, and blur lightly
  const buffer = await sharp(inputPath)
    .resize(24, 24, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .blur(1)
    .png()
    .toBuffer();

  const base64 = buffer.toString("base64");
  console.log("\n✅ Add this to your Image component:");
  console.log(`\nblurDataURL="data:image/png;base64,${base64}"\n`);
}

generateBlurPlaceholder().catch(console.error);

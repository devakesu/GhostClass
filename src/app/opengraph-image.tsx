import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const alt = "GhostClass — Smart Attendance Tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

const iconSrc = (() => {
  const buf = readFileSync(join(process.cwd(), "public/icon-512.png"));
  return `data:image/png;base64,${buf.toString("base64")}`;
})();

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#141414",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        <img
          src={iconSrc}
          width={300}
          height={300}
          alt=""
          style={{ borderRadius: "24px" }}
        />
        <div
          style={{
            color: "#ffffff",
            fontSize: 72,
            fontWeight: 700,
            marginTop: 32,
            letterSpacing: "-2px",
          }}
        >
          GhostClass
        </div>
        <div
          style={{
            color: "#a855f7",
            fontSize: 32,
            marginTop: 16,
          }}
        >
          Smart Attendance Tracker
        </div>
      </div>
    ),
    size
  );
}

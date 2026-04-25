import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      commit: process.env.SOURCE_COMMIT ?? "unknown",
      build_id: process.env.SOURCE_COMMIT ?? "unknown",
      node_env: process.env.NODE_ENV,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

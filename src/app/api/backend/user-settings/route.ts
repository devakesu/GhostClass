import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withSecurity } from "@/lib/security/app-check";

const handler = async (_req: Request) => {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("bunk_calculator_enabled, target_percentage")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }

    return NextResponse.json({ settings });
  } catch (_error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};

export const GET = withSecurity(handler as any);

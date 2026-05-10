import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function check() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  
  const supabase = createClient(url, key);
  
  // Get the user from user_settings
  const { data: settings } = await supabase.from("user_settings").select("user_id").limit(1);
  if (!settings || settings.length === 0) return;
  
  const uid = settings[0].user_id;
  console.log("Searching for auth_id:", uid);
  
  const { data: user } = await supabase.from("users").select("*").eq("auth_id", uid).maybeSingle();
  console.log("User:", user);
  
  if (!user) {
    console.log("No user found in 'users' table with auth_id =", uid);
    // Try searching by 'id' (Ezygo ID)
    const { data: userById } = await supabase.from("users").select("*").eq("id", uid).maybeSingle();
    console.log("User by ID:", userById);
  }
}

check();

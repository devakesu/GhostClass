import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import { getAuthTokenServer } from "@/lib/security/auth-cookie";
import { validateCsrfToken } from "@/lib/security/csrf";
import { CSRF_HEADER } from "@/lib/security/csrf-constants";
import { getAllowedHosts, resolveRequestHostname } from "@/lib/security/origin-validation";
import { logger } from "@/lib/logger";
import { egressFetch, getClientIp } from "@/lib/utils.server";
import { authRateLimiter } from "@/lib/ratelimit";
import { z } from "zod";
import { withSecurity } from "@/lib/security/app-check";

export const dynamic = "force-dynamic";

function resolve(
  local: string | null | undefined,
  remote: string | number | null | undefined
): string | null {
  if (local && local !== "") return local;
  return remote ? String(remote) : null;
}

const getHandler = async (req: Request) => {
  const ip = getClientIp(req.headers);
  if (!ip) return NextResponse.json({ error: "No IP" }, { status: 400 });
  const { success, reset } = await authRateLimiter.limit(`profile_get_${ip}`);
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(reset) } });

  if (process.env.NODE_ENV !== "development") {
    const allowedHosts = getAllowedHosts();
    const origin = req.headers.get("origin");
    if (!origin) {
      const secFetchSite = req.headers.get("sec-fetch-site")?.toLowerCase();
      const requestHostname = resolveRequestHostname(req as any);
      if (!(secFetchSite === "same-origin" && !!requestHostname && allowedHosts?.has(requestHostname))) return NextResponse.json({ error: "Origin required" }, { status: 400 });
    } else {
      const originHostname = new URL(origin).hostname.toLowerCase();
      if (!allowedHosts?.has(originHostname)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existingUser } = await supabaseAdmin.from("users").select("*, class:classes(id, name)").eq("auth_id", user.id).maybeSingle();

  const decryptedGender = existingUser?.gender && existingUser?.gender_iv ? decrypt(existingUser.gender_iv, existingUser.gender) : null;
  const decryptedBirthDate = existingUser?.birth_date && existingUser?.birth_date_iv ? decrypt(existingUser.birth_date_iv, existingUser.birth_date) : null;
  const decryptedPhone = existingUser?.phone && existingUser?.phone_iv ? decrypt(existingUser.phone_iv, existingUser.phone) : null;

  if (existingUser && existingUser.first_name) {
    after(async () => {
      const syncToken = await getAuthTokenServer();
      if (!syncToken) return;
      try {
        const ezygoRes = await egressFetch("myprofile", { headers: { Authorization: `Bearer ${syncToken}` } });
        if (ezygoRes.ok) {
          const json = await ezygoRes.json();
          const d = json.data ?? json;
          const enc = (d.mobile || d.user?.mobile) ? encrypt(d.mobile || d.user?.mobile) : null;
          await supabaseAdmin.from("users").update({
            first_name: resolve(existingUser.first_name, d.first_name || d.full_name?.split(" ")[0]),
            last_name: resolve(existingUser.last_name, d.last_name || d.full_name?.split(" ").slice(1).join(" ")),
            phone: enc?.content, phone_iv: enc?.iv
          }).eq("id", existingUser.id);
        }
      } catch (err) { logger.warn("Sync failed", err); }
    });
    return NextResponse.json({ 
      id: existingUser.id, 
      username: existingUser.username, 
      email: existingUser.email, 
      first_name: existingUser.first_name, 
      last_name: existingUser.last_name, 
      phone: decryptedPhone, 
      gender: decryptedGender, 
      birth_date: decryptedBirthDate, 
      avatar_url: existingUser.avatar_url,
      class: Array.isArray(existingUser.class) ? existingUser.class[0] : existingUser.class
    });
  }

  const token = await getAuthTokenServer();
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });
  const ezygoRes = await egressFetch("myprofile", { headers: { Authorization: `Bearer ${token}` } });
  if (!ezygoRes.ok) return NextResponse.json({ error: "Failed" }, { status: 502 });
  const json = await ezygoRes.json();
  const d = json.data || json;
  const encPhone = (d.mobile || d.user?.mobile) ? encrypt(d.mobile || d.user?.mobile) : null;
  const upsertData = { id: d.user_id, auth_id: user.id, first_name: resolve(null, d.first_name || d.full_name?.split(" ")[0]), last_name: resolve(null, d.last_name || d.full_name?.split(" ").slice(1).join(" ")), phone: encPhone?.content, phone_iv: encPhone?.iv };
  await supabaseAdmin.from("users").upsert(upsertData, { onConflict: "id" });
  return NextResponse.json({ ...upsertData, phone: d.mobile || d.user?.mobile });
};

const patchSchema = z.object({
  first_name: z.string().min(2),
  last_name: z.string().optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const patchHandler = async (req: Request, { decryptedBody }: { decryptedBody?: any }) => {
  const ip = getClientIp(req.headers);
  if (!ip) return NextResponse.json({ error: "No IP" }, { status: 400 });
  const { success } = await authRateLimiter.limit(`profile_patch_${ip}`);
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const csrfToken = req.headers.get(CSRF_HEADER);
  if (!(await validateCsrfToken(csrfToken))) return NextResponse.json({ error: "Invalid CSRF" }, { status: 403 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body = decryptedBody;
  if (!body) { body = await req.json(); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });

  const { first_name, last_name, gender, birth_date } = parsed.data;
  const up: any = { first_name, last_name: last_name ?? null };
  if (gender) { const enc = encrypt(gender); up.gender = enc.content; up.gender_iv = enc.iv; }
  if (birth_date) { const enc = encrypt(birth_date); up.birth_date = enc.content; up.birth_date_iv = enc.iv; }

  const supabaseAdmin = getAdminClient();
  await supabaseAdmin.from("users").update(up).eq("auth_id", user.id);
  return NextResponse.json({ first_name, last_name, gender, birth_date });
};

export const GET = withSecurity(getHandler as any);
export const PATCH = withSecurity(patchHandler as any);

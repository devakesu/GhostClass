import { NextRequest, NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getAdminClient } from "@/lib/supabase/admin";
import { withSecurity } from "@/lib/security/app-check";
import { 
  processContactSubmission, 
  contactSchema 
} from "@/lib/contact/service";
import { getClientIp } from "@/lib/utils.server";
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

/**
 * REST API for contact form submissions.
 * Optimized for Mobile App usage with Zero-Trust security (JWE + App Check).
 */
export const POST = withSecurity(async (req, { decryptedBody }) => {
  const request = req as NextRequest;
  const headerList = await nextHeaders();
  
  // 1. Resolve Payload
  // If withSecurity decrypted a JWE, use that. Otherwise, try raw JSON (for dev/web).
  let body = decryptedBody;
  if (!body) {
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
  }

  // 2. Validate Input
  const result = contactSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ 
      error: result.error.issues[0].message 
    }, { status: 400 });
  }

  // 3. Resolve Auth Context (Optional for contact form)
  // Support both Supabase sessions and Guest submissions.
  const supabase = getAdminClient();
  const authHeader = headerList.get("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const { data: { user } } = await supabase.auth.getUser(token);
    userId = user?.id || null;
  }

  // 4. IP Extraction
  const ip = getClientIp(headerList);

  // 5. Delegate to Shared Service
  try {
    const res = await processContactSubmission(supabase, result.data, {
      userId,
      ip: ip || undefined,
      userAgent: headerList.get("user-agent") || undefined,
    });

    return NextResponse.json({ success: true, id: res.id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`API Contact Flow failed: ${errorMessage}`, error);
    return NextResponse.json({ 
      error: "Failed to process message. Please try again later." 
    }, { status: 500 });
  }
});

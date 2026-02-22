import { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { DashboardDataLoader } from "./DashboardDataLoader";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { Loading } from "@/components/loading";

// Force dynamic rendering for protected routes
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Dashboard",
  robots: {
    index: true,
    follow: true,
  },
};

export default async function DashboardPage() {
  // 1. Check authentication (fast – reads existing session cookie, no external I/O)
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    logger.dev('[Dashboard] User not authenticated, redirecting', {
      context: 'dashboard-page',
    });
    redirect("/");
  }

  // 2. Get EzyGo access token
  const cookieStore = await cookies();
  const token = cookieStore.get("ezygo_access_token")?.value;

  if (!token) {
    logger.warn('[Dashboard] EzyGo token missing, redirecting', {
      context: 'dashboard-page',
      userId: user.id,
    });
    redirect("/");
  }

  // 3. Stream data-dependent content – page shell renders immediately, then
  //    DashboardDataLoader flushes when fetchDashboardData resolves
  return (
    <Suspense fallback={<Loading />}>
      <DashboardDataLoader token={token} userId={user.id} />
    </Suspense>
  );
}
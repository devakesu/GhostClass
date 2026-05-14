import { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { LeaveDataLoader } from "./LeaveDataLoader";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { Loading } from "@/components/loading";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leave Applications",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LeaveApplicationsPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    logger.dev("[LeaveApp] User not authenticated, redirecting", {
      context: "leave-page",
    });
    redirect("/");
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("ezygo_access_token")?.value;

  if (!token) {
    logger.warn("[LeaveApp] EzyGo token missing, redirecting", {
      context: "leave-page",
      userId: user.id,
    });
    redirect("/");
  }

  return (
    <div className="flex-1 container mx-auto max-w-7xl px-4 md:px-6 pt-4 md:pt-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-linear-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            Leave Applications
          </h1>
          <p className="text-muted-foreground mt-1">
            View and track your official EzyGo leave requests.
          </p>
        </div>
      </div>

      <Suspense fallback={<Loading />}>
        <LeaveDataLoader token={token} />
      </Suspense>
    </div>
  );
}

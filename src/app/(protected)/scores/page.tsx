import { Metadata } from "next";
import { Suspense } from "react";
import ScoresClient from "./ScoresClient";
import { Loading } from "@/components/loading";

// Force dynamic rendering for protected routes
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scores",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ScoresPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ScoresClient />
    </Suspense>
  );
}

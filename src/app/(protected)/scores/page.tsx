import { Metadata } from "next";
import ScoresClient from "./ScoresClient";

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
  return <ScoresClient />;
}

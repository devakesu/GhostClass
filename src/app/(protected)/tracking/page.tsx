import { Metadata } from "next";
import TrackingClient from "./TrackingClient";

// Force dynamic rendering for protected routes
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tracking",
  robots: {
    index: false,
    follow: false,
  },
};

export default function TrackingPage() {
  return <TrackingClient />;
}

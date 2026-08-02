import { Metadata } from "next";
import NotificationsClient from "./NotificationsClient";

// Force dynamic rendering for protected routes
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Notifications",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotificationsPage() {
  return <NotificationsClient />;
}

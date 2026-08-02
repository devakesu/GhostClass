import { Metadata } from "next";
import ProfileClient from "./ProfileClient";

// Force dynamic rendering for protected routes
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProfilePage() {
  return <ProfileClient />;
}

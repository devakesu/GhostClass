import type { Metadata } from "next";
import AcceptTermsClient from "./AcceptTermsClient";

export const metadata: Metadata = {
  title: "Accept Terms",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AcceptTermsPage() {
  return <AcceptTermsClient />;
}

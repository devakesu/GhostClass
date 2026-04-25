import { Metadata } from "next";
import LegalClient from "./LegalClient";

// Force dynamic rendering since we use client components
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Legal Policies",
  robots: {
    index: true,
    follow: true,
  },
};

export default function LegalPage() {
  return <LegalClient />;
}
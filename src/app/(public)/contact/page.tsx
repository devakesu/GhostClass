import { Metadata } from "next";
import ContactClient from "./ContactClient";

// Force dynamic rendering since we use client components
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Contact Us",
  robots: {
    index: true,
    follow: true,
  },
};

export default function ContactPage() {
  return <ContactClient />;
}
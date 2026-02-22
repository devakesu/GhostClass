import type { Metadata } from 'next';
import { PublicNavbar } from "@/components/layout/public-navbar";
import { Footer } from "@/components/layout/footer";
import { NotFoundContent } from "@/components/not-found-content";

export const metadata: Metadata = {
  title: 'Page Not Found',
  robots: { index: false, follow: false },
};

/**
 * Custom 404 Not Found Page
 * Displayed when a user navigates to a non-existent route
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar />
      
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <NotFoundContent />
      </main>

      <Footer />
    </div>
  );
}

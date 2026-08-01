import { Footer } from "@/components/layout/footer";
import { Toaster } from "@/components/toaster";
import { ErrorBoundary } from "@/components/error-boundary";
import { OutageProvider } from "@/providers/outage-provider";
import { HidingNavbarWrapper } from "@/components/layout/hiding-navbar-wrapper";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary>
      <div className="flex min-h-screen flex-col">
        <HidingNavbarWrapper />

        <main className="flex-1 w-full pt-20">
          <OutageProvider>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </OutageProvider>
        </main>

        <Footer />
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}

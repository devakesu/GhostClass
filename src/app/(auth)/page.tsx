import { Footer } from "@/components/layout/footer";
import { LoginFormClient } from "@/components/user/login-form-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LoginPage() {
  return (
    <>
      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 pt-12 sm:p-8 sm:pt-16">
        <div className="w-full max-w-sm">
          <LoginFormClient />
        </div>
      </div>

      {/* Footer */}
      <Footer className="mt-0 pt-4 border-t-0 bg-transparent" />
    </>
  );
}
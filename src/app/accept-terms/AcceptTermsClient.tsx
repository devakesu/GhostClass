"use client";

import { Toaster } from "@/components/toaster";
import { AcceptTermsForm } from "@/components/legal/AcceptTermsForm";
import { useCSRFToken } from "@/hooks/use-csrf-token";

export default function AcceptTermsClient() {
  // Initialize CSRF token for consistency with other form pages
  useCSRFToken();

  return (
    <>
      <Toaster />
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        {/* Animated gradient mesh background */}
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          {/* Animated gradient orbs */}
          <div className="absolute top-20 left-20 w-96 h-96 bg-purple-500 rounded-full filter blur-[120px] opacity-50 animate-pulse"></div>
          <div className="absolute top-40 right-20 w-96 h-96 bg-pink-500 rounded-full filter blur-[120px] opacity-40 animate-pulse [animation-delay:1s]"></div>
          <div className="absolute bottom-20 left-40 w-96 h-96 bg-blue-500 rounded-full filter blur-[120px] opacity-40 animate-pulse [animation-delay:2s]"></div>
          <div className="absolute bottom-40 right-40 w-96 h-96 bg-violet-500 rounded-full filter blur-[120px] opacity-35 animate-pulse [animation-delay:3s]"></div>
          
          {/* Dot grid pattern */}
          <div 
            className="absolute inset-0 opacity-20 bg-[radial-gradient(circle,rgba(255,255,255,0.8)_1px,transparent_1px)] bg-size-[50px_50px]"
          ></div>
        </div>
        
        <div className="w-full max-w-2xl relative z-10">
          <AcceptTermsForm />
        </div>
      </div>
    </>
  );
}

"use client";

import dynamic from "next/dynamic";
import { Loading } from "@/components/loading";

// `ssr: false` must live in a Client Component (not a Server Component).
// This wrapper exists solely to host the dynamic import so the Server
// Component page.tsx can remain async without triggering the Next.js
// "ssr: false is not allowed in Server Components" error.
//
// WHY ssr: false:
// LoginForm uses Framer Motion with initial="hidden", which cascades opacity:0
// to all child variants. When SSR is enabled, the server bakes those styles
// into the HTML — the footer renders visibly while the entire form area is
// invisible until client hydration completes (1-2 s). Disabling SSR means the
// server sends <Loading /> in place of the form; once the JS bundle
// loads on the client, Framer Motion animates it in cleanly.
export const LoginFormClient = dynamic(
  () => import("./login-form").then((m) => ({ default: m.LoginForm })),
  { ssr: false, loading: () => <Loading /> },
);

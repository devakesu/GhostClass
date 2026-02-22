// src/lib/security/auth-cookie.ts
"use server";
import { cookies } from "next/headers";

export async function setAuthCookie(token: string, days = 31) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  (await cookies()).set("ezygo_access_token", token, {
    httpOnly: true,
    secure: process.env.HTTPS === 'true' || process.env.NODE_ENV === 'production',
    sameSite: "strict",
    path: "/",
    expires,
  });
}  

export async function clearAuthCookie() {
  (await cookies()).set("ezygo_access_token", "", {
    httpOnly: true,
    secure: process.env.HTTPS === 'true' || process.env.NODE_ENV === 'production',
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}

export async function getAuthTokenServer() {
  return (await cookies()).get("ezygo_access_token")?.value;
}
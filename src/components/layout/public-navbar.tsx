"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LayoutDashboard } from "lucide-react";

export function PublicNavbar() {
  return (
    <nav
      className="sticky top-0 z-10 flex h-20 items-center justify-between gap-4 px-4 md:px-6 border-b-2 border-border/50 bg-card shadow-sm"
      aria-label="Main navigation"
    >
      <div className="flex items-center gap-2 h-full">
        <Link
          href="/"
          className="group h-full flex items-center"
          aria-label="GhostClass home"
        >
          <div className="relative w-40 sm:w-64 md:w-80 h-20 overflow-hidden">
            <Image
              src="/logo.png"
              alt="GhostClass Logo"
              fill
              sizes="(max-width: 640px) 160px, (max-width: 768px) 256px, 320px"
              priority
              placeholder="blur"
              blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAAC4klEQVR4nO2T3U9SYRzHj5lNXV3IhVFic+vCaTdNL1ytorZmta66OK3sguUFqa14OxxejvCggBw4HOAIIgd8wUilo6IiCgoJCALlarrZvO8foR0Tx5xrXbW1+dk+F8/z3Z7fnu37g6Azzvj/4PPB+dbWvovNzd2X2tuFVVARqigWixUQKwSxlnOYFU/PTqXi0SvDFYFo9H6vyv9AbWAaAADnWCFWiH2o5MkBJz1loIDPr1Zphu+S3iWCDibJ6UjmoSUyyQULXh5gXFyaBrXsMIZhKhmGrCEZkqNm/A1gIcADPh+HpumqIlSs+G3ZAPbACvoQrs8zK1yM5bPx/MFWOLOrVM5EXr71r4hEvvAbhA53qp3RNqUr0oG6Q0/QiZBAMrUsFvuXJDJ66YXCFb6jtkXb1PbITWBfbAJ0uPbwmwwMV+ZIuMZvs91g5mNYonDwNffj5+e5xHdSQcXGRGRqR2xJ51FTmsGM26PKoeyYHE+GFGQio6TW9xS29T2FObmhNub9/frCKDBkHXo8LTDZo02QAExWS/UTjXYTcS9gt3YzHxnncvzL6lpun5oMbr3T6qJOlWZzR6VJ7Wq0qW2dNpPSaTJprD9Z0GjjuwO62L5Ou76vxZLfBrFCVo/lt4a0uTVCl1bZByMtEDDPXDUSgecW44hz2GCb9TrcwfHxT57x6fBrl32ug1AsPDXLl0Q4EkbM8hUZodiQmeUxGY6EpWbZvMwmXUBISUhuka6iFmkCtSKbqB2Nv3dh8ccuEOFClJ6+Tg15xfiAO2jQUAETcOA2wtNjxenbBHDX+wDJoQDFG8GsjV6A80ak1kYvSvG8KM6jUIpnlY40OhSOa6z0kWzuk5AcAMAF6IOMqKcxWyehdAoQifOZCPHc6senWlTGmcsATFazFSxV9VjoyJP3ZflxTWmhsMrdpawjekB9b5eyDobJGhgGF2CYqSwtUKnrx5aqePK+LP/T4v31Vp5xxr/hF2eVnXJoHTJgAAAAAElFTkSuQmCC"
              className="object-contain object-left transition-transform group-hover:scale-105"
            />
          </div>
        </Link>
      </div>

      <div className="flex gap-2 sm:gap-4 items-center">
        <Link href="/dashboard">
          <Button className="gap-2">
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Button>
        </Link>
      </div>
    </nav>
  );
}

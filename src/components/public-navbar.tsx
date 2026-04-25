"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client"; 
import { User } from "@supabase/supabase-js";
import { Loader2, LayoutDashboard } from "lucide-react";

export function PublicNavbar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setLoading(false);
    };
    checkAuth();
  }, []);

  return (
    <nav className="flex h-22 items-center justify-between px-6 border-b border-white/10 bg-background">
      <div className="flex items-center gap-2 h-full py-2">
        <Link href="/" className="group h-full flex items-center">
          <div className="relative w-58 h-full"> 
            <Image 
              src="/logo.png" 
              alt="GhostClass Logo"
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              priority
              className="object-contain object-left transition-transform group-hover:scale-105"
            />
          </div>
        </Link>
      </div>
      
      <div className="flex gap-4 items-center">
         {loading ? (
           <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
         ) : user ? (
           <Link href="/dashboard">
              <Button className="gap-2">
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Button>
           </Link>
         ) : (
           <>
             <Link href="/">
                <Button variant="ghost">Login</Button>
             </Link>
             <Link href="/contact">
                <Button variant="ghost">Contact</Button>
             </Link>
             <Link href="/legal">
                <Button variant="ghost">Legal</Button>
             </Link>
           </>
         )}
      </div>
    </nav>
  );
}
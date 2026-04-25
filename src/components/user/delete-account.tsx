"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { handleLogout } from "@/lib/security/auth";
import { logger } from "@/lib/logger";

export function DeleteAccount() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  const handleDelete = async () => {
    if (confirmation !== "DELETE") return;
    
    setIsDeleting(true);
    try {
      // 1. Delete storage objects (avatars) using the Storage API.
      // Direct deletion from storage.objects is blocked by Supabase; the JS client
      // is the correct way to remove files before the account RPC runs.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        try {
          const limit = 100;
          const maxIterations = 20; // Safety cap to avoid infinite loops in case of unexpected behavior.
          const allPaths: string[] = [];
          let offset = 0;

          for (let i = 0; i < maxIterations; i++) {
            const { data: files, error: listError } = await supabase.storage
              .from('avatars')
              .list(user.id, { limit, offset }, { signal: AbortSignal.timeout(5000) });

            if (listError) {
              // Log but don't block account deletion if storage listing fails.
              logger.error("Failed to list avatar files during account deletion:", listError);
              break;
            }

            if (!files || files.length === 0) {
              break;
            }

            allPaths.push(...files.map((f) => `${user.id}/${f.name}`));

            // If we received fewer than `limit` files, we've reached the last page.
            if (files.length < limit) {
              break;
            }

            offset += files.length;
          }

          if (allPaths.length > 0) {
            const { error: removeError } = await supabase.storage
              .from('avatars')
              .remove(allPaths);
            if (removeError) {
              // Log but still proceed with account deletion even if removal fails.
              logger.error("Failed to remove avatar files during account deletion:", removeError);
            }
          }
        } catch (storageError: unknown) {
          // Best-effort cleanup: log and continue with account deletion even if storage throws.
          if (
            storageError &&
            typeof storageError === "object" &&
            "name" in storageError &&
            (storageError as { name?: string }).name === "AbortError"
          ) {
            logger.warn("Avatar storage cleanup aborted during account deletion:", storageError);
          } else {
            logger.error("Unexpected error during avatar storage cleanup:", storageError);
          }
        }
      }

      // 2. Delete account data from database (public tables + auth user)
      const { error } = await supabase.rpc('delete_user_account');

      if (error) throw error;
      
      toast.success("Account deleted successfully");

      // Clear React Query cache
      queryClient.clear();
      
      // Use centralized logout logic (handles auth, storage, cookies, redirect)
      // handleLogout will lazy-load CSRF token handling when needed
      await handleLogout();
      
    } catch (error: any) {
      toast.error(error.message || "Failed to delete account");
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 md:p-5 dark:border-red-900/50 dark:bg-red-950/10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-bold text-red-900 dark:text-red-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Delete Account
          </h3>
          <p className="text-sm text-red-800/80 dark:text-red-300/70 leading-relaxed max-w-xl">
            Permanently remove your account and all associated attendance data. This action is irreversible and cannot be undone.
          </p>
        </div>
        
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              className="w-full md:w-auto shrink-0 bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4 mr-2" aria-label="Delete account" />
              Delete Account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-[400px] rounded-[24px] border-destructive/20 shadow-2xl">
            <AlertDialogHeader className="flex flex-col items-center text-center pt-2">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4 animate-pulse">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <AlertDialogTitle className="text-xl font-bold tracking-tight">Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground text-sm px-2 mt-2">
                This will permanently erase your <span className="text-foreground font-semibold">GhostClass</span> account, including all attendance logs and personal settings.
                <br /><br />
                <span className="text-[11px] opacity-70">Note: Your official EzyGo account remains unaffected.</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="py-4 space-y-2">
              <Label htmlFor="confirm" className="text-sm text-muted-foreground">
                Type <span className="font-bold text-foreground">DELETE</span> to confirm
              </Label>
              <Input
                id="confirm"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value.toUpperCase())}
                placeholder="DELETE"
                className="font-mono"
              />
            </div>

            <AlertDialogFooter className="sm:justify-center gap-2 pt-2">
              <AlertDialogCancel 
                disabled={isDeleting}
                className="rounded-xl border-border/40 hover:bg-muted"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                disabled={confirmation !== "DELETE" || isDeleting}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl px-6"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-label="Deleting account" />
                    Deleting...
                  </>
                ) : (
                  "Permanently Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
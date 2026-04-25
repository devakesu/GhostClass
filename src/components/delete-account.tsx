"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export function DeleteAccount() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleDelete = async () => {

    const clearCookie = (name: string) => {
      document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
    };
    if (confirmation !== "DELETE") return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_user_account');

      if (error) throw error;

      toast.success("Account deleted successfully");
      await supabase.auth.signOut();
      localStorage.clear();
      clearCookie("terms_version");
      clearCookie("ezygo_access_token");

      router.push("/");
      router.refresh();
      
    } catch (error: any) {
      toast.error(error.message || "Failed to delete account");
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/10">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h3 className="font-medium text-red-900 dark:text-red-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Delete Account
          </h3>
          <p className="text-sm text-red-700 dark:text-red-300/80">
            Permanently remove your account and all of its data. This action cannot be undone.
          </p>
        </div>
        
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="shrink-0 bg-red-600 hover:bg-red-700">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete your
                account, attendance data, settings, and remove your data from our servers. Data at EzyGo is unaffected and has no relation with us.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="py-4 space-y-2">
              <Label htmlFor="confirm" className="text-sm text-muted-foreground">
                Type <span className="font-bold text-foreground">DELETE</span> to confirm
              </Label>
              <Input
                id="confirm"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="DELETE"
                className="font-mono uppercase"
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                disabled={confirmation !== "DELETE" || isDeleting}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Account"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
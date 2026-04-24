"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, UserCircle2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Turnstile, { useTurnstile } from "react-turnstile";
import { upsertInstructorAction } from "@/app/actions/instructors";
import { getCsrfToken } from "@/lib/axios";

interface EditInstructorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseCode: string;
  courseName: string;
  initialName?: string;
  semester: string;
  academicYear: string;
}

export function EditInstructorDialog({
  open,
  onOpenChange,
  courseCode,
  courseName,
  initialName = "",
  semester,
  academicYear,
}: EditInstructorDialogProps) {
  const [name, setName] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [token, setToken] = useState<string>("");
  const [shouldRenderWidget, setShouldRenderWidget] = useState(false);

  const queryClient = useQueryClient();
  const turnstile = useTurnstile();

  // Adjusting state during render to avoid synchronous setState inside useEffect
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevInitialName, setPrevInitialName] = useState(initialName);
  if (open !== prevOpen || initialName !== prevInitialName) {
    setPrevOpen(open);
    setPrevInitialName(initialName);
    if (open) {
      setName(initialName);
      setToken("");
    } else {
      setShouldRenderWidget(false);
    }
  }

  // Defer Turnstile rendering to prioritize dialog opening animation
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => setShouldRenderWidget(true), 150);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter an instructor name");
      return;
    }

    if (!token) {
      toast.error("Please complete the security check.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("courseCode", courseCode);
      formData.append("instructorName", name);
      formData.append("semester", semester);
      formData.append("academicYear", academicYear);
      formData.append("cf-turnstile-response", token);
      
      const csrfToken = getCsrfToken();
      if (csrfToken) formData.append("csrf_token", csrfToken);

      const result = await upsertInstructorAction(formData);

      if (result.error) {
        toast.error(result.error);
        turnstile.reset();
        setToken("");
        return;
      }

      toast.success("Instructor updated for everyone in the class!");
      
      // Invalidate instructors query
      queryClient.invalidateQueries({
        queryKey: ["course_instructors"],
      });

      setToken("");
      setName("");
      turnstile.reset();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update instructor:", error);
      toast.error("Failed to save instructor name.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-106.25 border-border/50 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2 mx-auto">
            <UserCircle2 className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl font-bold">
            Edit Instructor
          </DialogTitle>
          <DialogDescription className="text-center">
            Set the instructor name for <strong>{courseCode}</strong>. This will be shared with your entire class.
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400">
          <AlertTriangle className="h-4 w-4 text-blue-500!" />
          <AlertTitle className="text-sm font-bold text-blue-600 dark:text-blue-400">Communal Responsibility</AlertTitle>
          <AlertDescription className="text-xs opacity-90">
            This name is shared with your entire class. Please ensure it is accurate and respectful.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-muted-foreground ml-1">
                Course
              </Label>
              <div className="px-3 py-2 bg-muted/50 rounded-md border border-border/50">
                <p className="font-medium text-foreground">{courseName}</p>
                <p className="text-xs text-muted-foreground font-mono uppercase">{courseCode}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructor-name" className="text-sm font-semibold text-muted-foreground ml-1">
                Instructor Name
              </Label>
              <Input
                id="instructor-name"
                placeholder="Dr. John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="py-6 border-2 focus-visible:ring-primary/30"
                disabled={isSubmitting}
                autoComplete="off"
                autoFocus
                maxLength={100}
              />
            </div>
          </div>

          <div className="flex flex-col items-center justify-center py-2 min-h-15">
             {shouldRenderWidget && (
               <Turnstile
                 sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                 onVerify={(t) => {
                   setToken(t);
                 }}
                 onError={() => {
                   toast.error("Security check failed. Please refresh.");
                 }}
                 onExpire={() => setToken("")}
                 theme="auto"
               />
             )}
             {!shouldRenderWidget && (
               <div className="h-12 w-full animate-pulse bg-muted/20 rounded-md" />
             )}
           </div>

          <DialogFooter className="sm:justify-center">
            <Button
              type="submit"
              className="w-full h-12 text-lg font-bold"
              disabled={isSubmitting || !token}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Saving...
                </>
              ) : (
                !token ? "Waiting for Verification..." : "Save for Class"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

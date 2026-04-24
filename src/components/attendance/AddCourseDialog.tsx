"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/users/profile";
import Turnstile, { useTurnstile } from "react-turnstile";
import { addCourseAction } from "@/app/actions/courses";
import { getCsrfToken } from "@/lib/axios";
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
import { BookPlus, Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AddCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semester?: string;
  academicYear?: string;
}

export function AddCourseDialog({
  open,
  onOpenChange,
  semester,
  academicYear,
}: AddCourseDialogProps) {
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [token, setToken] = useState<string>("");
  const [shouldRenderWidget, setShouldRenderWidget] = useState(false);

  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const turnstile = useTurnstile();

  // Adjusting state during render to avoid synchronous setState inside useEffect
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setShouldRenderWidget(false);
      setCourseCode("");
      setCourseName("");
      setToken("");
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
    if (!courseCode.trim() || !courseName.trim()) {
      toast.error("Please fill in all fields");
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
      formData.append("courseName", courseName);
      formData.append("semester", semester || profile?.current_semester || "");
      formData.append("academicYear", academicYear || profile?.current_year || "");
      formData.append("cf-turnstile-response", token);
      
      const csrfToken = getCsrfToken();
      if (csrfToken) formData.append("csrf_token", csrfToken);

      const result = await addCourseAction(formData);

      if (result.error) {
        toast.error(result.error);
        turnstile.reset();
        setToken("");
        return;
      }

      toast.success(`${courseCode.toUpperCase()} added to your class lineup!`);

      // Invalidate courses query to refresh cards
      queryClient.invalidateQueries({
        queryKey: ["courses"],
      });

      // Reset and close
      setCourseCode("");
      setCourseName("");
      setToken("");
      turnstile.reset();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error adding course:", error);
      toast.error("Failed to add course. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-106.25 border-2 border-primary/20 bg-background/95 backdrop-blur-sm">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2 mx-auto">
            <BookPlus className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl font-bold">
            Add New Course
          </DialogTitle>
          <DialogDescription className="text-center">
            Adding this course will make it available to everyone in{" "}
            <strong>{profile?.class?.name || "your class"}</strong> for the{" "}
            <strong>{(semester || profile?.current_semester)?.toUpperCase()} {(academicYear || profile?.current_year)}</strong>
            {" "}
            semester.
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-amber-500/10 border-amber-500/50 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 text-amber-500!" />
          <AlertTitle className="text-sm font-bold text-amber-600 dark:text-amber-400">Accuracy Matters</AlertTitle>
          <AlertDescription className="text-xs opacity-90">
            Please enter valid data. Spamming or entering fake info is strictly prohibited and can be traced to your account.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="course-code"
                className="text-sm font-semibold text-muted-foreground ml-1"
              >
                Course Code (e.g. GAMAT201)
              </Label>
              <Input
                id="course-code"
                placeholder="CS101"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                className="font-mono uppercase tracking-wider text-lg py-6 border-2 focus-visible:ring-primary/30"
                disabled={isSubmitting}
                autoComplete="off"
                maxLength={20}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="course-name"
                className="text-sm font-semibold text-muted-foreground ml-1"
              >
                Course Name
              </Label>
              <Input
                id="course-name"
                placeholder="Data Structures & Algorithms"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                className="py-6 border-2 focus-visible:ring-primary/30"
                disabled={isSubmitting}
                autoComplete="off"
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
              className="w-full h-12 text-lg font-bold transition-all hover:scale-[1.02]"
              disabled={isSubmitting || !token}
            >
              {isSubmitting
                ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Adding Course...
                  </>
                )
                : (
                  !token ? "Waiting for Verification..." : "Add Course to Lineup"
                )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

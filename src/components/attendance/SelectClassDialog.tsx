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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { GraduationCap, Loader2 } from "lucide-react";
import { getAvailableClassesAction, selectUserClassAction } from "@/app/actions/user";
import { handleLogout } from "@/lib/security/auth";

interface SelectClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semester: string;
  academicYear: string;
  isCloseable?: boolean;
}

export function SelectClassDialog({
  open,
  onOpenChange,
  semester,
  academicYear,
  isCloseable = false,
}: SelectClassDialogProps) {
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryClient = useQueryClient();

  // Load classes when dialog opens or semester/year changes
  useEffect(() => {
    if (open && semester && academicYear) {
      const loadClasses = async () => {
        setIsLoadingClasses(true);
        try {
          const res = await getAvailableClassesAction(semester, academicYear);
          setClasses(res);
          setSelectedClassId("");
        } catch (err) {
          console.error("Failed to load classes:", err);
          toast.error("Failed to load classes");
        } finally {
          setIsLoadingClasses(false);
        }
      };
      loadClasses();
    }
  }, [open, semester, academicYear]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassId) {
      toast.error("Please select a class");
      return;
    }

    setIsSubmitting(true);
    try {
      await selectUserClassAction(selectedClassId);
      toast.success("Class assigned successfully!");
      // Invalidate profile query to update UI state
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      onOpenChange(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save class selection";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    // If it's not closeable, don't allow closing it
    if (!newOpen && !isCloseable) {
      return;
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-md border-2 border-primary/20 bg-background/95 backdrop-blur-sm [&>button]:hidden"
        onPointerDownOutside={(e) => {
          if (!isCloseable) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!isCloseable) e.preventDefault();
        }}
      >
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2 mx-auto">
            <GraduationCap className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl font-bold">
            Select Your Class
          </DialogTitle>
          <DialogDescription className="text-center">
            You must select a class for the current term (<strong>{semester.toUpperCase()} {academicYear}</strong>) to access course and attendance features.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-muted-foreground ml-1">
                Select Class
              </label>
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
                disabled={isLoadingClasses || isSubmitting}
              >
                <SelectTrigger className="w-full py-6 border-2 focus:ring-primary/30">
                  <SelectValue placeholder={isLoadingClasses ? "Loading classes..." : "Choose Class"} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              If your class is not listed, please wait until someone else in your class syncs it or until EzyGo is initialized.
            </p>
          </div>

          <DialogFooter className="sm:justify-center flex-col gap-2">
            <Button
              type="submit"
              className="w-full h-12 text-lg font-bold transition-all hover:scale-[1.02]"
              disabled={isSubmitting || !selectedClassId}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Saving Selection...
                </>
              ) : (
                "Confirm Class"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full h-10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
              onClick={() => handleLogout()}
              disabled={isSubmitting}
            >
              Logout
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

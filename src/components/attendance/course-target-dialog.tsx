"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Badge } from "@/components/ui/badge";
import { useAttendanceSettings } from "@/providers/attendance-settings";
import { toast } from "sonner";
import { BookOpen, Percent, RotateCcw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeCourseCode } from "@/lib/utils";

interface CourseItem {
  code: string;
  name?: string;
  id?: string | number;
}

interface CourseTargetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses?: CourseItem[];
}

const TARGET_OPTIONS = [75, 80, 85, 90, 95];

export function CourseTargetDialog({
  open,
  onOpenChange,
  courses = [],
}: CourseTargetDialogProps) {
  const {
    targetPercentage,
    setTargetPercentage,
    courseTargets,
    updateCourseTarget,
    updateCourseTargets,
  } = useAttendanceSettings();

  // Deduplicate and normalize courses list
  const uniqueCourses = useMemo(() => {
    const map = new Map<string, CourseItem>();
    courses.forEach((c) => {
      const code = c.code || String(c.id || "");
      if (!code) return;
      const normalized = normalizeCourseCode(code);
      if (!map.has(normalized)) {
        map.set(normalized, {
          code: normalized,
          name: c.name || c.code || normalized,
          id: c.id,
        });
      }
    });
    return Array.from(map.values());
  }, [courses]);

  const handleGlobalTargetChange = (valStr: string) => {
    const val = Number(valStr);
    setTargetPercentage(val);
    toast.success("Default Target Updated", {
      description: `Default attendance target set to ${val}%.`,
    });
  };

  const handleCourseTargetChange = (courseCode: string, valStr: string) => {
    const val = Number(valStr);
    updateCourseTarget(courseCode, val);
    toast.success("Course Target Updated", {
      description: `Target for ${courseCode} set to ${val}%.`,
    });
  };

  const handleResetCourseTarget = (courseCode: string) => {
    const newTargets = { ...courseTargets };
    /* eslint-disable-next-line security/detect-object-injection */
    delete newTargets[courseCode];
    updateCourseTargets(newTargets);
    toast.info("Course Target Reset", {
      description:
        `${courseCode} will now use default target (${targetPercentage}%).`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-background/95 backdrop-blur-md border-border/60">
        <DialogHeader className="p-6 pb-4 border-b border-border/40">
          <div className="flex items-center gap-2.5 text-primary mb-1">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Target className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl font-bold">
              Target Attendance Settings
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Set default target percentage or customize targets for individual
            courses.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Universal Default Target Section */}
          <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Default Target</span>
              </div>
              <Select
                value={String(targetPercentage)}
                onValueChange={handleGlobalTargetChange}
              >
                <SelectTrigger
                  id="global-target-select"
                  className="w-24 h-9 text-xs font-semibold bg-background border-border/60"
                >
                  <SelectValue placeholder={`${targetPercentage}%`} />
                </SelectTrigger>
                <SelectContent className="z-70">
                  {TARGET_OPTIONS.map((val) => (
                    <SelectItem key={val} value={String(val)}>
                      {val}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Applies to all courses that don&apos;t have a course-specific
              target override.
            </p>
          </div>

          {/* Course-wise Targets Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Course Targets ({uniqueCourses.length})
              </span>
            </div>

            {uniqueCourses.length === 0
              ? (
                <div className="text-center py-6 text-xs text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/60">
                  No courses available yet.
                </div>
              )
              : (
                <div className="space-y-2.5">
                  {uniqueCourses.map((c) => {
                    const customTarget = courseTargets?.[c.code];
                    const hasCustom = typeof customTarget === "number";
                    const effectiveTarget = hasCustom
                      ? customTarget
                      : targetPercentage;

                    return (
                      <div
                        key={c.code}
                        className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-card/30 hover:bg-card/60 transition-colors gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="p-1.5 rounded-lg bg-muted/60 text-muted-foreground shrink-0">
                            <BookOpen className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold truncate">
                                {c.code}
                              </span>
                              {hasCustom
                                ? (
                                  <Badge
                                    variant="secondary"
                                    className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20"
                                  >
                                    Custom
                                  </Badge>
                                )
                                : (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] px-1.5 py-0 text-muted-foreground opacity-70"
                                  >
                                    Default
                                  </Badge>
                                )}
                            </div>
                            {c.name && c.name !== c.code && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {c.name}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasCustom && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => handleResetCourseTarget(c.code)}
                              title="Reset to default target"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Select
                            value={String(effectiveTarget)}
                            onValueChange={(val) =>
                              handleCourseTargetChange(c.code, val)}
                          >
                            <SelectTrigger
                              id={`course-target-select-${c.code}`}
                              className="w-20 h-8 text-xs font-semibold bg-background border-border/50"
                            >
                              <SelectValue
                                placeholder={`${effectiveTarget}%`}
                              />
                            </SelectTrigger>
                            <SelectContent className="z-70">
                              {TARGET_OPTIONS.map((val) => (
                                <SelectItem key={val} value={String(val)}>
                                  {val}%
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

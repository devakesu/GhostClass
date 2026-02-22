"use client";

import { useState, useEffect, useMemo } from "react";
import type { CaptureContext } from "@sentry/core";
// Lazy Sentry helpers – deferred import keeps the Sentry SDK (~250 KB) out of the initial bundle.
const captureSentryException = (error: unknown, context?: CaptureContext) => {
  void import("@sentry/nextjs").then(({ captureException }) => captureException(error, context));
};
import { useTrackingData } from "@/hooks/tracker/useTrackingData";
import { useTrackingCount } from "@/hooks/tracker/useTrackingCount";
import { useUser } from "@/hooks/users/user";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, CircleAlert, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import { useAttendanceReport } from "@/hooks/courses/attendance";
import { useFetchSemester, useFetchAcademicYear } from "@/hooks/users/settings";
import { Loading } from "@/components/loading";
import { formatSessionName, generateSlotKey, getSessionNumber, redact } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useFetchCourses } from "@/hooks/courses/courses";
import { getOfficialSessionRaw } from "@/lib/logic/attendance-reconciliation";
import { useSyncOnMount } from "@/hooks/use-sync-on-mount";

// --- Helper Functions ---

const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return "";
  const raw = String(dateStr).trim();
  if (raw.includes("T")) return raw.split("T")[0].replace(/-/g, "");
  const digitsOnly = raw.replace(/[^0-9]/g, "");
  if (digitsOnly.length === 8 && !raw.includes("/") && !raw.includes("-")) return digitsOnly;
  if (raw.includes("/")) {
    const parts = raw.split("/");
    if (parts.length === 3) {
      const [a, b, c] = parts;
      if (c.length === 4) return `${c}${b.padStart(2, "0")}${a.padStart(2, "0")}`;
      if (a.length === 4) return `${a}${b.padStart(2, "0")}${c.padStart(2, "0")}`;
    }
  }
  if (raw.includes("-")) {
    const parts = raw.split("-");
    if (parts.length === 3) {
      const [a, b, c] = parts;
      if (a.length === 4) return `${a}${b.padStart(2, "0")}${c.padStart(2, "0")}`;
      if (c.length === 4) return `${c}${b.padStart(2, "0")}${a.padStart(2, "0")}`;
    }
  }
  if (digitsOnly.length >= 8) return digitsOnly.slice(-8);
  return digitsOnly;
};

const formatDisplayDate = (dateStr: string): string => {
  const norm = normalizeDate(dateStr);
  if (norm.length === 8) {
      return `${norm.slice(6,8)}/${norm.slice(4,6)}/${norm.slice(0,4)}`;
  }
  return dateStr;
};

const parseDateValue = (dateStr: string) => {
    const norm = normalizeDate(dateStr);
    if(norm.length === 8) {
        return new Date(`${norm.slice(0,4)}-${norm.slice(4,6)}-${norm.slice(6,8)}`).getTime();
    }
    return new Date().getTime();
};

export default function TrackingClient() {
  const { data: user } = useUser();
  
  const [deleteId, setDeleteId] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<string | null>(null);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  
  // Per-course record limits (for performance with 100+ records)
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const recordsPerCourseInitial = 10;
  
  // Use a unique ID per mount to detect Strict Mode remounts (now managed inside useSyncOnMount)

  const coursesPerPage = 3; 

  const { data: coursesData } = useFetchCourses();
  const { data: count, refetch: refetchCount } = useTrackingCount(enabled ? user : null);
  const { data: trackingData, isLoading: isDataLoading, refetch: refetchTrackingData } = useTrackingData(enabled ? user : null);
  const { data: attendanceData } = useAttendanceReport();
  const { data: semesterData } = useFetchSemester();
  const { data: academicYearData } = useFetchAcademicYear();

  useEffect(() => { if (user) setEnabled(true); }, [user]);

  // --- AUTO SYNC ---
  const { isSyncing, syncCompleted } = useSyncOnMount({
    username: user?.username,
    userId: user?.id,
    sentryLocation: "TrackingClient",
    sentryTag: "tracking_sync",
    onPartialSync: async () => {
      toast.warning("Partial Sync Completed", {
        description: "Some tracking records couldn't be synced. Your data may be incomplete.",
      });
      await Promise.all([refetchTrackingData(), refetchCount()]);
    },
    onSuccess: async (data) => {
      toast.info("Data Synced", {
        description: `${data.deletions ?? 0} outdated records removed.`,
      });
      await Promise.all([refetchTrackingData(), refetchCount()]);
    },
  });

  // --- 1. GROUP AND SORT DATA ---
  const groupedAllData = useMemo(() => {
    if (!trackingData) return {};
    const grouped: Record<string, typeof trackingData> = {};

    trackingData.forEach((item) => {
      if (item.semester !== semesterData || item.year !== academicYearData) {
        return;
      }
      const courseKey = item.course.trim();
      if (!grouped[courseKey]) grouped[courseKey] = [];
      grouped[courseKey].push(item);
    });

    Object.keys(grouped).forEach(key => {
        grouped[key].sort((a, b) => {
            const dateA = parseDateValue(a.date);
            const dateB = parseDateValue(b.date);
            if (dateA !== dateB) return dateB - dateA;
            return getSessionNumber(a.session) - getSessionNumber(b.session);
        });
    });
    return grouped;
  }, [trackingData, semesterData, academicYearData]);

  const allCourseKeys = useMemo(() => Object.keys(groupedAllData).sort(), [groupedAllData]);
  const totalPages = Math.ceil(allCourseKeys.length / coursesPerPage);
  
  const currentCourseKeys = useMemo(() => {
    const startIndex = currentPage * coursesPerPage;
    return allCourseKeys.slice(startIndex, startIndex + coursesPerPage);
  }, [currentPage, allCourseKeys, coursesPerPage]);

  const goToPrevPage = () => { if (currentPage > 0) setCurrentPage(currentPage - 1); };
  const goToNextPage = () => { if (currentPage < totalPages - 1) setCurrentPage(currentPage + 1); };

  const toggleCourseExpansion = (courseName: string) => {
    setExpandedCourses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(courseName)) {
        newSet.delete(courseName);
      } else {
        newSet.add(courseName);
      }
      return newSet;
    });
  };

  const handleDeleteTrackData = async (uniqueId: string, session: string, course: string, date: string) => {
      if (!user) return;
      
      setDeleteId(uniqueId);

      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      try {
        const { error } = await supabase
          .from('tracker')
          .delete()
          .eq('session', session)
          .eq('course', course)
          .eq('date', date)
          .eq('auth_user_id', authUser?.id);

        if (error) throw error;

        toast.success("Delete successful");
        await Promise.all([refetchTrackingData(), refetchCount()]);

        const remainingInCourse = groupedAllData[course]?.length || 0;
        if (remainingInCourse <= 1 && currentCourseKeys.length === 1 && currentPage > 0) {
            setCurrentPage(prev => prev - 1);
        }

      } catch (error) {
        toast.error("Error deleting the record.");
        captureSentryException(error, { tags: { type: "tracking_delete_single", location: "TrackingClient/handleDeleteTrackData" }, extra: { userId: redact("id", String(user?.id)), session, course, date } });
      } finally {
        setDeleteId("");
      }
  };

  const deleteAllTrackingData = async () => {
    if (!user) return;
    try {
      setIsProcessing(true);
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('tracker')
        .delete()
        .eq('auth_user_id', authUser?.id)
        .eq('semester', semesterData)
        .eq('year', academicYearData);

      if (error) throw error;

      toast.success("All records cleared.");
      await Promise.all([refetchTrackingData(), refetchCount()]);
      setCurrentPage(0);

    } catch (error) {
      toast.error("Failed to delete all tracking data.");
      captureSentryException(error, { tags: { type: "tracking_delete_all", location: "TrackingClient/deleteAllTrackingData" }, extra: { userId: redact("id", String(user?.id)) }   });
    } finally {
      setIsProcessing(false);
    }
  };
  
  // --- 2. OFFICIAL SESSION LOOKUP MAP ---
  const officialSessionsMap = useMemo(() => {
    const map = new Map<string, any>();
    if (attendanceData?.studentAttendanceData) {
      Object.entries(attendanceData.studentAttendanceData).forEach(([dateStr, dateData]) => {
        Object.entries(dateData as any).forEach(([sessionKey, session]: [string, any]) => {
          if (session.course) {
            const rawSession = getOfficialSessionRaw(session, sessionKey);
            const key = generateSlotKey(session.course, dateStr, rawSession);
            map.set(key, session); 
          }
        });
      });
    }
    return map;
  }, [attendanceData]);

  const cardVariants = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 }, exit: { opacity: 0, scale: 0.95 } };
  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.3, staggerChildren: 0.05 } } };
  const pageVariants = { enter: (d: number) => ({ x: d > 0 ? 50 : -50, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: d < 0 ? 50 : -50, opacity: 0 }) };

  // Block rendering until tracking is enabled, base data has loaded, and initial sync has completed.
  if (!enabled || isDataLoading || isSyncing || !syncCompleted) return <Loading />;

  return isProcessing ? ( <div className="h-screen flex items-center justify-center"><Loading /></div> ) : (
    <LazyMotion features={domAnimation}>
      <div className="flex flex-1 flex-col flex-wrap gap-4 h-full p-4 md:p-6 min-h-[70vh] text-center relative">
        {trackingData && allCourseKeys.length > 0 ? (
          <>
            <div className="mb-2 pb-4 mt-10">
              <p className="text-2xl font-semibold text-foreground py-2 max-md:text-xl">Attendance Tracker</p>
              <p className="text-sm text-muted-foreground max-md:text-xs mb-4">
                These are custom-marked attendance records or the absences you&apos;ve marked for re-checking or duty leave.
              </p>
              {(count ?? 0) > 0 && (
                <div className="flex flex-col gap-2 items-center justify-center">
                  <Badge className="text-sm py-1 px-3 bg-yellow-500/12 text-yellow-400/75 border-yellow-500/15">
                    You have added <strong>{count}</strong> {count === 1 ? "class" : "classes"}.
                  </Badge>
                  <button onClick={() => setDeleteAllConfirmOpen(true)} aria-label={`Clear all ${count} tracked ${count === 1 ? 'class' : 'classes'}`} className="text-sm cursor-pointer justify-between items-center gap-2 bg-red-500/12 text-red-400/75 hover:bg-red-500/18 duration-300 border border-red-500/15 py-1 px-3 rounded-md flex">
                    Clear all <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            <m.div variants={containerVariants} initial="hidden" animate="visible" className="flex flex-col gap-4 relative w-full max-w-175 mx-auto">
              <AnimatePresence mode="wait" initial={false} custom={currentPage > 0 ? -1 : 1}>
                <m.div key={currentPage} custom={currentPage} initial="enter" animate="center" exit="exit" variants={pageVariants} transition={{ type: "tween", duration: 0.3 }} className="flex flex-col gap-6">
                  {currentCourseKeys.map((courseName) => {
                    const items = groupedAllData[courseName];
                    const displayCourseName = attendanceData?.courses?.[items[0].course]?.name || coursesData?.courses?.[items[0].course]?.name || courseName; 
                    
                    // Performance optimization: limit records per course
                    const isExpanded = expandedCourses.has(courseName);
                    const visibleItems = isExpanded ? items : items.slice(0, recordsPerCourseInitial);
                    const hasMore = items.length > recordsPerCourseInitial;
                    
                    return (
                      <div key={courseName} className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 pl-1 sticky top-16 bg-background/95 backdrop-blur-sm z-10 py-2 border-b border-border/40 shadow-sm rounded-t-md">
                          <div className="p-1.5 rounded-md bg-primary/10 text-primary"><BookOpen size={16} /></div>
                          <h3 className="text-md font-semibold text-left text-foreground/90 capitalize">{displayCourseName.toLowerCase()}</h3>
                          <Badge variant="outline" className="ml-auto text-xs">{items.length}</Badge>
                        </div>

                        <div className="flex flex-col gap-3">
                          {visibleItems.map((trackingItem) => {
                            const trackingId = `${trackingItem.auth_user_id}-${trackingItem.session}-${trackingItem.course}-${trackingItem.date}`;
                            
                            // Status Logic
                            const isCorrection = trackingItem.status === 'correction';
                            const attCode = Number(trackingItem.attendance);
                            let userLabel = "Present", userColor = "green";
                            if (attCode === 225) { userLabel = "Duty Leave"; userColor = "orange"; }
                            else if (attCode === 111) { userLabel = "Absent"; userColor = "red"; }

                            let statusText = userLabel;
                            if (isCorrection) {
                                const itemKey = generateSlotKey(trackingItem.course, trackingItem.date, trackingItem.session);
                                const officialSession = officialSessionsMap.get(itemKey);
                                let officialLabel = "Absent"; 
                                if (officialSession) {
                                    const offCode = Number(officialSession.attendance);
                                    if (offCode === 110) officialLabel = "Present";
                                    else if (offCode === 111) officialLabel = "Absent";
                                    else if (offCode === 225) officialLabel = "Duty Leave";
                                }
                                statusText = `${officialLabel} → ${userLabel}`;
                            }

                            const typeLabel = isCorrection ? "Correction" : "Extra";
                            const typeColorClass = isCorrection 
                                ? "bg-purple-500/10 text-purple-400 border-purple-500/20" 
                                : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";

                            let statusBadgeClass = "bg-green-500/20 text-green-400";
                            let cardBgClass = "bg-green-500/5 border-green-500/20";

                            if (isCorrection) {
                                if (userColor === "orange") { statusBadgeClass = "bg-orange-500/20 text-orange-400"; cardBgClass = "bg-orange-500/5 border-orange-500/20"; }
                                else if (userColor === "red") { statusBadgeClass = "bg-red-500/20 text-red-400"; cardBgClass = "bg-red-500/5 border-red-500/20"; }
                                else { cardBgClass = "bg-green-500/5 border-green-500/20"; statusBadgeClass = "bg-green-500/20 text-green-400"; }
                            } else {
                                if (userColor === "green") { statusBadgeClass = "bg-green-500/20 text-green-400"; cardBgClass = "bg-green-500/5 border-green-500/20"; } 
                                else if (userColor === "orange") { statusBadgeClass = "bg-orange-500/20 text-orange-400"; cardBgClass = "bg-orange-500/5 border-orange-500/20"; } 
                                else { statusBadgeClass = "bg-red-500/20 text-red-400"; cardBgClass = "bg-red-500/5 border-red-500/20"; }
                            }

                            return (
                              <m.div 
                                key={trackingId} 
                                variants={cardVariants}
                                className={`p-4 text-left rounded-xl border hover:bg-opacity-20 transition-all w-full ${cardBgClass}`}
                              >
                                <div className="flex justify-between items-start mb-2 gap-4">
                                  <div className="font-medium text-sm text-foreground/70">
                                    Session: <span className="text-foreground capitalize">{formatSessionName(trackingItem.session)}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={`text-[10px] px-1.5 h-5 ${typeColorClass}`}>{typeLabel}</Badge>
                                    <Badge className={statusBadgeClass}>
                                      {statusText}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center justify-between mt-2">
                                  <span className="font-medium">{formatDisplayDate(trackingItem.date)}</span>
                                  <m.button 
                                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} 
                                    disabled={deleteId === trackingId}
                                    onClick={() => setDeleteConfirmOpen(trackingId)} 
                                    aria-label={`Remove tracking entry for ${formatSessionName(trackingItem.session)} session on ${formatDisplayDate(trackingItem.date)}`}
                                    className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 bg-yellow-400/6 rounded-lg font-medium text-yellow-600 disabled:opacity-50"
                                  >
                                    {deleteId === trackingId ? "Deleting..." : <><span className="max-md:hidden">Remove</span><Trash2 size={15} aria-hidden="true" /></>}
                                  </m.button>
                                </div>
                              </m.div>
                            );
                          })}
                        </div>

                        {/* Show More/Less Button */}
                        {hasMore && (
                          <m.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            onClick={() => toggleCourseExpansion(courseName)}
                            className="mt-2 w-full py-2 px-4 text-sm font-medium text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg transition-colors duration-200"
                          >
                            {isExpanded 
                              ? `Show Less` 
                              : `Show ${items.length - recordsPerCourseInitial} More ${items.length - recordsPerCourseInitial === 1 ? 'Record' : 'Records'}`
                            }
                          </m.button>
                        )}
                      </div>
                    );
                  })}
                </m.div>
              </AnimatePresence>

              {totalPages > 1 && (
                <div className="flex justify-center items-center mt-6 gap-8 pb-8">
                  <m.button onClick={goToPrevPage} disabled={currentPage === 0} className={`h-8 w-8 flex justify-center items-center rounded-lg ${currentPage === 0 ? "text-muted-foreground bg-accent/30" : "text-primary bg-accent hover:bg-accent/40"}`} aria-label="Previous page"><ChevronLeft size={20} aria-hidden="true" /></m.button>
                  <div className="text-sm text-muted-foreground font-medium">Page {currentPage + 1} of {totalPages}</div>
                  <m.button onClick={goToNextPage} disabled={currentPage === totalPages - 1} className={`h-8 w-8 flex justify-center items-center rounded-lg ${currentPage === totalPages - 1 ? "text-muted-foreground bg-accent/30" : "text-primary bg-accent hover:bg-accent/40"}`} aria-label="Next page"><ChevronRight size={20} aria-hidden="true" /></m.button>
                </div>
              )}
            </m.div>
          </>
        ) : (
          <m.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col items-center justify-center flex-1 min-h-[50vh]"
          >
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-linear-to-tr from-amber-500/20 to-orange-500/20 rounded-full blur-2xl transform scale-150 opacity-60" />
              <div className="relative bg-background/50 backdrop-blur-sm border border-border/50 p-6 rounded-full shadow-sm ring-1 ring-border/50">
                <CircleAlert className="w-10 h-10 text-muted-foreground/60" strokeWidth={1.5} />
              </div>
            </div>

            <h3 className="text-xl font-semibold text-foreground mb-2 tracking-tight">No Tracking History</h3>
            <p className="text-sm text-muted-foreground max-w-70 leading-relaxed">
              Your custom attendance records will appear here once you start tracking.
            </p>
          </m.div>
        )}
      </div>
      
      {/* Delete Single Item Confirmation */}
      <AlertDialog open={!!deleteConfirmOpen} onOpenChange={(open) => !open && setDeleteConfirmOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tracking Record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this attendance tracking record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteConfirmOpen) {
                  const trackingItem = trackingData?.find(item => 
                    `${item.auth_user_id}-${item.session}-${item.course}-${item.date}` === deleteConfirmOpen
                  );
                  if (trackingItem) {
                    await handleDeleteTrackData(deleteConfirmOpen, trackingItem.session, trackingItem.course, trackingItem.date);
                  }
                  setDeleteConfirmOpen(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Delete All Confirmation */}
      <AlertDialog open={deleteAllConfirmOpen} onOpenChange={setDeleteAllConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Tracking Records?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {count} tracking {count === 1 ? 'record' : 'records'}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await deleteAllTrackingData();
                setDeleteAllConfirmOpen(false);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </LazyMotion>
  );
};
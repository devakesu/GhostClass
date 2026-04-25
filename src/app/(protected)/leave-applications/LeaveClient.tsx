"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, FileText, CheckCircle2, XCircle, ArrowRight, User } from "lucide-react";
import { useFetchSemester, useFetchAcademicYear } from "@/hooks/users/settings";
import { ServiceErrorView } from "@/components/service-error-view";
import { cn } from "@/lib/utils";

const formatDate = (dateString: string) => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
};

const getLeaveStatus = (approvers: any[]) => {
  if (!approvers || approvers.length === 0) return { label: "Pending", color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-500/20", icon: Clock };
  
  const actedApprovers = approvers
    .filter(a => a.action_by !== null || a.action_at !== null)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  if (actedApprovers.length === 0) return { label: "Pending", color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-500/20", icon: Clock };
  
  const lastAction = actedApprovers[0].action_type;
  
  if (lastAction === 'reject') return { label: "Rejected", color: "bg-red-500/10 text-red-600 dark:text-red-500 border-red-500/20", icon: XCircle };
  if (lastAction === 'approve') return { label: "Approved", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/20", icon: CheckCircle2 };
  if (lastAction === 'forward') return { label: "Forwarded", color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20", icon: ArrowRight };
  if (lastAction === 'recommend') return { label: "Recommended", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20", icon: ArrowRight };
  
  return { label: "In Progress", color: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20", icon: Clock };
};

const formatBytes = (bytes: string | number) => {
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(b)) return "0 B";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
};

export default function LeaveClient({ initialData }: { initialData: any }) {
  const { data: semesterData } = useFetchSemester();
  const { data: academicYearData } = useFetchAcademicYear();

  const leaves = (initialData?.studentLeaves?.student_leaves || []).filter((leave: any) => {
      // If semester/year data isn't loaded yet from the client context, don't filter out yet
      // Or filter explicitly once they are available.
      if (!semesterData || !academicYearData) return true;
      return leave.usersubgroup?.academic_semester === semesterData && leave.usersubgroup?.academic_year === academicYearData;
  });

  const allSessions = initialData?.studentLeaves?.student_leave_sessions || {};
  const approvedCount = leaves.filter((leave: any) => getLeaveStatus(leave.approvers).label === "Approved").length;
  
  if (!initialData) {
    return (
      <ServiceErrorView 
        title="Leave Data Sync Unavailable"
        onRetry={() => {
          // reloadWithUpdate is handled by ServiceErrorView
        }}
      />
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Card className="custom-container">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Total Applied</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold bg-linear-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
              {leaves.length}
            </div>
          </CardContent>
        </Card>
        
        <Card className="custom-container">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold bg-linear-to-br from-emerald-600 to-teal-600 dark:from-teal-400 dark:to-emerald-400 bg-clip-text text-transparent">
              {approvedCount}
            </div>
          </CardContent>
        </Card>
      </div>


      
      {leaves.length === 0 ? (
        <Card className="bg-muted/30 dark:bg-black/20 border border-border/50 dark:border-white/5 rounded-xl p-12 text-center border-dashed">
          <div className="flex flex-col items-center justify-center space-y-3 text-muted-foreground">
            <FileText className="h-12 w-12 opacity-20" />
            <p className="text-lg">No leave applications found.</p>
            <p className="text-sm opacity-70">You haven&apos;t applied for any leaves through EzyGo yet.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {leaves.map((leave: any) => {
            const status = getLeaveStatus(leave.approvers);
            const StatusIcon = status.icon;
            const requestedSessions = allSessions[leave.id] || [];
            
            // Unique dates from sessions to show the range
            const uniqueDates = [...new Set(requestedSessions.map((s: any) => s.date))];
            const dateRangeStr = uniqueDates.length === 1 
              ? formatDate(uniqueDates[0] as string) 
              : uniqueDates.length > 1 
                ? `${formatDate(uniqueDates[0] as string)} - ${formatDate(uniqueDates[uniqueDates.length - 1] as string)}`
                : "N/A";

            return (
              <Card key={leave.id} className="custom-container hover:border-border dark:hover:border-white/20 transition-all duration-300 flex flex-col">
                <CardHeader className="pb-3 border-b border-border/30 dark:border-white/5">
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant="outline" className={`flex gap-1.5 items-center ${status.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {status.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium bg-muted/50 dark:bg-white/5 px-2 py-1 rounded-md border border-border/50 dark:border-white/5">
                      Type: {leave.attendancetype?.name || "Leave"}
                    </span>
                  </div>
                  <CardTitle className="text-lg leading-snug text-foreground">
                    {leave.leave_reason || "Leave Application"}
                  </CardTitle>
                  {leave.event && (
                    <div className="text-sm text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1.5 font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block animate-pulse" />
                      Event: {leave.event.name}
                    </div>
                  )}
                </CardHeader>
                
                <CardContent className="py-4 space-y-5 flex-1 text-sm">
                  {/* Date & Meta */}
                  <div className="grid grid-cols-2 gap-4 text-muted-foreground">
                    <div>
                      <span className="block text-[11px] sm:text-xs uppercase tracking-wider opacity-80 dark:opacity-60 mb-1 font-semibold dark:font-normal">Applied On</span>
                      <div className="flex items-center gap-1.5 text-foreground/80 dark:text-white/80">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(leave.created_at)}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] sm:text-xs uppercase tracking-wider opacity-80 dark:opacity-60 mb-1 font-semibold dark:font-normal">Leave Dates</span>
                      <div className="flex items-center gap-1.5 text-foreground/80 dark:text-white/80">
                        <Clock className="h-3.5 w-3.5" />
                        <span className="truncate" title={dateRangeStr}>{dateRangeStr}</span>
                      </div>
                    </div>
                  </div>

                  {/* Impacted Sessions */}
                  {requestedSessions.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[11px] sm:text-xs text-muted-foreground uppercase tracking-wider font-bold dark:font-semibold">Impacted Sessions ({requestedSessions.length})</span>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-2 custom-scrollbar">
                        {requestedSessions.map((session: any) => (
                          <div key={session.id} className="flex items-start gap-2 bg-muted/50 dark:bg-white/5 rounded-md p-2 border border-border/50 dark:border-white/5">
                            <Badge variant="outline" className="bg-muted dark:bg-white/5 text-[10px] sm:text-xs px-1.5 py-0 border-border/50">S: {session.session?.name}</Badge>
                            <span className="text-xs text-foreground/80 dark:text-white/80 line-clamp-2 leading-tight flex-1">
                              {session.course?.name || session.course?.code || "Unknown Course"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Attachments */}
                  {leave.files && leave.files.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[11px] sm:text-xs text-muted-foreground uppercase tracking-wider font-bold dark:font-semibold">Attachments</span>
                      <div className="flex flex-wrap gap-2">
                        {leave.files.map((file: any) => (
                          <div key={file.id} className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-500/10 p-2 rounded-md border border-indigo-100 dark:border-indigo-500/20 max-w-full">
                            <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            <span className="truncate text-xs text-indigo-700 dark:text-indigo-200 font-medium dark:font-normal" title={file.file_name}>{file.file_name}</span>
                            <span className="text-[10px] text-indigo-500/80 dark:text-indigo-400/60 shrink-0 font-medium dark:font-normal">({formatBytes(file.size_byte)})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>

                {/* Workflow Footer */}
                {leave.approvers && leave.approvers.filter((a: any) => a.action_by_user).length > 0 && (
                  <div className="px-6 pt-3.5 pb-4 mt-auto border-t border-border/40 dark:border-white/5 bg-muted/20 dark:bg-white/2">
                    <div className="w-full space-y-2.5">
                      <span className="block text-[11px] text-muted-foreground uppercase tracking-wider font-bold dark:font-semibold">Workflow History</span>
                      <div className="flex flex-col gap-1.5 text-[11px] sm:text-xs text-muted-foreground max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                        {leave.approvers
                          .filter((a: any) => a.action_by_user)
                          .reduce((acc: any[], current: any) => {
                            const isDuplicate = acc.find(item => 
                              item.action_by === current.action_by && 
                              item.action_type === current.action_type && 
                              item.action_at === current.action_at
                            );
                            if (!isDuplicate) acc.push(current);
                            return acc;
                          }, [])
                          .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) // latest first
                          .map((approver: any) => {
                            const isApproved = approver.action_type === 'approve';
                            const isRejected = approver.action_type === 'reject';
                            const isForwarded = approver.action_type === 'forward';
                            const isRecommended = approver.action_type === 'recommend';
                            
                            return (
                              <div key={approver.id} className="flex items-center justify-between border-b border-border/20 last:border-0 pb-1.5 last:pb-0">
                                <span className="flex items-center gap-1.5 text-foreground/80 dark:text-white/70 font-medium">
                                  <span className={cn(
                                    "h-5 w-5 rounded-full flex items-center justify-center shrink-0",
                                    isApproved ? "bg-emerald-500/15" :
                                    isRejected ? "bg-red-500/15" :
                                    isForwarded ? "bg-indigo-500/15" :
                                    isRecommended ? "bg-blue-500/15" : "bg-primary/10"
                                  )}>
                                    <User className={cn(
                                      "h-3 w-3",
                                      isApproved ? "text-emerald-600" :
                                      isRejected ? "text-red-600" :
                                      isForwarded ? "text-indigo-600" :
                                      isRecommended ? "text-blue-600" : "text-primary"
                                    )} />
                                  </span>
                                  {approver.action_by_user.first_name} {approver.action_by_user.last_name}
                                </span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={cn(
                                    "text-[9px] uppercase tracking-tighter px-1.5 py-0 h-4 border-none font-bold",
                                    isApproved ? "bg-emerald-500/12 text-emerald-600" :
                                    isForwarded ? "bg-indigo-500/12 text-indigo-600" :
                                    isRecommended ? "bg-blue-500/12 text-blue-600" :
                                    isRejected ? "bg-red-500/12 text-red-600" : 
                                    "bg-muted text-muted-foreground"
                                  )}>
                                    {isApproved ? "Approved" :
                                     isForwarded ? "Forwarded" :
                                     isRecommended ? "Recommended" :
                                     isRejected ? "Rejected" : approver.action_type}
                                  </Badge>
                                  <span className="opacity-50">•</span>
                                  <span className="text-[10px] tabular-nums whitespace-nowrap">{formatDate(approver.action_at)}</span>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

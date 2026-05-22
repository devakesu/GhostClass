"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  ArrowRight,
  User,
} from "lucide-react";
import {
  useFetchSemester,
  useFetchAcademicYear,
} from "@/hooks/users/settings";
import { ServiceErrorView } from "@/components/service-error-view";
import { cn } from "@/lib/utils";

const formatDate = (dateString: string | number | Date | null) => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

interface LeaveApproverUser {
  first_name?: string;
  last_name?: string;
}

interface LeaveApprover {
  id: string | number;
  action_by?: string | number;
  action_type?: string | null;
  action_at?: string | null;
  updated_at?: string;
  action_by_user?: LeaveApproverUser;
}

interface StatusInfo {
  label: string;
  color: string;
  icon: React.ElementType;
}

const STATUS_MAP: Record<string, StatusInfo> = {
  reject: {
    label: "Rejected",
    color: "bg-red-500/10 text-red-600 dark:text-red-500 border-red-500/20",
    icon: XCircle,
  },
  approve: {
    label: "Approved",
    color:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/20",
    icon: CheckCircle2,
  },
  forward: {
    label: "Forwarded",
    color:
      "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    icon: ArrowRight,
  },
  recommend: {
    label: "Recommended",
    color:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    icon: ArrowRight,
  },
};

const getLeaveStatus = (approvers?: LeaveApprover[] | null): StatusInfo => {
  const defaultStatus: StatusInfo = {
    label: "Pending",
    color:
      "bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-500/20",
    icon: Clock,
  };

  const inProgressStatus: StatusInfo = {
    label: "In Progress",
    color: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
    icon: Clock,
  };

  if (!approvers || approvers.length === 0) return defaultStatus;

  // If any level has rejected, the entire leave is immediately Rejected
  const hasRejected = approvers.some((a) => a.action_type === "reject");
  if (hasRejected) {
    return STATUS_MAP.reject;
  }

  const actedApprovers = [...approvers]
    .filter((a) => a.action_type !== null || a.action_at !== null)
    .sort(
      (a, b) =>
        new Date(b.updated_at || "").getTime() - new Date(a.updated_at || "").getTime()
    );

  if (actedApprovers.length === 0) return defaultStatus;

  const hasPending = approvers.some(
    (a) => a.action_type === null && a.action_at === null
  );
  const lastAction = actedApprovers[0].action_type;

  if (hasPending) {
    // If there are pending steps, we cannot be fully Approved.
    if (lastAction === "approve") {
      return inProgressStatus;
    }
    if (lastAction === "forward") {
      return STATUS_MAP.forward;
    }
    if (lastAction === "recommend") {
      return STATUS_MAP.recommend;
    }
    return inProgressStatus;
  }

  // All levels have acted, and none rejected.
  if (lastAction === "approve") {
    return STATUS_MAP.approve;
  }
  if (lastAction === "forward") {
    return STATUS_MAP.forward;
  }
  if (lastAction === "recommend") {
    return STATUS_MAP.recommend;
  }

  return inProgressStatus;
};

const formatBytes = (bytes: string | number) => {
  const b = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (isNaN(b)) return "0 B";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
};

function getApproverStyles(type?: string | null) {
  if (type === "approve") {
    return { bg: "bg-emerald-500/15", text: "text-emerald-600" };
  }
  if (type === "reject") {
    return { bg: "bg-red-500/15", text: "text-red-600" };
  }
  if (type === "forward") {
    return { bg: "bg-indigo-500/15", text: "text-indigo-600" };
  }
  if (type === "recommend") {
    return { bg: "bg-blue-500/15", text: "text-blue-600" };
  }
  return { bg: "bg-primary/10", text: "text-primary" };
}

function WorkflowHistoryItem({ approver }: { approver: LeaveApprover }) {
  const statusInfo = STATUS_MAP[approver.action_type || ""] || {
    label: approver.action_type || "Unknown",
    color: "bg-muted text-muted-foreground",
  };
  const styles = getApproverStyles(approver.action_type);

  return (
    <div className="flex items-center gap-3 border-b border-border/20 pb-1.5 last:border-0 last:pb-0">
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-foreground/80 dark:text-white/70 font-medium">
        <span className={cn("h-5 w-5 rounded-full flex items-center justify-center shrink-0", styles.bg)}>
          <User className={cn("h-3 w-3", styles.text)} />
        </span>
        <span className="min-w-0 truncate leading-tight">
          {approver.action_by_user?.first_name} {approver.action_by_user?.last_name}
        </span>
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
        <Badge
          variant="outline"
          className={cn("text-[9px] uppercase tracking-tighter px-1.5 py-0 h-4 border-none font-bold", statusInfo.color)}
        >
          {statusInfo.label}
        </Badge>
        <span className="opacity-50">•</span>
        <span className="text-[10px] tabular-nums whitespace-nowrap">
          {formatDate(approver.action_at ?? null)}
        </span>
      </div>
    </div>
  );
}

function WorkflowHistory({ approvers }: { approvers?: LeaveApprover[] | null }) {
  const validApprovers = useMemo(() => {
    if (!approvers) return [];
    return [...approvers]
      .filter((a) => a.action_by_user)
      .reduce((acc: LeaveApprover[], current) => {
        const isDuplicate = acc.find(
          (item) =>
            item.action_by === current.action_by &&
            item.action_type === current.action_type &&
            item.action_at === current.action_at
        );
        if (!isDuplicate) acc.push(current);
        return acc;
      }, [])
      .sort(
        (a, b) =>
          new Date(b.updated_at || "").getTime() -
          new Date(a.updated_at || "").getTime()
      );
  }, [approvers]);

  if (validApprovers.length === 0) return null;

  return (
    <div className="px-4 sm:px-6 pt-3.5 pb-4 mt-auto border-t border-border/40 dark:border-white/5 bg-muted/20 dark:bg-white/2">
      <div className="w-full space-y-2.5">
        <span className="block text-[11px] text-muted-foreground uppercase tracking-wider font-bold dark:font-semibold">
          Workflow History
        </span>
        <div className="flex min-w-0 flex-col gap-1.5 text-[11px] sm:text-xs text-muted-foreground max-h-56 overflow-y-auto pr-1 custom-scrollbar">
          {validApprovers.map((approver) => (
            <WorkflowHistoryItem key={approver.id} approver={approver} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface LeaveSession {
  id: string | number;
  date?: string;
  session?: { name?: string };
  course?: { name?: string; code?: string };
}

interface LeaveFile {
  id: string | number;
  file_name?: string;
  size_byte?: string | number;
}

interface LeaveItem {
  id: string | number;
  leave_reason?: string;
  created_at?: string;
  attendancetype?: { name?: string };
  event?: { name?: string };
  approvers?: LeaveApprover[];
  files?: LeaveFile[];
  usersubgroup?: {
    academic_semester?: string;
    academic_year?: string;
  };
}

interface StudentLeavesPayload {
  student_leaves?: LeaveItem[];
  student_leave_sessions?: Record<string, LeaveSession[]>;
}

interface LeaveInitialData {
  studentLeaves?: StudentLeavesPayload;
  [key: string]: unknown;
}

function LeaveCard({ leave, sessions }: { leave: LeaveItem; sessions: LeaveSession[] }) {
  const status = getLeaveStatus(leave.approvers);
  const StatusIcon = status.icon;

  const dateRangeStr = useMemo(() => {
    const uniqueDates = [...new Set(sessions.map((s) => s.date).filter(Boolean))];
    if (uniqueDates.length === 0) return "N/A";
    if (uniqueDates.length === 1) return formatDate(uniqueDates[0] as string);
    return `${formatDate(uniqueDates[0] as string)} - ${formatDate(
      uniqueDates[uniqueDates.length - 1] as string
    )}`;
  }, [sessions]);

    return (
      <Card className="custom-container w-full min-w-0 overflow-hidden hover:border-border dark:hover:border-white/20 transition-all duration-300 flex flex-col">
        <CardHeader className="px-4 sm:px-6 pb-3 border-b border-border/30 dark:border-white/5">
        <div className="flex flex-col gap-2 mb-2 sm:flex-row sm:items-start sm:justify-between">
          <Badge
            variant="outline"
            className={cn("flex w-fit max-w-full gap-1.5 items-center whitespace-normal break-words", status.color)}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {status.label}
          </Badge>
          <span className="text-xs text-muted-foreground font-medium bg-muted/50 dark:bg-white/5 px-2 py-1 rounded-md border border-border/50 dark:border-white/5 whitespace-normal break-words sm:text-right">
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

        <CardContent className="px-4 sm:px-6 py-4 space-y-5 text-sm min-w-0">
        <div className="grid grid-cols-1 gap-4 text-muted-foreground sm:grid-cols-2">
          <div className="min-w-0">
            <span className="block text-[11px] sm:text-xs uppercase tracking-wider opacity-80 dark:opacity-60 mb-1 font-semibold dark:font-normal">
              Applied On
            </span>
            <div className="flex items-start gap-1.5 text-foreground/80 dark:text-white/80 min-w-0">
              <Calendar className="h-3.5 w-3.5" />
              <span className="min-w-0 break-words leading-tight">
                {formatDate(leave.created_at || null)}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <span className="block text-[11px] sm:text-xs uppercase tracking-wider opacity-80 dark:opacity-60 mb-1 font-semibold dark:font-normal">
              Leave Dates
            </span>
            <div className="flex items-start gap-1.5 text-foreground/80 dark:text-white/80 min-w-0">
              <Clock className="h-3.5 w-3.5" />
              <span className="min-w-0 break-words leading-tight" title={dateRangeStr}>
                {dateRangeStr}
              </span>
            </div>
          </div>
        </div>

        {sessions.length > 0 && (
          <div className="space-y-2">
            <span className="text-[11px] sm:text-xs text-muted-foreground uppercase tracking-wider font-bold dark:font-semibold">
              Impacted Sessions ({sessions.length})
            </span>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-2 custom-scrollbar">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex min-w-0 items-start gap-2 bg-muted/50 dark:bg-white/5 rounded-md p-2 border border-border/50 dark:border-white/5"
                >
                  <Badge
                    variant="outline"
                    className="shrink-0 bg-muted dark:bg-white/5 text-[10px] sm:text-xs px-1.5 py-0 border-border/50 whitespace-nowrap"
                  >
                    S: {session.session?.name}
                  </Badge>
                  <span className="min-w-0 flex-1 text-xs text-foreground/80 dark:text-white/80 line-clamp-2 leading-tight break-words whitespace-normal">
                    {session.course?.name ||
                      session.course?.code ||
                      "Unknown Course"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {leave.files && leave.files.length > 0 && (
          <div className="space-y-2">
            <span className="text-[11px] sm:text-xs text-muted-foreground uppercase tracking-wider font-bold dark:font-semibold">
              Attachments
            </span>
            <div className="flex flex-wrap gap-2">
              {leave.files.map((file) => (
                <div
                  key={file.id}
                  className="flex min-w-0 flex-wrap items-center gap-2 bg-indigo-50 dark:bg-indigo-500/10 p-2 rounded-md border border-indigo-100 dark:border-indigo-500/20 max-w-full"
                >
                  <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="min-w-0 flex-1 break-words text-xs text-indigo-700 dark:text-indigo-200 font-medium dark:font-normal" title={file.file_name}>
                    {file.file_name}
                  </span>
                  <span className="text-[10px] text-indigo-500/80 dark:text-indigo-400/60 shrink-0 font-medium dark:font-normal whitespace-nowrap sm:ml-auto">
                    ({formatBytes(file.size_byte || 0)})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <WorkflowHistory approvers={leave.approvers} />
    </Card>
  );
}

export default function LeaveClient({
  initialData,
}: {
  initialData?: LeaveInitialData;
}) {
  const { data: semesterData } = useFetchSemester();
  const { data: academicYearData } = useFetchAcademicYear();

  const leaves = useMemo(() => {
    const rawLeaves = initialData?.studentLeaves?.student_leaves || [];
    if (!semesterData || !academicYearData) return rawLeaves;

    return rawLeaves.filter(
      (leave) =>
        leave.usersubgroup?.academic_semester === semesterData &&
        leave.usersubgroup?.academic_year === academicYearData
    );
  }, [initialData, semesterData, academicYearData]);

  const allSessions = initialData?.studentLeaves?.student_leave_sessions || {};
  const approvedCount = useMemo(
    () =>
      leaves.filter((l) => getLeaveStatus(l.approvers).label === "Approved")
        .length,
    [leaves]
  );

  if (!initialData) {
    return (
      <ServiceErrorView title="Leave Data Sync Unavailable" onRetry={() => {}} />
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Card className="custom-container">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
              Total Applied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold bg-linear-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
              {leaves.length}
            </div>
          </CardContent>
        </Card>

        <Card className="custom-container">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
              Approved
            </CardTitle>
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
            <p className="text-sm opacity-70">
              You haven&apos;t applied for any leaves through EzyGo yet.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {leaves.map((leave) => (
            <LeaveCard
              key={leave.id}
              leave={leave}
              sessions={allSessions[leave.id] || []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

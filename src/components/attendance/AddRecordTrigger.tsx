"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AddAttendanceDialog } from "@/components/attendance/AddAttendanceDialog";
import { useAttendanceReport } from "@/hooks/courses/attendance";
import { useTrackingData } from "@/hooks/tracker/useTrackingData";
import { useFetchCourses } from "@/hooks/courses/courses";
import { useFetchAcademicYear, useFetchSemester } from "@/hooks/users/settings";
import type { User } from "@/types";

interface AddRecordTriggerProps {
  user: User;
  onSuccess: () => Promise<void>;
}

/**
 * Local interface for the user data shape passed to AddAttendanceDialog.
 * Keeps the mapping from the broader User type to the dialog's expected fields explicit.
 */
interface DialogUser {
  id: string;
  auth_id?: string;
}

export function AddRecordTrigger({ user, onSuccess }: AddRecordTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  // Transform user object to match AddAttendanceDialog's expected interface
  const dialogUser: DialogUser = {
    id: String(user.id),
    auth_id: "auth_id" in user 
      ? (user as User & { auth_id?: string | null }).auth_id ?? undefined
      : undefined,
  };

  const { data: selectedSemester } = useFetchSemester();
  const { data: selectedYear } = useFetchAcademicYear();
  
  const { data: attendanceData, refetch: refetchAttendance } = useAttendanceReport(
    selectedSemester ?? undefined,
    selectedYear ?? undefined,
    { enabled: isOpen },
  );
  
  const { data: trackingData, refetch: refetchTracking } = useTrackingData(user, { 
    enabled: isOpen 
  });
  
  const { data: coursesData } = useFetchCourses({ 
    enabled: isOpen 
  });

  // Handle local success, then bubble up
  const handleSuccess = async () => {
    // Invalidate all attendance-related queries to refresh dashboard immediately
    queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-report-all"] });
    queryClient.invalidateQueries({ queryKey: ["track_data"] });
    
    await Promise.all([refetchAttendance(), refetchTracking()]);
    await onSuccess();
  };

  return (
    <>
      {/* The Trigger Button */}
      <Button
        onClick={() => setIsOpen(true)}
        className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm font-semibold gap-2 border-0 cursor-pointer"
        aria-label="Add new attendance record (Press Enter to open)"
        title="Add new attendance record"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span className="max-sm:hidden">Add Record</span>
        <span className="sr-only sm:hidden">Add Record</span>
      </Button>

      <AddAttendanceDialog 
         open={isOpen} 
         onOpenChange={setIsOpen}
         attendanceData={attendanceData ?? undefined}
         trackingData={trackingData || []}
         coursesData={coursesData ?? undefined}
         user={dialogUser}
         onSuccess={handleSuccess}
         selectedSemester={selectedSemester ?? undefined}
         selectedYear={selectedYear ?? undefined}
      />
    </>
  );
}

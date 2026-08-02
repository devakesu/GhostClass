"use client";

import { createContext, ReactNode, useContext, useMemo } from "react";
import { useUserSettings } from "@/providers/user-settings";

interface AttendanceSettingsContextType {
  targetPercentage: number;
  setTargetPercentage: (percentage: number) => void;
  courseTargets: Record<string, number>;
  updateCourseTarget: (courseCode: string, percentage: number) => void;
  updateCourseTargets: (map: Record<string, number>) => void;
  isLoading: boolean;
}

const AttendanceSettingsContext = createContext<
  AttendanceSettingsContextType | undefined
>(undefined);

interface AttendanceSettingsProviderProps {
  children: ReactNode;
}

export function AttendanceSettingsProvider({
  children,
}: AttendanceSettingsProviderProps) {
  const {
    settings,
    updateTarget,
    updateCourseTarget,
    updateCourseTargets,
    isLoading,
  } = useUserSettings();

  const targetPercentage = settings?.target_percentage ?? 75;
  const courseTargets = useMemo(
    () => settings?.course_targets ?? {},
    [settings?.course_targets],
  );

  const contextValue = useMemo(
    () => ({
      targetPercentage,
      setTargetPercentage: updateTarget,
      courseTargets,
      updateCourseTarget,
      updateCourseTargets,
      isLoading,
    }),
    [
      targetPercentage,
      updateTarget,
      courseTargets,
      updateCourseTarget,
      updateCourseTargets,
      isLoading,
    ],
  );

  return (
    <AttendanceSettingsContext.Provider value={contextValue}>
      {children}
    </AttendanceSettingsContext.Provider>
  );
}

export const useAttendanceSettings = () => {
  const context = useContext(AttendanceSettingsContext);
  if (context === undefined) {
    throw new Error(
      "useAttendanceSettings must be used within an AttendanceSettingsProvider",
    );
  }
  return context;
};

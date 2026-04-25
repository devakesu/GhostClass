"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { handleLogout as performLogout } from "@/lib/security/auth";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/users/user";
import { useProfile } from "@/hooks/users/profile";
import { Switch } from "@/components/ui/switch";
import {
  useInstitutions,
  useDefaultInstitutionUser,
  useUpdateDefaultInstitutionUser,
} from "@/hooks/users/institutions";
import Image from "next/image";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Building2,
  Layers2,
  LogOut,
  UserRound,
  Percent,
  SquareAsterisk,
  Calculator,
  Plus,
  Contact,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useUserSettings } from "@/providers/user-settings";
import { AddAttendanceDialog } from "@/components/AddAttendanceDialog";
import { useAttendanceReport } from "@/hooks/courses/attendance";
import { useTrackingData } from "@/hooks/tracker/useTrackingData";
import { useFetchCourses } from "@/hooks/courses/courses";

import UserPlaceholder from "@/assets/user.png";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/notifications/useNotifications";

export const Navbar = () => {
  const router = useRouter();
  const { data: user } = useUser();
  const { data: profile } = useProfile();
  const { settings, updateBunkCalc, updateTarget, isLoading: settingsLoading } = useUserSettings();

  const { data: institutions, isLoading: institutionsLoading } = useInstitutions();
  const { data: defaultInstitutionUser } = useDefaultInstitutionUser();
  const updateDefaultInstitutionUser = useUpdateDefaultInstitutionUser();
  const queryClient = useQueryClient();
  const selectedInstitution = defaultInstitutionUser?.toString() ?? "";

  // --- ADD RECORD STATE ---
  const [isAddRecordOpen, setIsAddRecordOpen] = useState(false);

  // --- DATA HOOKS FOR DIALOG ---
  const { data: attendanceData, refetch: refetchAttendance } = useAttendanceReport();
  const { data: trackingData, refetch: refetchTracking } = useTrackingData(user);
  const { data: coursesData } = useFetchCourses();

  const pathname = usePathname();
  const { unreadCount } = useNotifications(true);

  // Handle Bunk Calc Toggle 
  const handleBunkCalcToggle = (checked: boolean) => {
    updateBunkCalc(checked);

    window.dispatchEvent(
      new CustomEvent("bunkCalcToggle", { detail: checked })
    );

    if (checked) {
      toast.success("Bunk Calculator Enabled", {
        style: {
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          color: "rgb(34, 197, 94)",
          border: "1px solid rgba(34, 197, 94, 0.5)",
          backdropFilter: "blur(5px)",
        },
      });
    } else {
      toast.info("Bunk Calculator Disabled", {
        style: {
          backgroundColor: "rgba(250, 204, 21, 0.1)",
          color: "rgb(250, 204, 21)",
          border: "1px solid rgba(250, 204, 21, 0.5)",
          backdropFilter: "blur(5px)",
        },
      });
    }
  };

  const handleLogout = async () => {
    await performLogout();
  };

  const navigateTo = (path: string) => {
    router.push(path);
  };

  const handleInstitutionChange = (value: string) => {
    updateDefaultInstitutionUser.mutate(Number.parseInt(value), {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["defaultInstitutionUser"] });
        queryClient.invalidateQueries({ queryKey: ["institutions"] });
        toast.success("Institution updated", {
          description: "Your default institution has been updated.",
        });
      },
      onError: () => {
        toast.error("Error", {
          description: "Failed to update institution. Please try again.",
        });
      },
    });
  };

  const handleAddSuccess = async () => {
    // Broadly invalidate to update counts, cards, charts and summaries
    queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-report-all"] });
    queryClient.invalidateQueries({ queryKey: ["track_data"] });
    
    await Promise.all([refetchAttendance(), refetchTracking()]);
  };

  const currentTarget = settings?.target_percentage ?? 75;
  const currentBunkCalc = settings?.bunk_calculator_enabled ?? true;

  return (
    <header className="sticky top-0 z-10 flex h-17 items-center justify-between gap-4 border-b-2 bg-background px-4 md:px-6 text-white mr-0.5 border-white/5">
      
      <AddAttendanceDialog 
         open={isAddRecordOpen} 
         onOpenChange={setIsAddRecordOpen}
         attendanceData={attendanceData}
         trackingData={trackingData || []}
         coursesData={coursesData}
         user={user}
         onSuccess={handleAddSuccess}
      />

      <div className="flex items-center gap-2">
        <Link href="/" className="group text-3xl sm:text-4xl lg:text-[2.50rem] font-semibold gradient-logo font-klick tracking-wide">
          <div className="relative w-48 h-40 overflow-hidden">
            <Image 
              src="/logo.png" 
              alt="GhostClass Logo"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              priority
              className="object-contain transition-transform group-hover:scale-110"
            />
          </div>
        </Link>
      </div>
      <div className="flex items-center justify-between gap-4 md:gap-6">
        <div className="gap-3 flex items-center">

          {pathname !== "/dashboard" && (
            <div className="max-lg:hidden text-white/85">
              <Button
                variant={"outline"}
                className="custom-button cursor-pointer"
                onClick={() => navigateTo("/dashboard")}
              >
                <Layers2 className="h-4 w-4" />
                Dashboard
              </Button>
            </div>
          )}

          {pathname !== "/tracking" && (
            <div className="max-lg:hidden text-white/85">
              <Button
                variant={"outline"}
                className="custom-button cursor-pointer"
                onClick={() => navigateTo("/tracking")}
              >
                <SquareAsterisk className="h-4 w-4" />
                Tracking
              </Button>
            </div>
          )}

          <Button
            onClick={() => setIsAddRecordOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md font-semibold gap-2 border-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span className="max-sm:hidden">Add Record</span>
            <span className="sm:hidden">Add</span>
          </Button>

          {/* Attendance Target Selector (Desktop Only) */}
          <div className="flex max-sm:hidden">
            <Select
              value={currentTarget.toString()}
              onValueChange={(value) => {
                const val = Number(value);
                updateTarget(val);
                toast.success("Attendance Target Updated", {
                  description: (
                    <span style={{ color: "#ffffffa6" }}>
                      Your attendance target is now set to {value}%
                    </span>
                  ),
                  style: {
                    backgroundColor: "rgba(34,197,94,0.08)",
                    color: "#22c55e",
                    border: "1px solid #22c55e33",
                    backdropFilter: "blur(4px)",
                  },
                });
              }}
            >
              <SelectTrigger className="w-[110px] custom-input cursor-pointer">
                <SelectValue>
                  <div className="flex items-center font-medium">
                    <Percent className="mr-2 h-4 w-4" />
                    <span>{currentTarget}%</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="custom-dropdown mt-1">
                {[75, 80, 85, 90, 95].map((percentage) => (
                  <SelectItem key={percentage} value={percentage.toString()}>
                    <div className="flex items-center cursor-pointer">
                      <Percent className="mr-2 h-4 w-4 shrink-0" />
                      <span className="font-medium">{percentage}%</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Institution Selector */}
          {!institutionsLoading && institutions && institutions.length > 0 && (
            <div className="flex max-md:hidden">
              <Select
                value={selectedInstitution}
                onValueChange={handleInstitutionChange}
              >
                <SelectTrigger className="w-[140px] md:w-[290px] custom-input cursor-pointer">
                  <SelectValue>
                    {selectedInstitution &&
                      institutions?.find(
                        (i) => i.id.toString() === selectedInstitution
                      ) && (
                        <div className="flex items-center font-medium">
                          <Building2 className="mr-2 h-4 w-4" />
                          <span>
                            {(
                              institutions.find(
                                (i) => i.id.toString() === selectedInstitution
                              )?.institution.name || ""
                            )}
                          </span>
                        </div>
                      )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="custom-dropdown mt-1">
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id.toString()}>
                      <div className="flex items-center cursor-pointer">
                        <Building2 className="mr-2 h-4 w-4 shrink-0" />
                        <span className="font-medium">
                          {inst.institution.name}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">

          <Link href="/notifications">
            <Button variant="ghost" className="relative h-9 w-9 p-0 rounded-full">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white font-bold ring-2 ring-background">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full cursor-pointer">
                <Avatar className="h-9 w-9 outline-2 relative">
                  {profile?.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt={user?.username || "Profile"}
                      fill
                      className="object-cover rounded-full"
                      priority
                      sizes="36px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-muted">
                      <Image src={UserPlaceholder} alt="Avatar" width={36} height={36} className="object-contain" priority/>
                    </div>
                  )}
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-56 z-50 mt-1 custom-dropdown pr-1 mr-[-4px]" align="end">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium lowercase">{user?.username}</p>
                  <p className="text-xs text-muted-foreground lowercase">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigateTo("/dashboard")} className="cursor-pointer">
                <Layers2 className="mr-2 h-4 w-4" />
                <span>Dashboard</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigateTo("/tracking")} className="cursor-pointer">
                <SquareAsterisk className="mr-2 h-4 w-4" />
                <span>Tracking</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigateTo("/profile")} className="cursor-pointer">
                <UserRound className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigateTo("/contact")} className="cursor-pointer">
                <Contact className="mr-2 h-4 w-4" />
                <span>Contact Us</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />

              {/* Bunk Calculator Toggle - UPDATED */}
              <div className="px-2 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calculator className="h-4 w-4" />
                    <span className="text-sm">Bunk Calculator</span>
                  </div>
                  <Switch
                    checked={currentBunkCalc}
                    onCheckedChange={handleBunkCalcToggle}
                    disabled={settingsLoading}
                  />
                </div>
              </div>

              {/* Target Percentage Selector (Mobile Only) */}
              <div className="px-2 py-2 sm:hidden border-t border-white/10 mt-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Percent className="h-4 w-4" />
                        <span className="text-sm">Target</span>
                    </div>
                    <Select
                      value={currentTarget.toString()}
                      onValueChange={(value) => {
                        updateTarget(Number(value));
                        toast.success("Target Updated", { description: `Target set to ${value}%` });
                      }}
                    >
                      <SelectTrigger className="w-[80px] h-8 text-xs bg-background/50 border-white/10">
                        <SelectValue placeholder={`${currentTarget}%`} />
                      </SelectTrigger>
                      <SelectContent className="custom-dropdown z-60">
                          {[75, 80, 85, 90, 95].map((p) => (
                            <SelectItem key={p} value={p.toString()}>{p}%</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
              </div>

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer" variant="destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

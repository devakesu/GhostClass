"use client";

import {
  useInstitutions,
  useDefaultInstitutionUser,
  useUpdateDefaultInstitutionUser,
} from "@/hooks/users/institutions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Institution selector component for managing user's default institution.
 * Displays enrolled institutions with radio selection and optimistic UI updates.
 * Handles loading states and empty states gracefully.
 * 
 * @returns Interactive institution selection card with animations
 * 
 * Features:
 * - Radio button selection for institutions
 * - Optimistic UI updates with rollback on error
 * - Loading and empty state handling
 * - Animated transitions
 * 
 * @example
 * ```tsx
 * <InstitutionSelector />
 * ```
 */
export function InstitutionSelector() {
  const { data: institutions, isLoading } = useInstitutions();
  const { data: defaultInstitutionUser } = useDefaultInstitutionUser();
  const updateDefaultInstitutionUser = useUpdateDefaultInstitutionUser();
  const queryClient = useQueryClient();

  // Track user's pending selection (null means no pending change)
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);

  // Use pending selection if user has edited, otherwise use the server value
  const selectedInstitution = pendingSelection ?? defaultInstitutionUser?.toString() ?? "";

  const handleSaveInstitution = () => {
    if (!selectedInstitution) return;

    updateDefaultInstitutionUser.mutate(Number.parseInt(selectedInstitution), {
      onSuccess: () => {
        setPendingSelection(null); // Clear pending state on success
        queryClient.invalidateQueries({ queryKey: ["defaultInstitutionUser"] });
        queryClient.invalidateQueries({ queryKey: ["institutions"] });
        toast("Institution updated", {
          description: "Your default institution has been updated.",
        });
      },
      onError: () => {
        setPendingSelection(null); // Clear pending state on error to revert to server value
        toast.error("Error", {
          description: "Failed to update institution. Please try again.",
        });
      },
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Institutions</CardTitle>
          <CardDescription>Select your default institution</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-fit w-6 animate-spin text-muted-foreground" aria-label="Loading" />
        </CardContent>
      </Card>
    );
  }

  if (!institutions || institutions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Institutions</CardTitle>
          <CardDescription>
            You are not enrolled in any institutions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Contact your administrator to get enrolled in an institution.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="custom-container">
        <CardHeader className="mt-3 flex flex-col gap-0.5">
          <CardTitle className="text-lg">Institutions</CardTitle>
          <CardDescription className="hidden md:block">
            Set your primary institution
          </CardDescription>
        </CardHeader>
        <CardContent className="">
          <RadioGroup
            value={selectedInstitution}
            onValueChange={setPendingSelection}
            className="space-y-1 flex flex-col gap-1"
            aria-label="Select your default institution"
            aria-describedby="institution-help"
          >
            {/* Screen reader helper text */}
            <span className="sr-only" id="institution-help">
              Choose your primary educational institution to customize your experience. Your selection will be saved as default.
            </span>
            <AnimatePresence>
              {institutions.map((institution, index) => (
                <motion.div
                  key={institution.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`flex items-center cursor-pointer border-2 rounded-[12px] space-x-2 p-2 md:p-3 transition-colors ${
                    selectedInstitution === institution.id.toString()
                      ? "border-primary bg-primary/10 dark:bg-primary/20 ring-1 ring-primary/30"
                      : "bg-input/40 border-input"
                  }`}
                >
                  <label
                    htmlFor={`institution-${institution.id}`}
                    className="flex flex-1 items-center justify-between cursor-pointer"
                    aria-label={`Select institution ${institution.institution.name} with role ${institution.institution_role.name}`}
                  >
                    <div className="flex items-center space-x-2 md:space-x-3">
                      <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <div className="flex flex-col gap-0.5">
                        <p className="text-sm font-medium line-clamp-1">
                          {institution.institution.name}
                        </p>
                        <p className="text-xs text-muted-foreground hidden md:block">
                          Role:{" "}
                          <span className="capitalize">
                            {institution.institution_role.name}
                          </span>
                        </p>
                      </div>
                    </div>
                  </label>
                  <RadioGroupItem
                    value={institution.id.toString()}
                    id={`institution-${institution.id}`}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </RadioGroup>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-4 flex justify-end"
          >
            <motion.div>
              <Button
                onClick={handleSaveInstitution}
                disabled={
                  updateDefaultInstitutionUser.isPending ||
                  pendingSelection === null ||
                  pendingSelection === defaultInstitutionUser?.toString()
                }
                className="w-full font-semibold min-h-11.5 rounded-[12px] mt-4 font-md"
                aria-label="Save selected institution as default"
              >
                {updateDefaultInstitutionUser.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                {updateDefaultInstitutionUser.isPending ? (
                  <>
                    <span className="sr-only">Saving your institution preference</span>
                    <span aria-hidden="true">Saving...</span>
                  </>
                ) : (
                  "Save as Default"
                )}
              </Button>
            </motion.div>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

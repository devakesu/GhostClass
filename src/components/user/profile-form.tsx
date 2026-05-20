"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm, type Resolver } from "react-hook-form";
import React, { useState, forwardRef } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Pencil, X, Check, Calendar, User, Info } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateProfile } from "@/hooks/users/profile";
import { UserProfile } from "@/types";
import { cn, redact } from "@/lib/utils";
import { birthDateSchema, genderSchema, optionalPersonNameSchema, personNameSchema } from "@/lib/validation/text";
import { Separator } from "../ui/separator";
import { DeleteAccount } from "./delete-account";

const profileFormSchema = z.object({
  first_name: personNameSchema,
  last_name: optionalPersonNameSchema,
  gender: z.union([genderSchema, z.literal("")]),
  birth_date: birthDateSchema
    .optional()
    .nullable()
    .refine((val) => {
      if (!val) return true;

      // Normalize both the birth date and today's date to UTC midnight to avoid timezone issues
      const [year, month, day] = val.split("-").map(Number);
      const birthDate = new Date(Date.UTC(year, month - 1, day));

      const today = new Date();
      const todayUtc = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
      );

      return birthDate.getTime() <= todayUtc.getTime();
    }, "Birth date cannot be in the future"),
});

type ProfileFormInput = {
  first_name: string;
  last_name: string | null;
  gender: "" | "male" | "female" | "other";
  birth_date: string | null;
};

interface ReadOnlyFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'> {
  value?: string | null;
  placeholder?: string;
}

const ReadOnlyField = forwardRef<HTMLInputElement, ReadOnlyFieldProps>(
  ({ value, placeholder = "Not set", className, ...props }, ref) => {
    const hasValue = value !== null && value !== undefined && value !== "";

    return (
      <div className={cn(
        "flex h-11 w-full items-center rounded-xl border border-border/40 px-3 transition-all",
        "bg-secondary/15 dark:bg-white/5 text-foreground/90",
        !hasValue && "opacity-50",
        className
      )}>
        <input
          ref={ref}
          {...props}
          readOnly
          aria-readonly="true"
          value={hasValue ? value! : ""}
          placeholder={placeholder}
          className="bg-transparent border-none focus:outline-none w-full text-sm font-medium"
          tabIndex={0}
        />
      </div>
    );
  }
);

ReadOnlyField.displayName = "ReadOnlyField";

const fieldVariants = {
  hidden: { opacity: 0, y: 5 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: custom * 0.05, duration: 0.2 },
  }),
};

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const [isEditing, setIsEditing] = useState(false);
  const updateProfileMutation = useUpdateProfile();

  const getGenderValue = (val: string | undefined | null) => {
    if (!val) return "";
    return val.toLowerCase() as ProfileFormInput["gender"];
  };

  const displayGender = (val: string | undefined | null) => {
    if (!val) return "Not set";
    return val.charAt(0).toUpperCase() + val.slice(1);
  };

  const form = useForm<ProfileFormInput, unknown, ProfileFormInput>({
    resolver: zodResolver(profileFormSchema) as unknown as Resolver<ProfileFormInput, unknown, ProfileFormInput>,
    defaultValues: {
      first_name: "",
      last_name: "",
      gender: "",
      birth_date: "",
    },
    values: {
      first_name: profile?.first_name || "",
      last_name: profile?.last_name || "",
      gender: getGenderValue(profile?.gender),
      birth_date: profile?.birth_date || "",
    },
    resetOptions: {
      keepDirtyValues: true,
    }
  });

  function onSubmit(formValues: ProfileFormInput) {
    updateProfileMutation.mutate(
      { 
        data: {
          first_name: formValues.first_name,
          last_name: formValues.last_name?.trim() || null,
          gender: formValues.gender || null,
          birth_date: formValues.birth_date || null,
        } 
      },
      {
        onSuccess: () => {
          toast.success("Profile updated");
          setIsEditing(false);
        },
        onError: (error) => {
          toast.error("Failed to update profile");
          logger.error(error);
          
          // Capture failure in Sentry
          Sentry.captureException(error, {
              tags: { type: "profile_update_error", location: "ProfileForm/onSubmit" },
              extra: { userId: redact("id", String(profile.id)) }
          });
        },
      }
    );
  }

  return (
    <Form {...form}>
      <motion.form
        initial="hidden"
        animate="visible"
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
      >
        <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Basic Details
            </h3>

            <AnimatePresence mode="wait">
            {!isEditing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="h-8 px-2 text-primary hover:text-primary/80 hover:bg-primary/10"
                  aria-label="Edit profile"
                >
                  <Pencil className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                  Edit
                </Button>
              </motion.div>
            )}
            </AnimatePresence>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div custom={0} variants={fieldVariants}>
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider ml-1">
                    First Name
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      {isEditing ? (
                        <Input
                          placeholder="Enter first name"
                          className="pl-9 custom-input bg-background/50 h-11"
                          {...field}
                        />
                      ) : (
                        <ReadOnlyField value={field.value} className="pl-9" />
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </motion.div>

          <motion.div custom={1} variants={fieldVariants}>
            <FormField
              control={form.control}
              name="last_name"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider ml-1">
                    Last Name
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      {isEditing ? (
                        <Input
                          placeholder="Enter last name"
                          className="pl-9 custom-input bg-background/50 h-11"
                          {...field}
                          value={field.value ?? ""}
                        />
                      ) : (
                        <ReadOnlyField value={field.value} className="pl-9" />
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </motion.div>

          <motion.div custom={2} variants={fieldVariants}>
            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider ml-1">
                    Gender
                  </FormLabel>
                  <div className="relative">
                    <Info className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 z-10" />
                    {isEditing ? (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="pl-9 custom-input bg-background/50 h-11" aria-label="Select gender">
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="custom-dropdown">
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <ReadOnlyField value={displayGender(field.value)} className="pl-9" />
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </motion.div>

          <motion.div custom={3} variants={fieldVariants}>
            <FormField
              control={form.control}
              name="birth_date"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider ml-1">
                    Date of Birth
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                      {isEditing ? (
                        <Input
                          type="date"
                          className="pl-9 custom-input bg-background/50 h-11"
                          {...field}
                          value={field.value || ""}
                          aria-label="Enter date of birth"
                        />
                      ) : (
                        <ReadOnlyField value={field.value} placeholder="YYYY-MM-DD" className="pl-9" />
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </motion.div>
        </div>

        {/* Action Buttons - Only Visible when Editing */}
        <AnimatePresence>
          {isEditing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex justify-end gap-3 pt-4 border-t border-border/40"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  form.reset();
                }}
                className="h-9"
              >
                <X className="w-4 h-4 mr-2" aria-hidden="true" /> Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={updateProfileMutation.isPending}
                className="h-9 min-w-25"
                aria-label={updateProfileMutation.isPending ? "Saving profile changes" : "Save profile changes"}
              >
                {updateProfileMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />
                ) : (
                  <Check className="w-4 h-4 mr-2" aria-hidden="true" />
                )}
                Save
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.form>
      
      <Separator className="my-4" />

      {/* Account Info Footer */}
      <div className="flex items-center gap-4 py-4 px-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Calendar className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
            GhostClass Join Date
          </span>
          <span className="text-sm font-bold text-foreground/90">
            {profile?.created_at
              ? new Date(profile.created_at).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "N/A"}
          </span>
        </div>
      </div>

      <Separator className="my-4" />
      
      {/* Danger Zone */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-destructive">
           <h3 className="text-lg font-medium">Danger Zone</h3>
        </div>
        <DeleteAccount />
      </div>
    </Form>
  );
}
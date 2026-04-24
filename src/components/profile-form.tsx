"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Pencil, X, Check } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { Separator } from "./ui/separator";
import { DeleteAccount } from "./delete-account";

const profileFormSchema = z.object({
  first_name: z.string().min(2, {
    message: "First name must be at least 2 characters.",
  }),
  last_name: z.string().optional(),
  gender: z.string().min(1, {
    message: "Please select a gender.",
  }),
  birth_date: z.string().optional().nullable(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const [isEditing, setIsEditing] = useState(false);
  const updateProfileMutation = useUpdateProfile();

  const getGenderValue = (val: string | undefined | null) => {
    if (!val) return "";
    return val.toLowerCase();
  };

  const displayGender = (val: string | undefined | null) => {
    if (!val) return "Not set";
    return val.charAt(0).toUpperCase() + val.slice(1);
  };

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
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

  function onSubmit(formValues: ProfileFormValues) {
    updateProfileMutation.mutate(
      { 
        data: {
          first_name: formValues.first_name,
          last_name: formValues.last_name,
          gender: formValues.gender,
          birth_date: formValues.birth_date || undefined,
        } 
      },
      {
        onSuccess: () => {
          toast.success("Profile updated");
          setIsEditing(false);
        },
        onError: (error) => {
          toast.error("Failed to update profile");
          console.error(error);
        },
      }
    );
  }

  const fieldVariants = {
    hidden: { opacity: 0, y: 5 },
    visible: (custom: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: custom * 0.05, duration: 0.2 },
    }),
  };

  const ReadOnlyField = ({ value, placeholder = "Not set" }: { value?: string | null, placeholder?: string }) => (
    <div className={cn(
      "flex h-11 w-full items-center rounded-lg border border-border/40 px-3 py-2 text-sm transition-all",
      "bg-secondary/20 text-foreground/90",
      !value && "text-muted-foreground italic"
    )}>
      {value || placeholder}
    </div>
  );

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
                >
                  <Pencil className="w-3.5 h-3.5 mr-2" />
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
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-muted-foreground ml-1">
                    First Name
                  </FormLabel>
                  <FormControl>
                    {isEditing ? (
                      <Input
                        placeholder="Enter first name"
                        className="bg-background/50 h-11"
                        {...field}
                      />
                    ) : (
                      <ReadOnlyField value={field.value} />
                    )}
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
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-muted-foreground ml-1">
                    Last Name
                  </FormLabel>
                  <FormControl>
                    {isEditing ? (
                      <Input
                        placeholder="Enter last name"
                        className="bg-background/50 h-11"
                        {...field}
                      />
                    ) : (
                      <ReadOnlyField value={field.value} />
                    )}
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
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-muted-foreground ml-1">
                    Gender
                  </FormLabel>
                  {isEditing ? (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background/50 h-11">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <ReadOnlyField value={displayGender(field.value)} />
                  )}
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
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-muted-foreground ml-1">
                    Date of Birth
                  </FormLabel>
                  <FormControl>
                    {isEditing ? (
                      <Input
                        type="date"
                        className="bg-background/50 h-11"
                        {...field}
                        value={field.value || ""}
                      />
                    ) : (
                      <ReadOnlyField value={field.value} placeholder="YYYY-MM-DD" />
                    )}
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
                <X className="w-4 h-4 mr-2" /> Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={updateProfileMutation.isPending}
                className="h-9 min-w-[100px]"
              >
                {updateProfileMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Save
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.form>
      <Separator className="my-8" />
      
      {/* Danger Zone */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-destructive">Danger Zone</h3>
        <DeleteAccount />
      </div>
    </Form>
  );
}

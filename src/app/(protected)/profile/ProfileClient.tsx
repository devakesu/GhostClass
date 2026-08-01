"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { useProfile } from "@/hooks/users/profile";
import { ProfileForm } from "@/components/user/profile-form";
import { InstitutionSelector } from "@/components/institution-selector";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Image from "next/image";
import { motion, Variants } from "framer-motion";
import {
  Camera,
  Clock,
  Fingerprint,
  Loader2,
  Mail,
  Phone,
  School,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import UserPlaceholder from "@/assets/user.png";
import { uploadUserAvatar } from "@/hooks/users/upload-avatar";
import { compressImage, redact } from "@/lib/utils";
import { Loading as CompLoading } from "@/components/loading";

export default function ProfileClient() {
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useProfile();

  const [isUploading, setIsUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLoading = profileLoading && !profile;

  const joinedTargetDate = profile?.ezygo_created_at || profile?.created_at;
  const joinedDateString = joinedTargetDate
    ? new Date(joinedTargetDate).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    : "N/A";

  // Priority: 1. User Upload Preview -> 2. Fetched DB URL -> 3. Fallback Placeholder
  const displayAvatar = avatarPreview || profile?.avatar_url || UserPlaceholder;

  // Revoke object URL to avoid memory leaks
  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  const handleAvatarClick = useCallback(() => {
    if (!isLoading && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [isLoading, isUploading]);

  if (isLoading && !profileError) {
    return <CompLoading />;
  }

  const getUploadableFile = async (originalFile: File): Promise<File> => {
    if (originalFile.size <= 5 * 1024 * 1024) {
      return originalFile;
    }
    toast.info("Compressing large image...", { duration: 2000 });
    try {
      const compressed = await compressImage(originalFile, 0.7);
      const bestCompressed = compressed.size > 5 * 1024 * 1024
        ? await compressImage(originalFile, 0.5)
        : compressed;
      if (bestCompressed.size > 5 * 1024 * 1024) {
        throw new Error(
          "Image is too large to upload even after compression. Please choose a smaller image (under 5 MB).",
        );
      }
      return bestCompressed;
    } catch (error) {
      logger.warn("Compression failed, falling back to original:", error);
      Sentry.captureException(error, {
        tags: {
          type: "image_compression",
          location: "ProfileClient/handleFileChange",
        },
        extra: {
          original_size: originalFile.size,
          user_id: redact("id", String(profile?.id ?? "unknown")),
        },
      });
      toast.warning("Could not compress image. Uploading original.");
      return originalFile;
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!profile?.id) {
      toast.error(
        "We couldn't verify your profile right now. Please refresh and try again.",
      );
      return;
    }

    const originalFile = event.target.files?.[0];
    if (!originalFile) return;

    if (!originalFile.type.startsWith("image/")) {
      toast.error("Please upload an image file.");
      return;
    }

    let optimisticPreviewUrl: string | null = null;

    try {
      setIsUploading(true);

      optimisticPreviewUrl = URL.createObjectURL(originalFile);
      setAvatarPreview(optimisticPreviewUrl);

      const fileToUpload = await getUploadableFile(originalFile);

      const newAvatarUrl = await uploadUserAvatar(fileToUpload);

      setAvatarPreview(newAvatarUrl);
      toast.success("Profile picture updated!");

      refetchProfile();
    } catch (error: unknown) {
      logger.error("Upload error:", error);

      setAvatarPreview(profile?.avatar_url || null);

      const errObj = error as { message?: unknown } | null;
      const safeMessage =
        typeof errObj?.message === "string" && /too large/i.test(errObj.message)
          ? errObj.message
          : "We encountered an error while updating your profile picture. Please try again later. If the issue persists, please contact us.";
      toast.error(safeMessage);

      Sentry.captureException(error, {
        tags: {
          type: "avatar_upload",
          location: "ProfileClient/handleFileChange",
        },
        extra: {
          user_id: redact("id", String(profile?.id ?? "unknown")),
          file_size: originalFile.size,
        },
      });
    } finally {
      setIsUploading(false);

      if (fileInputRef.current) fileInputRef.current.value = "";

      if (optimisticPreviewUrl) {
        URL.revokeObjectURL(optimisticPreviewUrl);
      }
    }
  };

  const tabContentVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: "easeInOut" },
    },
  };

  const fieldVariants = {
    hidden: { opacity: 0 },
    visible: (custom: number) => ({
      opacity: 1,
      transition: { delay: custom * 0.1, duration: 0.3 },
    }),
  };

  if (isLoading) {
    return <CompLoading />;
  }

  // Note: Regional error cases (profileError, etc.) are now handled globally
  // by the OutageBarrier in ProtectedLayout. Page-specific fallback logic
  // is removed to maintain a unified "Fail-Fast" experience.

  return (
    <div className="bg-background">
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto pt-4 md:pt-6 px-4 md:px-6"
      >
        <motion.div
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.15 },
            },
          }}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-3 gap-4 md:gap-8"
        >
          {/* Left Column: Profile Card */}
          <motion.div className="md:col-span-2 sm:col-span-1 lg:col-span-1 space-y-4 md:space-y-6">
            <Card className="custom-container relative overflow-hidden">
              <CardContent className="flex flex-col items-center md:items-start pt-12">
                {/* Banner Background */}
                <div className="h-30 md:h-35 w-full absolute top-0 left-0 right-0 z-0 overflow-hidden pointer-events-none">
                  <div className="absolute inset-0 bg-linear-to-r from-violet-900/40 via-purple-900/40 to-slate-900/40" />
                  <div className="absolute -bottom-10 left-8 w-32 h-32 bg-primary/20 blur-[50px] rounded-full" />
                </div>

                {/* Profile Image Area */}
                <div className="relative w-24 h-24 mb-3 flex items-start mt-0.5 group z-10">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/png, image/jpeg, image/webp"
                    aria-label="Upload profile picture"
                    title="Upload profile picture"
                  />

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={handleAvatarClick}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleAvatarClick();
                      }
                    }}
                    aria-label="Change profile picture"
                    className={`relative w-full h-full rounded-full ring-4 ring-background border-2 border-border/30 z-10 cursor-pointer transition-all duration-300 ${
                      isUploading ? "opacity-80" : "group-hover:opacity-90"
                    }`}
                  >
                    <Image
                      src={displayAvatar}
                      alt="Profile"
                      fill
                      className={`object-cover rounded-full${
                        typeof displayAvatar === "object"
                          ? " brightness-150 dark:brightness-100"
                          : ""
                      }`}
                      priority
                      unoptimized={!!avatarPreview?.startsWith("blob:")}
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />

                    {/* Loading Overlay */}
                    {isUploading && (
                      <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center z-30">
                        <Loader2
                          className="w-8 h-8 text-white animate-spin"
                          aria-label="Loading"
                        />
                      </div>
                    )}

                    {!isUploading && (
                      <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground p-1.5 rounded-full border-[3px] border-background shadow-sm z-20 flex items-center justify-center">
                        {/* Decorative icon — the parent button already has aria-label="Change profile picture". */}
                        <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-center md:text-left w-full flex flex-col gap-0.5 relative z-10">
                  <h3 className="text-lg md:text-xl font-semibold mt-2">
                    {
                      /* Fall back to username when both name fields are null/undefined so the
                        heading is never empty (layout gap + inaccessible blank heading). */
                    }
                    {(profile?.first_name || profile?.last_name)
                      ? `${profile?.first_name ?? ""} ${
                        profile?.last_name ?? ""
                      }`.trim()
                      : (profile?.username ?? "Your Name")}
                  </h3>
                  <p className="text-muted-foreground text-sm lowercase font-medium">
                    @{profile?.username}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="block">
              <InstitutionSelector />
            </div>
          </motion.div>

          {/* Right Column */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 50 },
              show: { opacity: 1, y: 0, transition: { duration: 0.1 } },
            }}
            className="md:col-span-2"
          >
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="grid w-full grid-cols-2 max-md:mt-4 rounded-[12px] bg-muted">
                <TabsTrigger value="personal">Personal</TabsTrigger>
                <TabsTrigger value="account">EzyGo</TabsTrigger>
              </TabsList>

              {/* Personal Tab Content */}
              <TabsContent value="personal" className="mt-4">
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={tabContentVariants}
                >
                  <Card className="custom-container py-0">
                    <CardHeader className="p-6 pb-2 border-b border-border/40 bg-muted/20">
                      <CardTitle className="text-lg">
                        Personal Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6">
                      {profile && <ProfileForm profile={profile} />}
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

              {/* Account Tab Content */}
              <TabsContent value="account" className="mt-4">
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={tabContentVariants}
                >
                  <Card className="custom-container">
                    <CardHeader className="p-4 md:p-6 pb-0 md:pb-0 flex flex-col gap-0.5">
                      <CardTitle className="text-lg">
                        EzyGo Account
                      </CardTitle>
                      <CardDescription className="md:block font-medium">
                        Fetched from Ezygo. Cannot be changed here.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                      <div className="flex flex-col gap-1">
                        {/* EzyGo ID */}
                        <motion.div
                          custom={0}
                          variants={fieldVariants}
                          initial="hidden"
                          animate="visible"
                          className="flex items-center gap-4 py-3"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Fingerprint className="h-5 w-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                              EzyGo ID
                            </span>
                            <span className="text-sm font-bold text-foreground/90">
                              {profile?.id}
                            </span>
                          </div>
                        </motion.div>
                        <div className="h-px w-full bg-border/40" />

                        {/* EzyGo Username */}
                        <motion.div
                          custom={1}
                          variants={fieldVariants}
                          initial="hidden"
                          animate="visible"
                          className="flex items-center gap-4 py-3"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <UserCheck className="h-5 w-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                              EzyGo Username
                            </span>
                            <span className="text-sm font-bold text-foreground/90">
                              {profile?.username}
                            </span>
                          </div>
                        </motion.div>
                        <div className="h-px w-full bg-border/40" />

                        {/* Email */}
                        <motion.div
                          custom={2}
                          variants={fieldVariants}
                          initial="hidden"
                          animate="visible"
                          className="flex items-center gap-4 py-3"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Mail className="h-5 w-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                              Email
                            </span>
                            <span className="text-sm font-bold text-foreground/90 lowercase">
                              {profile?.email}
                            </span>
                          </div>
                        </motion.div>
                        <div className="h-px w-full bg-border/40" />

                        {/* Mobile */}
                        <motion.div
                          custom={3}
                          variants={fieldVariants}
                          initial="hidden"
                          animate="visible"
                          className="flex items-center gap-4 py-3"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Phone className="h-5 w-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                              Mobile
                            </span>
                            <span className="text-sm font-bold text-foreground/90">
                              {profile?.phone ? `+${profile.phone}` : "N/A"}
                            </span>
                          </div>
                        </motion.div>
                        <div className="h-px w-full bg-border/40" />

                        {/* Class */}
                        {profile?.class && (
                          <>
                            <motion.div
                              custom={4}
                              variants={fieldVariants}
                              initial="hidden"
                              animate="visible"
                              className="flex items-center gap-4 py-3"
                            >
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <School className="h-5 w-5" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                  Class
                                </span>
                                <span className="text-sm font-bold text-foreground/90">
                                  {profile.class.name || "N/A"}
                                </span>
                              </div>
                            </motion.div>
                            <div className="h-px w-full bg-border/40" />
                          </>
                        )}

                        {/* EzyGo Created At */}
                        <motion.div
                          custom={5}
                          variants={fieldVariants}
                          initial="hidden"
                          animate="visible"
                          className="flex items-center gap-4 py-3"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Clock className="h-5 w-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                              Joined EzyGo
                            </span>
                            <span className="text-sm font-bold text-foreground/90">
                              {joinedDateString}
                            </span>
                          </div>
                        </motion.div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>
            </Tabs>
          </motion.div>
        </motion.div>
      </motion.main>
    </div>
  );
}

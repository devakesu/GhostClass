"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { useProfile } from "@/hooks/users/profile";
import { useUser } from "@/hooks/users/user";
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
import { Camera, Loader2 } from "lucide-react"; 
import { toast } from "sonner"; 

import UserPlaceholder from "@/assets/user.png";
import { uploadUserAvatar } from "@/hooks/users/upload-avatar";
import { compressImage, redact } from "@/lib/utils";
import { Loading as CompLoading } from "@/components/loading";

export default function ProfileClient() {
  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = useProfile();
  const { data: user, isLoading: userLoading } = useUser();

  const [isUploading, setIsUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLoading = profileLoading || userLoading;

  // Priority: 1. User Upload Preview -> 2. Fetched DB URL -> 3. Fallback Placeholder
  const displayAvatar = avatarPreview || profile?.avatar_url || UserPlaceholder;

  // Revoke object URL to avoid memory leaks
  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  const handleAvatarClick = useCallback(() => {
    if (!isLoading && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [isLoading, isUploading]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user?.id) {
      toast.error("User not found. Please reload.");
      return;
    }

    const originalFile = event.target.files?.[0];
    if (!originalFile) return;

    if (!originalFile.type.startsWith("image/")) {
      toast.error("Please upload an image file.");
      return;
    }

    // Keep track of the temporary URL to clean it up later
    let optimisticPreviewUrl: string | null = null;

    try {
      setIsUploading(true);

      // 1. Optimistic UI: Show immediate local preview
      optimisticPreviewUrl = URL.createObjectURL(originalFile);
      setAvatarPreview(optimisticPreviewUrl);

      let fileToUpload: File = originalFile;

      // 2. Compression Logic
      if (originalFile.size > 5 * 1024 * 1024) {
        toast.info("Compressing large image...", { duration: 2000 });
        try {
          const compressed = await compressImage(originalFile, 0.7);
          // Compress harder if first pass is still > 5MB
          const bestCompressed =
            compressed.size > 5 * 1024 * 1024
              ? await compressImage(originalFile, 0.5)
              : compressed;
          // Final guard: reject cleanly if still over limit after best-effort compression
          // rather than letting a 50 MB file reach Supabase and get a server error.
          if (bestCompressed.size > 5 * 1024 * 1024) {
            throw new Error(
              "Image is too large to upload even after compression. Please choose a smaller image (under 5 MB)."
            );
          }
          fileToUpload = bestCompressed;
        } catch (error) {
          logger.warn("Compression failed, falling back to original:", error);
          
          // Report non-fatal error to Sentry
          Sentry.captureException(error, { 
              tags: { type: "image_compression", location: "ProfileClient/handleFileChange" },
              // file_name omitted — original filenames are user PII (e.g. "john_doe_photo.jpg").
              extra: { original_size: originalFile.size, user_id: redact("id", String(user?.id ?? "unknown")) }
          });
          toast.warning("Could not compress image. Uploading original.");
        }
      }
      
      // 3. Upload to Supabase
      const newAvatarUrl = await uploadUserAvatar(fileToUpload);
      
      // 4. Success: Switch to remote URL
      setAvatarPreview(newAvatarUrl);
      toast.success("Profile picture updated!");
      
      // Sync DB changes
      refetchProfile(); 

    } catch (error: any) {
      logger.error("Upload error:", error);
      
      // 5. Revert to previous valid avatar on failure (Better UX than showing nothing)
      setAvatarPreview(profile?.avatar_url || null); 
      
      toast.error(error.message || "Failed to update profile picture");
      
      // Report fatal error to Sentry
      Sentry.captureException(error, {
          tags: { type: "avatar_upload", location: "ProfileClient/handleFileChange"  },
          // file_name omitted — original filenames are user PII (e.g. "john_doe_photo.jpg").
          extra: { user_id: redact("id", String(user?.id ?? "unknown")), file_size: originalFile.size }
      });

    } finally {
      setIsUploading(false);
      
      // Reset input to allow re-uploading the same file if needed
      if (fileInputRef.current) fileInputRef.current.value = "";

      // 6. Cleanup Memory: Revoke the blob URL now that we have the real URL (or reverted)
      if (optimisticPreviewUrl) {
          URL.revokeObjectURL(optimisticPreviewUrl);
      }
    }
  };

  const tabContentVariants : Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeInOut" } },
  };

  const fieldVariants = {
    hidden: { opacity: 0 },
    visible: (custom: number) => ({ opacity: 1, transition: { delay: custom * 0.1, duration: 0.3 } }),
  };

  if (isLoading) {
    return <CompLoading />;
  }

  return (
    <div className="min-h-[90vh] bg-background pb-6">
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto py-4 md:py-8 px-4 md:px-6"
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
            <Card className="relative overflow-hidden border-border/50 shadow-sm bg-card/50 backdrop-blur-sm">
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
                  />
                  
                  <div 
                    role="button"
                    tabIndex={0}
                    onClick={handleAvatarClick}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleAvatarClick();
                      }
                    }}
                    aria-label="Change profile picture"
                    className={`relative w-full h-full rounded-full ring-4 ring-background border-2 border-white/10 z-10 cursor-pointer transition-all duration-300 ${isUploading ? 'opacity-80' : 'group-hover:opacity-90'}`}
                  >
                    <Image
                      src={displayAvatar}
                      alt="Profile"
                      fill
                      className="object-cover rounded-full" 
                      priority
                      unoptimized={!!avatarPreview?.startsWith('blob:')}
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                    
                    {/* Loading Overlay */}
                    {isUploading && (
                      <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center z-30">
                        <Loader2 className="w-8 h-8 text-white animate-spin" aria-label="Loading" />
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
                    {/* Fall back to username when both name fields are null/undefined so the
                        heading is never empty (layout gap + inaccessible blank heading). */}
                    {(profile?.first_name || profile?.last_name)
                      ? `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()
                      : (user?.username ?? "Your Name")}
                  </h3>
                  <p className="text-muted-foreground text-sm lowercase font-medium">
                    @{user?.username}
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
              <TabsList className="grid w-full grid-cols-2 max-md:mt-4 rounded-[12px] bg-[#2B2B2B]">
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
                  <Card className="border-border/50 py-0 shadow-sm bg-card/50 backdrop-blur-sm">
                    <CardHeader className="p-6 pb-2 border-b border-border/40 bg-muted/20">
                      <CardTitle className="text-lg">
                        Personal Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6">
                      {profile ? (
                        <ProfileForm profile={profile} />
                      ) : (
                        <div className="text-muted-foreground text-sm">Failed to load profile data</div>
                      )}
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
                    <CardHeader className="p-4 md:p-6 flex flex-col gap-0.5">
                      <CardTitle className="text-lg">
                        Account Settings
                      </CardTitle>
                      <CardDescription className="md:block font-medium">
                        Fetched from Ezygo. Cannot be changed here.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6">
                      <div className="space-y-4 md:space-y-6">
                        <div className="grid grid-cols-1 min-[1300px]:grid-cols-2 gap-5 text-sm">
                          
                          {/* Username */}
                          <motion.div className="space-y-2" custom={0} variants={fieldVariants} initial="hidden" animate="visible">
                            <h3 className="text-sm font-normal">Username</h3>
                            <div className="px-2 pl-3 py-2 bg-secondary/50 lowercase font-sm rounded-[12px] text-sm font-medium">
                              {user?.username}
                            </div>
                          </motion.div>
                          
                          {/* Email */}
                          <motion.div className="space-y-2" custom={1} variants={fieldVariants} initial="hidden" animate="visible">
                            <h3 className="text-sm font-medium">Email</h3>
                            <div className="px-2 pl-3 py-2 bg-secondary/50 lowercase font-sm rounded-[12px] text-sm font-medium">
                              {user?.email}
                            </div>
                          </motion.div>
                          
                          {/* Mobile */}
                          <motion.div className="space-y-2" custom={2} variants={fieldVariants} initial="hidden" animate="visible">
                            <h3 className="text-sm font-medium">Mobile</h3>
                            <div className="px-2 pl-3 py-2 bg-secondary/50 lowercase font-sm rounded-[12px] text-sm font-medium">
                              +{user?.mobile}
                            </div>
                          </motion.div>
                          
                          {/* Created At */}
                          <motion.div className="space-y-2" custom={3} variants={fieldVariants} initial="hidden" animate="visible">
                            <h3 className="text-sm font-medium">Account Created</h3>
                            <div className="px-2 pl-3 py-2 bg-secondary/50 lowercase font-sm rounded-[12px] text-sm font-medium">
                              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "N/A"}
                            </div>
                          </motion.div>

                        </div>
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
import { createClient } from "@/lib/supabase/client";
import { redact } from "@/lib/utils";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

/**
 * Strict MIME-type → file-extension whitelist for avatar uploads.
 *
 * SVG is intentionally excluded: SVGs can embed <script> tags and execute JS
 * when served as image/svg+xml, making them an XSS vector.
 * The extension is always derived from this map — never from the user-supplied
 * filename — so a file renamed to "evil.html" cannot create an .html object
 * in storage even if it passes the MIME check.
 * The contentType written to Supabase is also the map key, not file.type,
 * so the stored object is always served with a known-safe content type.
 */
const ALLOWED_AVATAR_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Uploads user avatar to Supabase storage and updates user profile.
 * Handles authentication, file upload, URL generation, and database update.
 * Automatically cleans up storage on failure.
 *
 * Only JPEG, PNG, and WebP are accepted; SVG and all other types are rejected
 * to prevent XSS via crafted images.
 *
 * @param file - Avatar image file to upload
 * @returns Promise resolving to public URL of uploaded avatar
 * @throws {Error} If user not authenticated, file type is unsupported, or upload fails
 *
 * Process:
 * 1. Validate MIME type against whitelist
 * 2. Authenticate user
 * 3. Upload file to Supabase storage (avatars bucket)
 * 4. Generate public URL
 * 5. Update user profile with new avatar URL
 * 6. Cleanup on failure
 *
 * @example
 * ```ts
 * const avatarUrl = await uploadUserAvatar(imageFile);
 * console.log('New avatar URL:', avatarUrl);
 * ```
 */
export async function uploadUserAvatar(file: File) {
  const supabase = createClient();
  
  // 1. Get Current User
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
      const err = new Error("User not authenticated during avatar upload");
      Sentry.captureException(err, { tags: { type: "avatar_auth_error", location: "uploadUserAvatar" } });
      throw err;
  }

  try {
      // 2. Validate MIME type against whitelist — derive extension and content-type
      // from the map, never from user-controlled file.name or file.type.
      const validatedContentType = file.type;
      const fileExt = ALLOWED_AVATAR_MIME_TO_EXT[validatedContentType];
      if (!fileExt) {
        throw new Error(
          `Unsupported file type: "${validatedContentType}". Only JPEG, PNG, and WebP images are allowed.`
        );
      }

      // 3. Prepare File Path using the whitelisted extension
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // 4. Upload File directly to Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
            upsert: true,
            // Use the map key as the stored content-type, not the raw file.type value,
            // so Supabase always serves the object with a known-safe MIME type.
            contentType: validatedContentType,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // 4. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Guard: getPublicUrl() is synchronous and cannot fail — it constructs the URL
      // client-side from NEXT_PUBLIC_SUPABASE_URL. A misconfigured env var would silently
      // write a wrong-project URL to the DB without this check.
      const supabaseProjectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseProjectUrl && !publicUrl.startsWith(supabaseProjectUrl)) {
        throw new Error(
          `Avatar URL origin mismatch: expected URL starting with ${supabaseProjectUrl} but got ${publicUrl}. Check NEXT_PUBLIC_SUPABASE_URL.`
        );
      }

      // 5. Update User Profile in DB
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('auth_id', user.id);

      if (updateError) {
        const profileUpdateError = new Error(`Profile update failed: ${updateError.message}`);
        try {
          await supabase.storage.from('avatars').remove([filePath]);
        } catch (cleanupErr) {
          logger.warn("Avatar cleanup after profile update failure failed (non-critical):", cleanupErr);
          Sentry.captureException(cleanupErr, {
            level: "warning",
            tags: { type: "avatar_cleanup_fail", location: "uploadUserAvatar_cleanupOnUpdateFail" },
          });
        }
        throw profileUpdateError;
      }

      // 6. Cleanup: Delete old avatars in the background
      (async () => {
          try {
            // Bound the list call: limit prevents unbounded pagination; AbortSignal.timeout
            // ensures the unawaited cleanup doesn't hold a connection open indefinitely.
            const cleanupSignal = AbortSignal.timeout(15_000);
            const { data: files } = await supabase.storage
              .from('avatars')
              .list(user.id, { limit: 100 }, { signal: cleanupSignal });

            if (files && files.length > 0) {
              const filesToDelete = files
                .filter((f) => f.name !== fileName) // Keep the new one
                .map((f) => `${user.id}/${f.name}`);

              if (filesToDelete.length > 0) {
                await supabase.storage.from('avatars').remove(filesToDelete);
              }
            }
          } catch (cleanupErr) {
            logger.warn("Background cleanup failed (non-critical):", cleanupErr);
            Sentry.captureException(cleanupErr, { 
                level: "warning",
                tags: { type: "avatar_cleanup_fail", location: "uploadUserAvatar" } 
            });
          }
      })();

      return publicUrl;

  } catch (error: unknown) {
      logger.error("Avatar Upload Flow Failed:", error);
      Sentry.captureException(error, {
          tags: { type: "avatar_upload_critical", location: "uploadUserAvatar" },
          extra: { 
              userId: redact("id", String(user.id)),
              fileSize: file.size,
              fileType: file.type
          }
      });
      throw error;
  }
}
"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock as LockIcon, Mail, Phone, User } from "lucide-react"; 

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import axios, { AxiosError } from "axios"; 
import { getCsrfToken } from "@/lib/axios";
import { useCSRFToken } from "@/hooks/use-csrf-token"; 

import { Loading } from "@/components/loading";
import { PasswordResetForm } from "./password-reset-form";
import { motion, HTMLMotionProps, Variants } from "framer-motion";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/client";
import { CSRF_HEADER } from "@/lib/security/csrf-constants";
import { logger } from "@/lib/logger";
import { isAuthSessionMissingError } from "@/lib/security/auth";
import { DEFAULT_TARGET_PERCENTAGE } from "@/providers/user-settings";

interface LoginFormProps extends HTMLMotionProps<"div"> {
  className?: string;
}

interface ErrorResponse {
  message: string;
}

const loginMethodProps = {
  username: {
    label: "Username",
    type: "text",
    placeholder: "academic_weapon_fr",
  },
  email: {
    label: "Email",
    type: "email",
    placeholder: "cooked@attendance.edu",
  },
  phone: {
    label: "Phone",
    type: "tel",
    placeholder: "919234567890",
  },
};

const PASSWORD_VALIDATION = {
  MIN_LENGTH: 6,  // Conservative (most systems use 6-8)
  MAX_LENGTH: 128, // Prevent DOS attacks
} as const;

const validatePassword = (password: string): string | null => {
  // 1. Check empty
  if (!password || password.trim().length === 0) {
    return "Password is required";
  }
  
  // 2. Check minimum length
  if (password.length < PASSWORD_VALIDATION.MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_VALIDATION.MIN_LENGTH} characters`;
  }
  
  // 3. Check maximum length (prevent DOS)
  if (password.length > PASSWORD_VALIDATION.MAX_LENGTH) {
    return `Password must be less than ${PASSWORD_VALIDATION.MAX_LENGTH} characters`;
  }
  
  return null; // Valid
};

export function LoginForm({ className, ...props }: LoginFormProps) {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordResetForm, setShowPasswordResetForm] = useState(false);
  const [loginMethod, setLoginMethod] = useState<
    "username" | "email" | "phone"
  >("username");
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    stay_logged_in: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Initialize CSRF token
  useCSRFToken();
  
  // Create stable Supabase client reference to avoid unnecessary re-renders
  // SAFETY: The Supabase client returned by createClient() is stateless and safe to memoize.
  // It doesn't contain any user-specific state - auth state is managed separately via
  // Supabase's internal session management. Memoizing prevents unnecessary client recreation
  // on each render, which could cause performance issues and potential memory leaks.
  //
  // WARNING FOR FUTURE DEVELOPERS:
  // This memoization creates a hidden assumption: createClient() must ALWAYS return a stateless,
  // user-agnostic client. If createClient() were ever changed to return a user-specific client
  // (e.g., based on auth state), this memoization would break and cause bugs. In such a case,
  // either remove the memoization entirely or use a ref (useRef) instead to make it clearer
  // this is meant to be a stable reference that doesn't depend on component state.
  const supabase = useMemo(() => createClient(), []);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value;
    
    // Update form data
    setFormData({ ...formData, password });
    
    // Real-time validation
    if (password.length > 0 && password.length < PASSWORD_VALIDATION.MIN_LENGTH) {
      setPasswordError(`At least ${PASSWORD_VALIDATION.MIN_LENGTH} characters required`);
    } else if (password.length > PASSWORD_VALIDATION.MAX_LENGTH) {
      setPasswordError(`No more than ${PASSWORD_VALIDATION.MAX_LENGTH} characters allowed`);
    } else {
      setPasswordError(null);
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    const checkUser = async () => {
      setIsLoadingPage(true);
  
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        // Ignore auth session missing errors - they're expected when not logged in
        if (error && !isAuthSessionMissingError(error)) {
          throw error;
        }
        if (user && isMounted) {
          router.push("/dashboard");
          return;
        }
      } catch (err) {
        if (err instanceof Error && !isAuthSessionMissingError(err)) {
          logger.error("Unexpected error checking user session:", err);
        }
      } finally {
        if (isMounted) {
          setIsLoadingPage(false);
        }
      }
    };
    checkUser();
    
    return () => {
      isMounted = false;
    };
    // supabase is memoized with empty deps, so including it here is safe and stable
  }, [router, supabase]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const passwordError = validatePassword(formData.password);
      if (passwordError) {
        setError(passwordError);
        setIsLoading(false);
        return;
      }

      // 1. Login to Ezygo (public endpoint - exempt from CSRF, listed in PUBLIC_PATHS)
      const response = await axios.post("/api/backend/login", formData);
      const token = response.data.access_token;

      if (!token) throw new Error("Invalid response from server");

      // 2. Securely Save Token (Bridge to GhostClass) - requires CSRF token
      const csrfToken = getCsrfToken();
      
      const saveTokenResponse = await axios.post("/api/auth/save-token", 
        { token }, 
        { 
          headers: csrfToken ? { [CSRF_HEADER]: csrfToken } : {}
        }
      );

      // 3. Pre-populate settings from save-token response for immediate availability
      // This eliminates the 5-10 second delay showing defaults on fresh login
      const settings = saveTokenResponse.data?.settings;
      
      // Get user ID first - this is important before storing user-bound settings
      // If this fails, we will skip settings prefetch but still allow navigation
      const { data: { user }, error: getUserError } = await supabase.auth.getUser();
      if (getUserError || !user) {
        // User cannot be retrieved after successful login; log and continue without
        // user-bound settings prefetch. The dashboard will fetch settings from DB.
        const errorMsg = "User session not available after successful login; skipping settings prefetch";
        logger.error(errorMsg, {
          context: "LoginForm/handleSubmit",
          error: getUserError,
        });
      } else if (settings) {
        // Validate user ID matches between login response and Supabase session
        // This prevents storing settings under an incorrect user ID.
        //
        // API RESPONSE SCHEMAS:
        // - Current schema (preferred):   { user: { id: string, ... }, settings: ... }
        // - Legacy schema (back-compat):  { user_id: string, settings: ... }
        //
        // We first try the current nested user.id shape and only fall back to the
        // legacy top-level user_id field to support older backend responses while
        // the authentication/bridge services are being fully migrated.
        //
        // Once all callers and services have been updated to return the current
        // schema, the user_id fallback can be safely removed to simplify this code.
        const responseUserId = saveTokenResponse.data?.user?.id ?? saveTokenResponse.data?.user_id;
        if (responseUserId && user.id !== responseUserId) {
          logger.error("User ID mismatch between login response and Supabase session", {
            context: "LoginForm/handleSubmit",
            responseUserId,
            sessionUserId: user.id,
          });
          // Skip storing settings to avoid data corruption
          // Settings will be fetched from DB on the dashboard, so this is non-blocking
        } else {
          // Validate and normalize settings values before using them to prevent
          // prototype pollution or injection attacks
          const bunkEnabled =
            typeof settings.bunk_calculator_enabled === "boolean"
              ? settings.bunk_calculator_enabled
              : true;
          const rawTarget = settings.target_percentage;
          
          // Normalize target percentage using the same logic as normalizeTarget in user-settings.ts
          // This handles decimal percentages (e.g., 75.5) by rounding, and ensures values are
          // within valid range [1-100]. If the value is invalid, falls back to DEFAULT_TARGET_PERCENTAGE.
          let targetPercentage = DEFAULT_TARGET_PERCENTAGE;
          
          if (typeof rawTarget === "number" && Number.isFinite(rawTarget)) {
            const normalizedTarget = Math.round(rawTarget);
            if (normalizedTarget >= 1 && normalizedTarget <= 100) {
              targetPercentage = normalizedTarget;
            }
          }
          
          const bunkValue = bunkEnabled.toString();
          const targetValue = targetPercentage.toString();
          
          try {
            // Store settings with user ID to ensure they belong to the current user
            // Use sessionStorage for reliable cross-navigation transfer
            // Include userId in the stored data to prevent cross-user leakage if hook stays mounted
            sessionStorage.setItem("prefetchedSettings", JSON.stringify({
              userId: user.id,
              settings: {
                bunk_calculator_enabled: bunkEnabled,
                target_percentage: targetPercentage
              }
            }));
            
            // Also update localStorage for persistence across sessions
            localStorage.setItem(`showBunkCalc_${user.id}`, bunkValue);
            localStorage.setItem(`targetPercentage_${user.id}`, targetValue);
          } catch (storageError) {
            // Storage errors are non-critical - log but continue
            // Storage can fail in private browsing mode or when storage is disabled
            logger.dev("Failed to write returned settings to storage after login", {
              context: "LoginForm/handleSubmit",
              error: storageError instanceof Error ? storageError.message : String(storageError),
            });
          }
        }
      } else {
        // Fallback: apply default settings when none are returned from save-token
        // This is expected for brand new users who haven't set up their preferences yet
        // We apply sensible defaults and let the settings provider create the DB record
        const defaultSettings = {
          bunk_calculator_enabled: true,
          target_percentage: 75,
        };

        try {
          // We intentionally do NOT write to sessionStorage.prefetchedSettings here so
          // that the settings provider will still create a user_settings row in the DB.
          // Writing prefetchedSettings would cause the provider to skip DB initialization.
          localStorage.setItem(`showBunkCalc_${user.id}`, defaultSettings.bunk_calculator_enabled.toString());
          localStorage.setItem(`targetPercentage_${user.id}`, defaultSettings.target_percentage.toString());
        } catch (storageError) {
          // Storage errors are non-critical - log but continue
          logger.dev("Failed to write default settings to storage after login", {
            context: "LoginForm/handleSubmit",
            error: storageError instanceof Error ? storageError.message : String(storageError),
          });
        }

        // For new users, this is expected behavior - log at dev level to reduce monitoring noise
        // since this is a normal part of the new user onboarding flow
        logger.dev("No settings returned from /api/auth/save-token; applied default settings for new user.", {
          context: "LoginForm/handleSubmit",
        });
      }

      // 4. Success - navigate to dashboard
      router.push("/dashboard");

    } catch (error) {
      const err = error as AxiosError<ErrorResponse>;
      setIsLoading(false);
      
      let errorMsg = "An unexpected error occurred";

      if (err.config?.url?.includes("save-token")) {
         // This is a critical failure in OUR backend bridge
         errorMsg = "Secure session setup failed. Please try again.";
         Sentry.captureException(error, { tags: { type: "auth_bridge_client_error", location: "LoginForm/handleSubmit" } });
      } else if (err.response?.status === 401) {
         // User error (wrong password) - No Sentry needed
         errorMsg = "Invalid credentials. Please check your password.";
      } else if (err.response?.data?.message) {
         errorMsg = err.response.data.message;
      } else if (err.code === "ERR_NETWORK") {
         errorMsg = "Network error. Please check your connection.";
      }
      setError(errorMsg);

      // Announce error to screen readers
      if (typeof window !== 'undefined') {
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'alert');
        announcement.setAttribute('aria-live', 'assertive');
        announcement.className = 'sr-only';
        announcement.textContent = errorMsg;
        document.body.appendChild(announcement);
        setTimeout(() => document.body.removeChild(announcement), 5000);
      }
      logger.error("Login failed:", err);
    }
  };

  // Animation Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { when: "beforeChildren", staggerChildren: 0.1, duration: 0.3 },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.3 } },
  };

  const logoVariants : Variants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: { type: "spring", stiffness: 400, damping: 10, duration: 0.6 },
    },
  };

  // Show loading only when the page is in a loading state
  if (isLoadingPage) return <Loading />;

  if (showPasswordResetForm) {
    return (
      <PasswordResetForm
        className={className}
        onCancel={() => setShowPasswordResetForm(false)}
      />
    );
  }

  return (
    <motion.div
      className={cn("flex flex-col gap-3 login-page", className)}
      {...props}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          
          {/* Logo Section */}
          <motion.div
            className="flex flex-col items-center gap-1.5 -mt-8 sm:-mt-10" 
            variants={logoVariants}
          >
            <div className="flex justify-center items-center flex-col">
              <div className="relative w-85 h-30 sm:w-130 sm:h-45 overflow-hidden">
                <Image 
                  src="/logo.png" 
                  alt="GhostClass Logo"
                  fill
                  className="object-contain object-bottom transition-transform group-hover:scale-105" 
                  priority
                  placeholder="blur"
                  blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAAC4klEQVR4nO2T3U9SYRzHj5lNXV3IhVFic+vCaTdNL1ytorZmta66OK3sguUFqa14OxxejvCggBw4HOAIIgd8wUilo6IiCgoJCALlarrZvO8foR0Tx5xrXbW1+dk+F8/z3Z7fnu37g6Azzvj/4PPB+dbWvovNzd2X2tuFVVARqigWixUQKwSxlnOYFU/PTqXi0SvDFYFo9H6vyv9AbWAaAADnWCFWiH2o5MkBJz1loIDPr1Zphu+S3iWCDibJ6UjmoSUyyQULXh5gXFyaBrXsMIZhKhmGrCEZkqNm/A1gIcADPh+HpumqIlSs+G3ZAPbACvoQrs8zK1yM5bPx/MFWOLOrVM5EXr71r4hEvvAbhA53qp3RNqUr0oG6Q0/QiZBAMrUsFvuXJDJ66YXCFb6jtkXb1PbITWBfbAJ0uPbwmwwMV+ZIuMZvs91g5mNYonDwNffj5+e5xHdSQcXGRGRqR2xJ51FTmsGM26PKoeyYHE+GFGQio6TW9xS29T2FObmhNub9/frCKDBkHXo8LTDZo02QAExWS/UTjXYTcS9gt3YzHxnncvzL6lpun5oMbr3T6qJOlWZzR6VJ7Wq0qW2dNpPSaTJprD9Z0GjjuwO62L5Ou76vxZLfBrFCVo/lt4a0uTVCl1bZByMtEDDPXDUSgecW44hz2GCb9TrcwfHxT57x6fBrl32ug1AsPDXLl0Q4EkbM8hUZodiQmeUxGY6EpWbZvMwmXUBISUhuka6iFmkCtSKbqB2Nv3dh8ccuEOFClJ6+Tg15xfiAO2jQUAETcOA2wtNjxenbBHDX+wDJoQDFG8GsjV6A80ak1kYvSvG8KM6jUIpnlY40OhSOa6z0kWzuk5AcAMAF6IOMqKcxWyehdAoQifOZCPHc6senWlTGmcsATFazFSxV9VjoyJP3ZflxTWmhsMrdpawjekB9b5eyDobJGhgGF2CYqSwtUKnrx5aqePK+LP/T4v31Vp5xxr/hF2eVnXJoHTJgAAAAAElFTkSuQmCC"
                  sizes="(max-width: 640px) 340px, 520px"
                />
              </div>
            </div>
            
            <p className="text-center text-sm font-medium max-w-80.5 text-muted-foreground/80 -mt-2">
              {"Drop your ezygo credentials - we're just the aesthetic upgrade you deserved."}
            </p>
          </motion.div>

          {/* Input Section */}
          <div className="flex flex-col gap-4 mt-2"> 
            <motion.div className="grid gap-2" variants={itemVariants}>
              <div className="flex items-center justify-between">
                <Label htmlFor="login">
                  {loginMethodProps[loginMethod].label}
                </Label>
                <div className="flex gap-1">
                  {(["username", "email", "phone"] as const).map((method) => (
                    <Button
                      key={method}
                      type="button"
                      size="icon"
                      variant={loginMethod === method ? "secondary" : "ghost"}
                      className="h-6 w-6 p-3"
                      onClick={() => setLoginMethod(method)}
                      aria-label={method === "username" ? "Login with username" : method === "email" ? "Login with email" : "Login with phone"}
                    >
                      {method === "username" && <User className="h-4 w-4" aria-hidden="true" />}
                      {method === "email" && <Mail className="h-4 w-4" aria-hidden="true" />}
                      {method === "phone" && <Phone className="h-4 w-4" aria-hidden="true" />}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <Input
                  id="login"
                  type={loginMethodProps[loginMethod].type}
                  value={formData.username}
                  className="custom-input bg-secondary/10 border-white/10 focus:border-purple-500/50 transition-colors"
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  placeholder={loginMethodProps[loginMethod].placeholder}
                  name={loginMethodProps[loginMethod].label.toLowerCase()}
                  required
                />
              </div>
            </motion.div>

            <motion.div className="grid gap-2" variants={itemVariants}>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => setShowPasswordResetForm(true)}
                  className="text-[13px] text-muted-foreground hover:text-primary duration-100 font-medium"
                  aria-label="Forgot password"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  value={formData.password}
                  className={cn(
                    "custom-input bg-secondary/10 border-white/10 focus:border-purple-500/50 transition-colors",
                    passwordError && "border-red-500/50 focus:border-red-500"
                  )}
                  onChange={handlePasswordChange}
                  aria-invalid={!!passwordError}
                  aria-describedby={passwordError ? "password-error" : undefined}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent mr-1.5"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 opacity-70" aria-hidden="true" />
                  ) : (
                    <Eye className="h-5 w-5 opacity-70" aria-hidden="true" />
                  )}
                </Button>
              </div>
            </motion.div>

            {passwordError && (
                  <p id="password-error" className="text-xs text-red-400 mt-1">
                    {passwordError}
                  </p>
            )}

            <motion.div variants={itemVariants}>
              <Button
                type="submit"
                className="w-full font-semibold min-h-11.5 rounded-[12px] mt-2 font-sm shadow-sm hover:shadow-md transition-all"
                disabled={isLoading || !!passwordError}
              >
                {isLoading ? "Logging in..." : "Login"}
              </Button>
            </motion.div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center text-sm text-red-400 border rounded-lg bg-red-500/10 border-red-500/20 p-2"
              >
                {error}
              </motion.div>
            )}
          </div>
        </div>

        {/* Disclaimer Section */}
        <div className="mt-6 flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-700">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 mb-3">
            <LockIcon className="h-3 w-3 text-purple-400" />
            <span className="text-[11px] font-bold tracking-widest uppercase text-purple-300/80">
              Ghosts don&apos;t snoop 😁
            </span>
          </div>
          
          <p className="text-xs text-muted-foreground/80 max-w-[320px] leading-relaxed text-center italic">
            Your <span className="text-foreground font-medium">EzyGo</span> password is safe. 
            We strictly <span className="text-foreground font-medium">do not read, store, or share</span> your login password. 
            GhostClass is just here to help you skip. 👻
          </p>
        </div>
      </form>
    </motion.div>
  );
}
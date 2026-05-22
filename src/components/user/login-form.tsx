"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock as LockIcon, Mail, Phone, User } from "lucide-react"; 

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import axios from "@/lib/axios";
import { AxiosError } from "axios"; 
import { useCSRFToken } from "@/hooks/use-csrf-token"; 
import { useQueryClient } from "@tanstack/react-query";

import { PasswordResetForm } from "./password-reset-form";
import { motion, HTMLMotionProps, Variants } from "framer-motion";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/client";
import { logger } from "@/lib/logger";
import { isAuthSessionMissingError, isSupabaseLockTimeoutError } from "@/lib/security/auth";
import { DEFAULT_TARGET_PERCENTAGE } from "@/providers/user-settings";
import NProgress from "nprogress";

interface LoginFormProps extends HTMLMotionProps<"div"> {
  className?: string;
}

interface ErrorResponse {
  message: string;
}

interface SaveTokenData {
  userId?: string | null;
  settings?: {
    bunk_calculator_enabled?: boolean;
    target_percentage?: number;
    disabled_courses?: string[];
  };
}

type LoginMethod = "username" | "email" | "phone";

function getLoginMethodProps(method: LoginMethod) {
  switch (method) {
    case "email":
      return {
        label: "Email",
        type: "email",
        placeholder: "cooked@attendance.edu",
      };
    case "phone":
      return {
        label: "Phone",
        type: "tel",
        placeholder: "919234567890",
      };
    case "username":
    default:
      return {
        label: "Username",
        type: "text",
        placeholder: "academic_weapon_fr",
      };
  }
}

function getLoginMethodAriaLabel(method: LoginMethod): string {
  switch (method) {
    case "email":
      return "Login with email";
    case "phone":
      return "Login with phone";
    case "username":
    default:
      return "Login with username";
  }
}

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

const detectLoginMethod = (value: string): LoginMethod => {
  const trimmedValue = value.trim();

  if (!trimmedValue) return "username";

  // Switch early to email mode once users type an @ to keep UX responsive.
  if (trimmedValue.includes("@")) return "email";

  const digitsOnly = trimmedValue.replace(/\D/g, "");
  const phoneLikeCharsOnly = /^[+\d\s()-]+$/.test(trimmedValue);
  if (phoneLikeCharsOnly && digitsOnly.length >= 7) {
    return "phone";
  }

  return "username";
};

function clearLocalUserStorage(): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.clear();
      sessionStorage.removeItem("prefetchedSettings");
    } catch {
      // Ignore
    }
  }
}

async function verifyActiveSessionAndCleanup(
  supabase: ReturnType<typeof createClient>,
  router: ReturnType<typeof useRouter>,
  isMounted: boolean
): Promise<void> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    const isMissing = error ? isAuthSessionMissingError(error) : false;
    const isLock = error ? isSupabaseLockTimeoutError(error) : false;

    if (error && !isMissing && !isLock) {
      throw error;
    }

    if (session?.user) {
      if (isMounted) router.push("/dashboard");
      return;
    }

    if (!isLock) {
      clearLocalUserStorage();
    }
  } catch (err) {
    if (err instanceof Error) {
      if (isSupabaseLockTimeoutError(err)) {
        logger.dev("Supabase auth lock timeout during page-load session check");
      } else if (!isAuthSessionMissingError(err)) {
        logger.error("Unexpected error checking user session:", err);
      }
    }
  }
}

async function ensureCsrfTokenPreloaded(): Promise<void> {
  const { getCsrfToken, setCsrfToken } = await import("@/lib/axios");
  if (!getCsrfToken()) {
    try {
      const csrfResponse = await fetch("/api/csrf", { credentials: "include" });
      if (csrfResponse.ok) {
        const { token } = await csrfResponse.json();
        setCsrfToken(token);
      }
    } catch (csrfErr) {
      logger.dev("CSRF pre-fetch failed during login submission; proceeding with default interceptor logic", csrfErr);
    }
  }
}

function writeCustomSettingsToStorage(
  supabaseUserId: string,
  settings: NonNullable<SaveTokenData["settings"]>,
  queryClient: ReturnType<typeof useQueryClient>
): void {
  const bunkEnabled = typeof settings.bunk_calculator_enabled === "boolean" ? settings.bunk_calculator_enabled : true;
  const rawTarget = settings.target_percentage;

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
    sessionStorage.setItem("prefetchedSettings", JSON.stringify({
      userId: supabaseUserId,
      settings: {
        bunk_calculator_enabled: bunkEnabled,
        target_percentage: targetPercentage
      }
    }));

    localStorage.setItem(`showBunkCalc_${supabaseUserId}`, bunkValue);
    localStorage.setItem(`targetPercentage_${supabaseUserId}`, targetValue);

    queryClient.setQueryData(["userSettings", supabaseUserId], {
      bunk_calculator_enabled: bunkEnabled,
      target_percentage: targetPercentage,
      disabled_courses: settings.disabled_courses || []
    });
  } catch (storageError) {
    const msg = storageError instanceof Error ? storageError.message : String(storageError);
    logger.dev("Failed to write returned settings to storage after login", {
      context: "LoginForm/handleSubmit",
      error: msg,
    });
  }
}

function writeDefaultSettingsToStorage(supabaseUserId: string): void {
  try {
    localStorage.setItem(`showBunkCalc_${supabaseUserId}`, "true");
    localStorage.setItem(`targetPercentage_${supabaseUserId}`, "75");
  } catch (storageError) {
    const msg = storageError instanceof Error ? storageError.message : String(storageError);
    logger.dev("Failed to write default settings to storage after login", {
      context: "LoginForm/handleSubmit",
      error: msg,
    });
  }
  logger.dev("No settings returned from /api/auth/save-token; applied default settings for new user.", {
    context: "LoginForm/handleSubmit",
  });
}

function persistPrefetchedSettings(
  data: SaveTokenData | undefined,
  queryClient: ReturnType<typeof useQueryClient>
): void {
  const settings = data?.settings;
  const supabaseUserId = data?.userId ?? null;

  if (!supabaseUserId) {
    logger.error("User ID not returned from save-token; skipping settings prefetch", {
      context: "LoginForm/handleSubmit",
    });
    return;
  }

  if (settings) {
    writeCustomSettingsToStorage(supabaseUserId, settings, queryClient);
  } else {
    writeDefaultSettingsToStorage(supabaseUserId);
  }
}

function announceToScreenReader(errorMsg: string): void {
  if (typeof window !== 'undefined' && document.body) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'alert');
    announcement.setAttribute('aria-live', 'assertive');
    announcement.className = 'sr-only';
    announcement.textContent = errorMsg;
    document.body.appendChild(announcement);
    setTimeout(() => {
      if (document.body?.contains(announcement)) {
        document.body.removeChild(announcement);
      }
    }, 5000);
  }
}

export function LoginForm({ className, ...props }: LoginFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const manuallySelectedLoginMethodRef = useRef<LoginMethod | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordResetForm, setShowPasswordResetForm] = useState(false);
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("username");
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

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const loginValue = e.target.value;
    const inferredMethod = detectLoginMethod(loginValue);

    setFormData((prev) => ({ ...prev, username: loginValue }));

    // Preserve explicit email/phone selector choices while typing ambiguous input
    const manuallySelectedMethod = manuallySelectedLoginMethodRef.current;
    if (manuallySelectedMethod && inferredMethod === "username") {
      setLoginMethod(manuallySelectedMethod);
      return;
    }

    manuallySelectedLoginMethodRef.current = null;
    setLoginMethod(inferredMethod);
  };

  useEffect(() => {
    let isMounted = true;
    
    const checkUser = () => {
      void verifyActiveSessionAndCleanup(supabase, router, isMounted);
    };
    checkUser();
    
    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    NProgress.start();

    try {
      const passwordError = validatePassword(formData.password);
      if (passwordError) {
        setError(passwordError);
        setIsLoading(false);
        return;
      }

      await ensureCsrfTokenPreloaded();

      // 1. Login to Ezygo (public endpoint)
      const response = await axios.post("login", {
        username: formData.username.trim(),
        password: formData.password.trim(),
        stay_logged_in: true
      });
      
      const token = response.data.access_token || response.data.token;
      if (!token) throw new Error("Invalid response from server: Access token missing");

      // 2. Securely Save Token (Bridge to GhostClass)
      const saveTokenResponse = await axios.post("/api/auth/save-token", { token }, { baseURL: "/" });

      // 3. Persist returned user preferences cleanly
      persistPrefetchedSettings(saveTokenResponse.data, queryClient);

      // 4. Success - navigate to dashboard
      // Use a full navigation to ensure server-side middleware runs and
      // the client receives any HTTP-only Supabase session cookies that were
      // set by the /api/auth/save-token response. A client-side push can
      // render the protected layout before cookies are available which
      // caused an immediate logout previously.
      if (typeof window !== "undefined") {
        window.location.href = "/dashboard";
      } else {
        router.push("/dashboard");
      }

    } catch (error) {
      const err = error as AxiosError<ErrorResponse>;
      NProgress.done();
      setIsLoading(false);
      
      let errorMsg = "An unexpected error occurred. Please try again later.";

      if (err.config?.url?.includes("save-token")) {
         errorMsg = "Secure session setup failed. Please try again later. If the issue persists, contact us via the link in the footer.";
         Sentry.captureException(error, { tags: { type: "auth_bridge_client_error", location: "LoginForm/handleSubmit" } });
      } else if (err.response?.status === 401) {
         errorMsg = "Invalid credentials. Please check your password.";
      } else if (err.response?.data?.message) {
         const msg = err.response.data.message;
         errorMsg = msg === "These credentials do not match our records."
           ? "These credentials do not match EzyGo records."
           : msg;
      } else if (err.code === "ERR_NETWORK") {
         errorMsg = "Network error. Please check your connection. If this persists even after some time, kindly contact us using the link in the footer.";
         Sentry.captureException(error, { tags: { type: "network_error", location: "LoginForm/handleSubmit" } });
      }
      setError(errorMsg);
      announceToScreenReader(errorMsg);
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

  const currentMethodProps = getLoginMethodProps(loginMethod);

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
      initial={false}
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
                  {currentMethodProps.label}
                </Label>
                <div className="flex gap-1">
                  {(["username", "email", "phone"] as const).map((method) => (
                    <Button
                      key={method}
                      type="button"
                      size="icon"
                      variant={loginMethod === method ? "secondary" : "ghost"}
                      className="h-6 w-6 p-3"
                      onClick={() => {
                        setLoginMethod(method);
                        manuallySelectedLoginMethodRef.current =
                          method === "email" || method === "phone" ? method : null;
                      }}
                      aria-label={getLoginMethodAriaLabel(method)}
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
                  type={currentMethodProps.type}
                  value={formData.username}
                  className="custom-input dark:bg-secondary/10 dark:border-white/10 focus:border-primary/50 transition-colors"
                  onChange={handleLoginChange}
                  placeholder={currentMethodProps.placeholder}
                  name={currentMethodProps.label.toLowerCase()}
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
                    "custom-input dark:bg-secondary/10 dark:border-white/10 focus:border-primary/50 transition-colors",
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
                  <p id="password-error" className="text-xs text-red-600 dark:text-red-400 mt-1">
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
                className="text-center text-sm text-red-600 dark:text-red-400 border rounded-lg bg-red-500/10 border-red-500/30 dark:border-red-500/20 p-2"
              >
                {error}
              </motion.div>
            )}
          </div>
        </div>

        {/* Disclaimer Section */}
        <div className="mt-6 flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-700">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-3">
            <LockIcon className="h-3 w-3 text-primary" />
            <span className="text-[11px] font-bold tracking-widest uppercase text-primary">
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
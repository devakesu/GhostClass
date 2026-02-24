"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { Eye, EyeOff, Mail, Phone, User } from "lucide-react";

import ezygoClient from "@/lib/axios";
import axios, { AxiosError } from "axios";
import { getCsrfToken, setCsrfToken } from "@/lib/axios";
import { CSRF_HEADER } from "@/lib/security/csrf-constants";
import { useCSRFToken } from "@/hooks/use-csrf-token";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_TARGET_PERCENTAGE } from "@/providers/user-settings";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import NProgress from "nprogress";

import { motion } from "framer-motion";

interface PasswordResetFormProps {
  className?: string;
  onCancel: () => void;
}

interface ErrorResponse {
  message: string;
}

const PASSWORD_VALIDATION = {
  MIN_LENGTH: 6,
  MAX_LENGTH: 128,
} as const;

const validatePassword = (password: string): string | null => {
  if (!password || password.trim().length === 0) return "Password is required";
  if (password.length < PASSWORD_VALIDATION.MIN_LENGTH)
    return `Password must be at least ${PASSWORD_VALIDATION.MIN_LENGTH} characters`;
  if (password.length > PASSWORD_VALIDATION.MAX_LENGTH)
    return `Password must be less than ${PASSWORD_VALIDATION.MAX_LENGTH} characters`;
  return null;
};

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

interface ResetOptions {
  username: string;
  options: {
    emails: string[];
    mobiles: string[];
  };
}

export function PasswordResetForm({
  className,
  onCancel,
}: PasswordResetFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<"username" | "option" | "otp">("username");
  const [username, setUsername] = useState("");
  const [actualUsername, setActualUsername] = useState("");
  const [resetOptions, setResetOptions] = useState<ResetOptions | null>(null);
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [loginMethod, setLoginMethod] = useState<
    "username" | "email" | "phone"
  >("username");

  // Initialize CSRF token
  useCSRFToken();

  const handleUsernameSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    NProgress.start();
    setIsLoading(true);
    setError(null);

    try {
      const lookupResponse = await ezygoClient.post("/login/lookup", {
        username: username,
      });

      if (lookupResponse.data.users && lookupResponse.data.users.length > 0) {
        const usernameToUse = lookupResponse.data.users[0];
        setActualUsername(usernameToUse);

        const response = await ezygoClient.post("/password/reset/options", {
          username: usernameToUse,
        });
        setResetOptions(response.data);

        // Clear loading state BEFORE changing step so the option form renders
        // with isLoading=false immediately — prevents brief unclickable state
        setIsLoading(false);
        NProgress.done();
        setStep("option");
      } else {
        NProgress.done();
        setError("Ezygo: No user found with this username/email/phone.");
      }
    } catch (error: unknown) {
      NProgress.done();
      const err = error as AxiosError<ErrorResponse>;
      setError(`Ezygo: ${err.response?.data?.message ?? "Failed to fetch reset options."}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOptionSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    NProgress.start();
    setIsLoading(true);
    setError(null);

    try {
      // selectedOption is "mail:<address>" or "sms:<number>"; extract the method
      const deliveryMethod = selectedOption.split(":")[0] || selectedOption;
      await ezygoClient.post("/password/reset/request", {
        username: actualUsername,
        option: deliveryMethod,
      });

      setIsLoading(false);
      NProgress.done();
      setStep("otp");
    } catch (error: unknown) {
      NProgress.done();
      const err = error as AxiosError<ErrorResponse>;
      setError(`Ezygo: ${err.response?.data?.message ?? "Failed to request password reset."}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Validate password client-side before making any requests
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Passwords do not match.");
      return;
    }

    NProgress.start();
    setIsLoading(true);

    try {
      const response = await ezygoClient.post("/password/reset", {
        otp,
        username: actualUsername,
        password,
        password_confirmation: passwordConfirmation,
      });
      const token = response.data.access_token;

      // POST /api/csrf calls regenerateCsrfToken() which always issues a new token,
      // binding it to the new session after the privilege change (password reset).
      // This avoids the stale sessionStorage token that caused silent 403s on first
      // post-reset login.
      const csrfRefreshRes = await fetch("/api/csrf", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (csrfRefreshRes.ok) {
        const csrfData = await csrfRefreshRes.json().catch(() => null) as { token?: string } | null;
        if (typeof csrfData?.token === "string") {
          setCsrfToken(csrfData.token); // keep sessionStorage in sync
        }
      }
      const csrfToken = getCsrfToken();
      // CSRF token is required for save-token; abort if still missing after refresh
      if (!csrfToken) {
        throw new Error("CSRF token unavailable – please reload the page and try again.");
      }

      // Use plain axios for internal auth endpoint (not proxied through /api/backend/)
      const saveTokenResponse = await axios.post(
        "/api/auth/save-token",
        { token },
        { headers: { [CSRF_HEADER]: csrfToken } }
      );

      // Pre-populate settings from save-token response for immediate availability
      // Eliminates the 5-10 second delay showing defaults on first post-reset load
      const settings = saveTokenResponse.data?.settings;

      const { data: { user }, error: getUserError } = await supabase.auth.getUser();
      if (getUserError || !user) {
        logger.error("User session not available after password reset; skipping settings prefetch", {
          context: "PasswordResetForm/handleResetSubmit",
          error: getUserError,
        });
      } else if (settings) {
        const responseUserId =
          saveTokenResponse.data?.user?.id ?? saveTokenResponse.data?.user_id;
        if (responseUserId && user.id !== responseUserId) {
          logger.error("User ID mismatch between reset response and Supabase session", {
            context: "PasswordResetForm/handleResetSubmit",
            responseUserId,
            sessionUserId: user.id,
          });
          // Skip storing settings to avoid data corruption
        } else {
          const bunkEnabled =
            typeof settings.bunk_calculator_enabled === "boolean"
              ? settings.bunk_calculator_enabled
              : true;
          const rawTarget = settings.target_percentage;

          let targetPercentage = DEFAULT_TARGET_PERCENTAGE;
          if (typeof rawTarget === "number" && Number.isFinite(rawTarget)) {
            const normalizedTarget = Math.round(rawTarget);
            if (normalizedTarget >= 1 && normalizedTarget <= 100) {
              targetPercentage = normalizedTarget;
            }
          }

          try {
            sessionStorage.setItem(
              "prefetchedSettings",
              JSON.stringify({
                userId: user.id,
                settings: {
                  bunk_calculator_enabled: bunkEnabled,
                  target_percentage: targetPercentage,
                },
              })
            );
            localStorage.setItem(`showBunkCalc_${user.id}`, bunkEnabled.toString());
            localStorage.setItem(`targetPercentage_${user.id}`, targetPercentage.toString());
          } catch (storageError) {
            logger.dev("Failed to write settings to storage after password reset", {
              context: "PasswordResetForm/handleResetSubmit",
              error: storageError instanceof Error ? storageError.message : String(storageError),
            });
          }
        }
      } else {
        // No settings returned — write defaults to localStorage only
        // (not sessionStorage.prefetchedSettings so the settings provider creates the DB row)
        try {
          if (user) {
            localStorage.setItem(`showBunkCalc_${user.id}`, "true");
            localStorage.setItem(`targetPercentage_${user.id}`, DEFAULT_TARGET_PERCENTAGE.toString());
          }
        } catch (storageError) {
          logger.dev("Failed to write default settings to storage after password reset", {
            context: "PasswordResetForm/handleResetSubmit",
            error: storageError instanceof Error ? storageError.message : String(storageError),
          });
        }
        logger.dev(
          "No settings returned from /api/auth/save-token; applied default settings for new user.",
          { context: "PasswordResetForm/handleResetSubmit" }
        );
      }

      // Navigate to dashboard — NProgress finishes via NextTopLoader on navigation
      router.push("/dashboard");
    } catch (error: unknown) {
      NProgress.done();
      setIsLoading(false);

      const err = error as AxiosError<ErrorResponse>;
      let errorMsg = "An unexpected error occurred";

      if (err.config?.url?.includes("save-token")) {
        errorMsg = "Secure session setup failed. Please try again.";
        Sentry.captureException(error, {
          tags: {
            type: "auth_bridge_client_error",
            location: "PasswordResetForm/handleResetSubmit",
          },
        });
      } else if (err.response?.data?.message) {
        errorMsg = `Ezygo: ${err.response.data.message}`;
      } else if (err.code === "ERR_NETWORK") {
        errorMsg = "Network error. Please check your connection.";
      }
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
      },
    },
  };

  return (
    <motion.div
      className={cn("flex flex-col gap-8", className)}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-2xl font-semibold">Reset Password</h2>
        <p className="text-center text-sm text-muted-foreground font-medium">
          {step === "username"
            ? `Enter your ${loginMethodProps[
                loginMethod
              ].label.toLowerCase()} to begin`
            : step === "option"
            ? "Choose how to receive your reset code"
            : "Enter the code and your new password"}
        </p>
      </div>

      {step === "username" && (
        <form onSubmit={handleUsernameSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="login">
                {loginMethodProps[loginMethod].label}
              </Label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant={loginMethod === "username" ? "secondary" : "ghost"}
                  className="h-6 w-6 p-3"
                  onClick={() => setLoginMethod("username")}
                >
                  <User className="h-4 w-4" aria-label="Username" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={loginMethod === "email" ? "secondary" : "ghost"}
                  className="h-6 w-6 p-3"
                  onClick={() => setLoginMethod("email")}
                >
                  <Mail className="h-4 w-4" aria-label="Email" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={loginMethod === "phone" ? "secondary" : "ghost"}
                  className="h-6 w-6 p-3"
                  onClick={() => setLoginMethod("phone")}
                >
                  <Phone className="h-4 w-4" aria-label="Phone" />
                </Button>
              </div>
            </div>
            <Input
              id="reset-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full custom-input"
              placeholder={loginMethodProps[loginMethod].placeholder}
              required
            />
          </div>
          <div className="flex gap-2 w-full justify-between">
            <Button
              type="button"
              variant="outline"
              className="flex-1 font-semibold min-h-11.5 mt-4 rounded-[12px] font-sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 font-semibold min-h-11.5 mt-4 rounded-[12px] font-sm"
              disabled={isLoading}
            >
              {isLoading ? "Checking..." : "Continue"}
            </Button>
          </div>
        </form>
      )}

      {step === "option" && resetOptions && (
        <form onSubmit={handleOptionSubmit} className="flex flex-col gap-4">
          <RadioGroup
            value={selectedOption}
            onValueChange={setSelectedOption}
            disabled={isLoading}
            className="flex justify-center flex-col gap-3"
          >
            {resetOptions.options.emails.map((email) => (
              <label
                key={email}
                htmlFor={email}
                className="flex items-center space-x-2 custom-input justify-between px-4 pr-2 cursor-pointer"
              >
                <span className="text-sm font-medium">{email}</span>
                <RadioGroupItem value={`mail:${email}`} id={email} aria-label={`Send reset code to email ${email}`} />
              </label>
            ))}
            {resetOptions.options.mobiles.map((mobile) => (
              <label
                key={mobile}
                htmlFor={mobile}
                className="flex items-center space-x-2 custom-input justify-between pl-4 pr-2 cursor-pointer"
              >
                <span className="text-sm font-medium">{mobile}</span>
                <RadioGroupItem value={`sms:${mobile}`} id={mobile} aria-label={`Send reset code to phone ${mobile}`} />
              </label>
            ))}
          </RadioGroup>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 font-semibold min-h-11.5 mt-4 rounded-[12px] font-sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 font-semibold min-h-11.5 mt-4 rounded-[12px] font-sm"
              disabled={isLoading || !selectedOption}
            >
              {isLoading ? "Sending..." : "Send Code"}
            </Button>
          </div>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleResetSubmit} className="flex flex-col gap-5">
          <div className="grid gap-3">
            <Label htmlFor="otp">Reset Code</Label>
            <Input
              id="otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="Enter the reset code"
              className="custom-input"
              required
            />
          </div>
          <div className="grid gap-3">
            <Label htmlFor="new-password">New Password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your new password"
                className="custom-input"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent mr-1.5"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
          <div className="grid gap-3">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showNewPassword ? "text" : "password"}
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                placeholder="Confirm your new password"
                className="custom-input"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent mr-1.5"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 font-semibold min-h-11.5 mt-4 rounded-[12px] font-sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 font-semibold min-h-11.5 mt-4 rounded-[12px] font-sm"
              disabled={isLoading}
            >
              {isLoading ? "Resetting..." : "Reset Password"}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-sm text-destructive border rounded-lg bg-red-400/15 border-red-400/75 p-2"
          role="alert"
        >
          {error}
        </motion.div>
      )}
    </motion.div>
  );
}

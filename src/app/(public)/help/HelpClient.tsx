"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ChartBar = ({ 
  course, 
  target, 
  chartHeight 
}: { 
  course: { 
    readonly code: string; 
    readonly official: number; 
    readonly adjusted: number | null 
  }; 
  target: number; 
  chartHeight: number;
}) => {
  const aboveTarget = course.official >= target;
  const baseColor = aboveTarget ? "bg-green-600" : "bg-red-600";
  const hasTracking = course.adjusted !== null;
  const isGain = hasTracking && (course.adjusted!) >= course.official;

  const baseHeight = (course.official / 100) * chartHeight;
  const adjustedHeight = hasTracking ? (course.adjusted! / 100) * chartHeight : 0;
  const overlayHeight = Math.abs(adjustedHeight - baseHeight);
  const containerHeight = Math.max(baseHeight, adjustedHeight);

  let solidBarHeight = baseHeight;
  if (hasTracking && !isGain) {
    solidBarHeight = adjustedHeight;
  }

  const roundedClass = (!hasTracking || !isGain) ? 'rounded-t' : '';

  return (
    <div className="flex flex-col items-center gap-1 w-14">
      <div
        className="relative w-10 rounded-t overflow-hidden"
        style={{ height: containerHeight }}
      >
        <div
          className={`absolute bottom-0 left-0 right-0 ${baseColor} ${roundedClass}`}
          style={{ height: solidBarHeight }}
        />
        {hasTracking && (
          <div
            className={`absolute left-0 right-0 ${isGain ? 'rounded-t' : ''} border-x border-t`}
            style={{
              bottom: isGain ? baseHeight : adjustedHeight,
              height: overlayHeight,
              backgroundColor: isGain ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)',
              backgroundImage: `repeating-linear-gradient(45deg, ${isGain ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.7)'} 0, ${isGain ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.7)'} 2.5px, transparent 2.5px, transparent 5px)`,
              borderColor: isGain ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
            }}
          />
        )}
      </div>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">
        {course.code}
      </span>
      <span className="text-[10px] text-muted-foreground/60 text-center leading-tight">
        {course.official}%
        {hasTracking && (
          <span className={isGain ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
            {" "} → {course.adjusted}%
          </span>
        )}
      </span>
    </div>
  );
};

// ─── Section heading ───────────────────────────────────────────────────────────
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-semibold text-primary dark:text-primary border-l-2 border-primary/60 pl-3">
      {children}
    </h2>
  );
}

// ─── FAQ item ──────────────────────────────────────────────────────────────────
function makePanelId(question: string): string {
  const src = question.toLowerCase().trim();
  let out = "";
  for (const ch of src) {
    const code = ch.charCodeAt(0);
    const isAlnum = (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
    if (isAlnum) {
      out += ch;
    } else {
      if (out.endsWith("-")) continue;
      out += "-";
    }
    if (out.length >= 40) break;
  }
  // Trim leading/trailing hyphens without regex
  while (out.startsWith("-")) out = out.slice(1);
  while (out.endsWith("-")) out = out.slice(0, -1);
  const slug = out.slice(0, 40);
  return `faq-panel-${slug || "item"}`;
}

function FaqItem({ question, answer }: { question: string; answer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = makePanelId(question);
  const btnId = `${panelId}-btn`;
  return (
    <div className="bg-muted/30 border border-border/50 rounded-lg overflow-hidden">
      <button
        id={btnId}
        className="w-full flex items-center justify-between gap-4 p-4 text-left text-foreground/90 font-medium hover:bg-muted/60 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span>{question}</span>
        {open ? (
          <ChevronUp className="shrink-0 size-4 text-primary" aria-hidden="true" />
        ) : (
          <ChevronDown className="shrink-0 size-4 text-muted-foreground" aria-hidden="true" />
        )}
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        hidden={!open}
        className="px-4 pb-4 text-muted-foreground text-sm leading-relaxed border-t border-border/50 pt-3"
      >
        {answer}
      </div>
    </div>
  );
}

// ─── Mock course card ──────────────────────────────────────────────────────────
function MockCourseCard({ officialPct = 80, adjustedPct = 82.5 }: { officialPct?: number; adjustedPct?: number } = {}) {
  const isGain = adjustedPct >= officialPct;

  return (
    <Card className="bg-card/80 border-border w-full max-w-md mx-auto" data-testid="mock-course-card">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-foreground text-base leading-snug">
              Data Structures & Algorithms
            </CardTitle>
            <p className="text-muted-foreground text-xs mt-0.5">CSE301</p>
          </div>
          <Badge variant="outline" className="text-xs border-border text-muted-foreground shrink-0">
            {officialPct}%
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Counts row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {/* Present */}
          <span className="flex items-center gap-1">
            <span className="text-green-500 font-semibold">32</span>
            <span
              className="text-orange-500 text-xs cursor-default"
              title="Corrections"
            >
              +2
            </span>
            <span
              className="text-blue-500 dark:text-blue-400 text-xs cursor-default"
              title="Extras"
            >
              +1
            </span>
            <span className="text-muted-foreground text-xs">present</span>
          </span>

          {/* Absent */}
          <span className="flex items-center gap-1">
            <span className="text-red-500 font-semibold">8</span>
            <span
              className="text-orange-500 text-xs cursor-default"
              title="Corrections"
            >
              -2
            </span>
            <span className="text-muted-foreground text-xs">absent</span>
          </span>

          {/* Total */}
          <span className="flex items-center gap-1">
            <span className="text-foreground/90 font-semibold">40</span>
            <span
              className="text-blue-500 dark:text-blue-400 text-xs cursor-default"
              title="Extras"
            >
              +1
            </span>
            <span className="text-muted-foreground text-xs">total</span>
          </span>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Official {officialPct}%</span>
            <span className={`${isGain ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} font-medium`}>Tracking {adjustedPct}%</span>
          </div>
          <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
            {/* Official bar */}
            <div
              className={`absolute left-0 top-0 h-full bg-sky-500 overflow-hidden ${!isGain ? 'rounded-r-full' : ''}`}
              style={{ width: `${officialPct}%` }}
            >
              <div className="absolute right-0 top-0 w-[1.5px] h-full bg-white/20" />
            </div>
            {/* Gain overlay (solid) */}
            {isGain && (
              <div
                className="absolute top-0 h-full bg-green-500 rounded-r-full"
                style={{
                  left: `${officialPct}%`,
                  width: `${adjustedPct - officialPct}%`,
                }}
              />
            )}
          </div>
        </div>

        {/* Bunk calculator panels */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Official panel */}
          <div className="bg-blue-500/10 dark:bg-blue-950/40 border border-blue-500/30 dark:border-blue-800/40 rounded-lg p-3 space-y-1">
            <p className="text-blue-600 dark:text-blue-300 font-semibold">Safe (Official)</p>
            <p className="text-muted-foreground">Can bunk</p>
            <p className="text-green-600 dark:text-green-400 font-bold text-lg">3</p>
          </div>
          {/* Tracking panel */}
          <div className="bg-primary/10 dark:bg-primary/20 border border-primary/30 dark:border-primary/40 rounded-lg p-3 space-y-1">
            <p className="text-primary font-semibold">+ Tracking Data</p>
            <p className="text-muted-foreground">Can bunk</p>
            <p className="text-green-600 dark:text-green-400 font-bold text-lg">
              4
              <span aria-hidden="true" className="ml-1">
                🥳
              </span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Mock attendance chart ──────────────────────────────────────────────────────
function MockAttendanceChart() {
  const TARGET = 75;
  const CHART_HEIGHT = 180;

  const courses = [
    {
      code: "CSE301",
      official: 82,
      adjusted: null,
    },
    {
      code: "MAT201",
      official: 60,
      adjusted: null,
    },
    {
      code: "PHY101",
      official: 78,
      adjusted: 85,
    },
    {
      code: "ENG401",
      official: 65,
      adjusted: 58,
    },
  ] as const;

  // Target line Y position: (1 - TARGET/100) * CHART_HEIGHT
  const targetY = (1 - TARGET / 100) * CHART_HEIGHT;

  return (
    <div className="bg-muted/30 border border-border/50 rounded-lg p-4 w-full max-w-md mx-auto">
      {/* Chart area */}
      <div className="relative" style={{ height: CHART_HEIGHT }}>
        {/* Target dashed line */}
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-amber-400/70 z-10 flex items-center justify-end"
          style={{ top: targetY }}
        >
          <span className="bg-muted text-amber-600 dark:text-amber-400 text-[10px] px-1 -mt-2">
            Target: {TARGET}%
          </span>
        </div>

        {/* Bars */}
        <div className="absolute inset-0 flex items-end gap-2 justify-around px-2 pb-0">
          {courses.map((c) => (
            <ChartBar key={c.code} course={c} target={TARGET} chartHeight={CHART_HEIGHT} />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-green-600" />
          Official Green = Above target
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-red-600" />
          Official Red = Below target
        </span>
        <span className="flex items-center gap-1.5">
          <span 
            className="inline-block size-3 rounded-sm border" 
            style={{ 
              borderColor: 'rgb(34, 197, 94)',
              backgroundImage: 'repeating-linear-gradient(45deg, rgba(34, 197, 94, 0.6) 0, rgba(34, 197, 94, 0.6) 1.5px, transparent 1.5px, transparent 3px)' 
            }} 
          />
          Striped Green = Tracking gain
        </span>
        <span className="flex items-center gap-1.5">
          <span 
            className="inline-block size-3 rounded-sm border" 
            style={{ 
              borderColor: 'rgb(239, 68, 68)',
              backgroundImage: 'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.7) 0, rgba(239, 68, 68, 0.7) 1.5px, transparent 1.5px, transparent 3px)' 
            }} 
          />
          Striped Red = Tracking loss
        </span>
        <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dashed border-amber-500 dark:border-amber-400" />
          Dashed amber = Target %
        </span>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function HelpClient() {
  const faqs = [
    {
      question: "Can I use GhostClass as a mobile app?",
      answer: (
        <>
          Yes. GhostClass is available on the{" "}
          <a
            href={`https://play.google.com/store/apps/details?id=${process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium"
          >
            Google Play Store
          </a>
          . Alternatively, the web version is a Progressive Web App (PWA) — on most mobile browsers, you can select &apos;Add to Home Screen&apos; to install it as a standalone experience.
        </>
      ),
    },
    {
      question: "What is the bunk calculator?",
      answer:
        "The bunk calculator tells you how many classes you can safely skip — or must attend — to stay at or above your target attendance percentage.",
    },
    {
      question: "Why is my attendance percentage different from EzyGo?",
      answer:
        "GhostClass shows your official data plus any manually tracked corrections or extras. The official (EzyGo) percentage is always shown; adjustments are displayed separately alongside it.",
    },
    {
      question: "Does GhostClass change my real attendance?",
      answer:
        "No. GhostClass is a read-only calculator. It cannot modify any records in your institution's system.",
    },
    {
      question: "Is my EzyGo password stored anywhere?",
      answer:
        "No. Your password is used once to authenticate with EzyGo and is never persisted. Only the resulting bearer token is stored (encrypted) in the database.",
    },
    {
      question: "What do the striped segments in the attendance chart mean?",
      answer:
        "Striped segments represent your manually tracked data. A striped green segment shows a gain (present sessions you added), while a striped red segment shows a loss (absences you corrected or sessions you missed).",
    },
    {
      question: "Why are some classes (like 'Revision') missing from my total?",
      answer:
        "GhostClass intentionally excludes 'Revision' and other non-mandatory class types from the attendance calculation to ensure your percentage accurately reflects your academic standing.",
    },
    {
      question: "How can I verify if this instance of GhostClass is secure?",
      answer:
        "Visit the 'Build Transparency' page from the footer. It provides live provenance data, including the SLSA attestation level, build timestamp, and the exact GitHub commit used to build this instance.",
    },
    {
      question: "Why doesn't GhostClass call the EzyGo API directly from the browser?",
      answer:
        "The original approach exposed the EzyGo bearer token in the browser's Network tab and JavaScript memory — trivially stealable via DevTools or XSS. GhostClass stores the token in an httpOnly cookie (AES-256-GCM encrypted) and proxies all EzyGo requests through the server, so the raw token is never visible in the browser. The trade-off is a small extra network hop (~10–50 ms) per request.",
    },
    {
      question: "Why is the dashboard sometimes slow when many people log in at once?",
      answer:
        "All EzyGo API calls are queued through a server-side rate limiter (default: 3 concurrent requests) to avoid hitting EzyGo's rate limits. Early users in a burst get sub-2 s loads; later users in the same burst may wait a few extra seconds in the queue.",
    },
    {
      question: "How do I set my target attendance?",
      answer:
        "Update the target percentage from the header bar or the user profile dialog. The default is 75%.",
    },
    {
      question: "What does 'syncing' mean?",
      answer:
        "GhostClass periodically fetches your latest attendance from EzyGo. If data looks stale, visit the dashboard and use the refresh option.",
    },
    {
      question: "Why does a course card show 'No attendance data'?",
      answer:
        "The instructor hasn't updated attendance records yet for that course in EzyGo. However, you can still manually add records.",
    },
  ];

  return (
    <div className="bg-background text-muted-foreground px-6 md:px-12 pt-6 md:pt-12">
      <div className="max-w-3xl mx-auto space-y-12">
        {/* ── Header ── */}
        <div className="flex items-center gap-4 border-b border-border pb-6">
            <HelpCircle className="size-8 text-primary shrink-0" aria-hidden="true" />
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              Help & FAQ
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Everything you need to know about GhostClass.
            </p>
          </div>
        </div>

        {/* ── Section 1 – Course Card Explained ── */}
        <section className="space-y-6">
          <SectionHeading>
            <BookOpen className="inline-block mr-2 size-4" aria-hidden="true" />
            Course Card Explained
          </SectionHeading>

          <p className="text-muted-foreground text-sm">
            Below is a sample course card with all features shown. Hover over the
            small{" "}
            <span className="text-orange-500 font-semibold">orange</span> and{" "}
            <span className="text-blue-500 dark:text-blue-400 font-semibold">blue</span> modifiers to
            see tooltips.
          </p>

          <MockCourseCard />
          <p className="text-muted-foreground text-sm mt-4">
            If your tracking data shows a <span className="text-red-600 font-semibold">loss</span> (e.g. you corrected a present class to absent), the card reflects it:
          </p>
          <MockCourseCard officialPct={80} adjustedPct={75} />

          {/* Legend */}
          <div className="bg-muted/30 border border-border/50 rounded-lg p-5 space-y-4 text-sm">
            <h3 className="text-foreground/80 font-semibold">Counts Legend</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm bg-green-500 shrink-0" />
                <span>
                  <span className="text-green-500 font-semibold">Green number</span>{" "}
                  (e.g. 32) = Official present count from EzyGo
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm bg-orange-500 shrink-0" />
                <span>
                  <span className="text-orange-500 font-semibold">
                    Orange <code>+N</code>
                  </span>{" "}
                  next to Present = Correction entries that convert absences to present/DL
                  (does <strong className="text-foreground/80">NOT</strong> add to total)
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm bg-blue-500 shrink-0" />
                <span>
                  <span className="text-blue-500 dark:text-blue-400 font-semibold">
                    Blue <code>+N</code>
                  </span>{" "}
                  next to Present = Extra present classes you manually added (adds to
                  total)
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm bg-red-500 shrink-0" />
                <span>
                  <span className="text-red-500 font-semibold">Red number</span>{" "}
                  (e.g. 8) = Official absent count from EzyGo
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm bg-orange-500 shrink-0" />
                <span>
                  <span className="text-orange-500 font-semibold">
                    Orange <code>-N</code>
                  </span>{" "}
                  next to Absent = Correction entries (cancels those absences)
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm bg-blue-500 shrink-0" />
                <span>
                  <span className="text-blue-500 dark:text-blue-400 font-semibold">
                    Blue <code>+N</code>
                  </span>{" "}
                  next to Absent = Extra absent classes (adds to total)
                </span>
              </li>
              <li>
                <span className="text-foreground/80 font-semibold">Total</span> +{" "}
                <span className="text-blue-500 dark:text-blue-400 font-semibold">
                  Blue <code>+N</code>
                </span>{" "}
                = Official total + extra sessions added
              </li>
            </ul>

            <h3 className="text-foreground/80 font-semibold pt-2">
              Progress Bar Legend
            </h3>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <span className="inline-block size-3 rounded-sm bg-sky-500 mr-1.5 align-middle" />
                Sky blue bar = Official attendance percentage
              </li>
              <li>
                <span className="inline-block size-3 rounded-sm bg-green-500 mr-1.5 align-middle" />
                Green overlay (going further right) = Tracking data{" "}
                <strong className="text-foreground/80">GAIN</strong> (adjusted % is
                higher than official)
              </li>
              <li>
                <span className="inline-block size-3 rounded-sm bg-red-600 mr-1.5 align-middle" />
                Deep red overlay (going further left/right) = Tracking data{" "}
                <strong className="text-foreground/80">LOSS</strong> (adjusted % is
                lower than official)
              </li>
            </ul>

            <h3 className="text-foreground/80 font-semibold pt-2">
              Bunk Calculator (dual panel)
            </h3>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm bg-blue-600 shrink-0" />
                <span>
                  <span className="text-blue-600 dark:text-blue-300 font-semibold">
                    Safe (Official)
                  </span>{" "}
                  panel = Based only on data from EzyGo
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm bg-primary shrink-0" />
                <span>
                  <span className="text-primary font-semibold">
                    + Tracking Data
                  </span>{" "}
                  panel = Includes your manually tracked sessions
                </span>
              </li>
              <li>
                Shows how many classes you can safely bunk (
                <span className="text-green-600 dark:text-green-400">green</span>) or must attend (
                <span className="text-amber-600 dark:text-amber-400">amber</span>) to stay at your
                target %
              </li>
            </ul>
          </div>
        </section>

        {/* ── Section 2 – Correction vs Extra ── */}
        <section className="space-y-4">
          <SectionHeading>Correction vs Extra</SectionHeading>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Correction card */}
            <div className="bg-muted/30 border border-orange-500/50 dark:border-orange-700/50 rounded-lg p-5 space-y-3">
              <h3 className="text-orange-600 dark:text-orange-400 font-semibold text-base">
                Correction
              </h3>
              <ul className="text-muted-foreground text-sm space-y-2 list-disc list-inside">
                <li>
                  Used when EzyGo marked you absent but you were actually present
                </li>
                <li>
                  Does <strong className="text-foreground/80">NOT</strong> add to the
                  total class count — it only adjusts present/absent counts
                </li>
                <li>
                  Shown in{" "}
                  <span className="text-orange-600 dark:text-orange-500 font-semibold">orange</span> on
                  the course card
                </li>
              </ul>
              <p className="text-muted-foreground/80 text-xs italic">
                Example: &quot;You attended class but EzyGo shows Absent. Add a
                Correction → Present to fix the percentage without affecting the
                total.&quot;
              </p>
            </div>

            {/* Extra card */}
            <div className="bg-muted/30 border border-blue-500/50 dark:border-blue-700/50 rounded-lg p-5 space-y-3">
              <h3 className="text-blue-600 dark:text-blue-400 font-semibold text-base">Extra</h3>
              <ul className="text-muted-foreground text-sm space-y-2 list-disc list-inside">
                <li>
                  Used for classes that EzyGo doesn&apos;t know about yet (newly
                  held class not synced)
                </li>
                <li>
                  <strong className="text-foreground/80">ADDS</strong> to the total
                  class count AND to present/absent
                </li>
                <li>
                  Shown in{" "}
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">blue</span> on the
                  course card
                </li>
              </ul>
              <p className="text-muted-foreground/80 text-xs italic">
                Example: &quot;Professor held an extra class that hasn&apos;t appeared in
                EzyGo yet. Add an Extra → Present so GhostClass factors it in.&quot;
              </p>
            </div>
          </div>
        </section>

        {/* ── Section 3 – Attendance Chart Explained ── */}
        <section className="space-y-4">
          <SectionHeading>Attendance Chart Explained</SectionHeading>

          <p className="text-muted-foreground text-sm">
            The attendance chart gives you a quick visual overview of all your
            courses. Below is a sample chart showing all four possible combinations.
          </p>

          <MockAttendanceChart />

          <div className="bg-muted/30 border border-border/50 rounded-lg p-5 space-y-2 text-sm text-muted-foreground">
            <h3 className="text-foreground/80 font-semibold">Chart Legend</h3>
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm bg-green-600 shrink-0" />
                <span className="text-foreground/80 font-semibold">Official Green</span> = Above
                target (safe)
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm bg-red-600 shrink-0" />
                <span className="text-foreground/80 font-semibold">Official Red</span> = Below target
                (danger)
              </li>
              <li className="flex items-center gap-2">
                <span 
                  className="inline-block size-3 rounded-sm border shrink-0" 
                  style={{ 
                    borderColor: 'rgb(34, 197, 94)',
                    backgroundImage: 'repeating-linear-gradient(45deg, rgb(34, 197, 94) 0, rgb(34, 197, 94) 2px, transparent 2px, transparent 5px)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)'
                  }} 
                />
                <span className="text-foreground/80 font-semibold">Striped Green</span> on top =
                Tracking GAIN (adjusted % higher than official)
              </li>
              <li className="flex items-center gap-2">
                <span 
                  className="inline-block size-3 rounded-sm border shrink-0" 
                  style={{ 
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundImage: 'repeating-linear-gradient(45deg, rgb(239, 68, 68) 0, rgb(239, 68, 68) 2px, transparent 2px, transparent 5px)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)'
                  }} 
                />
                <span className="text-foreground/80 font-semibold">Striped Red</span> on top =
                Tracking LOSS (adjusted % lower than official)
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block w-5 border-t-2 border-dashed border-amber-500 shrink-0" />
                <span className="text-foreground/80 font-semibold">Dashed amber line</span> = Your
                attendance target (default 75%)
              </li>
            </ul>
          </div>
        </section>

        {/* ── Section 4 – FAQ ── */}
        <section className="space-y-4">
          <SectionHeading>
            <MessageSquare className="inline-block mr-2 size-4" aria-hidden="true" />
            Frequently Asked Questions
          </SectionHeading>

          <div className="space-y-3" data-testid="faq-section">
            {faqs.map((faq) => (
              <FaqItem
                key={faq.question}
                question={faq.question}
                answer={faq.answer}
              />
            ))}
          </div>
        </section>

        {/* ── Section 5 – Need More Help? ── */}
        <section className="space-y-4">
          <SectionHeading>Need More Help?</SectionHeading>

          <div className="bg-muted/30 border border-border/50 rounded-lg p-8 flex flex-col items-center gap-4 text-center">
            <HelpCircle className="size-10 text-primary" aria-hidden="true" />
            <p className="text-foreground text-base font-medium">
              Couldn&apos;t find what you were looking for?
            </p>
            <p className="text-muted-foreground/80 text-sm max-w-sm">
              Our team is happy to help. Reach out via the contact page and
              we&apos;ll get back to you as soon as possible.
            </p>
            <Button asChild className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
              <Link href="/contact">Contact Us →</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

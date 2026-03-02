"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  LazyMotion,
  domAnimation,
  m as motion,
  AnimatePresence,
} from "framer-motion";
import {
  GraduationCap,
  FileText,
  Clock,
  BookOpen,
  AlertCircle,
  RefreshCw,
  X,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loading } from "@/components/loading";
import { useExams, useExamAnswers, useExamQuestions, useAllExamAnswers, useAllExamQuestions } from "@/hooks/courses/exams";
import type { Exam, ExamAnswer, ExamQuestion } from "@/types";
import { cn } from "@/lib/utils";

// ─── Helpers ────────────────────────────────────────────────────────────────

type ActivityFilter = "all" | "assessment" | "assignment";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function getExamDate(exam: Exam): string | null {
  return exam.starts_at ?? exam.end_at ?? null;
}

function getMaxMark(exam: Exam): string | null {
  const fromSettings = exam.settings?.questionPaperMaximumMark;
  if (fromSettings) return fromSettings;
  if (exam.maximum_mark != null) return String(exam.maximum_mark);
  return null;
}

function getScore(exam: Exam): number | null {
  return exam.participants?.[0]?.pivot?.score ?? null;
}

function getCourseName(exam: Exam): string {
  const c = exam.course?.[0];
  if (!c) return "—";
  return c.code ? `${c.code} – ${c.name}` : c.name;
}

function getScoreColorClass(score: number, max: number) {
  const pct = (score / max) * 100;
  if (pct >= 75) return { text: "text-green-600 dark:text-green-400", bar: "bg-green-500" };
  if (pct >= 50) return { text: "text-yellow-600 dark:text-yellow-400", bar: "bg-yellow-500" };
  return { text: "text-red-600 dark:text-red-400", bar: "bg-red-500" };
}

/**
 * Groups an array of exams by their primary course, preserving order within each group.
 * Returns an ordered array of { id, label, exams } so rendering stays deterministic.
 */
function groupByCourse(
  exams: Exam[]
): { id: string; label: string; exams: Exam[] }[] {
  const order: string[] = [];
  const map = new Map<string, { id: string; label: string; exams: Exam[] }>();
  for (const exam of exams) {
    const course = exam.course?.[0];
    const key = course ? String(course.id) : "__none__";
    const label = course
      ? course.code
        ? `${course.code} – ${course.name}`
        : course.name
      : "Unknown Course";
    if (!map.has(key)) {
      map.set(key, { id: key, label, exams: [] });
      order.push(key);
    }
    map.get(key)!.exams.push(exam);
  }
  return order.map((k) => map.get(k)!);
}

// ─── Score Card ──────────────────────────────────────────────────────────────

function ScoreCard({
  exam,
  index,
  onClick,
  resolvedScore,
  resolvedMaxMark,
}: {
  exam: Exam;
  index: number;
  onClick: () => void;
  resolvedScore?: number;
  resolvedMaxMark?: number;
}) {
  // Prefer score computed from examanswers (fetched when drawer was opened)
  // over participants[0].pivot.score which the API often leaves null.
  const score = resolvedScore ?? getScore(exam);
  // getMaxMark reads exam-level API fields that are frequently null;
  // fall back to resolvedMaxMark (summed from examquestions).
  const apiMaxMark = getMaxMark(exam);
  const maxNum = apiMaxMark ? parseFloat(apiMaxMark) : (resolvedMaxMark ?? null);
  const maxMark = apiMaxMark ?? (resolvedMaxMark != null ? String(resolvedMaxMark) : null);
  const date = getExamDate(exam);
  const isAssessment = exam.activity_type === "assessment";
  const colors =
    score != null && maxNum != null && maxNum > 0
      ? getScoreColorClass(score, maxNum)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.4), ease: "easeOut" }}
      className="h-full"
    >
      <Card
        className="bg-card border border-border/50 hover:border-purple-500/60 hover:ring-1 hover:ring-purple-500/30 transition-all duration-200 h-full flex flex-col cursor-pointer"
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
        aria-label={`View details for ${exam.name}`}
      >
        <CardHeader className="pb-2 sm:pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm font-semibold text-foreground leading-snug line-clamp-3">
                {exam.name}
              </CardTitle>
              {exam.summary && (
                <p className="hidden sm:block text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {exam.summary}
                </p>
              )}
            </div>
            <Badge
              className={cn(
                "shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border",
                isAssessment
                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/50 dark:border-blue-500/30"
                  : "bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/50 dark:border-orange-500/30"
              )}
              variant="outline"
            >
              {exam.activity_type}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0 flex flex-col gap-2 sm:gap-3 flex-1">
          {/* Course */}
          <div className="flex items-start gap-2">
            <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {getCourseName(exam)}
            </span>
          </div>

          {/* Score row */}
          <div className="flex items-center justify-between mt-auto">
            {score != null ? (
              <div className="flex items-baseline gap-1">
                <span
                  className={cn(
                    "text-xl sm:text-2xl font-bold tabular-nums",
                    colors ? colors.text : "text-foreground"
                  )}
                >
                  {score}
                </span>
                {maxMark && (
                  <span className="text-sm text-muted-foreground font-medium">
                    / {maxMark}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground italic">Pending</span>
              </div>
            )}

            {date && (
              <span className="hidden sm:inline text-[11px] text-muted-foreground/60 tabular-nums">
                {formatDate(date)}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {score != null && maxNum != null && maxNum > 0 && (
            <div
              className="w-full h-1 bg-foreground/10 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round((score / maxNum) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Score ${score} out of ${maxNum}`}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  colors ? colors.bar : "bg-foreground/40"
                )}
                style={{ width: `${Math.min(100, (score / maxNum) * 100)}%` }}
              />
            </div>
          )}

          {/* View details hint */}
          <div className="flex items-center gap-1 mt-auto pt-1 -mb-1">
            <span className="text-[10px] text-purple-600 dark:text-purple-400">View details</span>
            <ChevronRight className="h-3 w-3 text-purple-600 dark:text-purple-400" aria-hidden="true" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Exam Detail Drawer ───────────────────────────────────────────────────────

/**
 * A single row in the per-question breakdown table.
 * Receives the question (always present) and the matching answer (may be
 * undefined when the exam has not been graded yet — "unmarked" case).
 */
function QuestionRow({
  question,
  answer,
  index,
}: {
  question: ExamQuestion;
  answer: ExamAnswer | undefined;
  index: number;
}) {
  const maxNum = parseFloat(question.maximum_mark);
  const scored = answer?.score != null;
  const scoreNum = scored ? parseFloat(answer!.score!) : null;

  const chipClass =
    scoreNum != null
      ? scoreNum === 0
        ? "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/50 dark:border-red-500/30"
        : scoreNum >= maxNum
          ? "bg-green-500/15 text-green-600 dark:text-green-300 border-green-500/50 dark:border-green-500/30"
          : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/50 dark:border-yellow-500/30"
      : "bg-foreground/10 text-muted-foreground border-foreground/10";

  const displayScore =
    scoreNum != null
      ? Number.isInteger(scoreNum)
        ? String(scoreNum)
        : scoreNum.toFixed(1)
      : "—";

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.5) }}
      className="flex items-center gap-3 py-2.5 border-b border-foreground/5 last:border-0"
    >
      {/* Q-number badge */}
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground/5 border border-foreground/10 shrink-0">
        <span className="text-[10px] font-bold text-muted-foreground">
          Q{question.question_no}
        </span>
      </div>

      {/* Per-question bar + max */}
      <div className="flex-1 min-w-0">
        {scoreNum != null && maxNum > 0 ? (
          <div
            className="w-full h-1 bg-foreground/10 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round((scoreNum / maxNum) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Q${question.question_no}: ${scoreNum} of ${maxNum} marks`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                scoreNum === 0
                  ? "bg-red-500"
                  : scoreNum >= maxNum
                    ? "bg-green-500"
                    : "bg-yellow-500"
              )}
              style={{ width: `${Math.min(100, (scoreNum / maxNum) * 100)}%` }}
            />
          </div>
        ) : (
          <div className="w-full h-1 bg-foreground/5 rounded-full" />
        )}
      </div>

      {/* Score / max */}
      <div className="flex items-baseline gap-0.5 shrink-0">
        <Badge
          variant="outline"
          className={cn(
            "text-xs font-bold tabular-nums px-2 py-0.5 border",
            chipClass
          )}
        >
          {displayScore}
        </Badge>
        <span className="text-xs font-semibold text-muted-foreground">
          /{question.maximum_mark}
        </span>
      </div>
    </motion.div>
  );
}

function ExamDetailDrawer({
  exam,
  onClose,
}: {
  exam: Exam;
  onClose: () => void;
}) {
  const {
    data: answers,
    isLoading: answersLoading,
    isError: answersError,
  } = useExamAnswers(exam.id);

  const {
    data: questions,
    isLoading: questionsLoading,
    isError: questionsError,
  } = useExamQuestions(exam.id);

  const isLoading = answersLoading || questionsLoading;
  const isError = answersError || questionsError;

  /**
   * Build a lookup map: examquestion_id → ExamAnswer for O(1) join.
   * Both arrays may be undefined while loading.
   */
  const answerByQuestionId = useMemo(() => {
    const map = new Map<number, ExamAnswer>();
    if (answers) {
      for (const a of answers) map.set(a.examquestion_id, a);
    }
    return map;
  }, [answers]);

  /**
   * Sorted questions (by question_no ascending, numeric sort).
   */
  const sortedQuestions = useMemo(() => {
    if (!questions) return [];
    return [...questions].sort(
      (a, b) => Number(a.question_no) - Number(b.question_no)
    );
  }, [questions]);

  /**
   * Computed total from actual answer scores (works for marked exams).
   * null when no answers are present (exam not yet graded).
   */
  const computedTotal = useMemo(() => {
    if (!answers || answers.length === 0) return null;
    // Return null when none of the answers have been graded yet.
    const hasAnyScore = answers.some((a) => a.score != null);
    if (!hasAnyScore) return null;
    return answers.reduce(
      (sum, a) => sum + (a.score != null ? parseFloat(a.score) : 0),
      0
    );
  }, [answers]);

  /**
   * Total possible marks derived from the question paper
   * (sum of question.maximum_mark across all questions).
   * More reliable than exam.settings.questionPaperMaximumMark.
   */
  const totalPossible = useMemo(() => {
    if (!questions || questions.length === 0) return null;
    return questions.reduce(
      (sum, q) => sum + parseFloat(q.maximum_mark),
      0
    );
  }, [questions]);

  const totalColors =
    computedTotal != null && totalPossible != null && totalPossible > 0
      ? getScoreColorClass(computedTotal, totalPossible)
      : null;

  const isMarked = answers !== undefined && answers.length > 0;

  // Close on Esc
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Prevent body scroll while open.
  // Both <html> and <body> must be locked because different browsers/environments
  // (iOS Safari, Next.js scroll restoration) use different scroll roots.
  useEffect(() => {
    const { documentElement, body } = document;
    const prevHtml = documentElement.style.overflow;
    const prevBody = body.style.overflow;
    documentElement.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      documentElement.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  const isAssessment = exam.activity_type === "assessment";

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="drawer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — slides in from the right */}
      <motion.div
        key="drawer-panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card border-l-2 border-border shadow-[-8px_0_32px_rgba(0,0,0,0.35)]"
        role="dialog"
        aria-modal="true"
        aria-label={`Exam details: ${exam.name}`}
      >
        {/* Drawer header */}
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-4">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border",
                  isAssessment
                    ? "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/50 dark:border-blue-500/30"
                    : "bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/50 dark:border-orange-500/30"
                )}
              >
                {exam.activity_type}
              </Badge>
              {!isLoading && !isMarked && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/35 dark:border-yellow-500/20"
                >
                  Pending marks
                </Badge>
              )}
            </div>
            <h2 className="text-base font-bold text-foreground leading-snug line-clamp-2">
              {exam.name}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {getCourseName(exam)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 shrink-0 border border-red-500/50 dark:border-red-500/30 bg-red-500/10 hover:bg-red-500/20 hover:border-red-500 dark:hover:border-red-500/50 rounded-lg"
            onClick={onClose}
            aria-label="Close details"
            autoFocus
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 pb-6 space-y-4">

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loading minimal message="Waiting on Ezygo to stop ghosting us 👻" />
            </div>
          )}

          {/* Error */}
          {isError && !isLoading && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <AlertCircle className="h-7 w-7 text-red-400" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Could not load question breakdown.
              </p>
            </div>
          )}

          {/* Question rows — shown for both marked and unmarked exams */}
          {!isLoading && !isError && sortedQuestions.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                {isMarked ? "Per-question breakdown" : "Question paper"}
              </p>
              <div className="rounded-xl border border-border/50 bg-foreground/3 px-4">
                {sortedQuestions.map((q, i) => (
                  <QuestionRow
                    key={q.id}
                    question={q}
                    answer={answerByQuestionId.get(q.id)}
                    index={i}
                  />
                ))}
              </div>
            </>
          )}

          {/* No questions at all */}
          {!isLoading && !isError && sortedQuestions.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <HelpCircle
                className="h-8 w-8 text-muted-foreground/40"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">
                No question data available.
              </p>
            </div>
          )}
        </div>

        {/* Footer — computed total (only for marked exams) */}
        {computedTotal !== null && totalPossible !== null && (
          <div className="border-t border-border px-5 py-5 pb-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Total Score
              </span>
              <div className="flex items-baseline gap-0.5">
                <span
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    totalColors ? totalColors.text : "text-foreground"
                  )}
                >
                  {Number.isInteger(computedTotal)
                    ? computedTotal
                    : computedTotal.toFixed(2)}
                </span>
                <span className="text-sm text-muted-foreground font-medium">
                  /{totalPossible % 1 === 0 ? totalPossible : totalPossible.toFixed(1)}
                </span>
              </div>
            </div>
            {totalPossible > 0 && (
              <div
                className="mt-2 w-full h-1.5 bg-foreground/10 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round((computedTotal / totalPossible) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Total score ${computedTotal} of ${totalPossible}`}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    totalColors ? totalColors.bar : "bg-foreground/40"
                  )}
                  style={{
                    width: `${Math.min(100, (computedTotal / totalPossible) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
      </motion.div>
    </>
  );
}

const TABS: { key: ActivityFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "assessment", label: "Assessments" },
  { key: "assignment", label: "Assignments" },
];

export default function ScoresClient() {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { data: exams, isLoading: examsLoading, isError, refetch, isFetching } = useExams();

  // Pre-fetch all exam answers in parallel on load.
  // Only for participated exams (participants.length > 0) — no point fetching
  // answers for exams that won't be displayed.
  // Shared query keys with useExamAnswers → drawer reads from cache, no re-fetch.
  const examIds = useMemo(
    () =>
      exams
        ?.filter((e) => e.participants && e.participants.length > 0)
        .map((e) => e.id) ?? [],
    [exams]
  );
  const allAnswersQueries = useAllExamAnswers(examIds);
  const allQuestionsQueries = useAllExamQuestions(examIds);

  // Block render until exams list + every answers + every questions request has settled.
  const isLoading =
    examsLoading ||
    allAnswersQueries.some((q) => q.isPending) ||
    allQuestionsQueries.some((q) => q.isPending);

  /**
   * Map of examId → computed total score from examanswers.
   * Derived directly from the parallel queries; no mutable state needed.
   */
  const resolvedScores = useMemo(() => {
    const map: Record<number, number> = {};
    allAnswersQueries.forEach((q, i) => {
      const id = examIds[i];
      if (id !== undefined && q.data && q.data.length > 0) {
        // Only record a score when at least one answer has been graded.
        // If all scores are null the exam was submitted but not yet graded —
        // we want the card to show "Pending", not "0 / 25".
        const hasAnyScore = q.data.some((a) => a.score != null);
        if (hasAnyScore) {
          map[id] = q.data.reduce(
            (sum, a) => sum + (a.score != null ? parseFloat(a.score) : 0),
            0
          );
        }
      }
    });
    return map;
  }, [allAnswersQueries, examIds]);

  /**
   * Map of examId → total possible marks, summed from examquestions.
   * More reliable than exam.settings.questionPaperMaximumMark / exam.maximum_mark
   * which are frequently null in the API list response.
   */
  const resolvedMaxMarks = useMemo(() => {
    const map: Record<number, number> = {};
    allQuestionsQueries.forEach((q, i) => {
      const id = examIds[i];
      if (id !== undefined && q.data && q.data.length > 0) {
        map[id] = q.data.reduce(
          (sum, question) => sum + parseFloat(question.maximum_mark),
          0
        );
      }
    });
    return map;
  }, [allQuestionsQueries, examIds]);

  // Derive a stable primitive so useEffect below has a deterministic dependency.
  const panel = searchParams.get("panel");

  // Open the drawer and push a history entry so the back button can close it.
  // Only push when panel is absent; replace if a different panel value exists;
  // do nothing if panel=1 is already set. Preserves any existing query params.
  const openDrawer = useCallback(
    (exam: Exam) => {
      setSelectedExam(exam);
      const currentPanel = searchParams.get("panel");
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("panel", "1");
      const nextUrl = `${pathname}?${nextParams.toString()}`;
      if (currentPanel === null) {
        router.push(nextUrl, { scroll: false });
      } else if (currentPanel !== "1") {
        router.replace(nextUrl, { scroll: false });
      }
    },
    [router, pathname, searchParams]
  );

  // Programmatic close: replace the URL with panel param removed.
  // This is safe regardless of whether openDrawer used push or replace,
  // since we never risk navigating to a different page.
  // The Android back button still works via the history entry pushed by openDrawer
  // (when panel was absent), caught by the useEffect below.
  const closeDrawer = useCallback(() => {
    if (searchParams.get("panel")) {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("panel");
      const params = nextParams.toString();
      router.replace(params ? `${pathname}?${params}` : pathname, { scroll: false });
    } else {
      setSelectedExam(null);
    }
  }, [router, pathname, searchParams]);

  // When the back button pops ?panel=1, searchParams loses the param and
  // this effect clears the selected exam to close the drawer.
  //
  // IMPORTANT: `selectedExam` is intentionally NOT in the dependency array.
  // Adding it would cause a race condition: openDrawer() calls setSelectedExam()
  // and router.push() in the same event handler. React processes setSelectedExam
  // before the router has flushed the URL update, so the first re-render has
  // selectedExam set but panel still null — the effect would immediately fire
  // and clear selectedExam, closing the drawer before it was ever visible.
  // Depending only on `panel` means the effect only fires when the URL changes,
  // which happens after the router flush — never on the initial openDrawer call.
  // setSelectedExam(null) is a no-op when selectedExam is already null.
  useEffect(() => {
    if (!panel) {
      setSelectedExam(null);
    }
  }, [panel]);

  /**
   * Mirror EzyGo's visibility rules:
   * - "assessment": show if the teacher added the student (participants.length > 0)
   * - "assignment":  show only if the student actually submitted (examanswers.length > 0)
   *
   * Unsubmitted assignments have a participants entry but no answers — EzyGo hides them.
   */
  const participatedExams = useMemo(() => {
    if (!exams) return [];
    return exams.filter((e) => {
      if (!e.participants || e.participants.length === 0) return false;
      if (e.activity_type === "assignment") {
        const idx = examIds.indexOf(e.id);
        if (idx === -1) return false;
        const q = allAnswersQueries[idx];
        return q?.data !== undefined && q.data.length > 0;
      }
      return true;
    });
  }, [exams, examIds, allAnswersQueries]);

  const filtered = useMemo(() => {
    const base =
      filter === "all"
        ? participatedExams
        : participatedExams.filter((e) => e.activity_type === filter);
    // Marked (has resolved score) first, then pending
    return [...base].sort((a, b) => {
      const aScored = resolvedScores[a.id] !== undefined || getScore(a) !== null ? 1 : 0;
      const bScored = resolvedScores[b.id] !== undefined || getScore(b) !== null ? 1 : 0;
      return bScored - aScored;
    });
  }, [participatedExams, filter, resolvedScores]);

  const counts: Record<ActivityFilter, number> = useMemo(() => {
    return {
      all: participatedExams.length,
      assessment: participatedExams.filter((e) => e.activity_type === "assessment").length,
      assignment: participatedExams.filter((e) => e.activity_type === "assignment").length,
    };
  }, [participatedExams]);

  const stats = useMemo(() => {
    if (participatedExams.length === 0) return null;
    const scored = participatedExams.filter(
      (e) => (resolvedScores[e.id] ?? getScore(e)) != null
    ).length;
    const pending = participatedExams.length - scored;
    const percentages = participatedExams
      .map((e) => {
        const s = resolvedScores[e.id] ?? getScore(e);
        const m = resolvedMaxMarks[e.id];
        if (s == null || m == null || m === 0) return null;
        return (s / m) * 100;
      })
      .filter((v): v is number => v !== null);
    const avg =
      percentages.length > 0
        ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)
        : null;
    return { total: participatedExams.length, scored, pending, avg };
  }, [participatedExams, resolvedScores, resolvedMaxMarks]);

  if (isLoading || (!exams && !isError)) {
    return (
      <Loading />
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <div className="flex-1 flex flex-col gap-6 p-4 pt-12 sm:p-8 sm:pt-16 max-w-7xl mx-auto w-full">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 border border-purple-500/50 dark:border-purple-500/30 shrink-0">
            <GraduationCap className="h-5 w-5 text-purple-600 dark:text-purple-300" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight leading-tight">
              Scores
            </h1>
            <p className="text-sm text-muted-foreground">
              Your assessments and assignments
            </p>
          </div>
        </motion.div>

        {/* Stats strip */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3"
          >
            {[
              { label: "Total", value: String(stats.total) },
              { label: "Scored", value: String(stats.scored) },
              { label: "Pending", value: String(stats.pending) },
              { label: "Avg Score", value: stats.avg != null ? `${stats.avg}%` : "—" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-border/50 bg-card p-3 sm:p-4"
                aria-label={`${s.label}: ${s.value}`}
              >
                <div className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
                  {s.value}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {s.label}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* Filter tabs + refresh */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex items-center gap-2 flex-wrap mb-2"
        >
          {TABS.map((tab) => (
            <Button
              key={tab.key}
              variant="outline"
              size="sm"
              className={cn(
                "custom-button rounded-lg text-xs font-medium transition-all",
                filter === tab.key
                  ? "border-purple-500/60 bg-purple-500/15 text-purple-700 dark:text-purple-200"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  filter === tab.key ? "bg-purple-500/30" : "bg-foreground/10"
                )}
              >
                {counts[tab.key]}
              </span>
            </Button>
          ))}

          <div className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh scores"
            >
              <RefreshCw
                className={cn("h-4 w-4", isFetching && "animate-spin")}
                aria-hidden="true"
              />
            </Button>
          </div>
        </motion.div>

        {/* Error state */}
        {isError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3 py-12 text-center"
          >
            <AlertCircle className="h-8 w-8 text-red-400" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Failed to load scores. Please try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="custom-button"
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </motion.div>
        )}

        {/* Empty state */}
        {!isError && !isLoading && filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3 py-16 text-center"
          >
            <FileText
              className="h-10 w-10 text-muted-foreground/40"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-muted-foreground">
              No{" "}
              {filter !== "all" ? filter + "s" : "exams"} found
            </p>
          </motion.div>
        )}

        {/* Cards grouped by course */}
        {!isError && filtered.length > 0 && (() => {
          const groups = groupByCourse(filtered);
          let globalIndex = 0;
          return (
            <AnimatePresence mode="wait">
              <motion.div
                key={filter}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-8 pb-6"
              >
                {groups.map((group) => {
                  const nAssessments = group.exams.filter((e) => e.activity_type === "assessment").length;
                  const nAssignments = group.exams.filter((e) => e.activity_type === "assignment").length;
                  const countLabel =
                    nAssessments > 0 && nAssignments > 0
                      ? `${nAssessments} assessment${nAssessments !== 1 ? "s" : ""} · ${nAssignments} assignment${nAssignments !== 1 ? "s" : ""}`
                      : nAssessments > 0
                      ? `${nAssessments} assessment${nAssessments !== 1 ? "s" : ""}`
                      : `${nAssignments} assignment${nAssignments !== 1 ? "s" : ""}`;
                  return (
                  <div key={group.id}>
                    {/* Course heading */}
                    <div className="flex items-center gap-3 mb-4">
                      <BookOpen className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" aria-hidden="true" />
                      <span className="text-sm font-semibold text-foreground">
                        {group.label}
                      </span>
                      <div className="flex-1 h-px bg-foreground/10" />
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {countLabel}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {group.exams.map((exam) => {
                        const idx = globalIndex++;
                        return (
                          <ScoreCard
                            key={exam.id}
                            exam={exam}
                            index={idx}
                            onClick={() => openDrawer(exam)}
                            resolvedScore={resolvedScores[exam.id]}
                            resolvedMaxMark={resolvedMaxMarks[exam.id]}
                          />
                        );
                      })}
                    </div>
                  </div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          );
        })()}
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {selectedExam && (
          <ExamDetailDrawer
            exam={selectedExam}
            onClose={closeDrawer}
          />
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}

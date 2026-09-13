export interface AcademicInfo {
  current_semester: "even" | "odd";
  current_year: string;
}

export interface AcademicInfoOptions {
  year?: string | null;
  semester?: string | null;
}

export function calculateCurrentAcademicInfo(
  metadata?: AcademicInfoOptions,
): AcademicInfo {
  if (metadata?.year && metadata?.semester) {
    const sem = metadata.semester.toLowerCase();
    let normalizedSem: "even" | "odd" | null = null;

    if (sem.includes("odd") || sem === "1") normalizedSem = "odd";
    else if (sem.includes("even") || sem === "2") normalizedSem = "even";

    if (normalizedSem) {
      return {
        current_semester: normalizedSem,
        current_year: metadata.year,
      };
    }
  }

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const isFirstHalf = month < 6;
  const currentSemester: "even" | "odd" = isFirstHalf ? "even" : "odd";
  const startYear = isFirstHalf ? year - 1 : year;
  const endYearShort = String(startYear + 1).slice(-2);

  return {
    current_semester: currentSemester,
    current_year: `${startYear}-${endYearShort}`,
  };
}

function yearSegmentsMatch(n1: string, n2: string): boolean {
  if (n1 === n2) return true;
  return (
    (n1.length === 2 && n2.length === 4 && n2.endsWith(n1)) ||
    (n2.length === 2 && n1.length === 4 && n1.endsWith(n2))
  );
}

/**
 * Normalizes and compares two academic years to avoid false-positive rollover detection.
 * Matches e.g. "2025-2026", "25-26", "2025-26".
 */
export function yearsDiffer(y1?: string | null, y2?: string | null): boolean {
  if (!y1 || !y2) return false;
  const s1 = y1.trim();
  const s2 = y2.trim();
  if (s1 === s2) return false;

  const nums1 = s1.match(/\d+/g) || [];
  const nums2 = s2.match(/\d+/g) || [];

  if (nums1.length > 0 && nums1.length === nums2.length) {
    const allMatch = nums1.every((n1, i) => {
      const n2 = nums2.at(i);
      return n2 !== undefined && yearSegmentsMatch(n1, n2);
    });
    if (allMatch) return false;
  }
  return true;
}

/**
 * Normalizes and compares two academic semesters (e.g. "even" vs "EVEN", "1" vs "odd").
 */
export function semestersDiffer(
  s1?: string | null,
  s2?: string | null,
): boolean {
  if (!s1 || !s2) return false;
  const normalize = (s: string): string => {
    const trimmed = s.trim().toLowerCase();
    if (trimmed.includes("odd") || trimmed === "1") return "odd";
    if (trimmed.includes("even") || trimmed === "2") return "even";
    return trimmed;
  };
  return normalize(s1) !== normalize(s2);
}

/**
 * Determines whether an academic rollover has occurred between two periods.
 */
export function hasAcademicRollover(
  oldPeriod: { semester?: string | null; year?: string | null },
  newPeriod: { semester?: string | null; year?: string | null },
): boolean {
  return (
    semestersDiffer(oldPeriod.semester, newPeriod.semester) ||
    yearsDiffer(oldPeriod.year, newPeriod.year)
  );
}

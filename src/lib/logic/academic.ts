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

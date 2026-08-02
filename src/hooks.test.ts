import { describe, expect, it } from "vitest";
import * as ExamHooks from "./hooks/courses/exams.ts";

describe("Exam Hooks Import Sanity", () => {
  it("should import exam hooks", () => {
    expect(ExamHooks).toBeDefined();
  });
});

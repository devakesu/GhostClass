import { it, expect } from "vitest";
import { useFetchClassCourses } from "@/hooks/courses/useFetchClassCourses";

it("sanity check", () => {
  expect(useFetchClassCourses).toBeDefined();
});

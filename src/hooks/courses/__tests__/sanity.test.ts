import { expect, it } from "vitest";
import { useFetchClassCourses } from "@/hooks/courses/useFetchClassCourses";

it("sanity check", () => {
  expect(useFetchClassCourses).toBeDefined();
});

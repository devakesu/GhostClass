import { z } from "zod";
import { toTitleCase } from "@/lib/utils";

function stripControlChars(value: string): string {
  let result = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) continue;
    result += char;
  }
  return result;
}

function sanitizeText(value: string): string {
  return stripControlChars(value).replace(/\s+/g, " ").trim();
}

function normalizeTextValue(value: unknown, collapseWhitespace: boolean): unknown {
  if (typeof value !== "string") return value;
  const sanitized = collapseWhitespace
    ? sanitizeText(value)
    : stripControlChars(value).trim();
  return sanitized === "" ? null : sanitized;
}

type TextSchemaOptions = {
  min?: number;
  max?: number;
  pattern?: RegExp;
  error?: string;
  collapseWhitespace?: boolean;
};

function makeTextSchema({ min, max, pattern, error, collapseWhitespace = true }: TextSchemaOptions = {}) {
  let schema = z.string();

  if (typeof min === "number") {
    schema = schema.min(min, error);
  }
  if (typeof max === "number") {
    schema = schema.max(max, error);
  }
  if (pattern) {
    schema = schema.regex(pattern, error);
  }

  return z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      return collapseWhitespace ? sanitizeText(value) : stripControlChars(value).trim();
    },
    schema,
  );
}

export function makeOptionalTextSchema(options: TextSchemaOptions = {}) {
  const collapseWhitespace = options.collapseWhitespace !== false;
  return z.preprocess(
    (value) => normalizeTextValue(value, collapseWhitespace),
    makeTextSchema(options).nullish(),
  ).transform((value) => value ?? null);
}

const NAME_PATTERN = /^[\p{L}\p{M}.'’\- ]+$/u;
const COURSE_NAME_PATTERN = /^[\p{L}\p{M}\p{N}.'’&/()+,:;\- ]+$/u;

export const personNameSchema = makeTextSchema({
  min: 2,
  max: 100,
  pattern: NAME_PATTERN,
  error: "Name contains invalid characters",
}).transform((value) => toTitleCase(value));

export const courseNameSchema = makeTextSchema({
  min: 2,
  max: 200,
  pattern: COURSE_NAME_PATTERN,
  error: "Course name contains invalid characters",
});

export const optionalPersonNameSchema = makeOptionalTextSchema({
  min: 2,
  max: 100,
  pattern: NAME_PATTERN,
  error: "Name contains invalid characters",
}).transform((value) => (value ? toTitleCase(value) : null));

export const shortTextSchema = makeTextSchema({
  min: 1,
  max: 200,
});

export const optionalShortTextSchema = makeOptionalTextSchema({
  min: 1,
  max: 200,
});

export const longTextSchema = makeTextSchema({
  min: 10,
  max: 5000,
  collapseWhitespace: false,
});

export const optionalReasonSchema = makeOptionalTextSchema({
  min: 1,
  max: 255,
});

export const reasonTextSchema = makeTextSchema({
  min: 1,
  max: 255,
});

export const emailSchema = z.string().trim().email("Invalid email format").max(255, "Email too long").transform((value) => value.toLowerCase());

export const courseCodeSchema = z.string().trim().min(1, "Course code is required").max(32, "Course code too long").transform((value) => value.toUpperCase().replace(/[\s\u00A0-]/g, ""));

export const academicYearSchema = z.string().trim().regex(/^\d{4}-(\d{4}|\d{2})$/, "Invalid academic year format (expected YYYY-YYYY or YYYY-YY)");

export const semesterSchema = z.enum(["odd", "even"]);

export const genderSchema = z.enum(["male", "female", "other"]);

export const birthDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Birth date must be in YYYY-MM-DD format");

export const ezygoUsernameSchema = makeTextSchema({
  min: 1,
  max: 100,
});

export const ezygoNameSchema = makeOptionalTextSchema({
  min: 1,
  max: 100,
  pattern: NAME_PATTERN,
  error: "Name contains invalid characters",
}).transform((value) => (value ? toTitleCase(value) : null));

export const ezygoTextSchema = makeOptionalTextSchema({
  min: 1,
  max: 255,
});

export const ezygoGenderSchema = makeOptionalTextSchema({
  min: 1,
  max: 32,
});

export const ezygoBirthDateSchema = makeOptionalTextSchema({
  min: 1,
  max: 10,
  pattern: /^\d{4}-\d{2}-\d{2}$/, 
  error: "Birth date must be in YYYY-MM-DD format",
});

export const ezygoProfileSchema = z.object({
  user_id: z.union([z.string(), z.number()]).transform((value) => String(value)).optional(),
  username: ezygoUsernameSchema.optional().nullable(),
  email: emailSchema.optional().nullable(),
  mobile: ezygoTextSchema.optional().nullable(),
  first_name: ezygoNameSchema.optional().nullable(),
  last_name: ezygoNameSchema.optional().nullable(),
  full_name: ezygoNameSchema.optional().nullable(),
  gender: ezygoGenderSchema.optional().nullable(),
  sex: ezygoGenderSchema.optional().nullable(),
  birth_date: ezygoBirthDateSchema.optional().nullable(),
  dob: ezygoBirthDateSchema.optional().nullable(),
  user: z.object({
    username: ezygoUsernameSchema.optional().nullable(),
    email: emailSchema.optional().nullable(),
    mobile: ezygoTextSchema.optional().nullable(),
    id: z.union([z.string(), z.number()]).transform((value) => String(value)).optional(),
  }).partial().optional(),
}).passthrough();

export const disabledCoursesSchema = z.record(
  z.string(),
  z.record(z.string(), reasonTextSchema),
);

export function sanitizePlainText(value: string): string {
  return sanitizeText(value);
}

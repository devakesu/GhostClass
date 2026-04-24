import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.email().max(255),
  subject: z.string().max(200).optional(),
  message: z.string().min(10).max(5000),
  token: z.string().optional(),
  csrf_token: z.string().optional(),
});

interface ContactContext {
  userId?: string | null;
  ip?: string;
  userAgent?: string;
}

interface ContactInsertResult {
  id: string;
}

export async function processContactSubmission(
  supabase: any,
  payload: z.infer<typeof contactSchema>,
  ctx: ContactContext = {},
): Promise<ContactInsertResult> {
  const { data, error } = await supabase
    .from("contact_messages")
    .insert({
      user_id: ctx.userId ?? null,
      name: payload.name.trim(),
      email: payload.email.trim().toLowerCase(),
      subject: payload.subject?.trim() || "New Contact Form Submission",
      message: payload.message.trim(),
      status: "new",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to save contact message");
  }

  return { id: data.id as string };
}

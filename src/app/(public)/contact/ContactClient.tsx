import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "@/components/contact-form";

export default async function ContactClient() {
  const supabase = await createClient();

  // 1. Check if user exists
  const { data: { user } } = await supabase.auth.getUser();

  let userDetails: { name: string; email: string } | undefined = undefined;

  if (user) {
    // 2. If logged in, fetch profile details
    const { data: profile } = await supabase
      .from("users")
      .select("first_name, last_name, email")
      .eq("auth_id", user.id)
      .single();

    if (profile) {
      userDetails = {
        name: `${profile.first_name || ""} ${profile.last_name || ""}`.trim(),
        email: profile.email || user.email,
      };
    }
  }

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold text-center mb-8">Contact Us</h1>
      {/* 3. Pass the data down */}
      <ContactForm userDetails={userDetails} />
    </div>
  );
}

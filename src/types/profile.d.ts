/**
 * User profile information combining authentication and personal data.
 * Contains both required fields and optional user-editable information.
 */
export interface UserProfile {
  /** Accepted terms version */
  terms_version: string;
  /** Unique user identifier */
  id: number;
  /** Supabase auth UUID */
  auth_id?: string | null;
  /** User's first name */
  first_name?: string;
  /** User's last name */
  last_name?: string | null;
  /** Login username */
  username: string;
  /** Email address */
  email: string;
  /** Phone/mobile number */
  phone?: string | null;
  /** Alternate mobile number field used by some restored views */
  mobile?: string | null;
  /** Gender identity */
  gender?: string | null;
  /** Date of birth (ISO format) */
  birth_date?: string | null;
  /** Avatar image URL */
  avatar_url?: string | null;
  /** Selected academic semester */
  current_semester?: string | null;
  /** Selected academic year */
  current_year?: string | null;
  /** Account creation timestamp */
  created_at?: string | null;
  /** Optional class relation included by some profile responses */
  class?: {
    id?: string | number | null;
    name?: string | null;
  } | null;
}

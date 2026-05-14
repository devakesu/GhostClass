/**
 * Represents a user entity in the system.
 * Contains core user identification and authentication data.
 */
export interface User {
  /** Unique user identifier */
  id: number;
  /** User's login username */
  username: string;
  /** User's email address */
  email: string;
  /** User's mobile/phone number */
  mobile: string;
  /** Timestamp of account creation (ISO format) */
  created_at: string;
  /** Supabase Auth UUID */
  auth_id?: string;
}

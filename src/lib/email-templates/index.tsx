import { render } from "react-email";
import CourseMismatchEmail from "./course-mismatch";
import AttendanceConflictEmail from "./attendance-conflict";
import RevisionClassEmail from "./revision-class";

export { CourseMismatchEmail, AttendanceConflictEmail, RevisionClassEmail };

export {
  renderContactAdminEmail,
  renderContactConfirmationEmail,
} from "./contact";
export type {
  ContactAdminEmailProps,
  ContactConfirmationEmailProps,
} from "./contact";

/**
 * Render email templates to HTML strings
 */
export const renderCourseMismatchEmail = async (props: {
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  date: string;
  session: string;
  manualCourseName: string;
  courseLabel: string;
  dashboardUrl: string;
}): Promise<string> => {
  return render(<CourseMismatchEmail {...props} />);
};

export const renderAttendanceConflictEmail = async (props: {
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  courseLabel: string;
  date: string;
  session: string;
  dashboardUrl: string;
}): Promise<string> => {
  return render(<AttendanceConflictEmail {...props} />);
};

export const renderRevisionClassEmail = async (props: {
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  courseName: string;
  date: string;
  session: string;
  dashboardUrl: string;
}): Promise<string> => {
  return render(<RevisionClassEmail {...props} />);
};

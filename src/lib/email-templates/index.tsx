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
export const renderCourseMismatchEmail = (props: {
  username: string;
  date: string;
  session: string;
  manualCourseName: string;
  courseLabel: string;
  dashboardUrl: string;
}): Promise<string> => {
  return render(<CourseMismatchEmail {...props} />);
};

export const renderAttendanceConflictEmail = (props: {
  username: string;
  courseLabel: string;
  date: string;
  session: string;
  dashboardUrl: string;
}): Promise<string> => {
  return render(<AttendanceConflictEmail {...props} />);
};

export const renderRevisionClassEmail = (props: {
  username: string;
  courseName: string;
  date: string;
  session: string;
  dashboardUrl: string;
}): Promise<string> => {
  return render(<RevisionClassEmail {...props} />);
};

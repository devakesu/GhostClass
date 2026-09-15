import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Section,
  Text,
} from "react-email";
import {
  badgeStyles,
  emailStyles,
  getLogoUrl,
  headerLogoStyle,
  tableStyles,
} from "./styles";

interface AttendanceConflictEmailProps {
  username: string;
  courseLabel: string;
  date: string;
  session: string;
  dashboardUrl: string;
  markedAttendance?: string;
  isDutyLeave?: boolean;
  remarks?: string | null;
}

export const AttendanceConflictEmail = ({
  username,
  courseLabel,
  date,
  session,
  dashboardUrl,
  markedAttendance,
  isDutyLeave,
  remarks,
}: AttendanceConflictEmailProps) => (
  <Html>
    <Head />
    <Body style={emailStyles.main}>
      <Container style={emailStyles.container}>
        <Section style={emailStyles.header}>
          <Img
            src={getLogoUrl()}
            alt="GhostClass"
            width={180}
            style={headerLogoStyle}
          />
        </Section>

        <Section style={emailStyles.content}>
          <Heading style={emailStyles.title}>
            {isDutyLeave
              ? "Duty Leave Update — Apply for DL"
              : "Attendance Conflict Detected"}
          </Heading>

          <Text style={emailStyles.paragraph}>
            Hi <strong>{username}</strong>,<br />
            {isDutyLeave
              ? `Your extra Duty Leave entry for ${courseLabel} on ${date} (Session ${session}) has been updated as absent in the official records. You can now apply for official duty leave.`
              : "We found a discrepancy between your self-marked attendance and the official record."}
          </Text>

          <Section style={emailStyles.conflictBox}>
            <table style={tableStyles.table}>
              <tbody>
                <tr>
                  <td style={tableStyles.cellLabel}>📚 Course</td>
                  <td style={tableStyles.cellValue}>{courseLabel}</td>
                </tr>
                <tr>
                  <td style={tableStyles.cellLabel}>📅 Date</td>
                  <td style={tableStyles.cellValue}>
                    {date} - ({session})
                  </td>
                </tr>
                <tr>
                  <td style={tableStyles.cellLabel}>👤 You Marked</td>
                  <td style={tableStyles.cellValueWithBadge}>
                    <span
                      style={
                        isDutyLeave
                          ? badgeStyles.dutyLeave
                          : badgeStyles.present
                      }
                    >
                      {markedAttendance ||
                        (isDutyLeave ? "Duty Leave" : "Present")}
                    </span>
                  </td>
                </tr>
                {remarks && remarks.trim() ? (
                  <tr>
                    <td style={tableStyles.cellLabel}>
                      📝 Your Manual Record Remarks:
                    </td>
                    <td style={tableStyles.cellValueBold}>{remarks.trim()}</td>
                  </tr>
                ) : null}
                <tr>
                  <td style={tableStyles.cellLabelLast}>🏫 Official</td>
                  <td style={tableStyles.cellValueWithBadgeLast}>
                    <span style={badgeStyles.absent}>Absent</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Text style={emailStyles.note}>
            {isDutyLeave ? (
              "We have automatically updated this entry to match the official status so you can track your attendance accurately while your Duty Leave application is processed."
            ) : (
              <>
                We have automatically flagged this entry as a{" "}
                <strong>Correction</strong> in your dashboard to keep your stats
                accurate.
              </>
            )}
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={dashboardUrl}>
              Open Dashboard
            </Button>
          </Section>
        </Section>

        <Section style={emailStyles.footer}>
          <Text style={emailStyles.footerText}>GhostClass 👻</Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default AttendanceConflictEmail;

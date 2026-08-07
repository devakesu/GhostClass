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
  emailStyles,
  getLogoUrl,
  headerLogoStyle,
  tableStyles,
} from "./styles";

interface CourseMismatchEmailProps {
  username: string;
  date: string;
  session: string;
  manualCourseName: string;
  courseLabel: string;
  dashboardUrl: string;
  /** Human-readable attendance label, e.g. "Present", "Absent", "Duty Leave" */
  attendance: string;
  /** Optional remark/note the user added when recording the entry */
  remarks?: string | null;
}

export const CourseMismatchEmail = ({
  username,
  date,
  session,
  manualCourseName,
  courseLabel,
  dashboardUrl,
  attendance,
  remarks,
}: CourseMismatchEmailProps) => (
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
          <Heading style={emailStyles.title}>Course Mismatch Detected</Heading>

          <Text style={emailStyles.paragraph}>
            Hi <strong>{username}</strong>,<br />
            We noticed a mix-up. You self-recorded a class for one course, but
            the official record shows a different one for that time slot.
          </Text>

          <Section style={emailStyles.conflictBox}>
            <table style={tableStyles.table}>
              <tbody>
                <tr>
                  <td style={tableStyles.cellLabel}>📅 Date</td>
                  <td style={tableStyles.cellValue}>
                    {date} - ({session})
                  </td>
                </tr>
                <tr>
                  <td style={tableStyles.cellLabel}>👤 You Marked</td>
                  <td style={tableStyles.cellValueBold}>{manualCourseName}</td>
                </tr>
                <tr>
                  <td style={tableStyles.cellLabel}>✅ Your Status</td>
                  <td style={tableStyles.cellValueBold}>{attendance}</td>
                </tr>
                {remarks
                  ? (
                    <tr>
                      <td style={tableStyles.cellLabel}>📝 Your Remarks</td>
                      <td style={tableStyles.cellValueBold}>{remarks}</td>
                    </tr>
                  )
                  : null}
                <tr>
                  <td style={tableStyles.cellLabelLast}>🏫 Official Record</td>
                  <td style={tableStyles.cellValueBoldLast}>{courseLabel}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Text style={emailStyles.note}>
            To prevent confusion, we have{" "}
            <strong>removed your manual entry</strong>. The details above are
            kept here for your reference. Please check your dashboard for the
            correct status.
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

export default CourseMismatchEmail;

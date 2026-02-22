import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Section,
  Text,
  Button,
} from "@react-email/components";
import { emailStyles, tableStyles, getLogoUrl, headerLogoStyle } from "./styles";

interface CourseMismatchEmailProps {
  username: string;
  date: string;
  session: string;
  manualCourseName: string;
  courseLabel: string;
  dashboardUrl: string;
}

export const CourseMismatchEmail = ({
  username,
  date,
  session,
  manualCourseName,
  courseLabel,
  dashboardUrl,
}: CourseMismatchEmailProps) => (
  <Html>
    <Head />
    <Body style={emailStyles.main}>
      <Container style={emailStyles.container}>
        <Section style={emailStyles.header}>
          <Img src={getLogoUrl()} alt="GhostClass" width={180} style={headerLogoStyle} />
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
                  <td style={tableStyles.cellLabelLast}>🏫 Official Record</td>
                  <td style={tableStyles.cellValueBoldLast}>{courseLabel}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Text style={emailStyles.note}>
            To prevent confusion, we have{" "}
            <strong>removed your manual entry</strong>. Please check your
            dashboard for the correct status.
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

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
import { emailStyles, tableStyles, badgeStyles, getLogoUrl, headerLogoStyle } from "./styles";

interface AttendanceConflictEmailProps {
  username: string;
  courseLabel: string;
  date: string;
  session: string;
  dashboardUrl: string;
}

export const AttendanceConflictEmail = ({
  username,
  courseLabel,
  date,
  session,
  dashboardUrl,
}: AttendanceConflictEmailProps) => (
  <Html>
    <Head />
    <Body style={emailStyles.main}>
      <Container style={emailStyles.container}>
        <Section style={emailStyles.header}>
          <Img src={getLogoUrl()} alt="GhostClass" width={180} style={headerLogoStyle} />
        </Section>

        <Section style={emailStyles.content}>
          <Heading style={emailStyles.title}>Attendance Conflict Detected</Heading>

          <Text style={emailStyles.paragraph}>
            Hi <strong>{username}</strong>,<br />
            We found a discrepancy between your self-marked attendance and the
            official record.
          </Text>

          <Section style={emailStyles.conflictBox}>
            {/* eslint-disable-next-line sonarjs/table-header -- Email table uses label/value format without <th> */}
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
                    <span style={badgeStyles.present}>Present</span>
                  </td>
                </tr>
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
            We have automatically flagged this entry as a{" "}
            <strong>Correction</strong> in your dashboard to keep your stats
            accurate.
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

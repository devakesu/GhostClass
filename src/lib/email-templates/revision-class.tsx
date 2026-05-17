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
} from "react-email";
import { emailStyles, tableStyles, getLogoUrl, headerLogoStyle } from "./styles";

interface RevisionClassEmailProps {
  username: string;
  courseName: string;
  date: string;
  session: string;
  dashboardUrl: string;
}

export const RevisionClassEmail = ({
  username,
  courseName,
  date,
  session,
  dashboardUrl,
}: RevisionClassEmailProps) => (
  <Html>
    <Head />
    <Body style={emailStyles.main}>
      <Container style={emailStyles.container}>
        <Section style={emailStyles.header}>
          <Img src={getLogoUrl()} alt="GhostClass" width={180} style={headerLogoStyle} />
        </Section>

        <Section style={emailStyles.content}>
          <Heading style={emailStyles.title}>Revision Class — Not Counted 📚</Heading>

          <Text style={emailStyles.paragraph}>
            Hi <strong>{username}</strong>,<br />
            EzyGo marked one of your self-recorded classes as a{" "}
            <strong>Revision</strong> class. Revision classes are not counted
            toward attendance, so your manual entry has been removed.
          </Text>

          <Section style={emailStyles.conflictBox}>
            <table style={tableStyles.table}>
              <thead>
                <tr>
                  <th colSpan={2} style={{ ...tableStyles.cellLabel, borderBottom: "1px solid #e5e7eb", textAlign: "left" }} scope="col">
                    Class Details
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tableStyles.cellLabel}>📚 Course</td>
                  <td style={tableStyles.cellValue}>{courseName}</td>
                </tr>
                <tr>
                  <td style={tableStyles.cellLabel}>📅 Date</td>
                  <td style={tableStyles.cellValue}>
                    {date} - ({session})
                  </td>
                </tr>
                <tr>
                  <td style={tableStyles.cellLabelLast}>🏫 Class Type</td>
                  <td style={tableStyles.cellValueBoldLast}>Revision</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Text style={emailStyles.note}>
            This class will <strong>not</strong> affect your attendance
            percentage. Check your dashboard to review your current standing.
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

export default RevisionClassEmail;

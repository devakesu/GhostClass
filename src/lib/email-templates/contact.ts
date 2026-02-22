/**
 * Contact-form email templates.
 *
 * Extracted from src/app/actions/contact.ts so the HTML is maintainable
 * in one place and independently testable. Functions accept pre-sanitized
 * strings (HTML-escaped name/email/subject, sanitizeHtml-processed message)
 * consistent with the call-site contract established by the original inline
 * templates.
 */

const BRAND_COLOR = "#7b75ff";
const BG_COLOR = "#f9fafb";

const CONTAINER_STYLE =
  `font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; ` +
  `background-color: ${BG_COLOR}; padding: 40px 20px; line-height: 1.6; color: #374151;`;

const CARD_STYLE =
  `max-width: 600px; margin: 0 auto; background-color: #ffffff; ` +
  `border-radius: 12px; overflow: hidden; ` +
  `box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb;`;

const HEADER_STYLE =
  `background-color: ${BRAND_COLOR}; padding: 30px 40px; text-align: center;`;

/**
 * Absolute URL for the app logo. Email clients cannot resolve relative paths, so
 * the logo must be served from a known public origin. Falls back to an empty string
 * (no <img>) if neither env var is set, which is safe for local dev/test runs.
 */
const getLogoUrl = (): string => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (appUrl) return `${appUrl}/logo.png`;
  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN;
  if (domain) return `https://${domain}/logo.png`;
  return "";
};

/** Renders a responsive logo <img> for the email header, or an empty string if no URL is configured. */
const renderLogoImg = (size = 180): string => {
  const src = getLogoUrl();
  if (!src) return `<span style="color: #ffffff; font-size: 22px; font-weight: 700;">GhostClass</span>`;
  return (
    `<img src="${src}" alt="GhostClass" width="${size}" ` +
    `style="display: block; margin: 0 auto; width: ${size}px; max-width: 100%; height: auto; border: 0;" />`);
};

const BODY_STYLE = `padding: 40px;`;

const FOOTER_STYLE =
  `background-color: #f3f4f6; padding: 20px; text-align: center; ` +
  `font-size: 12px; color: #6b7280;`;

// ---------------------------------------------------------------------------

export interface ContactAdminEmailProps {
  /** HTML-escaped sender name */
  name: string;
  /** HTML-escaped sender email */
  email: string;
  /** HTML-escaped message subject */
  subject: string;
  /** sanitize-html processed message body (may contain <br> and safe inline tags) */
  message: string;
  /** "Registered User" | "Guest Visitor" */
  userType: string;
  /** Database row ID of the inserted contact message */
  messageId: string;
}

/** Returns the HTML string for the admin notification email. */
export const renderContactAdminEmail = ({
  name,
  email,
  subject,
  message,
  userType,
  messageId,
}: ContactAdminEmailProps): string => `
  <div style="${CONTAINER_STYLE}">
    <div style="${CARD_STYLE}">
      <div style="${HEADER_STYLE}">
        ${renderLogoImg(180)}
        <h2 style="color: #ffffff; margin: 14px 0 0; font-size: 22px; font-weight: 600;">New Contact Submission</h2>
      </div>
      <div style="${BODY_STYLE}">
        <p style="margin-top: 0; color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;">Sender Details</p>
        <table style="width: 100%; margin-bottom: 20px; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 100px;">Name:</td>
            <td style="padding: 8px 0; font-weight: 500; color: #111827;">${name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Email:</td>
            <td style="padding: 8px 0; font-weight: 500; color: #111827;">
              <a href="mailto:${email}" style="color: ${BRAND_COLOR}; text-decoration: none;">${email}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Status:</td>
            <td style="padding: 8px 0; font-weight: 500; color: #111827;">${userType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">ID:</td>
            <td style="padding: 8px 0; font-family: monospace; color: #6b7280; font-size: 12px;">${messageId}</td>
          </tr>
        </table>

        <div style="background-color: #f3f4f6; border-radius: 8px; padding: 25px; border-left: 4px solid ${BRAND_COLOR};">
          <p style="margin-top: 0; color: #6b7280; font-size: 12px; font-weight: bold; text-transform: uppercase;">Subject: ${subject}</p>
          <div style="color: #374151; font-size: 16px;">${message}</div>
        </div>
      </div>
      <div style="${FOOTER_STYLE}">
        This is an automated notification from GhostClass System.
      </div>
    </div>
  </div>
`;

// ---------------------------------------------------------------------------

export interface ContactConfirmationEmailProps {
  /** HTML-escaped sender name */
  name: string;
  /** HTML-escaped message subject */
  subject: string;
  /** sanitize-html processed message body (may contain <br> and safe inline tags) */
  message: string;
}

/** Returns the HTML string for the user confirmation email. */
export const renderContactConfirmationEmail = ({
  name,
  subject,
  message,
}: ContactConfirmationEmailProps): string => `
  <div style="${CONTAINER_STYLE}">
    <div style="${CARD_STYLE}">
      <div style="${HEADER_STYLE}">
        ${renderLogoImg(180)}
      </div>
      <div style="${BODY_STYLE}">
        <h3 style="margin-top: 0; color: #111827; font-size: 20px;">Hi ${name},</h3>
        <p style="color: #4b5563; font-size: 16px;">
          Thanks for getting in touch! We've received your message and our team is looking into it.
        </p>
        <p style="color: #4b5563; font-size: 16px;">
          We typically respond within 24-48 hours. In the meantime, here's a copy of what you sent:
        </p>

        <div style="margin: 30px 0; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
          <p style="margin: 0 0 10px 0; font-size: 12px; color: #9ca3af; text-transform: uppercase; font-weight: 600;">Subject: ${subject}</p>
          <p style="margin: 0; color: #374151; font-style: italic;">&ldquo;${message}&rdquo;</p>
        </div>

        <p style="color: #4b5563; font-size: 16px;">Best regards,<br/><strong style="color: #111827;">The GhostClass Team</strong></p>
      </div>
      <div style="${FOOTER_STYLE}">
        &copy; ${new Date().getFullYear()} GhostClass. All rights reserved.
      </div>
    </div>
  </div>
`;

/**
 * Shared styles for email templates
 */

/**
 * Absolute URL for the app logo used in email headers.
 * Email clients cannot resolve relative paths, so it must be a full URL.
 * Falls back to an empty string for local dev/test where APP_URL may not be set.
 */
export const getLogoUrl = (): string => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (appUrl) return `${appUrl}/logo.png`;
  return "";
};

export const headerLogoStyle = {
  display: "block",
  margin: "0 auto",
  width: "180px",
  maxWidth: "100%",
  height: "auto",
  border: "0",
} as const;

export const emailStyles = {
  main: {
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    backgroundColor: "#f3f4f6",
    margin: "0",
    padding: "40px 0",
  },

  container: {
    maxWidth: "600px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
    border: "1px solid #e5e7eb",
  },

  header: {
    background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
    padding: "32px 20px",
    textAlign: "center" as const,
  },

  content: {
    padding: "40px 30px",
  },

  title: {
    color: "#111827",
    fontSize: "20px",
    fontWeight: "600",
    marginTop: "0",
    marginBottom: "16px",
  },

  paragraph: {
    color: "#4b5563",
    fontSize: "16px",
    lineHeight: "1.6",
    marginBottom: "24px",
  },

  conflictBox: {
    backgroundColor: "#fff1f2",
    border: "1px solid #fecdd3",
    borderRadius: "8px",
    padding: "20px",
  },

  note: {
    color: "#6b7280",
    fontSize: "14px",
    marginTop: "24px",
    lineHeight: "1.5",
    textAlign: "center" as const,
  },

  buttonContainer: {
    textAlign: "center" as const,
    marginTop: "32px",
  },

  button: {
    backgroundColor: "#7c3aed",
    color: "#ffffff",
    padding: "12px 32px",
    borderRadius: "6px",
    textDecoration: "none",
    fontWeight: "bold",
    fontSize: "16px",
    display: "inline-block",
    boxShadow: "0 4px 6px rgba(124, 58, 237, 0.25)",
  },

  footer: {
    backgroundColor: "#f9fafb",
    padding: "20px",
    textAlign: "center" as const,
    borderTop: "1px solid #e5e7eb",
  },

  footerText: {
    color: "#9ca3af",
    fontSize: "12px",
    margin: "0",
  },
};

export const tableStyles = {
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
  },

  cellLabel: {
    padding: "8px 0",
    borderBottom: "1px solid #ffe4e6",
    color: "#be123c",
    fontSize: "14px",
    fontWeight: "600",
  },

  cellLabelLast: {
    padding: "8px 0",
    color: "#be123c",
    fontSize: "14px",
    fontWeight: "600",
  },

  cellValue: {
    padding: "8px 0",
    borderBottom: "1px solid #ffe4e6",
    color: "#111827",
    textAlign: "right" as const,
    fontSize: "14px",
  },

  cellValueBold: {
    padding: "8px 0",
    borderBottom: "1px solid #ffe4e6",
    color: "#111827",
    textAlign: "right" as const,
    fontSize: "14px",
    fontWeight: "500",
  },

  cellValueBoldLast: {
    padding: "8px 0",
    color: "#111827",
    textAlign: "right" as const,
    fontSize: "14px",
    fontWeight: "700",
  },

  cellValueWithBadge: {
    padding: "8px 0",
    borderBottom: "1px solid #ffe4e6",
    textAlign: "right" as const,
  },

  cellValueWithBadgeLast: {
    padding: "8px 0",
    textAlign: "right" as const,
  },
};

export const badgeStyles = {
  present: {
    backgroundColor: "#dcfce7",
    color: "#15803d",
    padding: "4px 10px",
    borderRadius: "999px",
    fontWeight: "700",
    fontSize: "12px",
  },

  absent: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
    padding: "4px 10px",
    borderRadius: "999px",
    fontWeight: "700",
    fontSize: "12px",
  },
};

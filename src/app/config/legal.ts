export const TERMS_VERSION = "2.5";
const RAW_LEGAL_EFFECTIVE_DATE =
    process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE || "2026-03-06";

function normalizeLegalEffectiveDate(value: string): string {
    const trimmed = value.trim();
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!isoMatch) return trimmed;

    const [, year, month, day] = isoMatch;
    const monthIndex = Number(month) - 1;
    const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];

    if (monthIndex < 0 || monthIndex > 11) return trimmed;

    const dayNum = Number(day);
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) return trimmed;

    return `${months[monthIndex]} ${dayNum}, ${year}`;
}

export const LEGAL_EFFECTIVE_DATE = normalizeLegalEffectiveDate(
    RAW_LEGAL_EFFECTIVE_DATE,
);
const LEGAL_EMAIL = process.env.NEXT_PUBLIC_LEGAL_EMAIL || "legal@example.com";

// ------------------------------------------------------------------
// 1.  DISCLAIMER
// ------------------------------------------------------------------
export const BUNK_DISCLAIMER = `
**Educational Tool Only:** GhostClass is an independent attendance calculation tool designed to help students manage their time.

**No Liability:** You acknowledge that:
* Official college records are the final authority.
* Sync delays or API errors may cause discrepancies between GhostClass and EzyGo.
* You are solely responsible for maintaining the minimum attendance required by your university/institution.

**Use at Your Own Risk:** The creators are **not affiliated with, endorsed by, or connected to EzyGo**. TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE CREATORS OF GHOSTCLASS DISCLAIM ALL LIABILITY FOR ANY ACADEMIC CONSEQUENCES, INCLUDING BUT NOT LIMITED TO: grade reductions, exam ineligibility, disciplinary action, or loss of academic opportunity resulting from reliance on this app.
`;

// ------------------------------------------------------------------
// 2. PRIVACY POLICY
// ------------------------------------------------------------------
export const PRIVACY_POLICY = `
**Effective Date:** ${LEGAL_EFFECTIVE_DATE}

**1. Information We Collect**
To provide the GhostClass service, we collect and process specific categories of data:

* **Identity & Contact Information:** When you create an account, we collect your **legal name, email address, phone number, birth date, and gender from EzyGo**. This data is used for account management, security verification, and essential service communications.
* **Authentication Credentials:** We require your EzyGo authentication token to fetch data on your behalf. **We strictly DO NOT store your raw password.** We only store the encrypted session token.
* **Academic Data:** We cache your attendance records, course names, and schedule data to improve load times and provide analytics.
* **Device Preference Data (Browser Storage):** We store non-sensitive UI preferences on your device (for example theme mode, bunk calculator visibility, and target percentage) using localStorage/sessionStorage to improve usability and reduce repeated setup.
* **Communication Data:** If you contact us via our support forms, we collect your name, email, and message content to address your inquiry, regardless of whether you have a registered account.
* **Technical Telemetry:** We collect data such as your IP address, browser type, device model, and operating system version to ensure security and optimize performance.

**2. Security & Encryption Standards**
We employ industry-standard security measures to protect your data:
* **AES-256 Encryption:** All sensitive tokens are encrypted using **AES-256** before being written to our database.
* **In-Memory Processing:** Decryption of credentials occurs only in ephemeral server memory (RAM) for the duration of the API request and is never written to disk logs.
* **HTTPS/TLS:** All data transmission occurs over secure, encrypted channels.
* **"Ghost" Identity:** We create a shadow account linked to a cryptographic hash of your university identity.

**3. Third-Party Infrastructure & Sub-Processors**
We use trusted third-party infrastructure to operate GhostClass. By using the Service, you acknowledge and consent to your data being processed by the following providers:

* **Cloudflare (Edge Network & Security):**
    * *Purpose:* DNS resolution, DDoS protection, Content Delivery Network (CDN), Web Application Firewall (WAF), and **Turnstile CAPTCHA verification** for abuse prevention on user-submitted forms.
    * *Data:* User IP addresses, web traffic metadata, and security cookies.
    * *Location:* Global (Edge Network). [Privacy Policy](https://www.cloudflare.com/privacypolicy/)

* **Cloudflare Workers (Egress & ISP-Bypass Proxy):**
    * *Purpose:* Two separate worker deployments: (1) **EzyGo egress proxy** — Tier-1 server-side outbound proxy for EzyGo API requests, improving resiliency and masking the origin server IP; (2) **Supabase browser proxy** — optional, transparently routes browser → Supabase requests when \`supabase.co\` is regionally blocked by ISPs, without exposing a shared secret to the client (access is controlled by Origin header checking).
    * *Data:* (1) EzyGo proxy: request metadata (source IP / User-Agent forwarding headers) and proxied EzyGo request/response payloads, processed entirely in transit — no persistent storage. (2) Supabase proxy: Supabase authentication and database request/response payloads processed in transit — no persistent storage.
    * *Location:* Global (Cloudflare network). [Privacy Policy](https://www.cloudflare.com/privacypolicy/)

* **Amazon Web Services - Lambda + API Gateway (Egress & ISP-Bypass Proxy):**
    * *Purpose:* Two separate Lambda deployments: (1) **EzyGo egress proxy** — Tier-2 server-side outbound proxy fallback for EzyGo API requests when the Cloudflare tier is unavailable; (2) **Supabase browser proxy** — optional Tier-2 fallback for browser → Supabase requests when the Cloudflare Supabase proxy is unavailable.
    * *Data:* (1) EzyGo proxy: request metadata (source IP / User-Agent forwarding headers) and proxied EzyGo request/response payloads, processed entirely in transit — no persistent storage. (2) Supabase proxy: Supabase authentication and database request/response payloads processed in transit — no persistent storage.
    * *Location:* **Mumbai, India (AWS ap-south-1)**. [Privacy Policy](https://aws.amazon.com/privacy/)

* **Hetzner Online GmbH (Compute Infrastructure):**
    * *Purpose:* Hosts the application servers (VPS) that run the GhostClass logic and proxy requests to EzyGo.
    * *Data:* Ephemeral processing of encrypted tokens and API responses.
    * *Location:* Germany / Finland (EU Jurisdiction). [Privacy Policy](https://www.hetzner.com/legal/privacy-policy)

* **Supabase (Database & Auth):**
    * *Purpose:* Persistent storage of encrypted tokens and user preferences.
    * *Data:* Encrypted database rows and authentication session logs.
    * *Location:* AWS Regions (managed by Supabase). [Privacy Policy](https://supabase.com/privacy)

* **Sentry (Error Tracking):**
    * *Purpose:* Real-time crash reporting.
    * *Data:* Stack traces and error logs (Sanitized of PII).

* **Google Analytics (Usage Stats):**
    * *Purpose:* Anonymized usage statistics.

**4. International Data Transfers**
By using GhostClass, you acknowledge that your data may be transferred to and processed in servers located in **Germany (Hetzner)**, **India (AWS ap-south-1 for Lambda/API Gateway proxies)**, **your project's configured Supabase AWS region**, and globally via **Cloudflare's Edge/Workers**, regardless of your own physical location or the location of your university.

**5. Data Retention & Your Rights**
You retain full ownership and control over your data.
* **Right to Deletion:** You may delete your account at any time via the "Delete Account" action in your Profile. Upon deletion, your encrypted tokens and cached attendance data are **permanently and irreversibly removed** from our database.
* **Right to Access:** As an open-source project, our code is available for audit on GitHub to verify our data handling practices.
* **Grievance Redressal:** If you have concerns regarding the processing of your data, please contact us at **[${LEGAL_EMAIL}](mailto:${LEGAL_EMAIL})**.
`;

// ------------------------------------------------------------------
// 3. TERMS OF SERVICE
// ------------------------------------------------------------------
export const TERMS_OF_SERVICE = `
**1. Acceptance of Terms**
By accessing, browsing, or using GhostClass ("the Service"), you agree to be bound by these Terms of Service and all applicable laws and regulations. If you disagree with any part of the terms, you must discontinue use immediately.

**2. Software License: GNU General Public License (GPL)**
The underlying software source code of GhostClass is free software licensed under the **GNU General Public License v3.0 (or later)**.
* **Your Freedoms:** You are free to run the program, study how it works, redistribute copies, and modify the software to suit your needs.
* **Copyleft Obligation:** If you distribute copies or modifications of this software, **you must also release your source code** under the same GPL license. You cannot repackage this open-source code into a proprietary, closed-source product.
* **Source Code Availability:** The complete source code is available for audit and download on our public GitHub repository.

**3. "AS IS" WARRANTY DISCLAIMER**
BECAUSE THE PROGRAM IS LICENSED FREE OF CHARGE, THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW. THE COPYRIGHT HOLDERS PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU.

**4. Hosted Service Acceptable Use Policy**
While the *source code* is free, your usage of our *hosted instance* (this website) is a privilege, not a right. You agree NOT to:
* **API Abuse:** Use automated scripts, bots, spiders, or scrapers to access the Service in a manner that sends more request messages to our servers (or the upstream EzyGo servers) in a given period of time than a human can reasonably produce.
* **Security Violations:** Attempt to decipher, decompile, or reverse engineer any of the encryption keys or software algorithms used to provide the Service.
* **Malicious Activity:** Upload viruses, worms, or malicious code, or attempt to decrypt other users' data.
* **Upstream Integrity:** You agree not to use the Service in a manner that triggers rate limits, security blocks, or IP bans from EzyGo, which could jeopardize access for the entire community.

**5. Indemnification**
You agree to defend, indemnify, and hold harmless the creators, maintainers, and contributors of GhostClass from and against any claims, actions, or demands, including, without limitation, reasonable legal and accounting fees, alleging or resulting from (i) your use of the Service, (ii) your breach of these Terms of Service, or (iii) your violation of any university policy or academic regulation.

**6. Termination**
We reserve the right to terminate or suspend access to our hosted service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.

**7. Governing Law**
These Terms shall be governed and construed in accordance with the laws of **India**, without regard to its conflict of law provisions. Any disputes arising out of or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts at **Kochi, Kerala, India**.

**8. Contact Information**
For any legal inquiries, data deletion requests, or notices of violation, please contact us at **[${LEGAL_EMAIL}](mailto:${LEGAL_EMAIL})**.
`;

// ------------------------------------------------------------------
// 4. COOKIE POLICY
// ------------------------------------------------------------------
export const COOKIE_POLICY = `
**1. What Are Cookies?**
Cookies are small text files that are placed on your computer or mobile device by websites that you visit.

**2. Strictly Necessary Cookies (Essential)**
These cookies are fundamental to the operation and security of GhostClass. They cannot be disabled.
* **sb-[project-id]-auth-token:** A secure, HTTP-only cookie set by Supabase to maintain your authenticated session.
* **ezygo_access_token:** A secure, HTTP-only cookie that facilitates communication with the EzyGo API.
* **csrf_token:** A security token that protects against Cross-Site Request Forgery (CSRF) attacks. This cookie is HTTP-only (not accessible to JavaScript) to protect against XSS attacks. The token is provided to client-side code through secure API responses for use in subsequent requests (Synchronizer Token Pattern).
* **terms_version:** A secure, HTTP-only cookie used to validate, as part of the authentication flow, that you have accepted the current version of our Terms of Service.
* **__cf_bm / __cf_clearance:** Set by **Cloudflare**. These cookies are used to distinguish between humans and bots (including Turnstile CAPTCHA) and are essential for the security of our site.

**3. Performance & Analytics Cookies**
These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site.
* **_ga, _gid:** Set by Google Analytics to generate anonymous statistical data on website usage.
* **sentry-sc:** Set by Sentry to track session errors and debugging information.

**4. Browser Storage (localStorage/sessionStorage)**
In addition to cookies, GhostClass uses browser storage for functional preferences.
* **ghostclass-theme:** Stores your selected theme mode (light/dark).
* **showBunkCalc_[userId], targetPercentage_[userId]:** Stores attendance display preferences for convenience across sessions.
* **prefetchedSettings (sessionStorage):** Temporarily stores settings during navigation flows in the same browser session.
These values are used for user experience only and do not grant authentication access.

**5. Managing & Disabling Cookies**
Most web browsers allow some control of most cookies through the browser settings. However, if you block strictly necessary cookies (like Cloudflare or Supabase tokens), the application will fail to function.
`;
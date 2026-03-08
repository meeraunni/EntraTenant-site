// functions/api/contact.js
export async function onRequest(context) {
  const { request, env } = context;

  // ----- Config -----
  const TO_EMAIL = env.TO_EMAIL || "info@sentinelidentity.ca";
  const FROM_EMAIL = env.FROM_EMAIL || "noreply@sentinelidentity.ca";

  // Allow both apex + www (and optionally preview domains if you add them)
  const allowedOrigins = new Set(
    (env.ALLOWED_ORIGINS || "https://sentinelidentity.ca,https://www.sentinelidentity.ca")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
  );

  const origin = request.headers.get("Origin") || "";

  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://sentinelidentity.ca",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };

  // ----- Preflight -----
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ----- Method guard -----
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, corsHeaders);
  }

  // ----- Origin guard (basic CSRF protection) -----
  // If no Origin header (server-to-server), allow it.
  if (origin && !allowedOrigins.has(origin)) {
    return json({ ok: false, error: "Origin not allowed" }, 403, corsHeaders);
  }

  // ----- Parse body -----
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return json({ ok: false, error: "Invalid content type. Expected application/json." }, 415, corsHeaders);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400, corsHeaders);
  }

  // ----- Honeypot -----
  if (safe(body.company_site)) {
    // Bot filled hidden field. Pretend success.
    return json({ ok: true }, 200, corsHeaders);
  }

  // ----- Accept both naming schemes (so frontend changes won't break backend) -----
  const name = safe(body.name);
  const email = safe(body.email);

  const company = safe(body.company || body.org);
  const userCount = safe(body.userCount);
  const primaryFocus = safe(body.primaryFocus || body.topic);

  // Important: accept both 'problemSummary' and 'message'
  const problemSummary = safe(body.problemSummary || body.message);

  const sourcePage = safe(body.sourcePage);

  // ----- Validation -----
  if (!name || !email || !problemSummary) {
    return json(
      { ok: false, error: "Name, email, and issue summary are required." },
      400,
      corsHeaders
    );
  }

  if (!isValidEmail(email)) {
    return json({ ok: false, error: "Invalid email address." }, 400, corsHeaders);
  }

  // ----- Build email content -----
  const submittedAt = new Date().toISOString();

  const adminSubject = `New Sentinel Identity Assessment Request - ${company || name}`;
  const adminText = [
    "New assessment request received",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${company || "N/A"}`,
    `User Count: ${userCount || "N/A"}`,
    `Primary Focus: ${primaryFocus || "N/A"}`,
    `Submitted At (UTC): ${submittedAt}`,
    `Source Page: ${sourcePage || "N/A"}`,
    "",
    "Issue summary:",
    problemSummary,
  ].join("\n");

  const adminHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px;">New assessment request</h2>
      <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Name</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Email</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(email)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Company</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(company || "N/A")}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>User Count</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(userCount || "N/A")}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Primary Focus</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(primaryFocus || "N/A")}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Submitted (UTC)</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(submittedAt)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Source Page</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(sourcePage || "N/A")}</td></tr>
      </table>

      <h3 style="margin: 18px 0 8px;">Issue summary</h3>
      <div style="white-space: pre-wrap; border: 1px solid #e5e7eb; background: #f9fafb; padding: 12px; border-radius: 8px;">
        ${escapeHtml(problemSummary)}
      </div>
      <p style="margin-top: 14px; color: #6b7280;">Reply to this email to respond directly to the sender.</p>
    </div>
  `;

  // Minimal and human confirmation email (no robotic fluff)
  const customerSubject = "We received your assessment request";
  const customerText = [
    `Hi ${name},`,
    "",
    "We received your request and will review it.",
    "",
    "If this is urgent, email info@sentinelidentity.ca",
    "",
    "Sentinel Identity",
  ].join("\n");

  const customerHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 680px;">
      <h2 style="margin: 0 0 12px;">Request received</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>We received your request and will review it.</p>
      <p>If this is urgent, email <a href="mailto:info@sentinelidentity.ca">info@sentinelidentity.ca</a>.</p>
      <p style="margin-top: 18px;">Sentinel Identity</p>
    </div>
  `;

  // ----- Send emails -----
  // 1) Admin notification
  const adminSend = await sendViaMailChannels({
    from: FROM_EMAIL,
    to: TO_EMAIL,
    subject: adminSubject,
    text: adminText,
    html: adminHtml,
    replyTo: email,
  });

  if (!adminSend.ok) {
    return json(
      { ok: false, error: "Failed to send notification email.", details: adminSend.error },
      502,
      corsHeaders
    );
  }

  // 2) Customer confirmation (non-blocking)
  const customerSend = await sendViaMailChannels({
    from: FROM_EMAIL,
    to: email,
    subject: customerSubject,
    text: customerText,
    html: customerHtml,
    replyTo: "info@sentinelidentity.ca",
  });

  if (!customerSend.ok) {
    return json(
      { ok: true, warning: "Submitted, but confirmation email could not be sent.", details: customerSend.error },
      200,
      corsHeaders
    );
  }

  return json({ ok: true, message: "Submitted successfully." }, 200, corsHeaders);
}

/**
 * MailChannels send (Cloudflare Workers/Pages compatible)
 * Keep it simple: no DKIM placeholders unless you actually manage DKIM keys.
 */
async function sendViaMailChannels({ from, to, subject, text, html, replyTo }) {
  try {
    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: "Sentinel Identity" },
      reply_to: replyTo ? { email: replyTo } : undefined,
      subject,
      content: [
        { type: "text/plain", value: text || "" },
        { type: "text/html", value: html || "" },
      ],
    };

    const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text().catch(() => "");

    if (!res.ok) {
      return { ok: false, error: `MailChannels ${res.status}: ${responseText}` };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Mail send failed" };
  }
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers });
}

function safe(v) {
  const s = (v === undefined || v === null) ? "" : String(v);
  return s.replace(/\r/g, "").trim();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

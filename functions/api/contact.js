// functions/api/contact.js
export async function onRequest(context) {
  const { request, env } = context;

  const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || "https://sentinelidentity.ca";
  const TO_EMAIL = env.TO_EMAIL || "info@sentinelidentity.ca";
  const FROM_EMAIL = env.FROM_EMAIL || "noreply@sentinelidentity.ca";

  const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  // Handle browser preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Only allow POST
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      { status: 405, headers: corsHeaders }
    );
  }

  // Enforce origin (basic protection)
  const origin = request.headers.get("Origin") || "";
  if (origin && origin !== ALLOWED_ORIGIN) {
    return new Response(
      JSON.stringify({ ok: false, error: "Origin not allowed" }),
      { status: 403, headers: corsHeaders }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON body" }),
      { status: 400, headers: corsHeaders }
    );
  }

  // Expected fields from your form
  const {
    name = "",
    email = "",
    company = "",
    userCount = "",
    primaryFocus = "",
    problemSummary = "",
    sourcePage = "",
  } = body || {};

  // Basic validation
  if (!name.trim() || !email.trim() || !problemSummary.trim()) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Name, email, and problem summary are required.",
      }),
      { status: 400, headers: corsHeaders }
    );
  }

  if (!isValidEmail(email)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid email address." }),
      { status: 400, headers: corsHeaders }
    );
  }

  const submittedAt = new Date().toISOString();

  // ---- Email 1: Notification to you ----
  const adminSubject = `New Sentinel Identity Assessment Request - ${company || name}`;
  const adminText = [
    "New assessment request received from sentinelidentity.ca",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${company || "N/A"}`,
    `User Count: ${userCount || "N/A"}`,
    `Primary Focus: ${primaryFocus || "N/A"}`,
    `Submitted At (UTC): ${submittedAt}`,
    `Source Page: ${sourcePage || "N/A"}`,
    "",
    "What are they trying to fix?",
    `${problemSummary}`,
    "",
    "Reply directly to this email to respond to the prospect.",
  ].join("\n");

  const adminHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px;">New assessment request</h2>
      <p style="margin: 0 0 16px;">A visitor submitted the form on <strong>sentinelidentity.ca</strong>.</p>

      <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Name</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Email</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(email)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Company</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(company || "N/A")}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>User Count</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(userCount || "N/A")}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Primary Focus</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(primaryFocus || "N/A")}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Submitted (UTC)</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(submittedAt)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Source Page</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(sourcePage || "N/A")}</td></tr>
      </table>

      <h3 style="margin: 20px 0 8px;">What they are trying to fix</h3>
      <div style="white-space: pre-wrap; border: 1px solid #e5e7eb; background: #f9fafb; padding: 12px; border-radius: 8px;">
        ${escapeHtml(problemSummary)}
      </div>

      <p style="margin-top: 16px; color: #6b7280;">Tip: Use Reply to respond directly to the prospect.</p>
    </div>
  `;

  // ---- Email 2: Confirmation to prospect ----
  const customerSubject = "We received your Entra / M365 assessment request";
  const customerText = [
    `Hi ${name},`,
    "",
    "Thanks for reaching out to Sentinel Identity.",
    "We received your assessment request and will review what you shared.",
    "",
    "What you sent us:",
    `- Company: ${company || "N/A"}`,
    `- User Count: ${userCount || "N/A"}`,
    `- Primary Focus: ${primaryFocus || "N/A"}`,
    "",
    "We usually reply within 1 business day.",
    "",
    "If your issue is urgent, you can email us directly at info@sentinelidentity.ca",
    "",
    "Sentinel Identity",
    "Entra ID & Microsoft 365 security consulting",
  ].join("\n");

  const customerHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 680px;">
      <h2 style="margin: 0 0 12px;">Thanks, we received your request</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thanks for reaching out to <strong>Sentinel Identity</strong>. We received your Entra / Microsoft 365 assessment request and will review the details you submitted.</p>

      <div style="margin: 16px 0; padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f9fafb;">
        <p style="margin: 0 0 8px;"><strong>Company:</strong> ${escapeHtml(company || "N/A")}</p>
        <p style="margin: 0 0 8px;"><strong>User Count:</strong> ${escapeHtml(userCount || "N/A")}</p>
        <p style="margin: 0;"><strong>Primary Focus:</strong> ${escapeHtml(primaryFocus || "N/A")}</p>
      </div>

      <p>Typical response time is <strong>within 1 business day</strong>.</p>
      <p>If this is urgent, email us directly at <a href="mailto:info@sentinelidentity.ca">info@sentinelidentity.ca</a>.</p>

      <p style="margin-top: 20px;">Sentinel Identity<br />Entra ID & Microsoft 365 security consulting</p>
    </div>
  `;

  try {
    // Send admin notification first
    const adminSend = await sendViaMailChannels({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject: adminSubject,
      text: adminText,
      html: adminHtml,
      replyTo: email, // so you can hit Reply and respond to the prospect
    });

    if (!adminSend.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to send notification email.",
          details: adminSend.error || "Unknown email provider error",
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Send confirmation to customer
    const customerSend = await sendViaMailChannels({
      from: FROM_EMAIL,
      to: email,
      subject: customerSubject,
      text: customerText,
      html: customerHtml,
      replyTo: "info@sentinelidentity.ca",
    });

    if (!customerSend.ok) {
      // Admin email already went through, so don't fail the whole submission
      return new Response(
        JSON.stringify({
          ok: true,
          warning: "Submitted, but confirmation email could not be sent to the user.",
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Assessment request submitted successfully.",
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Unexpected server error",
        details: err?.message || "Unknown error",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * Send email via MailChannels (works in Cloudflare Workers/Pages Functions)
 * Docs pattern commonly used in Cloudflare Workers ecosystem.
 */
async function sendViaMailChannels({ from, to, subject, text, html, replyTo }) {
  try {
    const payload = {
      personalizations: [
        {
          to: [{ email: to }],
          dkim_domain: from.split("@")[1], // improves deliverability if domain set up properly
          dkim_selector: "mailchannels",   // optional; harmless if not configured
          dkim_private_key: undefined,     // not using manual DKIM here
        },
      ],
      from: {
        email: from,
        name: "Sentinel Identity",
      },
      reply_to: replyTo
        ? {
            email: replyTo,
            name: "Sentinel Identity",
          }
        : undefined,
      subject,
      content: [
        { type: "text/plain", value: text || "" },
        { type: "text/html", value: html || "" },
      ],
    };

    const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();

    if (!res.ok) {
      return {
        ok: false,
        error: `MailChannels ${res.status}: ${responseText}`,
      };
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "Mail send failed",
    };
  }
}

function isValidEmail(value) {
  // Basic validation. Not RFC-perfect, but enough for a contact form.
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

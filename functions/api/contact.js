// /functions/api/contact.js
export async function onRequest(context) {
  const { request, env } = context;

  // ---- Config (set these in Cloudflare Pages > Settings > Environment variables) ----
  const TO_EMAIL = env.TO_EMAIL || "info@sentinelidentity.ca";
  const FROM_EMAIL = env.FROM_EMAIL || "noreply@sentinelidentity.ca";

  // MailChannels Email API (required now)
  const MAILCHANNELS_API_KEY = env.MAILCHANNELS_API_KEY; // REQUIRED

  // Allow multiple origins (because browsers send Origin; direct tests may not)
  const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS || "https://sentinelidentity.ca,https://www.sentinelidentity.ca")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const corsHeaders = (origin) => ({
    "Access-Control-Allow-Origin": origin || ALLOWED_ORIGINS[0] || "https://sentinelidentity.ca",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  });

  // Preflight
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin") || "";
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== "POST") {
    const origin = request.headers.get("Origin") || "";
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders(origin),
    });
  }

  const origin = request.headers.get("Origin") || "";
  // Only enforce if Origin header exists (browser). If empty (curl/server), allow.
  if (origin && ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ ok: false, error: "Origin not allowed" }), {
      status: 403,
      headers: corsHeaders(origin),
    });
  }

  if (!MAILCHANNELS_API_KEY) {
    return new Response(JSON.stringify({
      ok: false,
      error: "Server not configured: missing MAILCHANNELS_API_KEY",
    }), { status: 500, headers: corsHeaders(origin) });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: corsHeaders(origin),
    });
  }

  const {
    name = "",
    email = "",
    company = "",
    userCount = "",
    primaryFocus = "",
    problemSummary = "",
    sourcePage = "",
  } = body || {};

  if (!name.trim() || !email.trim() || !problemSummary.trim()) {
    return new Response(JSON.stringify({
      ok: false,
      error: "Name, email, and issue summary are required.",
    }), { status: 400, headers: corsHeaders(origin) });
  }

  if (!isValidEmail(email)) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid email address." }), {
      status: 400,
      headers: corsHeaders(origin),
    });
  }

  const submittedAt = new Date().toISOString();

  // Email to you
  const adminSubject = `New assessment request - ${company || name}`;
  const adminText = [
    "New assessment request from sentinelidentity.ca",
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

  // Confirmation to prospect
  const customerSubject = "We received your request";
  const customerText = [
    `Hi ${name},`,
    "",
    "Thanks for reaching out to Sentinel Identity.",
    "We received your request and will review the details you submitted.",
    "",
    "If your issue is urgent, email info@sentinelidentity.ca",
    "",
    "Sentinel Identity",
  ].join("\n");

  try {
    const adminSend = await sendViaMailChannels({
      apiKey: MAILCHANNELS_API_KEY,
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject: adminSubject,
      text: adminText,
      replyTo: email,
    });

    if (!adminSend.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Failed to send notification email.",
        details: adminSend.error || "Unknown MailChannels error",
      }), { status: 500, headers: corsHeaders(origin) });
    }

    // Try confirmation (do not fail request if this one fails)
    const customerSend = await sendViaMailChannels({
      apiKey: MAILCHANNELS_API_KEY,
      from: FROM_EMAIL,
      to: email,
      subject: customerSubject,
      text: customerText,
      replyTo: "info@sentinelidentity.ca",
    });

    if (!customerSend.ok) {
      return new Response(JSON.stringify({
        ok: true,
        warning: "Submitted, but confirmation email could not be sent to the user.",
      }), { status: 200, headers: corsHeaders(origin) });
    }

    return new Response(JSON.stringify({ ok: true, message: "Submitted." }), {
      status: 200,
      headers: corsHeaders(origin),
    });

  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: "Unexpected server error",
      details: err?.message || "Unknown error",
    }), { status: 500, headers: corsHeaders(origin) });
  }
}

async function sendViaMailChannels({ apiKey, from, to, subject, text, replyTo }) {
  try {
    // MailChannels Email API uses X-Api-Key now. :contentReference[oaicite:3]{index=3}
    const payload = {
      from: { email: from, name: "Sentinel Identity" },
      personalizations: [{ to: [{ email: to }] }],
      subject,
      reply_to: replyTo ? { email: replyTo } : undefined,
      content: [{ type: "text/plain", value: text || "" }],
    };

    const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    if (!res.ok) return { ok: false, error: `MailChannels ${res.status}: ${responseText}` };

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Mail send failed" };
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

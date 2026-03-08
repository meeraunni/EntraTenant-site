// functions/api/contact.js
export async function onRequest({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS || "https://sentinelidentity.ca,https://www.sentinelidentity.ca")
    .split(",").map(s => s.trim()).filter(Boolean);

  const headers = {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || "https://sentinelidentity.ca"),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers });

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ ok: false, error: "Origin not allowed", origin }), { status: 403, headers });
  }

  const RESEND_API_KEY = env.RESEND_API_KEY || env.resend_api_key;
  const TO_EMAIL = env.TO_EMAIL || "info@sentinelidentity.ca";
  const FROM_EMAIL = env.FROM_EMAIL || "noreply@sentinelidentity.ca";

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "Missing RESEND_API_KEY (or resend_api_key) in env." }), { status: 500, headers });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), { status: 400, headers }); }

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
    return new Response(JSON.stringify({ ok: false, error: "Name, email, and issue summary are required." }), { status: 400, headers });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid email address." }), { status: 400, headers });
  }

  const submittedAt = new Date().toISOString();

  const adminSubject = `New assessment request - ${company || name}`;
  const adminText = [
    "New assessment request (sentinelidentity.ca)",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${company || "N/A"}`,
    `User Count: ${userCount || "N/A"}`,
    `Primary Focus: ${primaryFocus || "N/A"}`,
    `Submitted (UTC): ${submittedAt}`,
    `Source Page: ${sourcePage || "N/A"}`,
    "",
    "Issue summary:",
    problemSummary,
  ].join("\n");

  const customerSubject = "We received your request";
  const customerText = [
    `Hi ${name},`,
    "",
    "Thanks for reaching out to Sentinel Identity.",
    "We received your request and will review it.",
    "",
    "If this is urgent, email info@sentinelidentity.ca",
    "",
    "Sentinel Identity",
  ].join("\n");

  // send to you
  const adminSend = await resendSend({
    apiKey: RESEND_API_KEY,
    from: `Sentinel Identity <${FROM_EMAIL}>`,
    to: [TO_EMAIL],
    subject: adminSubject,
    text: adminText,
    replyTo: email,
  });

  if (!adminSend.ok) {
    return new Response(JSON.stringify({ ok: false, error: "Failed to send admin email.", details: adminSend.error }), { status: 500, headers });
  }

  // send confirmation (best-effort)
  const customerSend = await resendSend({
    apiKey: RESEND_API_KEY,
    from: `Sentinel Identity <${FROM_EMAIL}>`,
    to: [email],
    subject: customerSubject,
    text: customerText,
    replyTo: "info@sentinelidentity.ca",
  });

  if (!customerSend.ok) {
    return new Response(JSON.stringify({ ok: true, warning: "Submitted. Confirmation email failed.", confirmationError: customerSend.error }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ ok: true, message: "Submitted." }), { status: 200, headers });
}

async function resendSend({ apiKey, from, to, subject, text, replyTo }) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        reply_to: replyTo,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${JSON.stringify(data)}` };
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: e?.message || "Resend send failed" };
  }
}

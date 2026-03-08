// functions/api/subscribe.js (Resend)
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
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return new Response(JSON.stringify({ ok: false, error: "Origin not allowed", origin }), { status: 403, headers });

  const RESEND_API_KEY = env.RESEND_API_KEY || env.resend_api_key;
  const TO_EMAIL = env.TO_EMAIL || "info@sentinelidentity.ca";
  const FROM_EMAIL = env.FROM_EMAIL || "noreply@sentinelidentity.ca";

  if (!RESEND_API_KEY) return new Response(JSON.stringify({ ok: false, error: "Missing RESEND_API_KEY (or resend_api_key) in env." }), { status: 500, headers });

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), { status: 400, headers }); }

  const email = String(body?.email || "").trim();
  const sourcePage = String(body?.sourcePage || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ ok: false, error: "Valid email is required." }), { status: 400, headers });
  }

  const subject = "New blog subscriber";
  const text = [
    "New subscriber on sentinelidentity.ca",
    "",
    `Email: ${email}`,
    `Source: ${sourcePage || "N/A"}`,
    `UTC: ${new Date().toISOString()}`,
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Sentinel Identity <${FROM_EMAIL}>`,
      to: [TO_EMAIL],
      subject,
      text,
      reply_to: email,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return new Response(JSON.stringify({ ok: false, error: "Subscription failed.", details: data }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ ok: true, message: "Subscribed." }), { status: 200, headers });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    if (allowed.length && !allowed.includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    const data = await request.json();

    const name = (data.name || "").trim();
    const email = (data.email || "").trim();
    const company = (data.company || "").trim();
    const users = (data.users || "").trim();
    const focus = (data.focus || "").trim();
    const message = (data.message || "").trim();

    if (!name || !email) {
      return new Response(JSON.stringify({ ok: false, error: "Name and email are required." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const toEmail = env.TO_EMAIL;
    const fromEmail = env.FROM_EMAIL;

    if (!toEmail || !fromEmail) {
      return new Response(JSON.stringify({ ok: false, error: "Missing TO_EMAIL/FROM_EMAIL environment variables." }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const subject = `New Entra Consulting Lead: ${focus || "General"}`;
    const body =
`New website inquiry

Name: ${name}
Email: ${email}
Company: ${company || "N/A"}
User count:

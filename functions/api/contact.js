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

    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim();
    const company = String(data.company || "").trim();
    const users = String(data.users || "").trim();
    const focus = String(data.focus || "").trim();
    const message = String(data.message || "").trim();

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

    const subject = "New Entra Consulting Lead: " + (focus || "General");

    // Avoid backticks entirely so copy/paste can't break strings
    const body =
      "New website inquiry\n\n" +
      "Name: " + name + "\n" +
      "Email: " + email + "\n" +
      "Company: " + (company || "N/A") + "\n" +
      "User count: " + (users || "N/A") + "\n" +
      "Primary focus: " + (focus || "N/A") + "\n\n" +
      "Details:\n" + (message || "N/A") + "\n";

    const sendResp = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: fromEmail, name: "Website Lead" },
        reply_to: { email: email, name: name },
        subject: subject,
        content: [{ type: "text/plain", value: body }],
      }),
    });

    if (!sendResp.ok) {
      const errText = await sendResp.text();
      return new Response(JSON.stringify({ ok: false, error: "Email send failed", details: errText }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "

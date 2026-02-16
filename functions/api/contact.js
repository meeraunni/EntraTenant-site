export async function onRequestPost({ request, env }) {
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

  try {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (allowed.length && origin && !allowed.includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    const data = await request.json();

    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim();
    const company = String(data.company || "").trim();
    const users = String(data.users || "").trim();
    const focus = String(data.focus || "").trim();
    const message = String(data.message || "").trim();

    if (!name || !email) return json({ ok: false, error: "Name and email are required." }, 400);

    const toEmail = env.TO_EMAIL;
    const fromEmail = env.FROM_EMAIL;
    if (!toEmail || !fromEmail) return json({ ok: false, error: "Missing TO_EMAIL/FROM_EMAIL." }, 500);

    const subject = "New Entra Consulting Lead: " + (focus || "General");
    const body =
      "New website inquiry\n\n" +
      "Name: " + name + "\n" +
      "Email: " + email + "\n" +
      "Company: " + (company || "N/A") + "\n" +
      "User count: " + (users || "N/A") + "\n" +
      "Primary focus: " + (focus || "N/A") + "\n\n" +
      "Details:\n" + (message || "N/A") + "\n";

    const resp = await fetch("https://api.mailchannels.net/tx/v1/send", {
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

    if (!resp.ok) {
      const details = await resp.text();
      return json({ ok: false, error: "Email send failed", details }, 502);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    return json({ ok: false, error: "Server error" }, 500);
  }
}

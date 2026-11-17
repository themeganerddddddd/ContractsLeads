// Only process public feedback when owner-operated email and anti-bot services are configured.
// No form contents, tokens, or email credentials are logged or exposed to the browser.
const CATEGORIES = new Set(["question", "bug", "data", "feature", "billing"]);

function back(request: Request, status: "sent" | "error") {
  return Response.redirect(new URL(`/support?status=${status}`, request.url), 303);
}

export async function POST(request: Request) {
  const recipient = process.env.SUPPORT_INBOX_EMAIL?.trim();
  const sender = process.env.RESEND_FROM_EMAIL?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!recipient || !sender || !apiKey || !turnstileSecret || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) {
    return Response.json({ error: "Support form unavailable" }, { status: 503 });
  }

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }
  if (!(request.headers.get("content-type") || "").startsWith("application/x-www-form-urlencoded")) {
    return Response.json({ error: "Invalid content type" }, { status: 415 });
  }
  const length = Number(request.headers.get("content-length") || "0");
  if (length > 15000) return Response.json({ error: "Form is too large" }, { status: 413 });

  try {
    const data = await request.formData();
    // Honeypot: avoid sending messages from simple automated form fillers.
    if (String(data.get("website") || "").trim()) return back(request, "sent");

    const email = String(data.get("email") || "").trim();
    const message = String(data.get("message") || "").trim();
    const category = String(data.get("category") || "");
    const captcha = String(data.get("cf-turnstile-response") || "");
    if (!CATEGORIES.has(category) || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      message.length < 12 || message.length > 4000 || !captcha || captcha.length > 4096) {
      return back(request, "error");
    }

    const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: turnstileSecret, response: captcha }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!verification.ok || !(await verification.json() as { success?: boolean }).success) {
      return back(request, "error");
    }

    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: [recipient],
        reply_to: email,
        subject: `[FirmQuarry feedback] ${category}`,
        text: `Category: ${category}\nReply email: ${email}\n\n${message}`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!sent.ok) return back(request, "error");
    return back(request, "sent");
  } catch {
    return back(request, "error");
  }
}

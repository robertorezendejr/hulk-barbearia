const FROM = `Hulk Barbearia <alertas@${process.env.RESEND_EMAIL_DOMAIN}>`;

export async function sendEmail({ to, subject, text }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_EMAIL_DOMAIN) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, text }),
    });
    if (!res.ok) console.error("resend_send_failed", res.status, await res.text());
  } catch (err) {
    console.error("resend_send_error", err);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

async function parseFailure(response) {
  try {
    const body = await response.json();
    return String(body?.message || body?.name || `HTTP ${response.status}`).slice(0, 180);
  } catch { return `HTTP ${response.status}`; }
}

export function createResendTransactionalEmail({ apiKey, from, publicBaseUrl, endpoint = "https://api.resend.com/emails", timeoutMs = 8_000, fetchImpl = fetch }) {
  if (!apiKey || !from || !publicBaseUrl) throw new Error("Resend email adapter requires apiKey, from, and publicBaseUrl");
  if (typeof fetchImpl !== "function") throw new Error("Resend email adapter requires fetch");

  async function send({ to, subject, html, text, idempotencyKey }) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw new Error(`Transactional email rejected: ${await parseFailure(response)}`);
    return { delivered: true };
  }

  return Object.freeze({
    async sendLoginCode({ email, code, challengeId, expiresInMinutes }) {
      const safeCode = escapeHtml(code);
      return send({
        to: email,
        subject: `${code} adalah kode masuk DEKTA`,
        text: `Kode masuk DEKTA Anda: ${code}. Berlaku ${expiresInMinutes} menit. Abaikan email ini jika Anda tidak memintanya.`,
        html: `<div style="font-family:Arial,sans-serif;color:#0f172a"><h1 style="font-size:22px">Masuk ke DEKTA</h1><p>Gunakan kode berikut:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px">${safeCode}</p><p>Berlaku ${expiresInMinutes} menit. Jangan berikan kode ini kepada siapa pun.</p></div>`,
        idempotencyKey: `login-${challengeId}`
      });
    },
    async sendInvitation({ email, inviteCode, invitationId, workspaceName, inviterName, expiresInDays }) {
      const invitationUrl = new URL("/", publicBaseUrl);
      invitationUrl.hash = `invite=${encodeURIComponent(inviteCode)}`;
      const safeWorkspace = escapeHtml(workspaceName || "workspace DEKTA");
      const safeInviter = escapeHtml(inviterName || "Admin perusahaan");
      const safeUrl = escapeHtml(invitationUrl.href);
      return send({
        to: email,
        subject: `Undangan bergabung ke ${workspaceName || "DEKTA"}`,
        text: `${inviterName || "Admin perusahaan"} mengundang Anda bergabung ke ${workspaceName || "DEKTA"}. Buka ${invitationUrl.href}. Undangan berlaku ${expiresInDays} hari.`,
        html: `<div style="font-family:Arial,sans-serif;color:#0f172a"><h1 style="font-size:22px">Undangan ke ${safeWorkspace}</h1><p>${safeInviter} mengundang Anda bergabung di DEKTA.</p><p><a href="${safeUrl}" style="background:#a33dc3;color:white;padding:12px 18px;border-radius:8px;text-decoration:none">Terima undangan</a></p><p>Undangan berlaku ${expiresInDays} hari.</p></div>`,
        idempotencyKey: `invite-${invitationId}`
      });
    }
  });
}

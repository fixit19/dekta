import {
  acceptWorkspaceInvitation,
  createWorkspace,
  createWorkspaceInvitation,
  loadIdentitySession,
  logoutIdentitySession,
  requestEmailLoginCode,
  verifyEmailLoginCode
} from "./api-client.js?v=0.1.0";

const ROLE_LABELS = Object.freeze({ executive_admin: "Owner / Admin", sales: "Penjualan", marketing: "Pemasaran", delivery: "Operasional", finance: "Keuangan", reviewer: "Viewer / auditor", billing_admin: "Admin langganan" });

function errorCopy(code) {
  return ({
    API_NOT_CONFIGURED: "Server belum dikonfigurasi untuk halaman ini.",
    API_UNREACHABLE: "Server lokal belum dapat dijangkau.",
    EMAIL_INVALID: "Tulis alamat email yang valid.",
    LOGIN_RATE_LIMITED: "Terlalu banyak permintaan kode. Coba lagi sekitar 10 menit.",
    LOGIN_CODE_INVALID: "Kode tidak cocok. Periksa enam angkanya lalu coba lagi.",
    LOGIN_CODE_USED: "Kode ini sudah pernah dipakai. Minta kode baru.",
    LOGIN_CODE_EXPIRED: "Kode sudah kedaluwarsa. Minta kode baru.",
    LOGIN_DELIVERY_FAILED: "Email kode masuk belum berhasil dikirim. Tunggu sebentar lalu coba lagi.",
    WORKSPACE_FIELDS_REQUIRED: "Lengkapi nama perusahaan, jenis usaha, ukuran tim, fungsi, dan data awal.",
    WORKSPACE_ALREADY_SELECTED: "Sesi ini sudah terhubung ke sebuah perusahaan.",
    INVITATION_FIELDS_REQUIRED: "Lengkapi email, peran, dan departemen anggota.",
    INVITATION_ALREADY_PENDING: "Undangan untuk email tersebut masih aktif.",
    INVITATION_DELIVERY_FAILED: "Undangan belum berhasil dikirim. Silakan coba lagi; undangan gagal tidak disimpan sebagai aktif.",
    INVITATION_EMAIL_MISMATCH: "Kode ini ditujukan untuk email lain. Masuk menggunakan email penerima undangan.",
    INVITATION_INVALID: "Kode undangan tidak valid atau tidak lengkap.",
    INVITATION_NOT_PENDING: "Undangan ini sudah diganti, dicabut, atau digunakan. Minta admin membuat kode baru.",
    INVITATION_EXPIRED: "Undangan sudah kedaluwarsa. Minta admin membuat kode baru.",
    MEMBER_ALREADY_ACTIVE: "Email tersebut sudah menjadi anggota aktif.",
    CSRF_INVALID: "Sesi keamanan berubah. Muat ulang halaman lalu coba lagi."
  })[code] || "Tindakan belum berhasil. Periksa isian lalu coba lagi.";
}

function setBusy(form, busy, label = "Memproses…") {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label;
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
    form.removeAttribute("aria-busy");
  }
}

function showError(container, result) {
  const element = container.querySelector("[data-identity-error]");
  if (!element) return;
  element.textContent = errorCopy(result?.code);
  element.hidden = false;
}

function clearError(container) {
  const element = container.querySelector("[data-identity-error]");
  if (element) {
    element.textContent = "";
    element.hidden = true;
  }
}

function formatTrial(end) {
  if (!end) return "Belum aktif";
  const remaining = Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000));
  const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(end));
  return `${remaining} hari tersisa · sampai ${date}`;
}

function updateWorkspaceSummary(screen, session) {
  const target = screen.querySelector("[data-workspace-summary]");
  if (!target || !session?.organization) return;
  target.replaceChildren();
  const items = [
    ["Workspace", session.organization.name],
    ["Akses Anda", (session.currentMembership?.roles || []).map((role) => ROLE_LABELS[role] || role).join(", ")],
    ["Trial", formatTrial(session.subscription?.trialEndsAt)]
  ];
  for (const [label, value] of items) {
    const item = document.createElement("div");
    const small = document.createElement("small");
    const strong = document.createElement("strong");
    small.textContent = label;
    strong.textContent = value || "—";
    item.append(small, strong);
    target.append(item);
  }
}

function populateDepartmentSelect(form, session) {
  const select = form.elements.department;
  select.replaceChildren();
  for (const department of session.departments || []) {
    if (department.code === "management") continue;
    const option = document.createElement("option");
    option.value = department.code;
    option.textContent = department.name;
    select.append(option);
  }
  if (!select.options.length && session.departments?.[0]) {
    const option = document.createElement("option");
    option.value = session.departments[0].code;
    option.textContent = session.departments[0].name;
    select.append(option);
  }
}

function applyIdentityChrome(session) {
  const profile = document.querySelector(".profile-switcher");
  const name = session.user?.displayName || "Pengguna";
  const role = (session.currentMembership?.roles || []).map((item) => ROLE_LABELS[item] || item).join(", ") || "Anggota";
  profile?.querySelector(".avatar")?.replaceChildren(document.createTextNode(name.split(/\s+/).map((item) => item[0]).join("").slice(0, 2).toUpperCase()));
  if (profile?.querySelector("strong")) profile.querySelector("strong").textContent = name.split(" ")[0];
  if (profile?.querySelector("small")) profile.querySelector("small").textContent = role;
  const company = document.querySelector(".brand-company");
  if (company) company.textContent = session.organization?.name || "Bisnis Saya";
  const accountBody = document.querySelector("[data-identity-account-body]");
  if (accountBody) {
    accountBody.replaceChildren();
    const facts = [["Nama", name], ["Email", session.user?.email], ["Perusahaan", session.organization?.name], ["Hak akses", role], ["Status trial", formatTrial(session.subscription?.trialEndsAt)]];
    for (const [label, value] of facts) {
      const row = document.createElement("div");
      const small = document.createElement("small");
      const strong = document.createElement("strong");
      small.textContent = label;
      strong.textContent = value || "—";
      row.append(small, strong);
      accountBody.append(row);
    }
  }
}

export async function bootstrapIdentity() {
  const gateway = document.querySelector("#identity-gateway");
  const appShell = document.querySelector(".app-shell");
  const screens = [...document.querySelectorAll("[data-identity-screen]")];
  const emailForm = document.querySelector("#identity-email-form");
  const codeForm = document.querySelector("#identity-code-form");
  const workspaceForm = document.querySelector("#identity-workspace-form");
  const inviteForm = document.querySelector("#identity-invite-form");
  const inviteScreen = document.querySelector('[data-identity-screen="invite"]');
  const accountDialog = document.querySelector("#identity-account-dialog");
  let challenge = null;
  let session = null;
  let resolved = false;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });

  function show(name) {
    for (const screen of screens) screen.hidden = screen.dataset.identityScreen !== name;
    gateway.hidden = false;
    appShell.hidden = true;
    screens.find((screen) => screen.dataset.identityScreen === name)?.querySelector("input, select, textarea, button:not([disabled])")?.focus({ preventScroll: true });
  }

  function finish(nextSession) {
    if (resolved) return;
    resolved = true;
    session = nextSession;
    applyIdentityChrome(session);
    gateway.hidden = true;
    appShell.hidden = false;
    resolveReady(session);
  }

  async function refresh({ afterWorkspaceCreation = false } = {}) {
    show("loading");
    const result = await loadIdentitySession();
    if (!result.ok && result.code) {
      show("offline");
      showError(document.querySelector('[data-identity-screen="offline"]'), result);
      return;
    }
    if (!result.authenticated) {
      session = null;
      show("email");
      return;
    }
    session = result;
    if (!session.organization) {
      workspaceForm.querySelector("[data-identity-error]").hidden = true;
      show("workspace");
      const pageUrl = new URL(location.href);
      const inviteCode = pageUrl.searchParams.get("invite") || new URLSearchParams(pageUrl.hash.slice(1)).get("invite");
      if (inviteCode) {
        workspaceForm.elements.inviteCode.value = inviteCode;
        document.querySelector('[data-workspace-mode="join"]')?.click();
      }
      return;
    }
    if (afterWorkspaceCreation) {
      populateDepartmentSelect(inviteForm, session);
      updateWorkspaceSummary(inviteScreen, session);
      show("invite");
      return;
    }
    finish(session);
  }

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError(emailForm);
    if (!emailForm.reportValidity()) return;
    setBusy(emailForm, true, "Membuat kode…");
    const result = await requestEmailLoginCode(emailForm.elements.email.value);
    setBusy(emailForm, false);
    if (!result.ok) return showError(emailForm, result);
    challenge = result;
    codeForm.querySelector("[data-login-email]").textContent = result.email;
    const demo = codeForm.querySelector("[data-development-code]");
    demo.hidden = !result.developmentCode;
    demo.querySelector("strong").textContent = result.developmentCode || "";
    codeForm.elements.code.value = "";
    codeForm.elements.displayName.value = "";
    show("code");
  });

  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError(codeForm);
    if (!codeForm.reportValidity() || !challenge) return;
    setBusy(codeForm, true, "Memverifikasi…");
    const result = await verifyEmailLoginCode({ challengeId: challenge.challengeId, code: codeForm.elements.code.value, displayName: codeForm.elements.displayName.value });
    setBusy(codeForm, false);
    if (!result.ok) return showError(codeForm, result);
    await refresh();
  });

  workspaceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError(workspaceForm);
    const createSection = workspaceForm.querySelector('[data-workspace-section="create"]');
    if (createSection.hidden || !workspaceForm.reportValidity()) return;
    const departments = [...workspaceForm.querySelectorAll('input[name="departments"]:checked')].map((input) => input.value);
    const submit = workspaceForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Menyiapkan workspace…";
    const result = await createWorkspace({ name: workspaceForm.elements.name.value, industry: workspaceForm.elements.industry.value, teamSize: workspaceForm.elements.teamSize.value, departments, startMode: workspaceForm.elements.startMode.value });
    submit.disabled = false;
    submit.textContent = "Aktifkan trial 14 hari";
    if (!result.ok) return showError(workspaceForm, result);
    await refresh({ afterWorkspaceCreation: true });
  });

  inviteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError(inviteScreen);
    if (!inviteForm.reportValidity()) return;
    inviteScreen.querySelector("[data-invite-result]").hidden = true;
    setBusy(inviteForm, true, "Membuat…");
    const result = await createWorkspaceInvitation({ email: inviteForm.elements.email.value, role: inviteForm.elements.role.value, departments: [inviteForm.elements.department.value] });
    setBusy(inviteForm, false);
    if (!result.ok) return showError(inviteScreen, result);
    const output = inviteScreen.querySelector("[data-invite-result]");
    output.replaceChildren();
    const label = document.createElement("span");
    if (result.developmentInviteCode) {
      const code = document.createElement("code");
      const copy = document.createElement("button");
      label.textContent = `Kode lokal untuk ${result.invitation.email}`;
      code.textContent = result.developmentInviteCode;
      copy.type = "button";
      copy.textContent = "Salin kode";
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(result.developmentInviteCode); copy.textContent = "Tersalin"; }
        catch { copy.textContent = "Blok lalu salin kode"; }
      });
      output.append(label, code, copy);
    } else {
      label.textContent = `Undangan sudah dikirim ke ${result.invitation.email}.`;
      output.append(label);
    }
    output.hidden = false;
    inviteForm.elements.email.value = "";
  });

  document.querySelector("[data-use-development-code]").addEventListener("click", () => {
    codeForm.elements.code.value = challenge?.developmentCode || "";
    codeForm.elements.displayName.focus();
  });
  document.querySelector("[data-identity-back]").addEventListener("click", () => { challenge = null; show("email"); });
  document.querySelectorAll("[data-workspace-mode]").forEach((button) => button.addEventListener("click", () => {
    const mode = button.dataset.workspaceMode;
    document.querySelectorAll("[data-workspace-mode]").forEach((item) => { item.classList.toggle("is-active", item === button); item.setAttribute("aria-selected", String(item === button)); });
    workspaceForm.querySelectorAll("[data-workspace-section]").forEach((section) => { section.hidden = section.dataset.workspaceSection !== mode; });
    clearError(workspaceForm);
  }));
  document.querySelector("[data-accept-invitation]").addEventListener("click", async () => {
    clearError(workspaceForm);
    const button = document.querySelector("[data-accept-invitation]");
    const code = workspaceForm.elements.inviteCode.value.trim();
    if (!code) return showError(workspaceForm, { code: "INVITATION_INVALID" });
    button.disabled = true;
    button.textContent = "Memeriksa undangan…";
    const result = await acceptWorkspaceInvitation(code);
    button.disabled = false;
    button.textContent = "Gabung ke perusahaan";
    if (!result.ok) return showError(workspaceForm, result);
    await refresh();
  });
  document.querySelector("[data-enter-workspace]").addEventListener("click", () => finish(session));
  document.querySelector("[data-retry-session]").addEventListener("click", () => refresh());

  document.addEventListener("dekta:open-workspace-invitation", () => {
    if (!session?.organization || !session.currentMembership?.roles?.includes("executive_admin")) return;
    populateDepartmentSelect(inviteForm, session);
    updateWorkspaceSummary(inviteScreen, session);
    inviteScreen.querySelector("[data-invite-result]").hidden = true;
    accountDialog?.open && accountDialog.close();
    show("invite");
  });

  document.querySelector("#open-identity")?.addEventListener("click", () => { applyIdentityChrome(session); accountDialog.showModal(); });
  document.querySelectorAll("[data-close-identity-account]").forEach((button) => button.addEventListener("click", () => accountDialog.close()));
  document.querySelector("[data-logout-session]")?.addEventListener("click", async () => {
    const button = document.querySelector("[data-logout-session]");
    button.disabled = true;
    button.textContent = "Keluar…";
    const result = await logoutIdentitySession();
    if (result.ok) location.reload();
    else { button.disabled = false; button.textContent = "Keluar dari DEKTA"; }
  });

  await refresh();
  return ready;
}

export function defaultDashboardForRoles(roles = []) {
  if (roles.includes("executive_admin")) return "summary";
  if (roles.includes("sales")) return "sales";
  if (roles.includes("marketing")) return "marketing";
  if (roles.includes("finance")) return "finance";
  if (roles.includes("delivery")) return "delivery";
  return "customer";
}

export function allowedDashboardsForRoles(roles = []) {
  if (roles.includes("executive_admin")) return ["summary", "sales", "customer", "marketing", "finance", "delivery"];
  const allowed = new Set(["customer"]);
  if (roles.includes("sales")) allowed.add("sales");
  if (roles.includes("marketing")) allowed.add("marketing");
  if (roles.includes("finance")) allowed.add("finance");
  if (roles.includes("delivery")) allowed.add("delivery");
  return [...allowed];
}

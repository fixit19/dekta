export const DEPARTMENT_PRESETS = Object.freeze({
  owner: ["Sales", "Customer", "Marketing", "Finance", "Delivery"],
  sales: ["Sales", "Customer"],
  custom: null
});

const MODULE_CONTEXT = Object.freeze({
  calendar: "Lintas fungsi",
  signals: "Penjualan",
  pipeline: "Penjualan",
  relationships: "Pelanggan",
  repeat: "Pelanggan",
  notifications: "Lintas fungsi",
  reports: "Ringkasan",
  experiments: "Pemasaran",
  collection: "Keuangan",
  contracts: "Keuangan",
  projects: "Operasional",
  partners: "Pemasaran",
  adaptation: "Pengaturan"
});

export function getWorkspaceContext(view, dashboardLabel = "Ringkasan") {
  if (view === "command") return { kind: "dashboard", prefix: "Dashboard", label: dashboardLabel };
  return { kind: "module", prefix: "Modul", label: MODULE_CONTEXT[view] || "Lintas fungsi" };
}

export function departmentsForPreset(preset, current = []) {
  const configured = DEPARTMENT_PRESETS[preset];
  return configured ? [...configured] : [...current];
}

export function isFieldVisitFollowUp(value) {
  return value === "field_visit";
}

const OPERATIONAL_COLLECTIONS = Object.freeze([
  "accounts",
  "contacts",
  "signals",
  "purchases",
  "calendarEvents",
  "opportunities",
  "contracts",
  "projects",
  "invoices",
  "payments",
  "consultingEngagements"
]);

export function shouldHideOperationalSample({ authenticated = false, startMode = "sample", serverConnected = false } = {}) {
  return Boolean(authenticated && startMode !== "sample" && !serverConnected);
}

export function applyOperationalFallbackPolicy(data, context = {}) {
  if (!shouldHideOperationalSample(context)) return data;
  return OPERATIONAL_COLLECTIONS.reduce((result, collection) => ({ ...result, [collection]: [] }), { ...data });
}

export function addonAccessCopy(addon, subscription) {
  if (!addon) return { label: "Belum tersedia", className: "overdue", detail: "Add-on belum tersedia pada workspace ini." };
  if (addon.status === "active_preview") {
    const trialEnd = subscription?.trialEndsAt ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(subscription.trialEndsAt)) : null;
    return {
      label: trialEnd ? `Mode coba sampai ${trialEnd}` : "Mode coba",
      className: "review",
      detail: "Bisa dicoba sekarang. Belum ditagihkan dan belum menjadi hak akses produksi."
    };
  }
  if (addon.status === "active") return { label: "Aktif — ditagih terpisah", className: "paid", detail: "Add-on aktif sebagai bagian penagihan perusahaan." };
  if (addon.status === "included") return { label: "Termasuk paket", className: "paid", detail: "Add-on termasuk dalam paket aktif perusahaan." };
  return { label: "Pratinjau — belum aktif", className: "overdue", detail: "Data contoh tetap terlihat untuk evaluasi. Belum aktif dan tidak ditagihkan." };
}

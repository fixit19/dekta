export const ACTIVE_STATUSES = new Set(["active", "on_hold"]);
export const OPPORTUNITY_STAGES = ["Qualified", "Discovery", "Solution", "Proposal", "Decision"];
export const LOST_REASONS = ["Budget / timing", "Tidak ada respons", "Tidak cocok", "Memilih kompetitor", "Prioritas internal berubah", "Lainnya"];
export const SIGNAL_DISQUALIFY_REASONS = ["Tidak ada kebutuhan nyata", "Tidak cocok dengan layanan", "Tidak ada authority", "Timing tidak jelas", "Budget tidak tersedia", "Duplikat / tidak valid", "Lainnya"];
export const BILLING_MODELS = ["one_time", "milestone", "recurring", "usage", "hybrid"];

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

export function createBillingPlan(input, contractValue) {
  const errors = [];
  const model = String(input.model || "").trim();
  if (!BILLING_MODELS.includes(model)) errors.push(controlError("model", "Pilih pola penagihan yang valid."));
  const value = Number(contractValue || 0);
  const cycleAmount = Number(input.cycleAmount || 0);
  const cycles = Number(input.cycles || 0);
  if (!input.startAt) errors.push(controlError("startAt", "Tanggal tagihan pertama wajib diisi."));
  if (["recurring", "hybrid"].includes(model) && !["monthly", "quarterly", "yearly"].includes(input.interval)) errors.push(controlError("interval", "Pilih interval recurring."));
  if (["recurring", "milestone", "hybrid"].includes(model) && (!Number.isInteger(cycles) || cycles < 1)) errors.push(controlError("cycles", "Jumlah termin/siklus minimal satu."));
  if (model !== "usage" && (!Number.isFinite(cycleAmount) || cycleAmount <= 0)) errors.push(controlError("cycleAmount", "Nilai per tagihan harus lebih dari nol."));
  if (model === "one_time" && cycleAmount !== value) errors.push(controlError("cycleAmount", "Tagihan sekali selesai harus sama dengan nilai kontrak."));
  if (model === "milestone" && cycleAmount * cycles !== value) errors.push(controlError("cycleAmount", "Total termin harus sama dengan nilai kontrak."));
  if (model === "usage" && !String(input.scheduleNote || "").trim()) errors.push(controlError("scheduleNote", "Dasar perhitungan usage wajib dijelaskan."));
  if (errors.length) return { ok: false, errors };
  return { ok: true, billingPlan: { model, interval: ["recurring", "hybrid"].includes(model) ? input.interval : null, cycleAmount: model === "usage" ? null : cycleAmount, cycles: model === "one_time" ? 1 : cycles || null, startAt: input.startAt, invoiceTiming: input.invoiceTiming === "arrears" ? "arrears" : "advance", generationMode: "draft_only", scheduleNote: String(input.scheduleNote || "").trim(), generatedPeriods: [] } };
}

export function createManualCalendarEvent(input, now = new Date()) {
  const errors = [];
  const title = String(input.title || "").trim();
  if (!title) errors.push(controlError("title", "Judul agenda wajib diisi."));
  if (!input.startsAt) errors.push(controlError("startsAt", "Waktu mulai wajib diisi."));
  const start = new Date(input.startsAt);
  if (input.startsAt && Number.isNaN(start.getTime())) errors.push(controlError("startsAt", "Waktu mulai tidak valid."));
  if (!String(input.owner || "").trim()) errors.push(controlError("owner", "Penanggung jawab wajib diisi."));
  const recurrence = ["none", "daily", "weekly", "monthly"].includes(input.recurrence) ? input.recurrence : "none";
  const occurrences = recurrence === "none" ? 1 : Number(input.occurrences || 0);
  if (!Number.isInteger(occurrences) || occurrences < 1 || occurrences > 52) errors.push(controlError("occurrences", "Jumlah pengulangan harus 1–52."));
  if (errors.length) return { ok: false, errors };
  const at = new Date(now).toISOString();
  return { ok: true, event: { id: createId("cal"), title, startsAt: start.toISOString(), owner: input.owner.trim(), note: String(input.note || "").trim(), recurrence, occurrences, status: "active", source: "manual", createdAt: at, activity: [{ at, kind: "calendar_created", label: `Agenda dibuat oleh ${input.owner.trim()}` }] } };
}

export function expandManualCalendarEvents(series = []) {
  return series.flatMap((event) => {
    if (event.status === "cancelled") return [];
    const count = Math.max(1, Math.min(52, Number(event.occurrences || 1)));
    return Array.from({ length: count }, (_, index) => {
      const occurrence = new Date(event.startsAt);
      if (event.recurrence === "daily") occurrence.setDate(occurrence.getDate() + index);
      if (event.recurrence === "weekly") occurrence.setDate(occurrence.getDate() + (7 * index));
      if (event.recurrence === "monthly") occurrence.setMonth(occurrence.getMonth() + index);
      return { ...event, id: `${event.id}:${index}`, seriesId: event.id, occurrenceIndex: index, at: occurrence.toISOString(), type: "manual", tone: "upcoming", account: "Agenda internal", meta: event.owner };
    });
  });
}

export function rescheduleManualCalendarEvent(event, input, now = new Date()) {
  const errors = [];
  if (!event?.id) errors.push(controlError("event", "Agenda tidak ditemukan."));
  if (!input.startsAt || Number.isNaN(new Date(input.startsAt).getTime())) errors.push(controlError("startsAt", "Waktu baru wajib dan harus valid."));
  if (!String(input.reason || "").trim()) errors.push(controlError("reason", "Alasan reschedule wajib diisi."));
  if (!String(input.actor || "").trim()) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (errors.length) return { ok: false, errors };
  const at = new Date(now).toISOString();
  return { ok: true, event: { ...event, startsAt: new Date(input.startsAt).toISOString(), updatedAt: at, activity: [{ at, kind: "calendar_rescheduled", label: `Agenda dijadwalkan ulang oleh ${input.actor.trim()}`, detail: input.reason.trim(), previousStartsAt: event.startsAt, nextStartsAt: new Date(input.startsAt).toISOString() }, ...(event.activity || [])] } };
}

export function buildRepeatOrderCenter(data, policy = {}, now = new Date()) {
  const reorderDays = Number(policy.reorderDays || 90);
  const dormantDays = Number(policy.dormantDays || 120);
  const purchasesByAccount = new Map();
  for (const purchase of data.purchases || []) {
    if (!purchasesByAccount.has(purchase.accountId)) purchasesByAccount.set(purchase.accountId, []);
    purchasesByAccount.get(purchase.accountId).push(purchase);
  }
  return (data.accounts || []).flatMap((account) => {
    const history = (purchasesByAccount.get(account.id) || []).toSorted((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    if (!history.length) return [];
    const latest = history[0];
    const elapsedDays = daysBetween(latest.completedAt, now);
    const cycleDays = Number(latest.reorderCycleDays || reorderDays);
    const openSignal = (data.signals || []).find((item) => item.accountId === account.id && item.source === "Existing client" && !["converted", "disqualified"].includes(item.status));
    const status = openSignal ? "in_progress" : elapsedDays >= dormantDays ? "dormant" : elapsedDays >= cycleDays ? "due" : "upcoming";
    const expectedAt = new Date(latest.completedAt); expectedAt.setDate(expectedAt.getDate() + cycleDays);
    return [{ account, history, latest, elapsedDays, expectedAt: expectedAt.toISOString(), status, openSignalId: openSignal?.id || null, reason: openSignal ? "Kebutuhan lanjutan sudah dicatat" : elapsedDays >= cycleDays ? `${elapsedDays} hari sejak pembelian terakhir` : `Perkiraan ${cycleDays - elapsedDays} hari lagi` }];
  }).toSorted((a, b) => ({ dormant: 0, due: 1, in_progress: 2, upcoming: 3 }[a.status] - ({ dormant: 0, due: 1, in_progress: 2, upcoming: 3 }[b.status])));
}

export function buildNotificationCenter(data, policy = {}, now = new Date()) {
  const notifications = [];
  for (const opportunity of data.opportunities || []) {
    const due = opportunity.nextAction?.due;
    if (["active", "on_hold"].includes(opportunity.status) && due && new Date(due) < now) notifications.push({ id: `opp:${opportunity.id}:${due}`, type: "followup", priority: "high", title: `Tindak lanjut ${opportunity.account} terlambat`, detail: opportunity.nextAction.label, dueAt: due, view: "pipeline", entityId: opportunity.id });
  }
  for (const flag of getCollectionFlags(data.invoices || [], data.payments || [], now)) {
    const invoice = (data.invoices || []).find((item) => item.id === flag.id);
    notifications.push({ id: `invoice:${flag.id}:${invoice?.dueAt}`, type: "invoice", priority: "high", title: `Invoice ${invoice?.number} perlu ditindaklanjuti`, detail: `Sisa ${formatIDR(flag.outstanding)}`, dueAt: invoice?.dueAt, view: "collection", entityId: flag.id });
  }
  for (const contract of data.contracts || []) {
    const remaining = daysBetween(now, contract.validUntil);
    if (["signed", "active"].includes(contract.status) && remaining >= 0 && remaining <= Number(policy.contractWarningDays || 30)) notifications.push({ id: `contract:${contract.id}:${contract.validUntil}`, type: "contract", priority: remaining <= 7 ? "high" : "medium", title: `Kontrak ${contract.number} segera berakhir`, detail: `${remaining} hari lagi`, dueAt: contract.validUntil, view: "contracts", entityId: contract.id });
  }
  for (const project of data.projects || []) {
    if (project.status !== "done" && new Date(project.dueAt) < now) notifications.push({ id: `project:${project.id}:${project.dueAt}`, type: "project", priority: "high", title: `Proyek ${project.name} melewati target`, detail: project.nextMilestone, dueAt: project.dueAt, view: "projects", entityId: project.id });
  }
  for (const candidate of buildRepeatOrderCenter(data, policy, now).filter((item) => ["due", "dormant"].includes(item.status))) notifications.push({ id: `repeat:${candidate.account.id}:${candidate.expectedAt}`, type: "repeat", priority: candidate.status === "dormant" ? "high" : "medium", title: `${candidate.account.name} siap ditinjau untuk repeat order`, detail: candidate.reason, dueAt: candidate.expectedAt, view: "repeat", entityId: candidate.account.id });
  return notifications.toSorted((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - ({ high: 0, medium: 1, low: 2 }[b.priority]) || new Date(a.dueAt) - new Date(b.dueAt)));
}

export function buildReportSnapshot(data, input = {}, now = new Date()) {
  const days = input.days === "all" ? null : Number(input.days || 30);
  const since = days ? new Date(now.getTime() - days * 86_400_000) : new Date(0);
  const owner = input.owner || "all";
  const inWindow = (value) => value && new Date(value) >= since && new Date(value) <= now;
  const opportunities = (data.opportunities || []).filter((item) => owner === "all" || item.owner === owner);
  const scopedOpportunityIds = new Set(opportunities.map((item) => item.id));
  const signals = (data.signals || []).filter((item) => inWindow(item.capturedAt) && (owner === "all" || item.owner === owner));
  const won = opportunities.filter((item) => item.status === "won" && inWindow(item.commitment?.date || item.lastActivityAt));
  const payments = (data.payments || []).filter((item) => inWindow(item.receivedAt) && (owner === "all" || scopedOpportunityIds.has(item.opportunityId)));
  const invoices = (data.invoices || []).filter((item) => inWindow(item.issuedAt) && (owner === "all" || scopedOpportunityIds.has(item.opportunityId)));
  const paidByInvoice = (data.payments || []).reduce((map, item) => map.set(item.invoiceId, (map.get(item.invoiceId) || 0) + Number(item.amount || 0)), new Map());
  const repeat = buildRepeatOrderCenter(data, input, now);
  return { window: { days: days || "all", since: since.toISOString(), until: now.toISOString() }, counts: { signals: signals.length, qualified: signals.filter((item) => item.status === "converted").length, activePipeline: opportunities.filter((item) => ["active", "on_hold"].includes(item.status)).length, won: won.length, repeatDue: repeat.filter((item) => ["due", "dormant"].includes(item.status)).length }, values: { pipeline: opportunities.filter((item) => ["active", "on_hold"].includes(item.status)).reduce((sum, item) => sum + Number(item.value || 0), 0), contracted: won.reduce((sum, item) => sum + Number(item.commitment?.value || item.value || 0), 0), invoiced: invoices.reduce((sum, item) => sum + Number(item.amount || 0), 0), receivable: invoices.reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0) - Number(paidByInvoice.get(item.id) || 0)), 0), collected: payments.reduce((sum, item) => sum + Number(item.amount || 0), 0) }, sources: [...new Set(signals.map((item) => item.source))].map((source) => ({ source, signals: signals.filter((item) => item.source === source).length, qualified: signals.filter((item) => item.source === source && item.status === "converted").length })) };
}

export function daysBetween(from, to) {
  const milliseconds = startOfDay(to) - startOfDay(from);
  return Math.round(milliseconds / 86_400_000);
}

const isoDateIsFuture = (value, now) => startOfDay(value) > startOfDay(now);

export function applyContractAction(contract, input, now = new Date()) {
  const errors = [];
  if (!contract?.id) errors.push(controlError("contract", "Kontrak tidak ditemukan."));
  const actor = String(input.actor || "").trim();
  const evidence = String(input.evidence || "").trim();
  if (!actor) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (!evidence) errors.push(controlError("evidence", "Referensi bukti wajib diisi."));
  const transitions = { draft: ["sent"], sent: ["signed"], signed: ["active"], active: ["cancelled"] };
  const target = String(input.targetStatus || "").trim();
  if (!transitions[contract?.status]?.includes(target)) errors.push(controlError("targetStatus", "Perubahan status kontrak tidak diizinkan."));
  if (target === "signed") {
    if (!input.effectiveAt) errors.push(controlError("effectiveAt", "Tanggal tanda tangan wajib diisi."));
    else if (isoDateIsFuture(input.effectiveAt, now)) errors.push(controlError("effectiveAt", "Tanggal tanda tangan tidak boleh di masa depan."));
  }
  if (errors.length) return { ok: false, errors };
  const at = new Date(now).toISOString();
  const updated = { ...contract, status: target, updatedAt: at, activity: [...(contract.activity || [])] };
  if (target === "signed") updated.signedAt = input.effectiveAt;
  updated.activity.unshift({ at, kind: `contract_${target}`, label: `Kontrak ${target} oleh ${actor}`, evidence });
  return { ok: true, contract: updated };
}

export function reviseContract(contract, input, now = new Date()) {
  const errors = [];
  if (!contract?.id) errors.push(controlError("contract", "Kontrak tidak ditemukan."));
  if (!["draft", "sent"].includes(contract?.status)) errors.push(controlError("status", "Hanya draft atau kontrak terkirim yang dapat direvisi."));
  if (!String(input.actor || "").trim()) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (!String(input.reason || "").trim()) errors.push(controlError("reason", "Alasan revisi wajib diisi."));
  if (errors.length) return { ok: false, errors };
  const at = new Date(now).toISOString();
  return { ok: true, contract: { ...contract, status: "draft", version: Number(contract.version || 1) + 1, updatedAt: at, activity: [{ at, kind: "contract_revised", label: `Versi baru dibuat oleh ${input.actor.trim()}`, detail: input.reason.trim(), previousVersion: Number(contract.version || 1) }, ...(contract.activity || [])] } };
}

export function recordInvoicePayment(invoice, payments, input, now = new Date()) {
  const errors = [];
  if (!invoice?.id) errors.push(controlError("invoice", "Invoice tidak ditemukan."));
  const amount = Number(input.amount || 0);
  const paidBefore = (payments || []).filter((item) => item.invoiceId === invoice?.id).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const outstanding = Math.max(0, Number(invoice?.amount || 0) - paidBefore);
  if (!Number.isFinite(amount) || amount <= 0) errors.push(controlError("amount", "Nominal pembayaran harus lebih dari nol."));
  if (amount > outstanding) errors.push(controlError("amount", "Nominal pembayaran tidak boleh melebihi sisa tagihan."));
  if (!input.receivedAt) errors.push(controlError("receivedAt", "Tanggal penerimaan wajib diisi."));
  else if (isoDateIsFuture(input.receivedAt, now)) errors.push(controlError("receivedAt", "Tanggal penerimaan tidak boleh di masa depan."));
  if (!String(input.evidence || "").trim()) errors.push(controlError("evidence", "Bukti pembayaran wajib diisi."));
  if (!String(input.actor || "").trim()) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (errors.length) return { ok: false, errors, outstanding };
  const at = new Date(now).toISOString();
  const totalPaid = paidBefore + amount;
  const payment = { id: createId("pay"), invoiceId: invoice.id, opportunityId: invoice.opportunityId, amount, receivedAt: input.receivedAt, evidence: input.evidence.trim(), recordedBy: input.actor.trim(), recordedAt: at };
  const updatedInvoice = { ...invoice, status: totalPaid >= Number(invoice.amount) ? "paid" : "partial", updatedAt: at, activity: [{ at, kind: "payment_recorded", label: `Pembayaran dicatat oleh ${input.actor.trim()}`, amount, evidence: input.evidence.trim() }, ...(invoice.activity || [])] };
  return { ok: true, invoice: updatedInvoice, payment, outstanding: Math.max(0, Number(invoice.amount) - totalPaid) };
}

export function buildReceivableAging(invoices = [], payments = [], now = new Date()) {
  const paidByInvoice = payments.reduce((map, payment) => {
    map.set(payment.invoiceId, (map.get(payment.invoiceId) || 0) + Number(payment.amount || 0));
    return map;
  }, new Map());
  const buckets = {
    current: { key: "current", label: "Belum jatuh tempo", count: 0, amount: 0 },
    days_1_30: { key: "days_1_30", label: "Terlambat 1–30 hari", count: 0, amount: 0 },
    days_31_60: { key: "days_31_60", label: "Terlambat 31–60 hari", count: 0, amount: 0 },
    days_61_90: { key: "days_61_90", label: "Terlambat 61–90 hari", count: 0, amount: 0 },
    days_90_plus: { key: "days_90_plus", label: "Terlambat >90 hari", count: 0, amount: 0 }
  };
  const rows = invoices
    .filter((invoice) => ["issued", "overdue", "disputed", "partial"].includes(invoice.status))
    .flatMap((invoice) => {
      const collected = Number(paidByInvoice.get(invoice.id) || 0);
      const outstanding = Math.max(0, Number(invoice.amount || 0) - collected);
      if (!outstanding) return [];
      const overdueDays = Math.max(0, daysBetween(invoice.dueAt, now));
      const bucketKey = startOfDay(invoice.dueAt) >= startOfDay(now) ? "current"
        : overdueDays <= 30 ? "days_1_30"
          : overdueDays <= 60 ? "days_31_60"
            : overdueDays <= 90 ? "days_61_90" : "days_90_plus";
      buckets[bucketKey].count += 1;
      buckets[bucketKey].amount += outstanding;
      return [{ ...invoice, collected, outstanding, overdueDays, bucketKey }];
    })
    .toSorted((a, b) => b.overdueDays - a.overdueDays || new Date(a.dueAt) - new Date(b.dueAt));
  return {
    rows,
    buckets: Object.values(buckets),
    totalOutstanding: rows.reduce((sum, item) => sum + item.outstanding, 0),
    totalOverdue: rows.filter((item) => item.overdueDays > 0).reduce((sum, item) => sum + item.outstanding, 0)
  };
}

function addBillingInterval(date, interval, count) {
  const next = new Date(date);
  if (interval === "yearly") next.setFullYear(next.getFullYear() + count);
  else if (interval === "quarterly") next.setMonth(next.getMonth() + (count * 3));
  else next.setMonth(next.getMonth() + count);
  return next;
}

function billingPeriodKey(date, index) {
  return `${date.toISOString().slice(0, 7)}-${String(index + 1).padStart(2, "0")}`;
}

export function buildBillingSchedule(contracts = [], invoices = [], now = new Date(), horizonDays = 120) {
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + Math.max(1, Number(horizonDays || 120)));
  const generatedKeys = new Set(invoices.map((invoice) => `${invoice.contractId || ""}:${invoice.billingPeriodKey || ""}`));
  const schedule = [];
  for (const contract of contracts.filter((item) => ["signed", "active"].includes(item.status))) {
    const plan = contract.billingPlan || {};
    const startAt = new Date(plan.startAt);
    if (!plan.model || Number.isNaN(startAt.getTime())) continue;
    if (["usage", "milestone"].includes(plan.model)) {
      schedule.push({ id: `${contract.id}:manual`, contractId: contract.id, opportunityId: contract.opportunityId, periodKey: "manual-review", dueAt: startAt.toISOString(), amount: null, status: "needs_review", reason: plan.model === "usage" ? "Nilai pemakaian perlu disetujui" : "Tanggal milestone perlu dikonfirmasi" });
      continue;
    }
    const cycles = Math.max(1, Number(plan.cycles || 1));
    for (let index = 0; index < cycles; index += 1) {
      const dueAt = addBillingInterval(startAt, plan.model === "one_time" ? "monthly" : plan.interval, plan.model === "one_time" ? 0 : index);
      if (dueAt > horizon) break;
      const periodKey = plan.model === "one_time" ? "initial" : billingPeriodKey(dueAt, index);
      const generatedPeriods = plan.generatedPeriods || [];
      const generated = generatedKeys.has(`${contract.id}:${periodKey}`) || generatedPeriods.includes(periodKey) || generatedPeriods.includes(periodKey.slice(0, 7));
      schedule.push({
        id: `${contract.id}:${periodKey}`,
        contractId: contract.id,
        opportunityId: contract.opportunityId,
        periodKey,
        dueAt: dueAt.toISOString(),
        amount: Number(plan.cycleAmount || contract.value || 0),
        status: generated ? "generated" : startOfDay(dueAt) <= startOfDay(now) ? "due" : "upcoming",
        reason: generated ? "Draft atau invoice periode ini sudah ada" : plan.model === "one_time" ? "Tagihan sekali selesai" : `Siklus ${index + 1} dari ${cycles}`
      });
    }
  }
  return schedule.toSorted((a, b) => ({ due: 0, needs_review: 1, upcoming: 2, generated: 3 }[a.status] - ({ due: 0, needs_review: 1, upcoming: 2, generated: 3 }[b.status]) || new Date(a.dueAt) - new Date(b.dueAt)));
}

export function createScheduledInvoiceDraft(contract, opportunity, scheduleItem, input = {}, now = new Date()) {
  const errors = [];
  if (!contract?.id || !opportunity?.id || scheduleItem?.contractId !== contract?.id) errors.push(controlError("source", "Kontrak, pelanggan, atau periode penagihan tidak sesuai."));
  if (!["due", "upcoming"].includes(scheduleItem?.status)) errors.push(controlError("period", "Periode ini tidak dapat dibuat menjadi draft invoice."));
  if (!Number.isFinite(Number(scheduleItem?.amount)) || Number(scheduleItem.amount) <= 0) errors.push(controlError("amount", "Nominal periode harus lebih dari nol."));
  if (!String(input.number || "").trim()) errors.push(controlError("number", "Nomor draft invoice wajib diisi."));
  if (!String(input.actor || "").trim()) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (errors.length) return { ok: false, errors };
  const at = new Date(now).toISOString();
  const amount = Number(scheduleItem.amount);
  return {
    ok: true,
    invoice: {
      id: createId("inv"), contractId: contract.id, opportunityId: opportunity.id,
      billingPeriodKey: scheduleItem.periodKey, number: input.number.trim(), status: "draft",
      issuedAt: null, dueAt: scheduleItem.dueAt, amount,
      items: [{ id: createId("item"), description: `${contract.title} — ${scheduleItem.reason}`, quantity: 1, unitPrice: amount }],
      subtotal: amount, discountAmount: 0, taxRate: 0, taxAmount: 0,
      createdAt: at, createdBy: input.actor.trim(),
      activity: [{ at, kind: "invoice_draft_created", label: `Draft invoice dibuat oleh ${input.actor.trim()}`, source: scheduleItem.id }]
    }
  };
}

export function applyInvoiceAction(invoice, payments = [], input = {}, now = new Date()) {
  const errors = [];
  if (!invoice?.id) errors.push(controlError("invoice", "Invoice tidak ditemukan."));
  if (!String(input.actor || "").trim()) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (!String(input.evidence || "").trim()) errors.push(controlError("evidence", "Alasan atau bukti tindakan wajib diisi."));
  const paid = payments.filter((item) => item.invoiceId === invoice?.id).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  if (input.action === "issue" && invoice?.status !== "draft") errors.push(controlError("status", "Hanya draft yang dapat diterbitkan."));
  if (input.action === "void" && !["draft", "issued", "overdue", "disputed"].includes(invoice?.status)) errors.push(controlError("status", "Status invoice ini tidak dapat dibatalkan."));
  if (input.action === "void" && paid > 0) errors.push(controlError("payment", "Invoice yang sudah memiliki pembayaran tidak dapat di-void. Gunakan proses koreksi yang terotorisasi."));
  if (!["issue", "void"].includes(input.action)) errors.push(controlError("action", "Tindakan invoice tidak valid."));
  if (errors.length) return { ok: false, errors };
  const at = new Date(now).toISOString();
  const status = input.action === "issue" ? "issued" : "void";
  return { ok: true, invoice: { ...invoice, status, issuedAt: input.action === "issue" ? at : invoice.issuedAt, updatedAt: at, activity: [{ at, kind: `invoice_${status}`, label: `Invoice ${status === "issued" ? "diterbitkan" : "dibatalkan"} oleh ${input.actor.trim()}`, evidence: input.evidence.trim() }, ...(invoice.activity || [])] } };
}

export function approvePartnerCommission(partner, commissionId, input, now = new Date()) {
  const errors = [];
  const commission = (partner?.commissions || []).find((item) => item.id === commissionId);
  if (!commission) errors.push(controlError("commission", "Komisi tidak ditemukan."));
  if (commission?.status !== "pending") errors.push(controlError("status", "Hanya komisi pending yang dapat disetujui."));
  if (!String(input.actor || "").trim()) errors.push(controlError("actor", "Penyetuju wajib tercatat."));
  if (!String(input.evidence || "").trim()) errors.push(controlError("evidence", "Bukti transaksi pelanggan wajib diisi."));
  if (errors.length) return { ok: false, errors };
  const at = new Date(now).toISOString();
  return { ok: true, partner: { ...partner, commissions: partner.commissions.map((item) => item.id === commissionId ? { ...item, status: "approved", approvedBy: input.actor.trim(), approvedAt: at, evidence: input.evidence.trim() } : item), activity: [{ at, kind: "commission_approved", label: `Komisi disetujui oleh ${input.actor.trim()}`, commissionId, evidence: input.evidence.trim() }, ...(partner.activity || [])] } };
}

export function recordPartnerPayout(partner, commissionId, input, now = new Date()) {
  const errors = [];
  const commission = (partner?.commissions || []).find((item) => item.id === commissionId);
  if (!commission) errors.push(controlError("commission", "Komisi tidak ditemukan."));
  if (commission?.status !== "approved") errors.push(controlError("status", "Pembayaran hanya dapat dicatat untuk komisi yang telah disetujui."));
  if (!String(input.actor || "").trim()) errors.push(controlError("actor", "Pencatat wajib tercatat."));
  if (!String(input.evidence || "").trim()) errors.push(controlError("evidence", "Bukti payout wajib diisi."));
  if (!input.paidAt) errors.push(controlError("paidAt", "Tanggal payout wajib diisi."));
  else if (isoDateIsFuture(input.paidAt, now)) errors.push(controlError("paidAt", "Tanggal payout tidak boleh di masa depan."));
  if (errors.length) return { ok: false, errors };
  const at = new Date(now).toISOString();
  return { ok: true, partner: { ...partner, commissionPaid: Number(partner.commissionPaid || 0) + Number(commission.amount || 0), commissions: partner.commissions.map((item) => item.id === commissionId ? { ...item, status: "paid", paidBy: input.actor.trim(), paidAt: input.paidAt, payoutEvidence: input.evidence.trim() } : item), activity: [{ at, kind: "commission_paid", label: `Payout dicatat oleh ${input.actor.trim()}`, commissionId, evidence: input.evidence.trim(), amount: commission.amount }, ...(partner.activity || [])] } };
}

export function getSignalReviewState(signal, now = new Date()) {
  if (signal?.status !== "nurture" || !signal.reviewDate) return "none";
  const difference = daysBetween(now, signal.reviewDate);
  if (difference < 0) return "overdue";
  if (difference === 0) return "due_today";
  return "scheduled";
}

export function validateActiveOpportunity(opportunity) {
  if (!ACTIVE_STATUSES.has(opportunity.status)) return [];

  const missing = [];
  if (!opportunity.owner?.trim()) missing.push("owner");
  if (!opportunity.stage?.trim()) missing.push("stage");

  if (opportunity.status === "on_hold") {
    if (!opportunity.holdReason?.trim()) missing.push("holdReason");
    if (!opportunity.reviewDate) missing.push("reviewDate");
    return missing;
  }

  if (!opportunity.nextAction?.label?.trim()) missing.push("nextAction.label");
  if (!opportunity.nextAction?.due) missing.push("nextAction.due");
  return missing;
}

const controlError = (field, message) => ({ field, message });

const validateControlDate = (value, field, label, errors, now) => {
  if (!value) {
    errors.push(controlError(field, `${label} wajib diisi.`));
    return;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    errors.push(controlError(field, `${label} tidak valid.`));
  } else if (startOfDay(parsed) < startOfDay(now)) {
    errors.push(controlError(field, `${label} tidak boleh berada di masa lalu.`));
  }
};

const validNextAction = (input, errors, now) => {
  if (!String(input.nextAction || "").trim()) errors.push(controlError("nextAction", "Next action wajib diisi."));
  validateControlDate(input.due, "due", "Tanggal jatuh tempo", errors, now);
};

export function applyOpportunityControl(opportunity, input, now = new Date()) {
  const errors = [];
  const actor = String(input.actor || "").trim();
  if (!actor) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (!opportunity?.id) errors.push(controlError("opportunity", "Opportunity tidak ditemukan."));
  if (errors.length) return { ok: false, errors };

  const at = new Date(now).toISOString();
  const updated = { ...opportunity, activity: [...(opportunity.activity || [])] };

  if (input.type === "next_action") {
    validNextAction(input, errors, now);
    if (!String(input.reason || "").trim()) errors.push(controlError("reason", "Alasan perubahan wajib diisi agar tanggal lama tetap dapat diaudit."));
    if (errors.length) return { ok: false, errors };
    const previous = opportunity.nextAction ? { ...opportunity.nextAction } : null;
    updated.status = "active";
    updated.nextAction = { label: input.nextAction.trim(), due: input.due };
    updated.lastActivityAt = at;
    updated.activity.unshift({
      at,
      kind: "next_action",
      label: `Next action diperbarui oleh ${actor}`,
      detail: input.reason.trim(),
      previousDue: previous?.due || null,
      previousLabel: previous?.label || null,
      nextDue: input.due,
      nextLabel: input.nextAction.trim()
    });
    return { ok: true, opportunity: updated };
  }

  if (input.type === "stage") {
    const targetStage = String(input.targetStage || "").trim();
    if (!OPPORTUNITY_STAGES.includes(targetStage)) errors.push(controlError("targetStage", "Tahap tujuan tidak valid."));
    if (targetStage === opportunity.stage) errors.push(controlError("targetStage", "Pilih tahap yang berbeda."));
    validNextAction(input, errors, now);
    if (!String(input.evidence || "").trim()) errors.push(controlError("evidence", "Bukti atau alasan perubahan tahap wajib diisi."));

    const targetIndex = OPPORTUNITY_STAGES.indexOf(targetStage);
    const gatedReferenceMissing = targetIndex >= OPPORTUNITY_STAGES.indexOf("Proposal") && !String(input.reference || opportunity.proposalReference || "").trim();
    const unmetRules = gatedReferenceMissing ? ["Referensi proposal/keputusan belum tersedia"] : [];
    if (unmetRules.length && !input.override) errors.push(controlError("reference", "Tahap Proposal/Decision membutuhkan referensi komersial."));
    if (input.override && input.authority !== "Executive Admin") errors.push(controlError("override", "Override hanya tersedia untuk Executive Admin pada prototype."));
    if (input.override && !String(input.overrideReason || "").trim()) errors.push(controlError("overrideReason", "Alasan override wajib diisi."));
    if (errors.length) return { ok: false, errors, unmetRules };

    updated.status = "active";
    updated.stage = targetStage;
    updated.nextAction = { label: input.nextAction.trim(), due: input.due };
    updated.lastActivityAt = at;
    if (input.reference) updated.proposalReference = input.reference.trim();
    updated.activity.unshift({
      at,
      kind: input.override ? "stage_override" : "stage",
      label: `${opportunity.stage} → ${targetStage} oleh ${actor}`,
      detail: input.evidence.trim(),
      reference: String(input.reference || "").trim() || null,
      overrideReason: input.override ? input.overrideReason.trim() : null,
      unmetRules
    });
    return { ok: true, opportunity: updated };
  }

  if (input.type === "hold") {
    if (!String(input.reason || "").trim()) errors.push(controlError("reason", "Alasan hold wajib diisi."));
    validateControlDate(input.reviewDate, "reviewDate", "Tanggal review", errors, now);
    if (errors.length) return { ok: false, errors };
    updated.status = "on_hold";
    updated.holdReason = input.reason.trim();
    updated.reviewDate = input.reviewDate;
    updated.nextAction = null;
    updated.lastActivityAt = at;
    updated.activity.unshift({ at, kind: "hold", label: `Opportunity ditahan oleh ${actor}`, detail: input.reason.trim(), reviewDate: input.reviewDate });
    return { ok: true, opportunity: updated };
  }

  if (input.type === "lost") {
    const reason = String(input.lostReason || "").trim();
    if (!LOST_REASONS.includes(reason)) errors.push(controlError("lostReason", "Pilih alasan lost yang tersedia."));
    if (reason === "Lainnya" && !String(input.reason || "").trim()) errors.push(controlError("reason", "Jelaskan alasan lainnya."));
    if (errors.length) return { ok: false, errors };
    updated.status = "lost";
    updated.stage = "Closed";
    updated.nextAction = null;
    updated.closeReason = reason === "Lainnya" ? input.reason.trim() : reason;
    updated.lastActivityAt = at;
    updated.activity.unshift({ at, kind: "lost", label: `Opportunity ditutup oleh ${actor}`, detail: updated.closeReason });
    return { ok: true, opportunity: updated };
  }

  if (input.type === "reactivate") {
    validNextAction(input, errors, now);
    if (!String(input.reason || "").trim()) errors.push(controlError("reason", "Alasan reaktivasi wajib diisi."));
    if (errors.length) return { ok: false, errors };
    updated.status = "active";
    updated.stage = OPPORTUNITY_STAGES.includes(input.targetStage) ? input.targetStage : "Qualified";
    updated.nextAction = { label: input.nextAction.trim(), due: input.due };
    updated.holdReason = null;
    updated.reviewDate = null;
    updated.closeReason = null;
    updated.lastActivityAt = at;
    updated.activity.unshift({ at, kind: "reactivated", label: `Opportunity diaktifkan kembali oleh ${actor}`, detail: input.reason.trim() });
    return { ok: true, opportunity: updated };
  }

  return { ok: false, errors: [controlError("type", "Jenis kontrol tidak valid.")] };
}

const listFromText = (value) => String(value || "").split(/\n|,/).map((item) => item.trim()).filter(Boolean);

const validateHandoffPackage = (input, errors, now) => {
  if (!String(input.scope || "").trim()) errors.push(controlError("scope", "Ringkasan scope wajib diisi."));
  if (!String(input.clientPIC || "").trim()) errors.push(controlError("clientPIC", "PIC klien wajib diisi."));
  if (!String(input.deliveryOwner || "").trim()) errors.push(controlError("deliveryOwner", "PIC delivery wajib diisi."));
  validateControlDate(input.targetStartDate, "targetStartDate", "Target mulai", errors, now);
  if (!String(input.dependencies || "").trim()) errors.push(controlError("dependencies", "Dependency wajib ditulis; isi ‘Tidak ada’ bila nihil."));
  if (!String(input.constraints || "").trim()) errors.push(controlError("constraints", "Constraint wajib ditulis; isi ‘Tidak ada’ bila nihil."));
};

export function submitWonHandoff(opportunity, input, now = new Date()) {
  const errors = [];
  const actor = String(input.actor || "").trim();
  if (opportunity?.status !== "active" || opportunity.stage !== "Decision") {
    errors.push(controlError("opportunity", "Won hanya dapat diajukan dari opportunity aktif pada stage Decision."));
  }
  if (!actor) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (!String(input.commitmentReference || "").trim()) errors.push(controlError("commitmentReference", "Referensi bukti komitmen wajib diisi."));
  const value = Number(input.contractedValue || 0);
  if (!Number.isFinite(value) || value <= 0) errors.push(controlError("contractedValue", "Nilai kontrak harus lebih dari nol."));
  if (!input.commitmentDate) {
    errors.push(controlError("commitmentDate", "Tanggal komitmen wajib diisi."));
  } else {
    const commitmentDate = new Date(input.commitmentDate);
    if (Number.isNaN(commitmentDate.getTime())) errors.push(controlError("commitmentDate", "Tanggal komitmen tidak valid."));
    else if (startOfDay(commitmentDate) > startOfDay(now)) errors.push(controlError("commitmentDate", "Tanggal komitmen tidak boleh berada di masa depan."));
  }
  validateHandoffPackage(input, errors, now);
  if (errors.length) return { ok: false, errors };

  const at = new Date(now).toISOString();
  const updated = { ...opportunity, activity: [...(opportunity.activity || [])] };
  updated.status = "won";
  updated.stage = "Won";
  updated.value = value;
  updated.probabilityLabel = "Terkontrak";
  updated.nextAction = null;
  updated.lastActivityAt = at;
  updated.commitment = {
    reference: input.commitmentReference.trim(),
    date: input.commitmentDate,
    value,
    recordedBy: actor,
    recordedAt: at
  };
  updated.handoff = {
    status: "submitted",
    scope: input.scope.trim(),
    clientPIC: input.clientPIC.trim(),
    deliveryOwner: input.deliveryOwner.trim(),
    targetStartDate: input.targetStartDate,
    dependencies: listFromText(input.dependencies),
    constraints: listFromText(input.constraints),
    submittedBy: actor,
    submittedAt: at,
    missing: []
  };
  updated.activity.unshift({
    at,
    kind: "won_submitted",
    label: `Bukti won dicatat dan handoff diajukan oleh ${actor}`,
    detail: input.commitmentReference.trim(),
    contractedValue: value
  });
  return { ok: true, opportunity: updated };
}

export function reviewHandoff(opportunity, input, now = new Date()) {
  const errors = [];
  const reviewer = String(input.reviewer || "").trim();
  if (opportunity?.status !== "won" || opportunity.handoff?.status !== "submitted") {
    errors.push(controlError("opportunity", "Hanya handoff submitted yang dapat direview."));
  }
  if (!reviewer) errors.push(controlError("reviewer", "Reviewer delivery wajib diisi."));
  if (!String(input.reviewNote || "").trim()) errors.push(controlError("reviewNote", "Catatan review wajib diisi."));
  if (!["accept", "reject"].includes(input.decision)) errors.push(controlError("decision", "Keputusan review tidak valid."));
  const missing = listFromText(input.missingItems);
  if (input.decision === "reject") {
    if (!missing.length) errors.push(controlError("missingItems", "Item yang perlu diperbaiki wajib diisi."));
    validateControlDate(input.returnDue, "returnDue", "Batas perbaikan", errors, now);
  }
  if (errors.length) return { ok: false, errors };

  const at = new Date(now).toISOString();
  const updated = { ...opportunity, activity: [...(opportunity.activity || [])], handoff: { ...opportunity.handoff } };
  if (input.decision === "accept") {
    updated.handoff.status = "accepted";
    updated.handoff.acceptedBy = reviewer;
    updated.handoff.acceptedAt = at;
    updated.handoff.reviewNote = input.reviewNote.trim();
    updated.handoff.missing = [];
    updated.nextAction = null;
    updated.activity.unshift({ at, kind: "handoff_accepted", label: `Handoff diterima oleh ${reviewer}`, detail: input.reviewNote.trim() });
  } else {
    updated.handoff.status = "rejected";
    updated.handoff.rejectedBy = reviewer;
    updated.handoff.rejectedAt = at;
    updated.handoff.reviewNote = input.reviewNote.trim();
    updated.handoff.missing = missing;
    updated.nextAction = { label: "Lengkapi dan kirim ulang handoff", due: input.returnDue };
    updated.activity.unshift({ at, kind: "handoff_rejected", label: `Handoff dikembalikan oleh ${reviewer}`, detail: `${input.reviewNote.trim()} · Missing: ${missing.join(", ")}` });
  }
  updated.lastActivityAt = at;
  return { ok: true, opportunity: updated };
}

export function resubmitHandoff(opportunity, input, now = new Date()) {
  const errors = [];
  const actor = String(input.actor || "").trim();
  if (opportunity?.status !== "won" || opportunity.handoff?.status !== "rejected") {
    errors.push(controlError("opportunity", "Hanya handoff rejected yang dapat dikirim ulang."));
  }
  if (!actor) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (!String(input.resolutionNote || "").trim()) errors.push(controlError("resolutionNote", "Ringkasan perbaikan wajib diisi."));
  validateHandoffPackage(input, errors, now);
  if (errors.length) return { ok: false, errors };

  const at = new Date(now).toISOString();
  const updated = { ...opportunity, activity: [...(opportunity.activity || [])], handoff: { ...opportunity.handoff } };
  const returnedItems = [...(updated.handoff.missing || [])];
  updated.handoff = {
    ...updated.handoff,
    status: "submitted",
    scope: input.scope.trim(),
    clientPIC: input.clientPIC.trim(),
    deliveryOwner: input.deliveryOwner.trim(),
    targetStartDate: input.targetStartDate,
    dependencies: listFromText(input.dependencies),
    constraints: listFromText(input.constraints),
    submittedBy: actor,
    submittedAt: at,
    resubmissionCount: Number(updated.handoff.resubmissionCount || 0) + 1,
    resolutionNote: input.resolutionNote.trim(),
    lastReturnedItems: returnedItems,
    lastReturnReviewNote: updated.handoff.reviewNote || "",
    missing: []
  };
  updated.nextAction = null;
  updated.lastActivityAt = at;
  updated.activity.unshift({ at, kind: "handoff_resubmitted", label: `Handoff dikirim ulang oleh ${actor}`, detail: input.resolutionNote.trim() });
  return { ok: true, opportunity: updated };
}

export function archiveOpportunity(opportunity, input, now = new Date()) {
  const errors = [];
  const actor = String(input.actor || "").trim();
  const reason = String(input.reason || "").trim();
  if (!opportunity?.id) errors.push(controlError("opportunity", "Opportunity tidak ditemukan."));
  if (opportunity?.status === "archived") errors.push(controlError("opportunity", "Opportunity sudah diarsipkan."));
  if (!actor) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (input.authority !== "Executive Admin") errors.push(controlError("authority", "Archive hanya tersedia untuk Executive Admin pada prototype."));
  if (!reason) errors.push(controlError("reason", "Alasan archive wajib diisi."));
  if (errors.length) return { ok: false, errors };

  const at = new Date(now).toISOString();
  const updated = { ...opportunity, activity: [...(opportunity.activity || [])] };
  updated.archive = {
    status: "archived",
    archivedAt: at,
    archivedBy: actor,
    reason,
    previousState: {
      status: opportunity.status,
      stage: opportunity.stage,
      nextAction: opportunity.nextAction ? { ...opportunity.nextAction } : null,
      holdReason: opportunity.holdReason || null,
      reviewDate: opportunity.reviewDate || null,
      closeReason: opportunity.closeReason || null
    }
  };
  updated.status = "archived";
  updated.stage = "Archived";
  updated.nextAction = null;
  updated.lastActivityAt = at;
  updated.activity.unshift({
    at,
    kind: "archived",
    label: `Opportunity diarsipkan oleh ${actor}`,
    detail: reason,
    previousStatus: opportunity.status,
    previousStage: opportunity.stage
  });
  return { ok: true, opportunity: updated };
}

export function restoreOpportunity(opportunity, input, now = new Date()) {
  const errors = [];
  const actor = String(input.actor || "").trim();
  const reason = String(input.reason || "").trim();
  if (opportunity?.status !== "archived" || opportunity.archive?.status !== "archived") {
    errors.push(controlError("opportunity", "Hanya opportunity archived yang dapat dipulihkan."));
  }
  if (!actor) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (input.authority !== "Executive Admin") errors.push(controlError("authority", "Restore hanya tersedia untuk Executive Admin pada prototype."));
  if (!reason) errors.push(controlError("reason", "Alasan restore wajib diisi."));
  if (errors.length) return { ok: false, errors };

  const at = new Date(now).toISOString();
  const previous = opportunity.archive.previousState || {};
  const updated = { ...opportunity, activity: [...(opportunity.activity || [])], archive: { ...opportunity.archive } };
  updated.status = previous.status || "active";
  updated.stage = previous.stage || "Qualified";
  updated.nextAction = previous.nextAction ? { ...previous.nextAction } : null;
  updated.holdReason = previous.holdReason;
  updated.reviewDate = previous.reviewDate;
  updated.closeReason = previous.closeReason;
  updated.archive.status = "restored";
  updated.archive.restoredAt = at;
  updated.archive.restoredBy = actor;
  updated.archive.restoreReason = reason;
  updated.lastActivityAt = at;
  updated.activity.unshift({
    at,
    kind: "restored",
    label: `Opportunity dipulihkan oleh ${actor}`,
    detail: reason,
    restoredStatus: updated.status,
    restoredStage: updated.stage
  });
  return { ok: true, opportunity: updated };
}

export function getPriorityOverrideState(opportunity, now = new Date()) {
  const override = opportunity?.priorityOverride;
  if (!override || override.active === false) return { status: "none", override: override || null };
  const expiresAt = new Date(override.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date(now)) return { status: "expired", override };
  return { status: "active", override };
}

export function setPriorityOverride(opportunity, input, now = new Date()) {
  const errors = [];
  const actor = String(input.actor || "").trim();
  const reason = String(input.reason || "").trim();
  if (!opportunity?.id || opportunity.status === "archived") errors.push(controlError("opportunity", "Priority override tidak tersedia untuk record archived."));
  if (!actor) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (input.authority !== "Executive Admin") errors.push(controlError("authority", "Priority override hanya tersedia untuk Executive Admin pada prototype."));
  if (!["promote", "defer"].includes(input.direction)) errors.push(controlError("direction", "Arah priority override tidak valid."));
  if (!reason) errors.push(controlError("reason", "Alasan priority override wajib diisi."));
  if (!input.expiresAt) {
    errors.push(controlError("expiresAt", "Masa berlaku override wajib diisi."));
  } else {
    const expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) errors.push(controlError("expiresAt", "Masa berlaku override tidak valid."));
    else if (expiresAt <= new Date(now)) errors.push(controlError("expiresAt", "Masa berlaku override harus berada di masa depan."));
  }
  if (errors.length) return { ok: false, errors };

  const at = new Date(now).toISOString();
  const current = getPriorityOverrideState(opportunity, now);
  const updated = { ...opportunity, activity: [...(opportunity.activity || [])] };
  updated.priorityOverride = {
    active: true,
    direction: input.direction,
    reason,
    actor,
    setAt: at,
    expiresAt: input.expiresAt
  };
  updated.lastActivityAt = at;
  updated.activity.unshift({
    at,
    kind: "priority_override_set",
    label: `Prioritas ${input.direction === "promote" ? "dinaikkan" : "diturunkan"} oleh ${actor}`,
    detail: reason,
    expiresAt: input.expiresAt,
    previousOverride: current.status === "none" ? null : { ...current.override, status: current.status }
  });
  return { ok: true, opportunity: updated };
}

export function clearPriorityOverride(opportunity, input, now = new Date()) {
  const errors = [];
  const actor = String(input.actor || "").trim();
  const reason = String(input.reason || "").trim();
  const current = getPriorityOverrideState(opportunity, now);
  if (current.status === "none") errors.push(controlError("opportunity", "Tidak ada priority override yang dapat dicabut."));
  if (!actor) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (input.authority !== "Executive Admin") errors.push(controlError("authority", "Pencabutan override hanya tersedia untuk Executive Admin pada prototype."));
  if (!reason) errors.push(controlError("reason", "Alasan pencabutan override wajib diisi."));
  if (errors.length) return { ok: false, errors };

  const at = new Date(now).toISOString();
  const updated = { ...opportunity, activity: [...(opportunity.activity || [])], priorityOverride: { ...opportunity.priorityOverride } };
  updated.priorityOverride.active = false;
  updated.priorityOverride.clearedAt = at;
  updated.priorityOverride.clearedBy = actor;
  updated.priorityOverride.clearReason = reason;
  updated.lastActivityAt = at;
  updated.activity.unshift({
    at,
    kind: "priority_override_cleared",
    label: `Priority override dicabut oleh ${actor}`,
    detail: reason,
    previousOverride: { ...current.override, status: current.status }
  });
  return { ok: true, opportunity: updated };
}

export function getAttentionFlags(opportunity, now = new Date(), staleDays = 10) {
  if (opportunity.status === "archived") return [];
  const flags = [];
  const today = startOfDay(now);
  const due = opportunity.nextAction?.due ? startOfDay(opportunity.nextAction.due) : null;
  const missing = validateActiveOpportunity(opportunity);

  if (missing.length > 0) {
    flags.push({ type: "incomplete", weight: 95, label: "Kontrol belum lengkap", detail: missing.join(", ") });
  }

  if (opportunity.status === "active" && due && due < today) {
    flags.push({ type: "overdue", weight: 100, label: "Terlambat", detail: `${daysBetween(due, today)} hari lewat` });
  } else if (opportunity.status === "active" && due?.getTime() === today.getTime()) {
    flags.push({ type: "due_today", weight: 80, label: "Jatuh tempo hari ini", detail: opportunity.nextAction.label });
  }

  if (opportunity.status === "on_hold" && opportunity.reviewDate) {
    const reviewDate = startOfDay(opportunity.reviewDate);
    if (reviewDate < today) {
      flags.push({ type: "hold_review", weight: 85, label: "Review hold terlambat", detail: `${daysBetween(reviewDate, today)} hari lewat` });
    } else if (reviewDate.getTime() === today.getTime()) {
      flags.push({ type: "hold_review", weight: 70, label: "Review hold hari ini", detail: opportunity.holdReason });
    }
  }

  if (opportunity.status === "active" && opportunity.lastActivityAt) {
    const inactiveFor = daysBetween(opportunity.lastActivityAt, now);
    if (inactiveFor >= staleDays) {
      flags.push({ type: "stale", weight: 55, label: "Mulai dingin", detail: `${inactiveFor} hari tanpa progres` });
    }
  }

  if (opportunity.blockingReason) {
    flags.push({ type: "blocked", weight: 90, label: "Terhambat", detail: opportunity.blockingReason });
  }

  if (opportunity.status === "won" && opportunity.handoffRequired !== false && opportunity.handoff?.status !== "accepted") {
    flags.push({ type: "handoff", weight: 75, label: "Handoff belum siap", detail: opportunity.handoff?.missing?.join(", ") || "Menunggu review delivery" });
  }

  const priority = getPriorityOverrideState(opportunity, now);
  if (priority.status === "active") {
    flags.push({
      type: "priority_override",
      weight: 0,
      label: priority.override.direction === "promote" ? "Prioritas manual naik" : "Prioritas manual turun",
      detail: `${priority.override.reason} · berlaku sampai ${priority.override.expiresAt}`
    });
  } else if (priority.status === "expired") {
    flags.push({ type: "priority_expired", weight: 35, label: "Override kedaluwarsa", detail: "Review dan cabut atau perbarui priority override." });
  }

  return flags;
}

export function calculateAttentionQueue(opportunities, now = new Date()) {
  return opportunities
    .flatMap((opportunity) => {
      const flags = getAttentionFlags(opportunity, now);
      if (flags.length === 0) return [];
      const sortedFlags = flags.toSorted((a, b) => b.weight - a.weight);
      const priority = getPriorityOverrideState(opportunity, now);
      const manualDelta = priority.status === "active" ? priority.override.direction === "promote" ? 250 : -60 : 0;
      return [{
        opportunity,
        flags: sortedFlags,
        score: Math.max(1, sortedFlags.reduce((total, flag) => total + flag.weight, 0) + manualDelta)
      }];
    })
    .toSorted((a, b) => b.score - a.score || b.opportunity.value - a.opportunity.value);
}

export function calculateFinancialSummary(opportunities, invoices, payments) {
  const pipeline = opportunities
    .filter((item) => item.status === "active" || item.status === "on_hold")
    .reduce((sum, item) => sum + Number(item.value || 0), 0);

  const contracted = opportunities
    .filter((item) => item.status === "won" || (item.status === "archived" && item.archive?.previousState?.status === "won"))
    .reduce((sum, item) => sum + Number(item.value || 0), 0);

  const issuedInvoices = invoices.filter((item) => ["issued", "overdue", "disputed", "paid", "partial"].includes(item.status));
  const invoiced = issuedInvoices.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const collected = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const receivable = Math.max(0, invoiced - collected);

  return { pipeline, contracted, invoiced, receivable, collected };
}

export function buildAccountSnapshot(data, accountId) {
  const account = (data.accounts || []).find((item) => item.id === accountId);
  if (!account) return null;

  const contacts = (data.contacts || []).filter((item) => item.accountId === accountId);
  const opportunities = (data.opportunities || []).filter((item) => item.accountId === accountId);
  const signals = (data.signals || []).filter((item) => item.accountId === accountId);
  const openSignals = signals.filter((item) => !["converted", "disqualified"].includes(item.status));
  const opportunityIds = new Set(opportunities.map((item) => item.id));
  const invoices = (data.invoices || []).filter((item) => opportunityIds.has(item.opportunityId));
  const invoiceIds = new Set(invoices.map((item) => item.id));
  const payments = (data.payments || []).filter((item) => opportunityIds.has(item.opportunityId) || invoiceIds.has(item.invoiceId));
  const hasActive = opportunities.some((item) => ["active", "on_hold"].includes(item.status));
  const hasWon = opportunities.some((item) => item.status === "won" || (item.status === "archived" && item.archive?.previousState?.status === "won"));
  const hasLost = opportunities.some((item) => item.status === "lost");
  const hasArchived = opportunities.some((item) => item.status === "archived");
  const relationshipState = hasWon && hasActive ? "client_active"
    : hasWon ? "client"
      : hasActive ? "active"
        : openSignals.length ? "prospect"
          : hasLost ? "closed"
            : hasArchived ? "archived" : "prospect";
  const touchDates = [
    account.createdAt,
    ...signals.map((item) => item.capturedAt),
    ...opportunities.flatMap((item) => [item.lastActivityAt, ...(item.activity || []).map((activity) => activity.at)]),
    ...invoices.map((item) => item.issuedAt),
    ...payments.map((item) => item.receivedAt)
  ].filter(Boolean);
  const lastTouchAt = touchDates.toSorted((a, b) => new Date(b) - new Date(a))[0] || account.createdAt;

  return {
    account,
    contacts,
    opportunities,
    signals,
    openSignals,
    invoices,
    payments,
    relationshipState,
    lastTouchAt,
    financial: calculateFinancialSummary(opportunities, invoices, payments)
  };
}

export function calculatePipelineHealth(opportunities, now = new Date()) {
  const active = opportunities.filter((item) => ACTIVE_STATUSES.has(item.status));
  const complete = active.filter((item) => validateActiveOpportunity(item).length === 0);
  const overdue = active.filter((item) => getAttentionFlags(item, now).some((flag) => flag.type === "overdue"));
  const stale = active.filter((item) => getAttentionFlags(item, now).some((flag) => flag.type === "stale"));

  return {
    active: active.length,
    completenessRate: active.length ? Math.round((complete.length / active.length) * 100) : 100,
    overdueRate: active.length ? Math.round((overdue.length / active.length) * 100) : 0,
    staleRate: active.length ? Math.round((stale.length / active.length) * 100) : 0
  };
}

export function getCollectionFlags(invoices, payments, now = new Date()) {
  const paidByInvoice = payments.reduce((map, payment) => {
    map.set(payment.invoiceId, (map.get(payment.invoiceId) || 0) + Number(payment.amount || 0));
    return map;
  }, new Map());

  return invoices
    .filter((invoice) => ["issued", "overdue", "disputed", "partial"].includes(invoice.status))
    .map((invoice) => {
      const collected = paidByInvoice.get(invoice.id) || 0;
      const outstanding = Math.max(0, Number(invoice.amount || 0) - collected);
      const isLate = outstanding > 0 && invoice.dueAt && startOfDay(invoice.dueAt) < startOfDay(now);
      return { ...invoice, collected, outstanding, isLate };
    })
    .filter((invoice) => invoice.outstanding > 0)
    .toSorted((a, b) => Number(b.isLate) - Number(a.isLate) || new Date(a.dueAt) - new Date(b.dueAt));
}

export function formatIDR(value, compact = false) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard"
  }).format(value);
}

export function formatDate(value, options = {}) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: options.year ? "numeric" : undefined,
    timeZone: "Asia/Jakarta"
  }).format(new Date(value));
}

export function createId(prefix = "item") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const relationshipKey = (value) => String(value || "").trim().toLocaleLowerCase("id-ID");

export function linkRelationship(data, input) {
  data.accounts ||= [];
  data.contacts ||= [];

  const accountName = String(input.account || "").trim();
  if (!accountName) throw new Error("Account name is required");

  let account = data.accounts.find((item) => relationshipKey(item.name) === relationshipKey(accountName));
  if (!account) {
    account = {
      id: createId("acc"),
      name: accountName,
      source: input.source || "Unknown",
      createdAt: input.at || new Date().toISOString()
    };
    data.accounts.push(account);
  }

  const contactName = String(input.contact || "").trim();
  const isKnownContact = contactName && !["belum teridentifikasi", "unknown", "-"].includes(relationshipKey(contactName));
  let contact = null;
  if (isKnownContact) {
    contact = data.contacts.find((item) => item.accountId === account.id && relationshipKey(item.name) === relationshipKey(contactName));
    if (!contact) {
      contact = { id: createId("con"), accountId: account.id, name: contactName, createdAt: input.at || new Date().toISOString() };
      data.contacts.push(contact);
    }
  }

  return { accountId: account.id, contactId: contact?.id || null };
}

export function convertSignalToOpportunity(signal, now = new Date()) {
  const due = new Date(now);
  due.setDate(due.getDate() + 1);

  return {
    id: createId("opp"),
    account: signal.account,
    accountId: signal.accountId || null,
    contact: signal.contact || "Belum teridentifikasi",
    contactId: signal.contactId || null,
    service: signal.need || "Perlu discovery",
    source: signal.source || "Unknown",
    owner: signal.owner,
    stage: "Qualified",
    status: "active",
    value: 0,
    probabilityLabel: "Perlu discovery",
    nextAction: {
      label: "Jadwalkan discovery dan validasi kebutuhan",
      due: due.toISOString()
    },
    lastActivityAt: new Date(now).toISOString(),
    note: signal.note || "Signal dipromosikan dari Growth Inbox. Nilai dan scope belum divalidasi.",
    originSignalId: signal.id,
    activity: [{ at: new Date(now).toISOString(), label: "Signal dipromosikan menjadi opportunity", kind: "qualified" }]
  };
}

export function applySignalTriage(signal, input, now = new Date()) {
  const errors = [];
  const actor = String(input.actor || "").trim();
  const action = String(input.action || "").trim();
  if (!signal?.id) errors.push(controlError("signal", "Signal tidak ditemukan."));
  if (!actor) errors.push(controlError("actor", "Aktor wajib tercatat."));
  if (!["qualify", "nurture", "disqualify", "reactivate"].includes(action)) errors.push(controlError("action", "Keputusan triage tidak valid."));
  if (errors.length) return { ok: false, errors };

  const at = new Date(now).toISOString();
  const updated = { ...signal, activity: [...(signal.activity || [])], lastDispositionAt: at };

  if (action === "qualify") {
    const service = String(input.service || "").trim();
    const nextAction = String(input.nextAction || "").trim();
    const rawValue = input.value;
    if (!service) errors.push(controlError("service", "Layanan yang relevan wajib dipilih."));
    if (rawValue === "" || rawValue === null || rawValue === undefined || !Number.isFinite(Number(rawValue)) || Number(rawValue) < 0) {
      errors.push(controlError("value", "Estimasi nilai wajib diisi dengan angka nol atau lebih."));
    }
    if (!nextAction) errors.push(controlError("nextAction", "Next action wajib diisi."));
    validateControlDate(input.due, "due", "Tanggal next action", errors, now);
    if (errors.length) return { ok: false, errors };

    const opportunity = {
      ...convertSignalToOpportunity(signal, now),
      service,
      value: Number(rawValue),
      nextAction: { label: nextAction, due: input.due },
      probabilityLabel: "Qualified manual",
      note: String(input.note || signal.note || "Signal dipromosikan dari Growth Inbox.").trim(),
      activity: [{ at, label: `Signal di-qualify oleh ${actor}`, kind: "signal_qualified", detail: `Layanan: ${service}` }]
    };
    updated.status = "converted";
    updated.convertedOpportunityId = opportunity.id;
    updated.qualifiedAt = at;
    updated.activity.unshift({ at, label: `Dipromosikan ke pipeline oleh ${actor}`, kind: "signal_qualified", detail: nextAction });
    return { ok: true, signal: updated, opportunity };
  }

  if (action === "nurture") {
    const reason = String(input.reason || "").trim();
    if (!reason) errors.push(controlError("reason", "Alasan nurture wajib diisi."));
    validateControlDate(input.reviewDate, "reviewDate", "Tanggal review", errors, now);
    if (errors.length) return { ok: false, errors };
    const previousReviewDate = signal.reviewDate || null;
    updated.status = "nurture";
    updated.nurtureReason = reason;
    updated.reviewDate = input.reviewDate;
    updated.activity.unshift({
      at,
      label: `${previousReviewDate ? "Jadwal nurture diperbarui" : "Masuk nurture"} oleh ${actor}`,
      kind: "signal_nurtured",
      detail: reason,
      previousReviewDate,
      nextReviewDate: input.reviewDate
    });
    return { ok: true, signal: updated };
  }

  if (action === "disqualify") {
    const reason = String(input.reason || "").trim();
    const note = String(input.note || "").trim();
    if (!SIGNAL_DISQUALIFY_REASONS.includes(reason)) errors.push(controlError("reason", "Pilih alasan disqualify yang tersedia."));
    if (reason === "Lainnya" && !note) errors.push(controlError("note", "Catatan wajib diisi untuk alasan Lainnya."));
    if (errors.length) return { ok: false, errors };
    updated.status = "disqualified";
    updated.disqualifyReason = reason;
    updated.disqualifyNote = note;
    updated.disqualifiedAt = at;
    updated.activity.unshift({ at, label: `Disqualified oleh ${actor}`, kind: "signal_disqualified", detail: note ? `${reason} — ${note}` : reason });
    return { ok: true, signal: updated };
  }

  const reason = String(input.reason || "").trim();
  if (!["nurture", "disqualified"].includes(signal.status)) errors.push(controlError("action", "Hanya signal nurture atau disqualified yang dapat diaktifkan kembali."));
  if (!reason) errors.push(controlError("reason", "Alasan reaktivasi wajib diisi."));
  if (errors.length) return { ok: false, errors };
  updated.status = "review";
  updated.reactivatedAt = at;
  updated.activity.unshift({ at, label: `Diaktifkan kembali oleh ${actor}`, kind: "signal_reactivated", detail: reason, previousStatus: signal.status });
  return { ok: true, signal: updated };
}

import {
  applyInvoiceAction,
  applyContractAction,
  approvePartnerCommission,
  applySignalTriage,
  applyOpportunityControl,
  archiveOpportunity,
  buildAccountSnapshot,
  buildBillingSchedule,
  buildNotificationCenter,
  buildReceivableAging,
  buildRepeatOrderCenter,
  buildReportSnapshot,
  calculateAttentionQueue,
  calculateFinancialSummary,
  calculatePipelineHealth,
  createBillingPlan,
  createScheduledInvoiceDraft,
  createManualCalendarEvent,
  clearPriorityOverride,
  createId,
  formatDate,
  formatIDR,
  getAttentionFlags,
  getCollectionFlags,
  getPriorityOverrideState,
  getSignalReviewState,
  expandManualCalendarEvents,
  linkRelationship,
  recordInvoicePayment,
  recordPartnerPayout,
  rescheduleManualCalendarEvent,
  reviseContract,
  resubmitHandoff,
  restoreOpportunity,
  reviewHandoff,
  setPriorityOverride,
  submitWonHandoff,
  SIGNAL_DISQUALIFY_REASONS
} from "./core/growth.js?v=0.1.6";
import { makeSeedData } from "./core/seed.js";
import { buildActivationJourney } from "./core/activation.js";
import { executeServerCommand, inspectDataAuthority } from "./core/api-client.js?v=0.1.0";
import { allowedDashboardsForRoles, bootstrapIdentity, defaultDashboardForRoles } from "./core/auth-workspace.js?v=0.1.9";
import {
  ROLE_CATALOG,
  buildCopilotSuggestion,
  calculateInvoiceBreakdown,
  calculateTrialState,
  createCommunicationDraft,
  generateDocumentDraft,
  normalizeWorkspaceModules,
  prepareIntegrationConnection,
  requestPlanChange,
  requestRoleChange,
  requestWorkspaceModuleChange,
  reviewCopilotSuggestion
} from "./core/control-center.js";
import {
  applyOperationalFallbackPolicy,
  addonAccessCopy,
  departmentsForPreset,
  getWorkspaceContext,
  isFieldVisitFollowUp,
  shouldHideOperationalSample
} from "./core/ux-policy.js";
import {
  addConsultingMilestone,
  addConsultingTask,
  addConsultingTaskComment,
  addConsultingWorkstream,
  buildConsultingPortfolio,
  buildExpenseReviewQueue,
  changeConsultingMilestoneStatus,
  changeConsultingTaskStatus,
  createConsultingEngagement,
  createTaskExpense,
  listAssignableMembers,
  reviewAssignmentHandoff,
  reviewTaskExpense,
  submitAssignmentHandoff
} from "./core/consulting.js";

const identitySession = await bootstrapIdentity();
const identityRoles = identitySession.currentMembership?.roles || [];
const allowedDashboardKeys = allowedDashboardsForRoles(identityRoles);
const identityOrganization = {
  fullName: identitySession.user?.displayName || "Pengguna",
  email: identitySession.user?.email || "",
  company: identitySession.organization?.name || "Bisnis Saya",
  departments: identitySession.currentMembership?.departments || [],
  primaryDepartment: identitySession.departments?.find((item) => item.code === identitySession.currentMembership?.departments?.[0])?.name || "Workspace",
  role: identityRoles.map((role) => ({ executive_admin: "Owner / Admin", sales: "Penjualan", marketing: "Pemasaran", delivery: "Operasional", finance: "Keuangan", reviewer: "Viewer / auditor", billing_admin: "Admin langganan" })[role] || role).join(", "),
  startMode: identitySession.organization?.startMode || "sample",
  configuredAt: identitySession.organization?.onboardedAt,
  serverAuthoritative: true
};

const STORAGE_KEY = "dekta-prototype-v1";
const LEGACY_STORAGE_KEY = "fixit-growth-os-prototype-v1";
const ONBOARDING_KEY = "dekta-onboarding";
const LEGACY_ONBOARDING_KEY = "fixit-growth-os-onboarding";
const views = new Set(["command", "calendar", "signals", "pipeline", "relationships", "repeat", "notifications", "reports", "experiments", "collection", "contracts", "projects", "partners", "adaptation"]);
const root = document.querySelector("#view-root");
const searchInput = document.querySelector("#global-search");
const opportunityDialog = document.querySelector("#opportunity-dialog");
const detailDialog = document.querySelector("#detail-dialog");
const controlDialog = document.querySelector("#control-dialog");
const controlForm = document.querySelector("#control-form");
const controlContext = document.querySelector("#control-context");
const controlErrors = document.querySelector("#control-errors");
const handoffDialog = document.querySelector("#handoff-dialog");
const handoffForm = document.querySelector("#handoff-form");
const handoffContext = document.querySelector("#handoff-context");
const handoffErrors = document.querySelector("#handoff-errors");
const handoffSubmit = document.querySelector("#handoff-submit");
const governanceDialog = document.querySelector("#governance-dialog");
const governanceForm = document.querySelector("#governance-form");
const governanceContext = document.querySelector("#governance-context");
const governancePrinciple = document.querySelector("#governance-principle");
const governanceErrors = document.querySelector("#governance-errors");
const governanceSubmit = document.querySelector("#governance-submit");
const clearPriorityButton = document.querySelector("#clear-priority");
const signalDialog = document.querySelector("#signal-dialog");
const signalTriageDialog = document.querySelector("#signal-triage-dialog");
const recordDialog = document.querySelector("#record-dialog");
const recordForm = document.querySelector("#record-form");
const recordFormContent = document.querySelector("#record-form-content");
const signalTriageForm = document.querySelector("#signal-triage-form");
const signalTriageErrors = document.querySelector("#signal-triage-errors");
const signalTriageSubmit = document.querySelector("#signal-triage-submit");
const resetDialog = document.querySelector("#reset-dialog");
const signalForm = document.querySelector("#signal-form");
const opportunityForm = document.querySelector("#opportunity-form");
const sidebar = document.querySelector("#sidebar");
const mobileBackdrop = document.querySelector("#mobile-backdrop");
const mobileMenu = document.querySelector("#mobile-menu");
const toast = document.querySelector("#toast");
const onboardingDialog = document.querySelector("#onboarding-dialog");
const onboardingForm = document.querySelector("#onboarding-form");
const onboardingProgress = document.querySelector("#onboarding-progress");
const onboardingBack = document.querySelector("#onboarding-back");
const onboardingNext = document.querySelector("#onboarding-next");
const onboardingErrors = document.querySelector("#onboarding-errors");
const onboardingSummary = document.querySelector("#onboarding-summary");

const state = {
  data: loadData(),
  dataAuthority: { mode: "synthetic", status: "checking", base: null, reason: "Memeriksa kesiapan API…", summary: null },
  organization: identityOrganization,
  view: "command",
  dashboard: defaultDashboardForRoles(identityRoles),
  salesAgendaFilter: "today",
  selectedSalesOpportunityId: null,
  selectedCustomerId: null,
  pipelineFilter: "active",
  pipelineView: "kanban",
  calendarView: "agenda",
  calendarCursor: new Date(),
  projectView: "consulting",
  financeView: "overview",
  adaptationFilter: "all",
  settingsTab: "modules",
  signalFilter: "attention",
  signalOriginFilter: "all",
  repeatFilter: "attention",
  notificationFilter: "unread",
  reportDays: "30",
  reportOwner: "all",
  search: "",
  controlOpportunityId: null,
  handoffOpportunityId: null,
  handoffMode: null,
  governanceOpportunityId: null,
  governanceMode: null,
  signalContextAccountId: null,
  recordType: null,
  recordTargetId: null,
  recordSubtargetId: null,
  recordAction: null,
  draggingOpportunityId: null,
  triageSignalId: null,
  onboardingStep: 1,
  activationMode: false
};

const todayNavigation = document.querySelector(".nav-item[data-dashboard-nav]");
if (todayNavigation) todayNavigation.dataset.dashboardNav = state.dashboard;

function syncRoleActionVisibility() {
  const isAdmin = identityRoles.includes("executive_admin");
  const allows = (roles) => isAdmin || roles.some((role) => identityRoles.includes(role));
  const actionRules = [
    ['[data-create-record="customer"], [data-create-record="customer_import"], [data-customer-edit], [data-customer-merge]', ["sales"]],
    ['#add-opportunity, [data-add-opportunity-account], [data-drag-opportunity], [data-move-opportunity], [data-win-opportunity]', ["sales"]],
    ['[data-create-record="contract"], [data-contract-action]', ["sales"]],
    ['[data-create-record="project"], [data-create-record="consulting_engagement"], [data-add-consulting-workstream], [data-add-consulting-milestone], [data-add-consulting-task], [data-consulting-milestone-status], [data-consulting-task-status], [data-comment-consulting-task], [data-handoff-assignment], [data-review-assignment], [data-add-task-expense]', ["delivery"]],
    ['[data-create-record="invoice"], [data-create-scheduled-invoice], [data-invoice-action], [data-invoice-reminder], [data-record-payment], [data-review-task-expense]', ["finance"]],
    ['[data-create-record="member_invite"], [data-create-record="role_change"], [data-create-record="plan_change"], [data-create-record="integration_setup"]', ["executive_admin"]]
  ];
  for (const [selector, roles] of actionRules) {
    document.querySelectorAll(selector).forEach((element) => { element.hidden = !allows(roles); });
  }
  const menu = document.querySelector(".create-menu");
  if (menu) menu.hidden = ![...menu.querySelectorAll(".create-menu-popover button")].some((button) => !button.hidden);
  const controlCenter = document.querySelector('.nav-reference[data-view="adaptation"]');
  const resetSample = document.querySelector("#reset-sample-data");
  if (controlCenter) controlCenter.hidden = !isAdmin;
  if (resetSample) resetSample.hidden = !isAdmin;
}

syncRoleActionVisibility();

function customerPipelineUsesServer() {
  return state.dataAuthority.status === "customer_pipeline_connected" && Boolean(state.dataAuthority.snapshot);
}

function operationalFallbackHidesSample() {
  return shouldHideOperationalSample({
    authenticated: identitySession.authenticated,
    startMode: identitySession.organization?.startMode,
    serverConnected: customerPipelineUsesServer()
  });
}

function customerPipelineData() {
  if (!customerPipelineUsesServer()) {
    return applyOperationalFallbackPolicy(state.data, {
      authenticated: identitySession.authenticated,
      startMode: identitySession.organization?.startMode,
      serverConnected: false
    });
  }
  const snapshot = state.dataAuthority.snapshot;
  const accountById = new Map((snapshot.accounts || []).map((item) => [item.id, item]));
  const memberByUserId = new Map((snapshot.members || []).map((item) => [item.userId, item]));
  const accountAudit = (snapshot.auditEvents || []).filter((item) => item.entityType === "account");
  const opportunityAudit = (snapshot.auditEvents || []).filter((item) => item.entityType === "opportunity");
  const contracts = snapshot.contracts || [];
  const opportunityByContractId = new Map(contracts.map((item) => [item.id, item.opportunityId]));
  const consultingAudit = (snapshot.auditEvents || []).filter((item) => String(item.entityType || "").startsWith("consulting_"));
  const comments = snapshot.consultingTaskComments || [];
  const handoffs = snapshot.consultingAssignmentHandoffs || [];
  const expenses = snapshot.consultingExpenses || [];
  const memberName = (userId) => memberByUserId.get(userId)?.displayName || userId || "Belum ditentukan";
  const consultingEngagements = (snapshot.consultingEngagements || []).map((engagement) => ({
    ...engagement,
    managerId: engagement.managerUserId,
    manager: memberName(engagement.managerUserId),
    workstreams: (snapshot.consultingWorkstreams || []).filter((item) => item.engagementId === engagement.id).map((workstream) => ({
      ...workstream,
      ownerId: workstream.ownerUserId,
      owner: memberName(workstream.ownerUserId),
      milestones: (snapshot.consultingMilestones || []).filter((item) => item.workstreamId === workstream.id),
      tasks: (snapshot.consultingTasks || []).filter((item) => item.workstreamId === workstream.id).map((task) => {
        const taskHandoffs = handoffs.filter((item) => item.taskId === task.id).toSorted((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
        const latestHandoff = taskHandoffs[0];
        return {
          ...task,
          ownerId: task.ownerUserId,
          owner: memberName(task.ownerUserId),
          comments: comments.filter((item) => item.taskId === task.id).map((comment) => ({ ...comment, author: memberName(comment.authorUserId), mentions: (comment.mentions || []).map((userId) => ({ id: userId, name: memberName(userId) })) })),
          handoff: latestHandoff ? { ...latestHandoff, fromAssigneeId: latestHandoff.fromUserId, fromAssignee: memberName(latestHandoff.fromUserId), toAssigneeId: latestHandoff.toUserId, toAssignee: memberName(latestHandoff.toUserId) } : null,
          activity: consultingAudit.filter((event) => event.entityId === task.id).toSorted((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt)).map((event) => ({ at: event.occurredAt, kind: event.action, actor: memberName(event.actorUserId) }))
        };
      })
    })),
    expenses: expenses.filter((item) => item.engagementId === engagement.id).map((expense) => ({ ...expense, evidence: expense.evidenceReference, submittedBy: memberName(expense.submittedByUserId), reviewedBy: expense.reviewedByUserId ? memberName(expense.reviewedByUserId) : null }))
  }));
  return {
    ...state.data,
    accounts: (snapshot.accounts || []).filter((item) => item.status !== "archived").map((item) => ({
      ...item,
      customFields: item.customFields || {},
      activity: accountAudit.filter((event) => event.entityId === item.id).toSorted((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).map((event) => ({
        at: event.occurredAt,
        kind: event.action,
        label: event.action === "account.update" ? "Data pelanggan diperbarui" : "Pelanggan dibuat di server",
        detail: event.action === "account.update" ? "Identitas dan klasifikasi tersimpan; histori relasi tetap dipertahankan" : "Identitas pelanggan mulai digunakan lintas proses"
      }))
    })),
    contacts: (snapshot.contacts || []).filter((item) => item.status !== "archived").map((item) => ({ ...item, name: item.displayName })),
    signals: [],
    purchases: [],
    calendarEvents: [],
    opportunities: (snapshot.opportunities || []).map((item) => {
      const account = accountById.get(item.accountId);
      const owner = memberByUserId.get(item.ownerUserId);
      const activity = opportunityAudit.filter((event) => event.entityId === item.id).toSorted((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).map((event) => ({ at: event.occurredAt, kind: event.action, label: event.action === "opportunity.stage" ? `Tahap dipindahkan ke ${stageLabel(event.nextState?.stage)}` : event.action === "opportunity.win" ? "Persetujuan pelanggan dicatat" : "Peluang dibuat di server", detail: event.reason || event.nextState?.stageReference || "Tercatat dan dapat diaudit" }));
      return { ...item, sourceStage: item.stage, stage: item.status === "won" ? "Won" : item.stage, handoffRequired: false, account: account?.name || "Pelanggan tidak ditemukan", contact: (snapshot.contacts || []).find((contact) => contact.accountId === item.accountId)?.displayName || "Kontak belum dicatat", source: account?.source || "Unknown", owner: owner?.displayName || item.ownerUserId, probabilityLabel: "Tersimpan server", nextAction: item.nextAction ? { label: item.nextAction, due: item.nextActionDueAt } : null, proposalReference: item.stageReference || "", commitment: item.status === "won" ? { reference: item.commitmentReference, date: item.committedAt, value: item.value } : null, lastActivityAt: item.updatedAt, note: "Data pelanggan dan pipeline tersimpan pada database DEKTA.", activity };
    }),
    contracts,
    projects: snapshot.projects || [],
    invoices: (snapshot.invoices || []).map((item) => ({ ...item, opportunityId: opportunityByContractId.get(item.contractId) || null })),
    payments: (snapshot.payments || []).map((item) => ({ ...item, evidence: item.evidenceReference })),
    consultingEngagements
  };
}

function customerPipelineAuthorityNote() {
  if (customerPipelineUsesServer()) return `<aside class="evidence-boundary" aria-label="Sumber data"><span class="evidence-icon">${icon("check")}</span><div><strong>Data pelanggan, pipeline &amp; pekerjaan tersimpan di server</strong><p>Perubahan pada halaman ini masuk database, divalidasi berdasarkan akses, dan dicatat pada audit log.</p></div><span class="evidence-coverage">Server-authoritative</span></aside>`;
  if (operationalFallbackHidesSample()) return `<aside class="evidence-boundary is-blocked" aria-label="Sumber data tidak tersedia"><span class="evidence-icon">${icon("alert")}</span><div><strong>Data operasional belum dapat dibaca</strong><p>Data contoh sengaja disembunyikan agar tidak tertukar dengan workspace perusahaan. Periksa koneksi server lalu coba lagi.</p></div><span class="evidence-coverage">Fail closed</span></aside>`;
  return `<aside class="evidence-boundary" aria-label="Sumber data"><span class="evidence-icon">${icon("clock")}</span><div><strong>Mode contoh lokal</strong><p>Jalankan <code>npm run dev:full</code> agar pelanggan, pipeline, dan pekerjaan konsultasi tersimpan di database.</p></div><span class="evidence-coverage">Belum tersambung</span></aside>`;
}

function sampleModuleBoundary(moduleName) {
  if (!customerPipelineUsesServer() && !operationalFallbackHidesSample()) return "";
  return `<aside class="evidence-boundary is-sample" aria-label="Batas data contoh"><span class="evidence-icon">${icon("alert")}</span><div><strong>${escapeHTML(moduleName)} masih berupa preview</strong><p>Isi di bagian ini adalah data contoh untuk menilai alur dan tampilan. Angka tidak masuk ringkasan workspace perusahaan.</p></div><span class="evidence-coverage">Data contoh</span></aside>`;
}

function attentionFlagsForUI(item) {
  return getAttentionFlags(item).filter((flag) => !(customerPipelineUsesServer() && item.status === "won" && flag.type === "handoff"));
}

function loadOnboardingConfiguration() {
  try {
    return JSON.parse(localStorage.getItem(ONBOARDING_KEY) || localStorage.getItem(LEGACY_ONBOARDING_KEY)) || null;
  } catch {
    return null;
  }
}

signalTriageForm.elements.disqualifyReason.insertAdjacentHTML("beforeend", SIGNAL_DISQUALIFY_REASONS.map((reason) => `<option>${reason}</option>`).join(""));

function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) return hydrateRelationships(makeSeedData());
    const baseline = makeSeedData();
    const parsed = JSON.parse(stored);
    return hydrateRelationships(migrateData({ ...baseline, ...parsed, signals: parsed.signals || baseline.signals }, baseline));
  } catch {
    return hydrateRelationships(makeSeedData());
  }
}

function migrateData(data, baseline) {
  const storedAccountIds = new Set((data.accounts || []).map((item) => item.id));
  data.accounts = [...(data.accounts || []), ...baseline.accounts.filter((item) => !storedAccountIds.has(item.id))]
    .map((item) => ({ ...item, segment: item.segment || "Belum disegmentasi", customFields: item.customFields || {} }));
  const storedContactIds = new Set((data.contacts || []).map((item) => item.id));
  data.contacts = [...(data.contacts || []), ...baseline.contacts.filter((item) => !storedContactIds.has(item.id))];
  data.customerAudit ||= [];
  const baselineById = new Map(baseline.opportunities.map((item) => [item.id, item]));
  data.opportunities = (data.opportunities || []).map((item) => {
    if (item.status !== "won") return item;
    const sample = baselineById.get(item.id) || {};
    const legacyStatus = item.handoff?.status === "review" ? "rejected" : item.handoff?.status;
    const handoff = { ...(sample.handoff || {}), ...(item.handoff || {}), status: legacyStatus || sample.handoff?.status };
    if (handoff.status === "submitted" && handoff.resubmissionCount && handoff.missing?.length) {
      handoff.lastReturnedItems ||= [...handoff.missing];
      handoff.lastReturnReviewNote ||= handoff.reviewNote || "";
      handoff.missing = [];
    }
    const migrated = { ...item, commitment: { ...(sample.commitment || {}), ...(item.commitment || {}) }, handoff };
    if (handoff.status === "rejected" && !migrated.nextAction) {
      migrated.nextAction = sample.nextAction || { label: "Lengkapi dan kirim ulang handoff", due: new Date(Date.now() + 86_400_000).toISOString() };
    }
    return migrated;
  });
  const storedSignalIds = new Set((data.signals || []).map((item) => item.id));
  data.signals = [...(data.signals || []), ...baseline.signals.filter((item) => !storedSignalIds.has(item.id))];
  if (Number(data.meta?.version || 0) < 6) {
    const nurtureSample = baseline.signals.find((item) => item.id === "sig-cakrawala");
    data.signals = data.signals.map((item) => item.id === "sig-cakrawala" && item.status === "inbox" && !(item.activity || []).length
      ? { ...item, status: nurtureSample.status, nurtureReason: nurtureSample.nurtureReason, reviewDate: nurtureSample.reviewDate, lastDispositionAt: nurtureSample.lastDispositionAt, activity: nurtureSample.activity }
      : item);
  }
  data.contracts = (data.contracts || baseline.contracts).map((item) => ({ ...item, billingPlan: item.billingPlan || baseline.contracts.find((row) => row.id === item.id)?.billingPlan || { model: "one_time", interval: null, cycleAmount: item.value, cycles: 1, startAt: item.signedAt || item.updatedAt, invoiceTiming: "advance", generationMode: "draft_only", scheduleNote: "Migrasi kontrak lama sebagai sekali selesai.", generatedPeriods: [] } }));
  data.calendarEvents ||= baseline.calendarEvents || [];
  data.projects = (data.projects || baseline.projects).map((item) => ({ ...item, tasks: item.tasks || [], files: item.files || [], comments: item.comments || [] }));
  const storedMemberIds = new Set((data.memberships || []).map((item) => item.id));
  data.memberships = [...(data.memberships || []), ...baseline.memberships.filter((item) => !storedMemberIds.has(item.id))];
  const memberByLegacyName = (value) => data.memberships.find((member) => String(value || "").toLocaleLowerCase("id-ID").startsWith(member.name.toLocaleLowerCase("id-ID")));
  const storedEngagementIds = new Set((data.consultingEngagements || []).map((item) => item.id));
  data.consultingEngagements = [...(data.consultingEngagements || []), ...baseline.consultingEngagements.filter((item) => !storedEngagementIds.has(item.id))]
    .map((engagement) => {
      const manager = engagement.managerId ? null : memberByLegacyName(engagement.manager);
      return {
        ...engagement,
        managerId: engagement.managerId || manager?.id || null,
        workstreams: (engagement.workstreams || []).map((workstream) => {
          const workstreamOwner = workstream.ownerId ? null : memberByLegacyName(workstream.owner);
          return {
            ...workstream,
            ownerId: workstream.ownerId || workstreamOwner?.id || null,
            tasks: (workstream.tasks || []).map((task) => {
              const taskOwner = task.ownerId ? null : memberByLegacyName(task.owner);
              const recipient = task.handoff?.toAssigneeId ? null : memberByLegacyName(task.handoff?.toAssignee);
              return {
                ...task,
                ownerId: task.ownerId || taskOwner?.id || null,
                comments: task.comments || [],
                handoff: task.handoff ? { ...task.handoff, toAssigneeId: task.handoff.toAssigneeId || recipient?.id || null } : null
              };
            })
          };
        })
      };
    });
  data.partners = (data.partners || baseline.partners).map((item) => ({ ...item, commissions: item.commissions || [], activity: item.activity || [] }));
  data.purchases ||= baseline.purchases || [];
  data.notificationState ||= {};
  data.notificationAudit ||= [];
  data.notificationPreferences = { ...(baseline.notificationPreferences || {}), ...(data.notificationPreferences || {}) };
  data.reportSchedules ||= [];
  data.organization ||= baseline.organization;
  data.roleChangeAudit ||= [];
  data.planCatalog ||= baseline.planCatalog;
  data.subscription ||= baseline.subscription;
  data.planChangeRequests ||= [];
  data.addons ||= baseline.addons;
  data.workspaceModules = normalizeWorkspaceModules(data.workspaceModules, baseline.workspaceModules);
  data.workspaceModuleAudit ||= [];
  data.documentTemplates ||= baseline.documentTemplates;
  data.generatedDocuments ||= [];
  data.integrations ||= baseline.integrations;
  data.communicationDrafts ||= [];
  data.copilotReviews ||= [];
  data.invoices = (data.invoices || baseline.invoices).map((item) => ({ ...item, items: item.items || [{ id: `${item.id}-item`, description: "Nilai invoice", quantity: 1, unitPrice: item.amount }], subtotal: item.subtotal ?? item.amount, discountAmount: item.discountAmount || 0, taxRate: item.taxRate || 0, taxAmount: item.taxAmount || 0 }));
  data.research = baseline.research;
  data.meta = { ...(data.meta || {}), version: 11 };
  return data;
}

function hydrateRelationships(data) {
  for (const item of [...(data.signals || []), ...(data.opportunities || [])]) {
    const relation = linkRelationship(data, {
      account: item.account,
      contact: item.contact,
      source: item.source,
      at: item.capturedAt || item.lastActivityAt || data.meta?.generatedAt
    });
    item.accountId = relation.accountId;
    item.contactId = relation.contactId;
  }
  return data;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function resetSampleData() {
  state.data = makeSeedData();
  state.pipelineFilter = "active";
  state.search = "";
  searchInput.value = "";
  persist();
  resetDialog.close();
  setView("command");
  updateNavCounts();
  showToast("Data lokal dikembalikan ke sampel awal.");
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function icon(name) {
  return `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

function initials(value) {
  return String(value || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function slug(value) {
  return String(value || "").toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}

function normalize(value) {
  return String(value || "").toLocaleLowerCase("id-ID");
}

function operatingAction(item) {
  if (item.status === "archived") return { label: `Diarsipkan: ${item.archive?.reason || "Tanpa alasan"}`, due: item.archive?.archivedAt };
  if (item.status === "on_hold") return { label: `Review hold: ${item.holdReason}`, due: item.reviewDate };
  if (item.nextAction) return item.nextAction;
  if (item.status === "won") return { label: "Periksa kesiapan kerja dan tagihan", due: item.lastActivityAt };
  return { label: item.closeReason || "Tidak ada tindakan", due: item.lastActivityAt };
}

function setView(view) {
  if (!views.has(view)) return;
  if (view === "command" && state.search) {
    state.search = "";
    searchInput.value = "";
  }
  state.view = view;
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    const groupedViews = (button.dataset.navViews || "").split(",").filter(Boolean);
    const active = button.dataset.view === view || groupedViews.includes(view);
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".nav-item[data-dashboard-nav]").forEach((button) => {
    const active = view === "command" && button.dataset.dashboardNav === state.dashboard;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  closeMobileNav();
  render();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.querySelector("#main-content")?.focus({ preventScroll: true });
}

function openMobileNav() {
  sidebar.classList.add("is-open");
  mobileBackdrop.hidden = false;
  mobileMenu.setAttribute("aria-expanded", "true");
}

function closeMobileNav() {
  sidebar.classList.remove("is-open");
  mobileBackdrop.hidden = true;
  mobileMenu.setAttribute("aria-expanded", "false");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function serverErrorMessage(code) {
  return {
    ACCOUNT_DUPLICATE: "Pelanggan dengan nama yang sama sudah ada. Buka data tersebut atau gunakan fitur gabungkan duplikat.",
    ACCOUNT_NOT_FOUND: "Data pelanggan tidak ditemukan atau sudah diarsipkan.",
    ACCOUNT_NAME_REQUIRED: "Nama perusahaan atau usaha wajib diisi.",
    ACCOUNT_CUSTOM_FIELDS_INVALID: "Custom fields tidak valid atau terlalu panjang.",
    ACCOUNT_MERGE_FIELDS_REQUIRED: "Pilih pelanggan tujuan dan tulis alasan penggabungan.",
    OPPORTUNITY_CONTROL_FIELDS_REQUIRED: "Lengkapi pelanggan, layanan, PIC, tahap, nilai, dan janji berikutnya.",
    OPPORTUNITY_OWNER_INVALID: "PIC harus anggota aktif dari tim Penjualan atau Admin.",
    OPPORTUNITY_VERSION_CONFLICT: "Peluang sudah berubah di sesi lain. Data telah dimuat ulang; periksa lalu ulangi.",
    STAGE_EVIDENCE_REQUIRED: "Bukti atau alasan perpindahan tahap wajib diisi.",
    STAGE_REFERENCE_REQUIRED: "Tahap Penawaran dan Keputusan memerlukan referensi proposal atau keputusan.",
    NEXT_ACTION_DUE_INVALID: "Tindakan berikutnya dan tanggal mendatang wajib diisi.",
    OPPORTUNITY_NOT_FOUND: "Peluang tidak ditemukan pada workspace ini.",
    OPPORTUNITY_NOT_ACTIVE: "Peluang ini sudah tidak aktif dan tidak dapat diubah lagi.",
    OPPORTUNITY_STAGE_INVALID: "Pilih tahap tujuan yang berbeda dan masih berlaku.",
    WIN_EVIDENCE_REQUIRED: "Referensi komitmen, tanggal persetujuan, dan nilai yang disetujui wajib diisi.",
    CONTRACT_SOURCE_NOT_FOUND: "Peluang atau pelanggan sumber kontrak tidak ditemukan.",
    WON_OPPORTUNITY_REQUIRED: "Kontrak aktif hanya dapat dicatat dari peluang yang sudah disetujui pelanggan.",
    CONTRACT_FIELDS_REQUIRED: "Lengkapi nomor, judul, nilai, mata uang, dan tanggal tanda tangan kontrak.",
    CONTRACT_NUMBER_DUPLICATE: "Nomor kontrak tersebut sudah digunakan. Periksa kontrak yang ada atau gunakan nomor lain.",
    PROJECT_SOURCE_NOT_FOUND: "Kontrak aktif yang terhubung ke peluang dan pelanggan tidak ditemukan.",
    PROJECT_FIELDS_REQUIRED: "Lengkapi nama pekerjaan, penanggung jawab, dan target selesai.",
    FEATURE_NOT_ENTITLED: "Fitur pekerjaan belum aktif untuk paket workspace ini.",
    INVOICE_SOURCE_NOT_FOUND: "Kontrak aktif untuk invoice ini tidak ditemukan.",
    INVOICE_FIELDS_REQUIRED: "Lengkapi nomor, nilai, tanggal terbit, jatuh tempo, dan referensi penerbitan invoice.",
    INVOICE_DUE_INVALID: "Jatuh tempo invoice tidak boleh lebih awal dari tanggal terbit.",
    INVOICE_NUMBER_DUPLICATE: "Nomor invoice tersebut sudah digunakan. Periksa invoice yang ada atau gunakan nomor lain.",
    INVOICE_NOT_FOUND: "Invoice tidak ditemukan pada workspace ini.",
    PAYMENT_EVIDENCE_REQUIRED: "Tanggal diterima dan referensi bukti pembayaran wajib diisi.",
    PAYMENT_EVIDENCE_DUPLICATE: "Referensi bukti pembayaran tersebut sudah pernah dipakai. Periksa pembayaran yang ada sebelum mencoba lagi.",
    PAYMENT_FIELDS_REQUIRED: "Nominal pembayaran harus berupa Rupiah utuh yang lebih besar dari nol.",
    PAYMENT_EXCEEDS_OUTSTANDING: "Nominal pembayaran melebihi sisa tagihan. Periksa kembali saldo invoice lalu masukkan nominal yang sesuai.",
    COMMAND_RETRYABLE_CONFLICT: "Data berubah saat disimpan. Data belum tersimpan; muat ulang lalu ulangi tindakan dengan informasi terbaru.",
    API_TIMEOUT: "Server terlalu lama merespons. Data belum disimpan; silakan coba lagi.",
    API_UNREACHABLE: "Server tidak dapat dijangkau. Data belum disimpan.",
    ACTION_FORBIDDEN: "Akun Anda tidak memiliki kewenangan untuk tindakan ini.",
    AUTHENTICATION_REQUIRED: "Sesi Anda sudah tidak aktif. Muat ulang dan masuk kembali.",
    TRIAL_EXPIRED: "Masa coba sudah selesai. Data tetap bisa dibaca, tetapi perubahan baru menunggu aktivasi paket.",
    GRACE_EXPIRED: "Masa tenggang sudah selesai. Data tetap aman dan dapat dibaca, tetapi perubahan baru dinonaktifkan.",
    SUBSCRIPTION_INACTIVE: "Workspace sedang dalam mode baca saja. Hubungi admin langganan untuk mengaktifkan perubahan.",
    IDEMPOTENCY_KEY_REUSED: "Permintaan bentrok dengan percobaan sebelumnya. Muat ulang lalu coba lagi."
    , CONSULTING_MEMBER_INVALID: "Pilih anggota aktif yang memiliki akses pada organisasi ini."
    , CONSULTING_ENGAGEMENT_REFERENCE_DUPLICATE: "Referensi engagement bentrok dengan data yang baru dibuat. Muat ulang lalu coba lagi."
    , CONSULTING_WORKSTREAM_DUPLICATE: "Nama layanan tersebut sudah ada pada engagement ini."
    , CONSULTING_MILESTONE_WEIGHT_EXCEEDED: "Total bobot milestone tidak boleh melebihi 100%."
    , CONSULTING_HANDOFF_REVIEWER_INVALID: "Serah tugas hanya dapat diterima atau dikembalikan oleh penerima yang dituju."
    , CONSULTING_HANDOFF_PENDING: "Tugas ini masih memiliki serah tugas yang menunggu keputusan."
    , CONSULTING_TASK_VERSION_CONFLICT: "Tugas sudah berubah di sesi lain. Data telah dimuat ulang; periksa lalu ulangi."
    , CONSULTING_MILESTONE_VERSION_CONFLICT: "Milestone sudah berubah di sesi lain. Data telah dimuat ulang; periksa lalu ulangi."
    , CONSULTING_EXPENSE_VERSION_CONFLICT: "Biaya sudah berubah di sesi lain. Data telah dimuat ulang; periksa lalu ulangi."
    , CONSULTING_EXPENSE_EVIDENCE_DUPLICATE: "Referensi bukti biaya tersebut sudah pernah dipakai."
  }[code] || `Perubahan belum tersimpan (${code || "kesalahan server"}).`;
}

function setFormSubmitting(form, busy, label = "Menyimpan…") {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  if (busy) {
    button.dataset.previousLabel = button.textContent;
    button.textContent = label;
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.previousLabel || button.textContent;
    button.disabled = false;
    form.removeAttribute("aria-busy");
  }
}

function executeConsultingServerCommand(command, payload) {
  const commands = {
    "consulting.engagement.create": () => executeServerCommand("consulting.engagement.create", payload),
    "consulting.workstream.create": () => executeServerCommand("consulting.workstream.create", payload),
    "consulting.milestone.create": () => executeServerCommand("consulting.milestone.create", payload),
    "consulting.milestone.status": () => executeServerCommand("consulting.milestone.status", payload),
    "consulting.task.create": () => executeServerCommand("consulting.task.create", payload),
    "consulting.task.status": () => executeServerCommand("consulting.task.status", payload),
    "consulting.task.comment": () => executeServerCommand("consulting.task.comment", payload),
    "consulting.assignment.submit": () => executeServerCommand("consulting.assignment.submit", payload),
    "consulting.assignment.review": () => executeServerCommand("consulting.assignment.review", payload),
    "consulting.expense.create": () => executeServerCommand("consulting.expense.create", payload),
    "consulting.expense.review": () => executeServerCommand("consulting.expense.review", payload)
  };
  return commands[command]?.() || Promise.resolve({ ok: false, code: "COMMAND_NOT_SUPPORTED" });
}

function selectedDepartments() {
  return [...onboardingForm.querySelectorAll('input[name="departments"]:checked')].map((field) => field.value);
}

function syncDepartmentPreset() {
  const preset = onboardingForm.elements.departmentPreset?.value || "owner";
  const picker = onboardingForm.querySelector(".department-picker");
  const summary = onboardingForm.querySelector("#department-preset-summary");
  const selected = departmentsForPreset(preset, selectedDepartments());
  if (preset !== "custom") {
    [...onboardingForm.elements.departments].forEach((field) => { field.checked = selected.includes(field.value); });
  }
  if (picker) picker.hidden = preset !== "custom";
  if (summary) {
    const labels = [...onboardingForm.elements.departments].filter((field) => field.checked).map((field) => field.closest("label")?.querySelector("strong")?.textContent || field.value);
    summary.textContent = preset === "custom" ? "Pilih fungsi yang benar-benar digunakan tim Anda." : `${labels.length} fungsi disiapkan: ${labels.join(", ")}. Bisa diubah nanti.`;
  }
}

function syncCompanyMode() {
  const mode = onboardingForm.elements.companyMode.value;
  onboardingForm.querySelectorAll("[data-company-mode]").forEach((section) => {
    section.hidden = section.dataset.companyMode !== mode;
  });
}

function updateOnboardingSummary() {
  const form = new FormData(onboardingForm);
  const mode = form.get("companyMode");
  const company = mode === "join" ? `Undangan ${form.get("inviteCode") || "belum diisi"}` : form.get("companyName") || "Perusahaan belum dinamai";
  const departments = selectedDepartments();
  const startMode = { sample: "Data contoh", empty: "Workspace kosong", import: "Review impor Excel" }[form.get("startMode")] || "Belum dipilih";
  onboardingSummary.innerHTML = `<div><small>Workspace</small><strong>${escapeHTML(company)}</strong></div><div><small>Akses awal</small><strong>${escapeHTML(form.get("primaryDepartment") || "Belum dipilih")} · ${departments.length} fungsi</strong></div><div><small>Mulai dari</small><strong>${escapeHTML(startMode)}</strong></div>`;
}

function setOnboardingStep(step) {
  state.onboardingStep = Math.max(1, Math.min(4, step));
  onboardingForm.querySelectorAll("[data-onboarding-step]").forEach((page) => {
    const active = Number(page.dataset.onboardingStep) === state.onboardingStep;
    page.hidden = !active;
    page.classList.toggle("is-active", active);
  });
  onboardingForm.querySelectorAll("[data-onboarding-indicator]").forEach((indicator) => {
    const position = Number(indicator.dataset.onboardingIndicator);
    indicator.classList.toggle("is-active", position === state.onboardingStep);
    indicator.classList.toggle("is-complete", position < state.onboardingStep);
  });
  onboardingProgress.textContent = `Langkah ${state.onboardingStep} dari 4`;
  onboardingBack.hidden = state.onboardingStep === 1;
  onboardingNext.textContent = state.onboardingStep === 4 ? "Aktifkan workspace" : "Lanjut";
  onboardingErrors.hidden = true;
  if (state.onboardingStep === 2) syncCompanyMode();
  if (state.onboardingStep === 3) syncDepartmentPreset();
  if (state.onboardingStep === 4) updateOnboardingSummary();
  onboardingForm.querySelector(`[data-onboarding-step="${state.onboardingStep}"] input, [data-onboarding-step="${state.onboardingStep}"] select`)?.focus({ preventScroll: true });
}

function validateOnboardingStep() {
  onboardingErrors.hidden = true;
  onboardingErrors.textContent = "";
  const page = onboardingForm.querySelector(`[data-onboarding-step="${state.onboardingStep}"]`);
  const mode = onboardingForm.elements.companyMode.value;
  const required = [...page.querySelectorAll("[required]")].filter((field) => {
    if (state.onboardingStep !== 2) return true;
    return mode === "create" ? field.name !== "inviteCode" : !["companyName", "industry", "companySize"].includes(field.name);
  });
  const invalid = required.find((field) => !String(field.value).trim() || (field.type === "email" && !field.validity.valid));
  if (invalid) {
    invalid.focus();
    onboardingErrors.textContent = invalid.type === "email" ? "Tulis alamat email yang valid." : "Lengkapi bagian yang masih kosong sebelum lanjut.";
    onboardingErrors.hidden = false;
    return false;
  }
  if (state.onboardingStep === 2 && mode === "join" && !String(onboardingForm.elements.inviteCode.value).trim()) {
    onboardingForm.elements.inviteCode.focus();
    onboardingErrors.textContent = "Masukkan kode undangan dari admin perusahaan.";
    onboardingErrors.hidden = false;
    return false;
  }
  if (state.onboardingStep === 3 && selectedDepartments().length === 0) {
    onboardingErrors.textContent = "Pilih sedikitnya satu departemen yang akan digunakan.";
    onboardingErrors.hidden = false;
    return false;
  }
  return true;
}

function openOnboarding() {
  onboardingForm.reset();
  onboardingForm.elements.companyMode.value = "create";
  onboardingForm.elements.departmentPreset.value = "owner";
  onboardingForm.elements.startMode.value = "sample";
  syncDepartmentPreset();
  setOnboardingStep(1);
  onboardingDialog.showModal();
}

function completeOnboarding() {
  const data = new FormData(onboardingForm);
  const company = data.get("companyMode") === "join" ? "workspace undangan" : data.get("companyName");
  const configuration = {
    fullName: data.get("fullName"),
    email: data.get("email"),
    company,
    departments: selectedDepartments(),
    primaryDepartment: data.get("primaryDepartment"),
    role: data.get("initialRole"),
    startMode: data.get("startMode"),
    configuredAt: new Date().toISOString(),
    prototypeOnly: true
  };
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify(configuration));
  state.organization = configuration;
  const profile = document.querySelector(".profile-switcher");
  profile.querySelector("strong").textContent = configuration.fullName.split(" ")[0];
  profile.querySelector("small").textContent = `${configuration.primaryDepartment} · ${configuration.role}`;
  const brandCompany = document.querySelector(".brand-company");
  if (brandCompany) brandCompany.textContent = configuration.company || "Bisnis Saya";
  onboardingDialog.close();
  showToast(`${company} siap dicoba. Data tetap berstatus sampel sampai lolos verifikasi.`);
}

function applyOnboardingProfile() {
  if (!state.organization) return;
  const profile = document.querySelector(".profile-switcher");
  profile.querySelector("strong").textContent = state.organization.fullName?.split(" ")[0] || "Pengguna";
  profile.querySelector("small").textContent = `${state.organization.primaryDepartment} · ${state.organization.role}`;
  const brandCompany = document.querySelector(".brand-company");
  if (brandCompany) brandCompany.textContent = state.organization.company || "Bisnis Saya";
}

function viewHeading(kicker, title, description, action = "") {
  const today = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jakarta"
  }).format(new Date());

  return `
    <header class="view-heading">
      <div>
        <span class="eyebrow">${escapeHTML(kicker)}</span>
        <h1>${escapeHTML(title)}</h1>
        <p>${escapeHTML(description)}</p>
      </div>
      ${action || `<div class="view-meta">${icon("clock")}<span>${escapeHTML(today)}</span></div>`}
    </header>`;
}

function financialMetric(label, value, caption, displayValue = null) {
  return `
    <div class="financial-metric">
      <span class="metric-label"><i class="metric-dot"></i>${escapeHTML(label)}</span>
      <strong class="metric-value">${displayValue ?? formatIDR(value, true)}</strong>
      <span class="metric-caption">${escapeHTML(caption)}</span>
    </div>`;
}

function flagMarkup(flag) {
  const iconName = flag.type === "priority_override" ? "trend" : ["overdue", "blocked", "incomplete", "priority_expired"].includes(flag.type) ? "alert" : "clock";
  return `<span class="flag ${escapeHTML(flag.type)}" title="${escapeHTML(flag.detail)}">${icon(iconName)}${escapeHTML(flag.label)}</span>`;
}

const departmentDashboards = [
  ["summary", "Ringkasan", "Pandangan lintas departemen untuk keputusan owner."],
  ["sales", "Penjualan", "Pelanggan, peluang, dan tindak lanjut penjualan."],
  ["customer", "Pelanggan", "Konteks hubungan, komitmen, dan peluang lanjutan."],
  ["marketing", "Pemasaran", "Sumber permintaan, kampanye, dan kualitas calon pelanggan."],
  ["finance", "Keuangan", "Tagihan, piutang, dan uang yang benar-benar diterima."],
  ["delivery", "Operasional", "Kesiapan pekerjaan dan komitmen kepada pelanggan."]
];

let tooltipIndex = 0;

function helpTip(text, label = "Apa ini?") {
  tooltipIndex += 1;
  const id = `tooltip-${tooltipIndex}`;
  return `<span class="help-tip"><button type="button" aria-describedby="${id}">${escapeHTML(label)}</button><span id="${id}" role="tooltip">${escapeHTML(text)}</span></span>`;
}

function horizontalScrollHint(text) {
  return `<p class="horizontal-scroll-hint" aria-hidden="true">${icon("arrow")}<span>${escapeHTML(text)}</span></p>`;
}

function renderAddonBanner(code, name, description) {
  const addon = state.data.addons.find((item) => item.code === code);
  const access = addonAccessCopy(addon, state.data.subscription);
  return `<aside class="addon-banner"><span class="status-badge ${access.className}">${escapeHTML(access.label)}</span><div><strong>${escapeHTML(name)}</strong><p>${escapeHTML(description)}</p><small>${escapeHTML(access.detail)}</small></div>${helpTip("Status mode coba, paket, dan tagihan ditampilkan terpisah. Hak akses produksi hanya berubah setelah bukti langganan diverifikasi server.")}</aside>`;
}

function dashboardMetric(label, value, caption, help, tone = "", iconName = "trend") {
  return `
    <article class="dashboard-metric ${escapeHTML(tone)}">
      <span class="dashboard-metric-icon" aria-hidden="true">${icon(iconName)}</span>
      <div class="dashboard-metric-copy">
        <div class="dashboard-metric-label"><span>${escapeHTML(label)}</span>${helpTip(help)}</div>
        <strong>${value}</strong>
        <small>${escapeHTML(caption)}</small>
      </div>
    </article>`;
}

function dashboardShell(key, title, description, body, action = "") {
  tooltipIndex = 0;
  const roleOptions = departmentDashboards.filter(([value]) => allowedDashboardKeys.includes(value)).map(([value, label]) => `<option value="${value}" ${key === value ? "selected" : ""}>${escapeHTML(label)}</option>`).join("");
  const rolePicker = `<label class="dashboard-role-picker"><span>Tampilan saya</span><select id="dashboard-role-select" aria-label="Pilih ringkasan departemen">${roleOptions}</select></label>`;
  return `
    <section class="view dashboard-view" data-rendered-view="command" data-dashboard="${escapeHTML(key)}">
      <header class="dashboard-heading">
        <div><h1>${escapeHTML(title)}</h1><p>${escapeHTML(description)}</p></div>
        <div class="dashboard-heading-actions">${action}${rolePicker}</div>
      </header>
      ${body}
    </section>`;
}

function dueState(item, now = new Date()) {
  const action = operatingAction(item);
  const due = action?.due ? new Date(action.due) : null;
  if (!due || Number.isNaN(due.getTime())) return "upcoming";
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due); dueDay.setHours(0, 0, 0, 0);
  if (dueDay < today) return "overdue";
  if (dueDay.getTime() === today.getTime()) return "today";
  return "upcoming";
}

function renderDepartmentDashboard() {
  const renderers = {
    summary: renderOwnerDashboard,
    sales: renderSalesDashboard,
    customer: renderCustomerDashboard,
    marketing: renderMarketingDashboard,
    finance: renderFinanceDashboard,
    delivery: renderDeliveryDashboard
  };
  root.innerHTML = (renderers[state.dashboard] || renderOwnerDashboard)();
  syncDashboardChrome();
}

function syncDashboardChrome() {
  const label = departmentDashboards.find(([value]) => value === state.dashboard)?.[1] || "Ringkasan";
  document.querySelectorAll(".topbar-tabs [data-dashboard]").forEach((button) => {
    const active = state.view === "command" && button.dataset.dashboard === state.dashboard;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".nav-item[data-dashboard-nav]").forEach((button) => {
    const active = state.view === "command" && button.dataset.dashboardNav === state.dashboard;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const context = getWorkspaceContext(state.view, label);
  const contextPrefix = document.querySelector("#active-context-prefix");
  const activeLabel = document.querySelector("#active-dashboard-label");
  if (contextPrefix) contextPrefix.textContent = `${context.prefix}:`;
  if (activeLabel) activeLabel.textContent = context.label;
}

function renderCommand() {
  renderDepartmentDashboard();
}

function renderOwnerDashboard() {
  const now = new Date();
  const firstName = state.organization?.fullName?.split(" ")[0] || "Anggit";
  if (!customerPipelineUsesServer() && identitySession.organization?.startMode !== "sample") {
    const journey = currentActivationJourney(now);
    const body = `${renderActivationJourney(now)}${renderOperationalWorkspaceSummary(journey)}`;
    return dashboardShell("summary", `Selamat pagi, ${firstName}`, "Bangun alur kerja dari pelanggan nyata perusahaan Anda. DEKTA akan menunjukkan langkah berikutnya.", body);
  }
  const operational = customerPipelineData();
  const financial = calculateFinancialSummary(operational.opportunities, operational.invoices, operational.payments);
  const queue = calculateAttentionQueue(operational.opportunities, now);
  const collectionFlags = getCollectionFlags(operational.invoices, operational.payments, now);
  const health = calculatePipelineHealth(operational.opportunities, now);
  const handoffCount = operational.opportunities.filter((item) => item.status === "won" && item.handoff?.status && item.handoff.status !== "accepted").length;
  const overdueCount = queue.filter((item) => item.flags.some((flag) => flag.type === "overdue")).length;
  const todayCount = queue.filter((item) => dueState(item.opportunity, now) === "today").length;
  const agenda = collectCalendarEvents().filter((item) => new Date(item.at) >= new Date(now.getTime() - 3_600_000)).slice(0, 3);

  const body = `
    ${renderActivationJourney(now)}
    <section class="attention-strip" aria-label="Hal yang perlu perhatian">
      <div class="attention-strip-heading"><h2>Perlu perhatian</h2><span>${overdueCount + handoffCount + collectionFlags.length}</span></div>
      <div class="attention-cards">
        <button type="button" data-dashboard="sales"><i class="attention-icon danger">${icon("alert")}</i><span><strong>${overdueCount} tindak lanjut terlambat</strong><small>Selesaikan atau jadwalkan ulang</small></span>${icon("chevron")}</button>
        <button type="button" data-dashboard="delivery"><i class="attention-icon warning">${icon("clock")}</i><span><strong>${handoffCount} pekerjaan menunggu</strong><small>Periksa kesiapan tim hari ini</small></span>${icon("chevron")}</button>
        <button type="button" data-dashboard="finance"><i class="attention-icon finance">${icon("file")}</i><span><strong>${collectionFlags.length} tagihan perlu tindakan</strong><small>Sisa ${formatIDR(financial.receivable, true)}</small></span>${icon("chevron")}</button>
      </div>
    </section>
    <div class="today-layout">
      <section class="dashboard-panel owner-priority today-priority">
        <div class="dashboard-panel-head"><div><h2>Prioritas hari ini</h2><p>${todayCount} jatuh tempo hari ini · urutan dimulai dari pelanggan yang paling lama menunggu.</p></div><button class="secondary-button compact" type="button" data-dashboard="sales">Lihat penjualan</button></div>
        ${renderAgendaRows(queue.slice(0, 5), "owner")}
        <button class="panel-footer-link" type="button" data-dashboard="sales">Lihat semua prioritas ${icon("arrow")}</button>
      </section>
      <aside class="today-aside">
        <section class="dashboard-panel business-summary">
          <div class="dashboard-panel-head"><div><h2>Ringkasan bisnis</h2><p>Angka utama tanpa mencampur tahap uang.</p></div>${helpTip("Potensi, nilai disepakati, tagihan, dan pembayaran selalu dihitung terpisah.")}</div>
          ${dashboardMetric("Potensi penjualan", formatIDR(financial.pipeline, true), `${health.active} peluang aktif`, "Nilai peluang aktif; belum menjadi pendapatan.")}
          ${dashboardMetric("Sudah ditagihkan", formatIDR(financial.invoiced, true), "Invoice terbit", "Nilai invoice yang sudah diterbitkan.", "success", "file")}
          ${dashboardMetric("Pembayaran diterima", formatIDR(financial.collected, true), "Bukti pembayaran tersedia", "Dana yang sudah tercatat dengan bukti.", "success", "check")}
          <button class="panel-footer-link" type="button" data-view-jump="reports">Lihat laporan lengkap ${icon("arrow")}</button>
        </section>
        <section class="dashboard-panel next-agenda">
          <div class="dashboard-panel-head"><div><h2>Agenda berikutnya</h2><p>Janji terdekat lintas pelanggan dan pekerjaan.</p></div></div>
          <div class="next-agenda-list">${agenda.map((item) => `<button type="button" ${item.opportunityId ? `data-open-opportunity="${escapeHTML(item.opportunityId)}"` : `data-view-jump="${escapeHTML(item.view || "calendar")}"`}><time>${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(item.at))}</time><span><strong>${escapeHTML(item.label || item.title)}</strong><small>${escapeHTML(item.account || item.meta || "Agenda kerja")}</small></span>${icon("chevron")}</button>`).join("") || `<p class="finance-empty">Belum ada agenda berikutnya.</p>`}</div>
          <button class="panel-footer-link" type="button" data-view-jump="calendar">Lihat kalender ${icon("arrow")}</button>
        </section>
      </aside>
    </div>`;
  return dashboardShell("summary", `Selamat pagi, ${firstName}`, "Berikut pekerjaan penting yang perlu ditangani hari ini. Mulai dari yang membuat pelanggan menunggu.", body);
}

function currentActivationJourney(at = new Date()) {
  return buildActivationJourney({ organization: identitySession.organization, subscription: identitySession.subscription, snapshot: state.dataAuthority.snapshot, at });
}

function activationActionButton(action, variant = "primary") {
  if (!action) return "";
  const disabled = action.disabled ? "disabled" : "";
  return `<button class="${variant === "secondary" ? "secondary-button" : "primary-button"}" type="button" data-activation-action="${escapeHTML(action.type)}" ${disabled}>${icon("arrow")}<span>${escapeHTML(action.label)}</span></button>`;
}

function renderActivationJourney(at = new Date()) {
  if (!identityRoles.includes("executive_admin")) return "";
  const journey = currentActivationJourney(at);
  if (!journey.ready) return `<section class="activation-journey is-loading" aria-live="polite"><span class="activation-spinner" aria-hidden="true"></span><div><strong>Menyiapkan panduan awal…</strong><p>Kemajuan dibaca dari data workspace, bukan dari centang manual.</p></div></section>`;
  if (journey.complete) {
    return `<section class="activation-complete" aria-label="Setup dasar selesai"><span>${icon("check")}</span><div><strong>Alur kerja pertama sudah siap</strong><p>Pelanggan, pekerjaan, layanan, milestone, dan tugas sudah tersambung.</p></div>${journey.optionalExpense ? activationActionButton({ ...journey.optionalExpense, disabled: !journey.writesAllowed }, "secondary") : `<button class="secondary-button" type="button" data-view-jump="projects">Buka pekerjaan</button>`}</section>`;
  }
  const next = journey.nextAction;
  const lastProgress = journey.lastProgressAt ? `Terakhir maju ${formatDate(journey.lastProgressAt, { year: true })}` : "Belum ada data operasional";
  return `<section class="activation-journey" aria-labelledby="activation-title">
    <div class="activation-overview">
      <span class="section-kicker">Mulai dalam ±5 menit</span>
      <div class="activation-title-row"><div><h2 id="activation-title">Siapkan alur pelanggan pertama</h2><p>Ikuti urutan yang dipakai tim sehari-hari. DEKTA otomatis melanjutkan dari langkah terakhir.</p></div><strong>${journey.completedCount}/${journey.totalCount}</strong></div>
      <div class="activation-progress" role="progressbar" aria-label="Kemajuan setup" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${journey.progress}"><span style="--activation-progress:${journey.progress}%"></span></div>
      <ol class="activation-steps">${journey.steps.map((step, index) => `<li class="${step.complete ? "is-complete" : step.key === next?.key ? "is-current" : ""}"><span>${step.complete ? icon("check") : index + 1}</span><div><strong>${escapeHTML(step.label)}</strong><small>${step.complete ? "Selesai" : step.key === next?.key ? "Kerjakan sekarang" : "Berikutnya"}</small></div></li>`).join("")}</ol>
    </div>
    <aside class="activation-next">
      <span>Langkah berikutnya</span>
      <h3>${escapeHTML(next?.title || "Setup selesai")}</h3>
      <p>${escapeHTML(next?.description || "Alur dasar sudah tersambung.")}</p>
      ${activationActionButton(next)}
      <small>${journey.writesAllowed ? `${lastProgress} · dihitung dari record server` : "Workspace sedang read-only; progres lama tetap aman."}</small>
    </aside>
  </section>`;
}

function renderOperationalWorkspaceSummary(journey) {
  const counts = journey.ready ? journey.counts : { customers: 0, engagements: 0, workstreams: 0, tasks: 0 };
  if (journey.complete) {
    return `<section class="first-value-summary surface" aria-labelledby="first-value-title">
      <div class="first-value-heading"><div><span class="section-kicker">Data perusahaan Anda</span><h2 id="first-value-title">Alur pertama siap dipakai tim</h2><p>Semua angka di bawah berasal dari workspace server ini—bukan data contoh.</p></div><div class="first-value-actions"><button class="secondary-button" type="button" data-view-jump="relationships">Buka pelanggan</button><button class="primary-button" type="button" data-view-jump="projects">Lanjutkan pekerjaan</button></div></div>
      <div class="first-value-metrics">${[["Pelanggan", counts.customers], ["Pekerjaan", counts.engagements], ["Layanan", counts.workstreams], ["Tugas", counts.tasks]].map(([label, value]) => `<article><strong>${value}</strong><span>${label}</span></article>`).join("")}</div>
    </section>`;
  }
  return `<section class="first-value-guide surface" aria-labelledby="first-value-guide-title">
    <div class="first-value-guide-icon" aria-hidden="true">${icon("users")}</div>
    <div><span class="section-kicker">Workspace bersih</span><h2 id="first-value-guide-title">Tidak ada data contoh yang dicampur ke pekerjaan Anda</h2><p>Mulai dari satu pelanggan. Setelah itu DEKTA menjaga konteks ketika pekerjaan berpindah layanan atau penanggung jawab.</p></div>
    <ol><li><strong>Daftarkan pelanggan</strong><span>Satu identitas untuk seluruh tim.</span></li><li><strong>Susun pekerjaannya</strong><span>Pisahkan layanan dan hasil yang dituju.</span></li><li><strong>Tentukan PIC</strong><span>Tugas diberikan ke anggota aktif, bukan nama bebas.</span></li></ol>
  </section>`;
}

function focusActivationNext() {
  window.scrollTo({ top: 0, behavior: "smooth" });
  requestAnimationFrame(() => document.querySelector("[data-activation-action]")?.focus({ preventScroll: true }));
}

function renderAgendaRows(queue, context = "sales") {
  if (!queue.length) return emptyState("check", "Tidak ada agenda aktif", "Semua tindakan berada dalam kontrol.");
  return `<div class="agenda-table" role="table" aria-label="Daftar pelanggan yang perlu ditindaklanjuti">
    <div class="agenda-row agenda-head" role="row"><span role="columnheader">Waktu</span><span role="columnheader">Yang perlu dilakukan</span><span role="columnheader">Pelanggan</span><span role="columnheader">Potensi</span><span role="columnheader">Aksi</span></div>
    ${queue.map(({ opportunity, flags }) => {
      const timing = dueState(opportunity);
      const action = operatingAction(opportunity);
      const timingLabel = timing === "overdue" ? `Terlambat · ${formatDate(action.due)}` : timing === "today" ? `Hari ini · ${formatDate(action.due)}` : formatDate(action.due, { year: true });
      return `<div class="agenda-row ${state.selectedSalesOpportunityId === opportunity.id ? "is-selected" : ""}" role="row">
        <span class="agenda-priority ${timing}" role="cell">${icon(timing === "overdue" ? "alert" : "clock")}<strong>${timingLabel}</strong><small>${escapeHTML(flags[0]?.label || "Terjadwal")}</small></span>
        <span class="agenda-action" role="cell"><strong>${escapeHTML(action.label)}</strong><small>${escapeHTML(opportunity.owner)} · ${escapeHTML(stageLabel(opportunity.stage))}</small></span>
        <span class="agenda-customer" role="cell"><strong>${escapeHTML(opportunity.account)}</strong><small>${escapeHTML(opportunity.contact)}</small></span>
        <span class="agenda-value" role="cell"><strong>${formatIDR(opportunity.value, true)}</strong><small>${escapeHTML(serviceLabel(opportunity.service))}</small></span>
        <span class="agenda-controls" role="cell">${context === "sales" ? `<button class="text-action" type="button" data-select-sales-context="${escapeHTML(opportunity.id)}">Lihat</button>` : ""}<button class="row-action" type="button" data-open-opportunity="${escapeHTML(opportunity.id)}" aria-label="Buka tindak lanjut ${escapeHTML(opportunity.account)}">${icon("chevron")}</button></span>
      </div>`;
    }).join("")}
  </div>`;
}

function renderSalesDashboard() {
  const now = new Date();
  const operational = customerPipelineData();
  const fullQueue = calculateAttentionQueue(operational.opportunities, now);
  const queue = fullQueue.filter(({ opportunity }) => {
    const timing = dueState(opportunity, now);
    if (state.salesAgendaFilter === "today") return timing === "overdue" || timing === "today";
    return timing === state.salesAgendaFilter;
  });
  const selected = operational.opportunities.find((item) => item.id === state.selectedSalesOpportunityId) || fullQueue[0]?.opportunity;
  if (selected && !state.selectedSalesOpportunityId) state.selectedSalesOpportunityId = selected.id;
  const snapshot = selected ? buildAccountSnapshot(operational, selected.accountId) : null;
  const health = calculatePipelineHealth(operational.opportunities, now);
  const activePipeline = operational.opportunities.filter((item) => ["active", "on_hold"].includes(item.status)).reduce((sum, item) => sum + item.value, 0);
  const filterCount = (value) => fullQueue.filter(({ opportunity }) => {
    const timing = dueState(opportunity, now);
    return value === "today" ? timing === "overdue" || timing === "today" : timing === value;
  }).length;
  const body = `
    <div class="dashboard-metrics dashboard-metrics-3">
      ${dashboardMetric("Potensi penjualan", formatIDR(activePipeline, true), `${health.active} peluang sedang berjalan`, "Perkiraan nilai peluang yang masih aktif. Angka ini belum menjadi kontrak atau uang masuk.", "accent", "trend")}
      ${dashboardMetric("Siap ditindaklanjuti", `${health.completenessRate}%`, "Penanggung jawab dan langkah berikutnya jelas", "Persentase peluang yang sudah memiliki penanggung jawab, tahap, tindakan, dan tanggal tindak lanjut.", health.completenessRate === 100 ? "success" : "accent", "check")}
      ${dashboardMetric("Pelanggan menunggu kabar", String(filterCount("overdue")), "Perlu dihubungi hari ini", "Pelanggan dengan janji tindak lanjut yang sudah lewat dan belum diselesaikan atau dijadwal ulang.", filterCount("overdue") ? "warning" : "success", "clock")}
    </div>
    <div class="sales-grid">
      <section class="dashboard-panel sales-agenda">
        <div class="dashboard-panel-head"><div><h2>Pelanggan yang perlu dihubungi</h2><p>Mulai dari janji yang terlambat, lalu lanjutkan pekerjaan hari ini.</p></div>${helpTip("Urutan mempertimbangkan janji yang terlambat, hambatan, dan tindakan berikutnya—bukan hanya nilai penjualan.", "Cara menentukan urutan")}</div>
        <div class="agenda-filters" role="group" aria-label="Filter tindak lanjut">${[["overdue", "Terlambat"], ["today", "Hari ini"], ["upcoming", "Berikutnya"]].map(([value, label]) => `<button type="button" class="chip-button ${state.salesAgendaFilter === value ? "is-active" : ""}" data-sales-filter="${value}">${label} <span>${filterCount(value)}</span></button>`).join("")}</div>
        ${renderAgendaRows(queue)}
        <button class="panel-footer-link" type="button" data-view-jump="pipeline">Lihat semua peluang ${icon("arrow")}</button>
      </section>
      ${renderSalesCustomerContext(selected, snapshot)}
    </div>`;
  return dashboardShell("sales", "Bantu pelanggan hari ini", "Lihat siapa yang sedang menunggu kabar, pahami kebutuhannya, lalu lanjutkan percakapannya.", body);
}

function renderSalesCustomerContext(opportunity, snapshot) {
  if (!opportunity || !snapshot) return `<aside class="dashboard-panel customer-context">${emptyState("relationships", "Belum ada konteks dipilih", "Pilih satu agenda untuk melihat hubungan pelanggan.")}</aside>`;
  const contact = snapshot.contacts.find((item) => item.id === opportunity.contactId) || snapshot.contacts[0];
  const lastActivity = opportunity.activity?.[0];
  return `<aside class="dashboard-panel customer-context">
    <div class="dashboard-panel-head"><div><h2>Kenali pelanggan</h2><p>Baca konteksnya sebelum menghubungi.</p></div><span class="status-badge active">Dipilih</span></div>
    <div class="customer-identity"><span class="account-mark account-mark-lg">${escapeHTML(initials(snapshot.account.name))}</span><div><strong>${escapeHTML(snapshot.account.name)}</strong><small>${escapeHTML(serviceLabel(opportunity.service))} · ${escapeHTML(stageLabel(opportunity.stage))}</small></div></div>
    <div class="customer-contact"><small>Kontak utama</small><strong>${escapeHTML(contact?.name || "Kontak belum diketahui")}</strong><span>${escapeHTML(sourceLabel(snapshot.account.source))}</span></div>
    <dl class="context-facts"><div><dt>Status hubungan</dt><dd>${escapeHTML(relationshipStateCopy(snapshot.relationshipState)[0])}</dd></div><div><dt>Nilai peluang</dt><dd>${formatIDR(opportunity.value, true)}</dd></div><div><dt>Interaksi terakhir</dt><dd>${formatDate(opportunity.lastActivityAt, { year: true })}</dd></div></dl>
    <section class="context-section"><div><h3>Percakapan terakhir</h3>${helpTip("Catatan ini berasal dari aktivitas pelanggan yang terhubung dengan peluang terpilih.")}</div><strong>${escapeHTML(userFacingText(lastActivity?.label || "Belum ada aktivitas"))}</strong><p>${escapeHTML(userFacingText(lastActivity?.detail || opportunity.note || "Belum ada catatan tambahan."))}</p></section>
    <section class="context-section context-next"><div><h3>Janji berikutnya</h3>${helpTip("Janji ini akan tetap muncul sampai diselesaikan atau dijadwal ulang dengan alasan.")}</div><strong>${escapeHTML(operatingAction(opportunity).label)}</strong><p>${formatDate(operatingAction(opportunity).due, { year: true })} · ${escapeHTML(opportunity.owner)}</p></section>
    <div class="context-actions"><button class="context-primary" type="button" data-open-opportunity="${escapeHTML(opportunity.id)}">Mulai tindak lanjut</button><button class="panel-footer-link" type="button" data-open-account="${escapeHTML(snapshot.account.id)}">Lihat profil pelanggan ${icon("arrow")}</button></div>
  </aside>`;
}

function renderCustomerDashboard() {
  const operational = customerPipelineData();
  const snapshots = operational.accounts.map((account) => buildAccountSnapshot(operational, account.id)).filter(Boolean).toSorted((a, b) => new Date(b.lastTouchAt) - new Date(a.lastTouchAt));
  const selected = snapshots.find((item) => item.account.id === state.selectedCustomerId) || snapshots[0];
  if (selected && !state.selectedCustomerId) state.selectedCustomerId = selected.account.id;
  const activeOpportunity = selected?.opportunities.find((item) => ["active", "on_hold"].includes(item.status));
  const signalCount = snapshots.flatMap((item) => item.openSignals).length;
  const body = `
    <div class="dashboard-metrics dashboard-metrics-3">
      ${dashboardMetric("Pelanggan & calon pelanggan", String(snapshots.length), "Semua hubungan tercatat", "Jumlah perusahaan unik yang pernah berinteraksi. Satu perusahaan dapat memiliki beberapa kontak dan peluang.")}
      ${dashboardMetric("Sedang berinteraksi", String(snapshots.filter((item) => ["active", "client_active"].includes(item.relationshipState)).length), "Perlu dijaga momentumnya", "Pelanggan dengan peluang atau pekerjaan yang masih terbuka.")}
      ${dashboardMetric("Kebutuhan baru", String(signalCount), "Perlu dinilai sebelum ditawarkan", "Kebutuhan baru pelanggan lama diperiksa dulu sebelum dihitung sebagai potensi penjualan.", signalCount ? "accent" : "")}
    </div>
    <div class="customer-dashboard-grid">
      <section class="dashboard-panel customer-directory"><div class="dashboard-panel-head"><div><h2>Daftar pelanggan</h2><p>Pilih pelanggan untuk melihat riwayat hubungan lengkap.</p></div>${helpTip("Profil pelanggan menyatukan kebutuhan, peluang, pekerjaan, tagihan, dan pembayaran yang terhubung.")}</div><div class="customer-list">${snapshots.map((snapshot) => {
        const [label, className] = relationshipStateCopy(snapshot.relationshipState);
        return `<button type="button" class="customer-list-row ${selected?.account.id === snapshot.account.id ? "is-selected" : ""}" data-select-customer="${escapeHTML(snapshot.account.id)}"><span class="account-mark">${escapeHTML(initials(snapshot.account.name))}</span><span><strong>${escapeHTML(snapshot.account.name)}</strong><small>${escapeHTML(snapshot.contacts[0]?.name || "Kontak belum diketahui")}</small></span><span class="relationship-state ${className}"><i></i>${escapeHTML(label)}</span>${icon("chevron")}</button>`;
      }).join("")}</div></section>
      <section class="dashboard-panel customer-workspace">${selected ? `<div class="dashboard-panel-head"><div><span class="section-kicker">Ringkasan pelanggan</span><h2>${escapeHTML(selected.account.name)}</h2><p>Terakhir berinteraksi ${formatDate(selected.lastTouchAt, { year: true })}</p></div><button class="secondary-button" type="button" data-open-account="${escapeHTML(selected.account.id)}">Lihat profil</button></div>
        <div class="customer-financial-strip">${dashboardMetric("Sedang dibicarakan", formatIDR(selected.financial.pipeline, true), "Belum disetujui pelanggan", "Peluang aktif yang masih dalam pembicaraan.")}${dashboardMetric("Sudah disetujui", formatIDR(selected.financial.contracted, true), "Komitmen tercatat", "Nilai yang sudah disetujui pelanggan.")}${dashboardMetric("Sudah dibayar", formatIDR(selected.financial.collected, true), "Pembayaran terbukti", "Pembayaran yang benar-benar sudah diterima.", "success")}</div>
        <div class="customer-workspace-sections"><section><h3>Apa yang sedang dibutuhkan?</h3><p>${escapeHTML(activeOpportunity?.note || selected.openSignals[0]?.note || "Belum ada pekerjaan aktif. Periksa kebutuhan baru berdasarkan percakapan terakhir.")}</p>${activeOpportunity ? `<button class="primary-button" type="button" data-open-opportunity="${escapeHTML(activeOpportunity.id)}">Lanjutkan peluang</button>` : `<button class="primary-button" type="button" data-open-expansion="${escapeHTML(selected.account.id)}">Catat kebutuhan baru</button>`}</section><section><h3>Janji berikutnya</h3><strong>${escapeHTML(activeOpportunity?.nextAction?.label || selected.openSignals[0]?.need || "Hubungi dan tanyakan kebutuhan baru")}</strong><p>${activeOpportunity?.nextAction?.due ? formatDate(activeOpportunity.nextAction.due, { year: true }) : "Belum ada tanggal yang dijanjikan"}</p></section></div>` : emptyState("relationships", "Belum ada pelanggan", "Catat calon pelanggan untuk mulai menyimpan konteks hubungan.")}</section>
    </div>`;
  return dashboardShell("customer", "Pelangganmu, lengkap dengan konteksnya", "Lanjutkan setiap percakapan dari kebutuhan dan janji terakhir—pelanggan tidak perlu mengulang ceritanya.", body, `<button class="primary-button" type="button" data-open-signal>${icon("plus")}<span>Catat kebutuhan</span></button>`);
}

function renderMarketingDashboard() {
  const experiments = state.data.experiments;
  const leads = experiments.reduce((sum, item) => sum + item.leads, 0);
  const qualified = experiments.reduce((sum, item) => sum + item.qualified, 0);
  const wins = experiments.reduce((sum, item) => sum + item.wins, 0);
  const qualificationRate = leads ? Math.round((qualified / leads) * 100) : 0;
  const sourceRows = [...new Set(state.data.opportunities.map((item) => item.source))].map((source) => {
    const opportunities = state.data.opportunities.filter((item) => item.source === source);
    return { source, opportunities: opportunities.length, pipeline: opportunities.filter((item) => ["active", "on_hold"].includes(item.status)).reduce((sum, item) => sum + item.value, 0), wins: opportunities.filter((item) => item.status === "won").length };
  }).toSorted((a, b) => b.pipeline - a.pipeline);
  const body = `
    ${sampleModuleBoundary("Pemasaran")}
    <div class="dashboard-metrics dashboard-metrics-4">
      ${dashboardMetric("Calon pelanggan", String(leads), "Dari seluruh kampanye", "Jumlah orang atau perusahaan yang merespons kampanye. Belum semuanya layak ditindaklanjuti.")}
      ${dashboardMetric("Layak ditindaklanjuti", String(qualified), `${qualificationRate}% dari calon pelanggan`, "Calon pelanggan yang kebutuhan, kecocokan, dan langkah berikutnya sudah cukup jelas.")}
      ${dashboardMetric("Menjadi pelanggan", String(wins), "Sudah menyetujui penawaran", "Peluang yang sudah memiliki bukti persetujuan. Belum otomatis berarti sudah membayar.", wins ? "success" : "")}
      ${dashboardMetric("Kampanye aktif", String(experiments.filter((item) => item.status === "running").length), "Perlu keputusan berikutnya", "Kampanye yang masih berjalan dan memiliki waktu evaluasi serta penanggung jawab.", "accent")}
    </div>
    <div class="marketing-grid"><section class="dashboard-panel experiment-board"><div class="dashboard-panel-head"><div><h2>Kampanye yang sedang diuji</h2><p>Setiap kampanye berakhir pada keputusan lanjutkan, perbaiki, atau hentikan.</p></div>${helpTip("Jangan menilai kampanye dari jumlah respons saja. Perhatikan kualitas calon pelanggan dan hasil akhirnya.")}</div>${experiments.map((item) => `<article class="experiment-row"><span class="experiment-channel">${escapeHTML(item.channel)}</span><div><strong>${escapeHTML(item.name)}</strong><p>${escapeHTML(item.hypothesis)}</p></div><div class="experiment-outcomes"><span><strong>${item.leads}</strong><small>Calon</small></span><span><strong>${item.qualified}</strong><small>Layak</small></span><span><strong>${item.wins}</strong><small>Jadi pelanggan</small></span></div><span class="status-badge ${escapeHTML(item.status)}">${item.status === "running" ? "Berjalan" : item.status === "review" ? "Tinjau" : "Dihentikan"}</span><div class="experiment-next"><small>Keputusan berikutnya</small><strong>${escapeHTML(item.decision)}</strong></div></article>`).join("")}<button class="panel-footer-link" type="button" data-view-jump="experiments">Lihat semua kampanye ${icon("arrow")}</button></section>
      <aside class="dashboard-panel source-performance"><div class="dashboard-panel-head"><div><h2>Sumber pelanggan terbaik</h2><p>Bandingkan jumlah peluang, potensi penjualan, dan pelanggan baru.</p></div>${helpTip("Sumber pada prototype masih memakai satu label sederhana. Kontribusi beberapa kanal belum dihitung.")}</div><div class="source-table"><div class="source-row source-head"><span>Sumber</span><span>Peluang</span><span>Potensi</span><span>Pelanggan</span></div>${sourceRows.map((row) => `<div class="source-row"><strong>${escapeHTML(sourceLabel(row.source))}</strong><span>${row.opportunities}</span><span>${formatIDR(row.pipeline, true)}</span><span>${row.wins}</span></div>`).join("")}</div></aside></div>`;
  return dashboardShell("marketing", "Temukan calon pelanggan yang tepat", "Lihat kampanye mana yang mendatangkan kebutuhan nyata, bukan sekadar ramai respons.", body);
}

function renderFinanceDashboard() {
  const operational = customerPipelineData();
  const financial = calculateFinancialSummary(operational.opportunities, operational.invoices, operational.payments);
  const flags = getCollectionFlags(operational.invoices, operational.payments);
  const invoices = operational.invoices.filter((invoice) => ["issued", "overdue", "disputed", "partial", "paid"].includes(invoice.status)).map((invoice) => {
    const opportunity = operational.opportunities.find((item) => item.id === invoice.opportunityId);
    const collected = operational.payments.filter((item) => item.invoiceId === invoice.id).reduce((sum, item) => sum + item.amount, 0);
    return { ...invoice, opportunity, collected, outstanding: Math.max(0, invoice.amount - collected) };
  });
  const collectionRate = financial.invoiced ? Math.round((financial.collected / financial.invoiced) * 100) : 0;
  const body = `
    <div class="dashboard-metrics dashboard-metrics-4">
      ${dashboardMetric("Pesanan disetujui", formatIDR(financial.contracted, true), "Belum tentu sudah ditagih", "Nilai yang sudah disetujui pelanggan. Angka ini belum otomatis menjadi tagihan.")}
      ${dashboardMetric("Tagihan terkirim", formatIDR(financial.invoiced, true), "Invoice telah diterbitkan", "Total tagihan yang sudah dikirim kepada pelanggan.")}
      ${dashboardMetric("Belum dibayar", formatIDR(financial.receivable, true), `${flags.length} perlu perhatian`, "Sisa tagihan yang belum dibayar. Pembayaran sebagian tetap menyisakan nilai.", flags.length ? "warning" : "")}
      ${dashboardMetric("Pembayaran diterima", formatIDR(financial.collected, true), `${collectionRate}% dari tagihan`, "Pembayaran yang benar-benar diterima dengan referensi bukti.", "success")}
    </div>
    <div class="finance-grid"><section class="dashboard-panel finance-ledger"><div class="dashboard-panel-head"><div><h2>Pelanggan yang perlu diingatkan</h2><p>Mulai dari tagihan yang sudah lewat jatuh tempo.</p></div>${helpTip("DEKTA menampilkan status penagihan. Pembukuan resmi dan rekonsiliasi bank tetap dilakukan di sistem keuangan yang dipilih.")}</div><div class="finance-table"><div class="finance-row finance-head"><span>Pelanggan / tagihan</span><span>Ditagihkan</span><span>Diterima</span><span>Belum dibayar</span><span>Status</span></div>${invoices.map((item) => `<div class="finance-row"><span><strong>${escapeHTML(item.opportunity?.account || "Tidak diketahui")}</strong><small>${escapeHTML(item.number)} · jatuh tempo ${formatDate(item.dueAt)}</small></span><strong>${formatIDR(item.amount, true)}</strong><strong>${formatIDR(item.collected, true)}</strong><strong>${formatIDR(item.outstanding, true)}</strong><span class="status-badge ${item.outstanding === 0 ? "paid" : new Date(item.dueAt) < new Date() ? "overdue" : "review"}">${item.outstanding === 0 ? "Lunas" : new Date(item.dueAt) < new Date() ? "Terlambat" : "Terbuka"}</span></div>`).join("")}</div><button class="panel-footer-link" type="button" data-view-jump="collection">Lihat semua tagihan ${icon("arrow")}</button></section>
      <aside class="dashboard-panel finance-principle"><span class="section-kicker">Alur pembayaran</span><h2>Dari pesanan sampai uang diterima.</h2><ol><li><strong>Disetujui</strong><span>Pelanggan sudah berkomitmen.</span></li><li><strong>Ditagihkan</strong><span>Tagihan sudah diterbitkan.</span></li><li><strong>Belum dibayar</strong><span>Masih ada pembayaran yang perlu diterima.</span></li><li><strong>Pembayaran diterima</strong><span>Dana sudah terbukti masuk.</span></li></ol><p>Status pembayaran tidak boleh mengubah kesepakatan penjualan tanpa bukti dan kewenangan yang sesuai.</p></aside></div>`;
  return dashboardShell("finance", "Jangan biarkan tagihan terlewat", "Ketahui pelanggan yang sudah membayar, yang belum jatuh tempo, dan yang perlu diingatkan dengan baik.", body);
}

function renderDeliveryDashboard() {
  const operational = customerPipelineData();
  const won = operational.opportunities.filter((item) => item.status === "won");
  const submitted = won.filter((item) => item.handoff?.status === "submitted");
  const rejected = won.filter((item) => item.handoff?.status === "rejected");
  const accepted = won.filter((item) => item.handoff?.status === "accepted");
  const firstPassRate = won.length ? Math.round((accepted.filter((item) => !item.handoff?.resubmissionCount).length / won.length) * 100) : 0;
  const body = `
    <div class="dashboard-metrics dashboard-metrics-4">
      ${dashboardMetric("Menunggu pemeriksaan", String(submitted.length), "Perlu keputusan tim operasional", "Informasi pekerjaan sudah diserahkan dan menunggu diterima atau dikembalikan.")}
      ${dashboardMetric("Perlu dilengkapi", String(rejected.length), "Kembali ke penanggung jawab", "Informasi pekerjaan dikembalikan dengan bagian yang perlu dilengkapi dan batas waktunya.", rejected.length ? "warning" : "")}
      ${dashboardMetric("Siap dikerjakan", String(accepted.length), "Bisa dijadwalkan", "Tujuan, penanggung jawab, tanggal, kebutuhan, dan batas pekerjaan telah diterima tim.", "success")}
      ${dashboardMetric("Lengkap sejak awal", `${firstPassRate}%`, "Berdasarkan data contoh", "Persentase pekerjaan yang diterima tanpa perlu dikembalikan untuk dilengkapi.")}
    </div>
    <div class="delivery-grid"><section class="dashboard-panel delivery-queue"><div class="dashboard-panel-head"><div><h2>Pekerjaan yang perlu diterima tim</h2><p>Periksa kesiapan informasi sebelum menjanjikan tanggal mulai kepada pelanggan.</p></div>${helpTip("Tim operasional dapat menerima atau mengembalikan informasi pekerjaan. Perubahan harga dan kesepakatan pelanggan tetap berada pada penanggung jawabnya.")}</div>${won.map((item) => {
      const handoff = item.handoff || {};
      const statusCopy = handoff.status === "accepted" ? ["Diterima", "paid"] : handoff.status === "rejected" ? ["Perlu diperbaiki", "overdue"] : ["Menunggu pemeriksaan", "review"];
      return `<article class="delivery-row"><span class="account-mark">${escapeHTML(initials(item.account))}</span><div class="delivery-main"><strong>${escapeHTML(item.account)}</strong><small>${escapeHTML(handoff.scope || serviceLabel(item.service))}</small></div><div><small>Penanggung jawab</small><strong>${escapeHTML(handoff.deliveryOwner || "Belum ditentukan")}</strong></div><div><small>Target mulai</small><strong>${handoff.targetStartDate ? formatDate(handoff.targetStartDate, { year: true }) : "Belum ditentukan"}</strong></div><span class="status-badge ${statusCopy[1]}">${statusCopy[0]}</span><button class="row-action" type="button" data-open-opportunity="${escapeHTML(item.id)}" aria-label="Buka pekerjaan ${escapeHTML(item.account)}">${icon("chevron")}</button>${handoff.status === "rejected" ? `<div class="delivery-missing"><strong>Yang masih kurang</strong><span>${escapeHTML((handoff.missing || []).join(" · ") || "Catatan perbaikan tersedia di detail")}</span></div>` : ""}</article>`;
    }).join("") || emptyState("check", "Belum ada pekerjaan baru", "Pekerjaan akan muncul setelah persetujuan pelanggan dan bukti komitmennya lengkap.")}</section>
      <aside class="dashboard-panel delivery-checklist"><span class="section-kicker">Sebelum dimulai</span><h2>Informasi yang wajib lengkap</h2><ul><li>${icon("check")}<span><strong>Tujuan dan batas pekerjaan</strong><small>Hasil yang diharapkan pelanggan tertulis jelas.</small></span></li><li>${icon("check")}<span><strong>Penanggung jawab kedua pihak</strong><small>Orang yang memutuskan dan mengerjakan sudah diketahui.</small></span></li><li>${icon("check")}<span><strong>Tanggal mulai</strong><small>Selaras dengan kapasitas dan kebutuhan pendukung.</small></span></li><li>${icon("check")}<span><strong>Akses dan bahan</strong><small>Data, aset, vendor, dan keputusan sudah tersedia.</small></span></li><li>${icon("check")}<span><strong>Hal di luar pekerjaan</strong><small>Batas layanan tidak disembunyikan.</small></span></li></ul><button class="secondary-button" type="button" data-view-jump="collection">Lihat tagihan terkait</button></aside></div>`;
  return dashboardShell("delivery", "Mulai pekerjaan tanpa membuat pelanggan mengulang", "Pastikan tujuan, bahan, penanggung jawab, dan janji kepada pelanggan sudah dipahami tim.", body);
}

function healthBar(label, value) {
  return `<div class="health-item"><span>${escapeHTML(label)}</span><strong>${value}%</strong><div class="health-bar"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div></div>`;
}

function renderAttentionTable(queue) {
  if (queue.length === 0) return emptyState("check", "Tidak ada exception aktif", "Semua opportunity berada dalam kontrol yang ditentukan.");
  return `
    <table class="attention-table">
      <thead><tr><th>Akun</th><th>Tahap</th><th>Tindakan</th><th>Trigger</th><th><span class="sr-only">Buka</span></th></tr></thead>
      <tbody>${queue.map(({ opportunity, flags }) => `
        <tr>
          <td><div class="company-cell"><strong>${escapeHTML(opportunity.account)}</strong><span>${escapeHTML(serviceLabel(opportunity.service))}</span></div></td>
          <td><span class="stage-badge ${slug(opportunity.stage)}">${escapeHTML(stageLabel(opportunity.stage))}</span></td>
          <td><div class="action-cell"><strong>${escapeHTML(operatingAction(opportunity).label)}</strong><span>${icon("clock")}${formatDate(operatingAction(opportunity).due)}</span></div></td>
          <td><div class="flag-stack">${flags.slice(0, 2).map(flagMarkup).join("")}</div></td>
          <td><button class="row-action" type="button" data-open-opportunity="${escapeHTML(opportunity.id)}" aria-label="Buka ${escapeHTML(opportunity.account)}">${icon("chevron")}</button></td>
        </tr>`).join("")}</tbody>
    </table>`;
}

function renderPipeline() {
  const operational = customerPipelineData();
  const filters = [
    ["active", "Aktif"], ["all", "Semua"], ["Proposal", "Penawaran"], ["Decision", "Menunggu keputusan"], ["won", "Disetujui"], ["lost", "Tidak lanjut"], ["archived", "Diarsipkan"]
  ];
  const search = normalize(state.search);
  const opportunities = operational.opportunities.filter((item) => {
    const matchesSearch = !search || [item.account, item.contact, item.service, item.source].some((value) => normalize(value).includes(search));
    const matchesFilter = (state.pipelineFilter === "all" && item.status !== "archived")
      || (state.pipelineFilter === "active" && ["active", "on_hold"].includes(item.status))
      || item.status === state.pipelineFilter
      || item.stage === state.pipelineFilter;
    return matchesSearch && matchesFilter;
  });

  root.innerHTML = `
    <section class="view" data-rendered-view="pipeline">
      ${viewHeading("Pipeline penjualan", "Gerakkan peluang tanpa kehilangan janji kepada pelanggan.", "Lihat alur sebagai Kanban atau daftar. Perpindahan tahap tetap harus melalui pemeriksaan bukti dan tindakan berikutnya.")}
      ${customerPipelineAuthorityNote()}
      <div class="toolbar pipeline-toolbar"><div class="filter-group">${filters.map(([value, label]) => `<button class="chip-button ${state.pipelineFilter === value ? "is-active" : ""}" type="button" data-pipeline-filter="${value}">${label}</button>`).join("")}</div><div class="view-switcher" role="group" aria-label="Pilih tampilan pipeline"><button type="button" class="chip-button ${state.pipelineView === "kanban" ? "is-active" : ""}" data-pipeline-view="kanban">Kanban</button><button type="button" class="chip-button ${state.pipelineView === "list" ? "is-active" : ""}" data-pipeline-view="list">Daftar</button><span class="result-count">${opportunities.length} peluang</span></div></div>
      ${state.pipelineView === "kanban" ? `${horizontalScrollHint("Geser untuk melihat seluruh tahap penjualan")} ${renderPipelineKanban(opportunities)}` : `<section class="surface pipeline-list" aria-label="Daftar peluang pelanggan"><div class="pipeline-row pipeline-header"><span>Pelanggan</span><span>Tahap</span><span>Janji berikutnya</span><span>Penanggung jawab</span><span>Potensi</span><span></span></div>${opportunities.length ? opportunities.map(renderPipelineRow).join("") : emptyState("search", "Belum ada peluang di sini", "Ubah filter atau kata pencarian untuk melihat peluang lain.")}</section>`}
    </section>`;
}

function renderPipelineKanban(opportunities) {
  const stages = [
    ["Qualified", "Layak"],
    ["Discovery", "Memahami kebutuhan"],
    ["Solution", "Menyiapkan solusi"],
    ["Proposal", "Penawaran"],
    ["Decision", "Keputusan"],
    ["Won", "Disetujui"]
  ];
  const visibleStages = state.pipelineFilter === "lost" || state.pipelineFilter === "archived"
    ? [[state.pipelineFilter, state.pipelineFilter === "lost" ? "Tidak lanjut" : "Diarsipkan"]]
    : stages.filter(([stage]) => state.pipelineFilter === "all" || state.pipelineFilter === "active" || state.pipelineFilter === "won" || state.pipelineFilter === stage);

  if (!opportunities.length) return `<section class="surface">${emptyState("search", "Belum ada peluang di sini", "Ubah filter atau kata pencarian untuk melihat peluang lain.")}</section>`;
  return `<section class="pipeline-kanban" tabindex="0" aria-label="Papan tahap penjualan; dapat digeser mendatar">
    ${visibleStages.map(([stage, label]) => {
      const items = opportunities.filter((item) => stage === "won" || stage === "lost" || stage === "archived" ? item.status === stage : item.stage === stage);
      const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
      return `<section class="kanban-column" data-drop-stage="${escapeHTML(stage)}" aria-labelledby="kanban-${slug(stage)}"><header><div><h2 id="kanban-${slug(stage)}">${escapeHTML(label)}</h2><span>${items.length}</span></div><strong>${formatIDR(total, true)}</strong></header><div class="kanban-stack">${items.map(renderPipelineCard).join("") || `<p class="kanban-empty">Tarik peluang ke tahap ini</p>`}</div></section>`;
    }).join("")}
  </section>`;
}

function renderPipelineCard(item) {
  const action = operatingAction(item);
  const timing = dueState(item);
  return `<article class="kanban-card ${timing === "overdue" ? "is-overdue" : ""}" draggable="true" data-drag-opportunity="${escapeHTML(item.id)}">
    <button type="button" data-open-opportunity="${escapeHTML(item.id)}" aria-label="Buka peluang ${escapeHTML(item.account)}">
      <span class="kanban-card-top"><i class="account-mark">${escapeHTML(initials(item.account))}</i><span class="status-badge ${timing === "overdue" ? "overdue" : timing === "today" ? "review" : "running"}">${timing === "overdue" ? "Terlambat" : timing === "today" ? "Hari ini" : escapeHTML(item.probabilityLabel)}</span></span>
      <strong>${escapeHTML(item.account)}</strong><small>${escapeHTML(serviceLabel(item.service))}</small>
      <span class="kanban-action"><b>${escapeHTML(action.label)}</b><time>${action.due ? formatDate(action.due, { year: true }) : "Belum dijadwalkan"}</time></span>
      <span class="kanban-card-foot"><em>${escapeHTML(item.owner)}</em><b>${formatIDR(item.value, true)}</b></span>
    </button>
    <button class="kanban-move" type="button" data-move-opportunity="${escapeHTML(item.id)}">Ubah tahap</button>
  </article>`;
}

function collectCalendarEvents() {
  const operational = customerPipelineData();
  const opportunityEvents = operational.opportunities.flatMap((item) => {
    const events = [];
    const action = operatingAction(item);
    if (action?.due && !["lost", "archived"].includes(item.status)) events.push({ id: `action-${item.id}`, at: action.due, type: "followup", label: action.label, account: item.account, meta: `${item.owner} · ${item.stage}`, tone: dueState(item), opportunityId: item.id });
    if (item.handoff?.targetStartDate) events.push({ id: `start-${item.id}`, at: item.handoff.targetStartDate, type: "project", label: "Target mulai pekerjaan", account: item.account, meta: item.handoff.deliveryOwner || "PIC belum ditentukan", tone: item.handoff.status === "accepted" ? "upcoming" : "warning", opportunityId: item.id });
    return events;
  });
  const invoiceEvents = (operational.invoices || []).map((invoice) => {
    const opportunity = operational.opportunities.find((item) => item.id === invoice.opportunityId);
    const paid = (operational.payments || []).filter((item) => item.invoiceId === invoice.id).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const outstanding = Math.max(0, Number(invoice.amount || 0) - paid);
    const overdue = outstanding > 0 && new Date(invoice.dueAt) < new Date();
    return { id: `invoice-${invoice.id}`, at: invoice.dueAt, type: "invoice", label: outstanding ? `Tagihan tersisa ${formatIDR(outstanding, true)}` : "Tagihan lunas", account: opportunity?.account || invoice.number, meta: invoice.number, tone: outstanding === 0 ? "done" : overdue ? "overdue" : "upcoming", view: "collection" };
  });
  const manualEvents = customerPipelineUsesServer() ? [] : expandManualCalendarEvents(state.data.calendarEvents || []);
  return [...opportunityEvents, ...invoiceEvents, ...manualEvents].toSorted((a, b) => new Date(a.at) - new Date(b.at));
}

const calendarDateKey = (value) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(value));

function calendarEventMarkup(item, compact = false) {
  const attributes = item.type === "manual" ? `data-calendar-event="${escapeHTML(item.seriesId)}"` : item.opportunityId ? `data-open-opportunity="${escapeHTML(item.opportunityId)}"` : `data-view-jump="${escapeHTML(item.view)}"`;
  const label = item.type === "followup" ? "Tindak lanjut" : item.type === "project" ? "Pekerjaan" : item.type === "invoice" ? "Tagihan" : "Agenda";
  return `<button type="button" class="calendar-event ${escapeHTML(item.tone)} ${compact ? "is-compact" : ""}" ${attributes}><i>${icon(item.type === "invoice" ? "file" : item.type === "project" ? "delivery" : "clock")}</i><span><strong>${escapeHTML(item.label || item.title)}</strong>${compact ? "" : `<small>${escapeHTML(item.account)} · ${escapeHTML(item.meta)}</small>`}</span>${compact ? "" : `<b>${label}</b>`}</button>`;
}

function calendarGroups(events) {
  const groups = new Map();
  events.forEach((event) => {
    const key = calendarDateKey(event.at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });
  return groups;
}

function renderAgendaCalendar(events, forcedDates = null) {
  const groups = calendarGroups(events);
  const dates = forcedDates || [...groups.keys()];
  const todayKey = calendarDateKey(new Date());
  return `<section class="calendar-agenda" aria-label="Agenda berdasarkan tanggal">${dates.map((date) => { const items = groups.get(date) || []; return `<article class="calendar-day ${date === todayKey ? "is-today" : ""}"><header><time datetime="${date}"><strong>${new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "Asia/Jakarta" }).format(new Date(`${date}T12:00:00+07:00`))}</strong><span>${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(`${date}T12:00:00+07:00`))}</span></time>${date === todayKey ? `<em>Hari ini</em>` : ""}</header><div>${items.map((item) => calendarEventMarkup(item)).join("") || `<p class="kanban-empty">Tidak ada agenda</p>`}</div></article>`; }).join("")}</section>`;
}

function renderMonthCalendar(events) {
  const cursor = new Date(state.calendarCursor);
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const groups = calendarGroups(events);
  const todayKey = calendarDateKey(new Date());
  const days = Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  return `<section class="month-calendar" aria-label="Kalender bulanan"><header>${["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => `<span>${day}</span>`).join("")}</header><div>${days.map((date) => { const key = calendarDateKey(date); const items = groups.get(key) || []; const outside = date.getMonth() !== cursor.getMonth(); return `<article class="month-day ${outside ? "is-outside" : ""} ${key === todayKey ? "is-today" : ""}"><time>${date.getDate()}</time>${items.slice(0, 3).map((item) => calendarEventMarkup(item, true)).join("")}${items.length > 3 ? `<small>+${items.length - 3} agenda</small>` : ""}</article>`; }).join("")}</div></section>`;
}

function renderCalendar() {
  const allEvents = collectCalendarEvents();
  let events = allEvents;
  let forcedDates = null;
  if (state.calendarView === "week") {
    const start = new Date(state.calendarCursor);
    start.setHours(12, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    forcedDates = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return calendarDateKey(date); });
    const allowed = new Set(forcedDates);
    events = allEvents.filter((item) => allowed.has(calendarDateKey(item.at)));
  }
  const counts = { followup: events.filter((item) => item.type === "followup").length, project: events.filter((item) => item.type === "project").length, invoice: events.filter((item) => item.type === "invoice").length };
  root.innerHTML = `<section class="view" data-rendered-view="calendar">
    ${viewHeading("Kalender kerja", "Semua janji bisnis dalam satu urutan waktu.", "Follow-up, pekerjaan, dan invoice tetap mengikuti record sumber. Agenda manual dapat dibuat dan dijadwalkan ulang tanpa mengubah status bisnis.", `<button class="primary-button" type="button" data-create-record="calendar_event">${icon("plus")}<span>Tambah agenda</span></button>`)}
    <div class="calendar-toolbar"><div class="view-switcher" role="group" aria-label="Tampilan kalender">${[["agenda", "Agenda"], ["week", "Minggu"], ["month", "Bulan"]].map(([value, label]) => `<button type="button" class="chip-button ${state.calendarView === value ? "is-active" : ""}" data-calendar-view="${value}">${label}</button>`).join("")}</div>${state.calendarView !== "agenda" ? `<div class="calendar-nav"><button type="button" class="icon-button" data-calendar-nav="prev" aria-label="Periode sebelumnya">‹</button><strong>${new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(state.calendarCursor)}</strong><button type="button" class="icon-button" data-calendar-nav="next" aria-label="Periode berikutnya">›</button><button type="button" class="text-button" data-calendar-today>Hari ini</button></div>` : ""}<span class="sync-boundary">Google Calendar belum tersambung</span></div>
    <div class="calendar-summary"><div><span>Follow-up</span><strong>${counts.followup}</strong><small>Janji kepada prospek dan pelanggan</small></div><div><span>Pekerjaan</span><strong>${counts.project}</strong><small>Target mulai dan kesiapan handoff</small></div><div><span>Tagihan</span><strong>${counts.invoice}</strong><small>Jatuh tempo dan status pembayaran</small></div></div>
    ${state.calendarView === "month" ? renderMonthCalendar(allEvents) : renderAgendaCalendar(events, forcedDates)}
  </section>`;
}

function signalStateCopy(item) {
  if (item.status === "converted") return { label: "Dilanjutkan", className: "paid", timing: "Peluang sudah dibuat" };
  if (item.status === "disqualified") return { label: "Tidak dilanjutkan", className: "stopped", timing: item.disqualifyReason || "Ditutup dengan alasan" };
  if (item.status === "nurture") {
    const reviewState = getSignalReviewState(item);
    if (reviewState === "overdue") return { label: "Review terlambat", className: "overdue", timing: `Seharusnya direview ${formatDate(item.reviewDate, { year: true })}` };
    if (reviewState === "due_today") return { label: "Review hari ini", className: "review", timing: "Waktunya cek kembali" };
    return { label: "Hubungi nanti", className: "review", timing: `Tinjau ${formatDate(item.reviewDate, { year: true })}` };
  }
  if (item.status === "review") return { label: "Perlu ditinjau", className: "review", timing: "Perlu keputusan tim" };
  return { label: "Baru masuk", className: "running", timing: "Belum menjadi peluang" };
}

function signalMatchesFilter(item) {
  const reviewState = getSignalReviewState(item);
  if (state.signalFilter === "attention") return ["inbox", "review"].includes(item.status) || ["overdue", "due_today"].includes(reviewState);
  if (state.signalFilter === "nurture") return item.status === "nurture";
  if (state.signalFilter === "closed") return ["converted", "disqualified"].includes(item.status);
  return true;
}

function renderSignalRow(item, index) {
  const stateCopy = signalStateCopy(item);
  const coreAction = item.status === "converted"
    ? `<button class="secondary-button" type="button" data-open-opportunity="${escapeHTML(item.convertedOpportunityId)}">Buka peluang</button>`
    : `<button class="secondary-button" type="button" data-triage-signal="${escapeHTML(item.id)}">${item.status === "disqualified" ? "Buka lagi" : item.status === "nurture" ? "Atur jadwal" : "Tinjau"}</button>`;
  const visitAction = item.canvassing?.visitStatus === "planned" ? `<button class="inline-action" type="button" data-canvassing-visit="${escapeHTML(item.id)}">Check-in / hasil</button>` : item.canvassing?.visitStatus === "completed" ? `<small>Kunjungan selesai</small>` : "";
  const action = `${visitAction}${coreAction}`;
  const decisionNote = item.status === "nurture" ? item.nurtureReason : item.status === "disqualified" ? item.disqualifyNote || item.disqualifyReason : item.note;
  return `
    <article class="signal-row ${item.status === "disqualified" ? "is-muted" : ""}">
      <span class="signal-number">${String(index + 1).padStart(2, "0")}</span>
      <div class="signal-account"><strong>${escapeHTML(item.account)}</strong><span>${escapeHTML(item.contact || "Kontak belum diketahui")}</span></div>
      <div class="signal-need"><span>Kebutuhan pelanggan</span><strong>${escapeHTML(item.need)}</strong><p>${escapeHTML(decisionNote || "Belum ada catatan kebutuhan.")}</p></div>
    <div class="signal-source"><span>${item.canvassing ? "Area / rute" : item.status === "nurture" ? "Jadwal" : "Sumber"}</span><strong>${escapeHTML(item.canvassing ? `${item.canvassing.routeOrder}. ${item.canvassing.area}` : item.status === "nurture" ? stateCopy.timing : sourceLabel(item.source))}</strong><small>${item.canvassing ? `${formatDate(item.canvassing.visitAt, { year: true })} · ${escapeHTML(item.canvassing.address)}` : item.status === "nurture" ? escapeHTML(sourceLabel(item.source)) : formatDate(item.capturedAt, { year: true })}</small></div>
      <div class="signal-controls"><span class="status-badge ${stateCopy.className}">${escapeHTML(stateCopy.label)}</span>${action}</div>
    </article>`;
}

function renderSignals() {
  const search = normalize(state.search);
  const allSignals = (state.data.signals || []).filter((item) => !search || normalize(`${item.account} ${item.contact} ${item.need} ${item.source} ${item.nurtureReason} ${item.disqualifyReason}`).includes(search));
  const originFiltered = allSignals.filter((item) => state.signalOriginFilter === "all" || (state.signalOriginFilter === "canvassing" ? Boolean(item.canvassing) : !item.canvassing));
  let signals = originFiltered.filter(signalMatchesFilter);
  if (state.signalOriginFilter === "canvassing") signals = signals.toSorted((a, b) => Number(a.canvassing?.routeOrder || 999) - Number(b.canvassing?.routeOrder || 999));
  const attentionCount = allSignals.filter((item) => ["inbox", "review"].includes(item.status) || ["overdue", "due_today"].includes(getSignalReviewState(item))).length;
  const nurtureCount = allSignals.filter((item) => item.status === "nurture").length;
  const closedCount = allSignals.filter((item) => ["converted", "disqualified"].includes(item.status)).length;
  const filters = [["attention", "Perlu keputusan"], ["nurture", "Hubungi nanti"], ["closed", "Selesai"], ["all", "Semua"]];
  const canvassingSignals = allSignals.filter((item) => item.canvassing);
  const today = calendarDateKey(new Date());
  const plannedToday = canvassingSignals.filter((item) => item.canvassing.visitStatus === "planned" && calendarDateKey(item.canvassing.visitAt) === today).length;
  const completed = canvassingSignals.filter((item) => item.canvassing.visitStatus === "completed").length;

  root.innerHTML = `
    <section class="view" data-rendered-view="signals">
      ${viewHeading("Prospek & canvassing", "Setiap kebutuhan baru perlu jawaban.", "Gabungkan prospek masuk, referral, dan hasil canvassing. Jika belum siap, simpan jadwal berikutnya atau tutup dengan alasan yang dapat ditinjau.", `<button class="primary-button" type="button" data-open-signal>${icon("plus")}<span>Catat prospek</span></button>`)}
      <div class="signal-summary">
        <div><span>Perlu keputusan</span><strong>${attentionCount}</strong><small>Termasuk review nurture yang jatuh tempo</small></div>
        <div><span>Dihubungi nanti</span><strong>${nurtureCount}</strong><small>Sudah memiliki jadwal berikutnya</small></div>
        <div><span>Sudah diputuskan</span><strong>${closedCount}</strong><small>Dilanjutkan atau ditutup dengan alasan</small></div>
      </div>
      <div class="prospect-source-switch" role="group" aria-label="Jenis tindak lanjut prospek">${[["all", "Semua prospek"], ["canvassing", "Kunjungan lapangan"], ["inbound", "Tanpa kunjungan"]].map(([value, label]) => `<button class="chip-button ${state.signalOriginFilter === value ? "is-active" : ""}" type="button" data-signal-origin="${value}">${label}</button>`).join("")}</div>
      ${state.signalOriginFilter === "canvassing" ? `<section class="canvassing-ops"><div><span>Target hari ini</span><strong>${plannedToday}</strong><small>Kunjungan terjadwal</small></div><div><span>Selesai</span><strong>${completed}</strong><small>Hasil sudah dicatat</small></div><div><span>Area aktif</span><strong>${new Set(canvassingSignals.map((item) => item.canvassing.area)).size}</strong><small>Rute berdasarkan urutan</small></div><button class="secondary-button" type="button" data-create-record="canvassing_import">Impor daftar</button></section>` : ""}
      <div class="toolbar signal-toolbar"><div class="filter-group">${filters.map(([value, label]) => `<button class="chip-button ${state.signalFilter === value ? "is-active" : ""}" type="button" data-signal-filter="${value}">${label}</button>`).join("")}</div><span class="result-count">${signals.length} prospek</span></div>
      <section class="signal-list" aria-label="Daftar calon pelanggan">
        ${signals.length ? signals.map(renderSignalRow).join("") : emptyState("check", "Tidak ada calon pelanggan di tampilan ini", "Coba filter lain atau catat kebutuhan baru yang masuk.")}
      </section>
    </section>`;
}

function renderPipelineRow(item) {
  const flags = attentionFlagsForUI(item);
  const action = operatingAction(item);
  return `
    <article class="pipeline-row">
      <div class="pipeline-main"><span class="account-mark">${escapeHTML(initials(item.account))}</span><div><strong>${escapeHTML(item.account)}</strong><span>${escapeHTML(item.service)} · ${escapeHTML(item.source)}</span></div></div>
      <span class="stage-badge ${slug(item.stage)}">${escapeHTML(item.stage)}</span>
      <div class="pipeline-next"><strong>${escapeHTML(action.label)}</strong><span>${action.due ? formatDate(action.due, { year: true }) : flags[0]?.label || escapeHTML(item.probabilityLabel)}</span></div>
      <div class="pipeline-owner"><span class="owner-chip"><i>${escapeHTML(initials(item.owner))}</i>${escapeHTML(item.owner)}</span></div>
      <div class="pipeline-value"><strong>${formatIDR(item.value, true)}</strong><span>${escapeHTML(item.probabilityLabel)}</span></div>
      <button class="row-action" type="button" data-open-opportunity="${escapeHTML(item.id)}" aria-label="Buka ${escapeHTML(item.account)}">${icon("chevron")}</button>
    </article>`;
}

function renderRelationships() {
  const operational = customerPipelineData();
  const search = normalize(state.search);
  const accountRows = operational.accounts
    .map((account) => buildAccountSnapshot(operational, account.id))
    .filter(Boolean)
    .filter((row) => !search || normalize(`${row.account.name} ${row.contacts.map((item) => item.name).join(" ")} ${row.openSignals.map((item) => item.need).join(" ")}`).includes(search))
    .toSorted((a, b) => new Date(b.lastTouchAt) - new Date(a.lastTouchAt));
  const clientCount = accountRows.filter((row) => ["client", "client_active"].includes(row.relationshipState)).length;
  const activeCount = accountRows.filter((row) => ["active", "client_active"].includes(row.relationshipState)).length;
  const expansionCount = accountRows.flatMap((row) => row.openSignals).filter((item) => item.source === "Existing client").length;

  root.innerHTML = `
    <section class="view" data-rendered-view="relationships">
      ${viewHeading("Hubungan pelanggan", "Semua cerita pelanggan di satu tempat.", "Lihat siapa yang pernah dihubungi, apa kebutuhannya, janji berikutnya, pekerjaan, tagihan, dan peluang lanjutannya.", `<div class="heading-action-stack"><button class="text-button" type="button" data-export-customers>Ekspor CSV</button><button class="secondary-button" type="button" data-create-record="customer_import">Impor</button><button class="primary-button" type="button" data-create-record="customer">${icon("plus")}<span>Tambah pelanggan</span></button></div>`)}
      ${customerPipelineAuthorityNote()}
      <section class="relationship-hero" aria-label="Ringkasan hubungan">
        <div class="relationship-thesis"><span>Riwayat hubungan</span><h2>Pelanggan tidak perlu mengulang cerita.</h2><p>Catat kebutuhan baru dari percakapan yang sebenarnya, lalu nilai sebelum menjadikannya peluang penjualan.</p></div>
        <div class="relationship-facts"><div><strong>${clientCount}</strong><span>Klien tercatat</span></div><div><strong>${activeCount}</strong><span>Relasi aktif</span></div><div><strong>${expansionCount}</strong><span>Kebutuhan lanjutan</span></div></div>
      </section>
      <section class="surface relationship-directory" aria-labelledby="account-directory-title">
        <div class="panel-head"><div><h2 id="account-directory-title">Daftar pelanggan</h2><p>Urut dari interaksi terbaru. Buka pelanggan untuk melihat konteks lengkap.</p></div><span class="count-pill relationship-count">${accountRows.length} pelanggan</span></div>
        <div class="account-list">
          ${accountRows.length ? accountRows.map(renderAccountRow).join("") : emptyState("search", "Akun tidak ditemukan", "Ubah kata pencarian untuk melihat relasi lain.")}
        </div>
      </section>
    </section>`;
}

function exportCustomersCSV() {
  const operational = customerPipelineData();
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [["ID", "Nama", "Sumber", "Segmentasi", "Custom fields"], ...operational.accounts.map((item) => [item.id, item.name, item.source || "", item.segment || "", Object.entries(item.customFields || {}).map(([key, value]) => `${key}=${value}`).join("; ")])];
  const blob = new Blob([rows.map((row) => row.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `dekta-pelanggan-${dateInputAfter(0)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`${operational.accounts.length} pelanggan diekspor ke CSV.`);
}

function relationshipStateCopy(value) {
  return {
    client_active: ["Pelanggan aktif", "client"],
    client: ["Pelanggan", "client"],
    active: ["Peluang aktif", "active"],
    prospect: ["Calon pelanggan", "prospect"],
    closed: ["Tidak lanjut", "closed"],
    archived: ["Diarsipkan", "archived"]
  }[value] || ["Calon pelanggan", "prospect"];
}

function renderAccountRow(snapshot) {
  const [stateLabel, stateClass] = relationshipStateCopy(snapshot.relationshipState);
  const activeOpportunity = snapshot.opportunities.find((item) => ["active", "on_hold"].includes(item.status));
  const handoffOpportunity = snapshot.opportunities.find((item) => item.status === "won" && ["rejected", "submitted"].includes(item.handoff?.status));
  const relationshipValue = snapshot.financial.contracted || snapshot.financial.pipeline;
  const valueLabel = snapshot.financial.contracted ? "Disetujui" : snapshot.financial.pipeline ? "Potensi" : "Belum ada nilai";
  const nextContext = activeOpportunity?.nextAction?.label
    || snapshot.openSignals[0]?.need
    || (handoffOpportunity?.handoff?.status === "rejected" ? "Informasi pekerjaan perlu dilengkapi" : handoffOpportunity ? "Menunggu pemeriksaan operasional" : null)
    || (snapshot.financial.collected ? "Proyek selesai · cek peluang lanjutan" : "Belum ada tindakan aktif");
  return `
    <button class="account-row" type="button" data-open-account="${escapeHTML(snapshot.account.id)}">
      <span class="account-mark account-mark-lg">${escapeHTML(initials(snapshot.account.name))}</span>
      <span class="account-identity"><strong>${escapeHTML(snapshot.account.name)}</strong><small>${snapshot.contacts.length ? escapeHTML(snapshot.contacts.map((item) => item.name).join(", ")) : "Kontak belum teridentifikasi"}</small></span>
      <span class="relationship-state ${stateClass}"><i></i>${escapeHTML(stateLabel)}</span>
      <span class="account-context"><small>Konteks berikutnya</small><strong>${escapeHTML(nextContext)}</strong></span>
      <span class="account-value"><strong>${relationshipValue ? formatIDR(relationshipValue, true) : "—"}</strong><small>${valueLabel} · ${snapshot.openSignals.length} kebutuhan baru</small></span>
      <span class="account-last-touch"><small>Interaksi terakhir</small><strong>${formatDate(snapshot.lastTouchAt, { year: true })}</strong></span>
      <span class="row-action" aria-hidden="true">${icon("chevron")}</span>
    </button>`;
}

function renderExperiments() {
  const search = normalize(state.search);
  const experiments = state.data.experiments.filter((item) => !search || normalize(`${item.name} ${item.channel} ${item.hypothesis}`).includes(search));
  root.innerHTML = `
    <section class="view" data-rendered-view="experiments">
      ${viewHeading("Kinerja kampanye", "Cari kebutuhan nyata, bukan sekadar respons.", "Bandingkan calon pelanggan yang masuk, yang layak dihubungi, dan yang akhirnya menyetujui penawaran.")}
      <div class="experiment-grid">
        ${experiments.map((item) => `
          <article class="surface experiment-card ${escapeHTML(item.status)}">
            <div class="experiment-top"><span class="experiment-channel">${escapeHTML(item.channel)}</span><span class="status-badge ${escapeHTML(item.status)}">${item.status === "running" ? "Berjalan" : item.status === "review" ? "Review" : "Dihentikan"}</span></div>
            <h2>${escapeHTML(item.name)}</h2><p>${escapeHTML(item.hypothesis)}</p>
            <div class="experiment-metrics"><div class="experiment-metric"><strong>${item.leads}</strong><span>Calon</span></div><div class="experiment-metric"><strong>${item.qualified}</strong><span>Layak dihubungi</span></div><div class="experiment-metric"><strong>${item.wins}</strong><span>Jadi pelanggan</span></div></div>
            <div class="experiment-decision"><span>Keputusan berikutnya</span><p>${escapeHTML(item.decision)}</p></div>
          </article>`).join("")}
      </div>
    </section>`;
}

function renderCollection() {
  const operational = customerPipelineData();
  const financial = calculateFinancialSummary(operational.opportunities, operational.invoices, operational.payments);
  const aging = buildReceivableAging(operational.invoices, operational.payments, new Date());
  const schedule = buildBillingSchedule(operational.contracts, operational.invoices, new Date(), 120);
  const expenseQueue = buildExpenseReviewQueue(operational.consultingEngagements || []);
  const search = normalize(state.search);
  const invoiceRows = operational.invoices
    .map((invoice) => {
      const opportunity = operational.opportunities.find((item) => item.id === invoice.opportunityId);
      const paymentTotal = operational.payments.filter((item) => item.invoiceId === invoice.id).reduce((sum, item) => sum + item.amount, 0);
      return { ...invoice, opportunity, collected: paymentTotal, outstanding: Math.max(0, invoice.amount - paymentTotal) };
    })
    .filter((item) => !search || normalize(`${item.number} ${item.opportunity?.account}`).includes(search));
  const issuedCount = invoiceRows.filter((item) => ["issued", "overdue", "disputed", "partial", "paid"].includes(item.status)).length;
  const draftCount = invoiceRows.filter((item) => item.status === "draft").length;
  const dueSchedules = schedule.filter((item) => item.status === "due");
  const tabs = [["overview", "Ringkasan"], ["expenses", `Biaya pekerjaan (${expenseQueue.awaitingCount})`], ["invoices", `Tagihan (${invoiceRows.length})`], ["receivables", `Belum dibayar (${aging.rows.length})`], ["schedule", `Jadwal tagihan (${dueSchedules.length})`], ["reconciliation", "Pencocokan pembayaran"]];
  const statusCopy = (status) => ({ draft: ["Draf", "review"], issued: ["Terbit", "running"], partial: ["Dibayar sebagian", "review"], paid: ["Lunas", "paid"], disputed: ["Dipermasalahkan", "overdue"], void: ["Dibatalkan", "stopped"], overdue: ["Terlambat", "overdue"] }[status] || [status, "review"]);
  const invoiceTable = `<section class="surface finance-register"><div class="finance-register-head"><div><h2>Daftar invoice</h2><p>${issuedCount} terbit · ${draftCount} draft · setiap invoice dapat ditelusuri ke pelanggan dan pembayaran.</p></div><button class="primary-button" type="button" data-create-record="invoice">${icon("plus")}<span>Buat invoice</span></button></div><div class="finance-invoice-row finance-invoice-head"><span>Pelanggan / invoice</span><span>Tanggal</span><span>Nilai</span><span>Terbayar</span><span>Status</span><span></span></div>${invoiceRows.length ? invoiceRows.map((item) => { const copy = statusCopy(item.status); return `<article class="finance-invoice-row"><span><strong>${escapeHTML(item.opportunity?.account || "Tidak diketahui")}</strong><small>${escapeHTML(item.number)}${item.billingPeriodKey ? ` · periode ${escapeHTML(item.billingPeriodKey)}` : ""}</small></span><span><small>Terbit ${item.issuedAt ? formatDate(item.issuedAt, { year: true }) : "belum"}</small><strong>Tempo ${formatDate(item.dueAt, { year: true })}</strong></span><strong>${formatIDR(item.amount, true)}</strong><span><strong>${formatIDR(item.collected, true)}</strong><small>Sisa ${formatIDR(item.outstanding, true)}</small></span><span class="status-badge ${copy[1]}">${copy[0]}</span><button class="inline-action" type="button" data-open-invoice="${escapeHTML(item.id)}">Detail</button></article>`; }).join("") : emptyState("file", "Belum ada invoice", "Buat invoice dari pesanan pelanggan atau jadwal kontrak.")}</section>`;
  const overview = `<div class="finance-overview-grid"><section class="surface finance-focus"><div class="panel-head"><div><h2>Prioritas penagihan</h2><p>Mulai dari piutang tertua dan periode recurring yang belum dibuat.</p></div>${helpTip("Piutang dihitung hanya dari invoice terbit. Draft, invoice void, dan nilai peluang tidak masuk perhitungan.")}</div><div class="finance-priority-list">${aging.rows.slice(0, 4).map((item) => { const opportunity = operational.opportunities.find((row) => row.id === item.opportunityId); return `<article><span class="finance-age ${item.overdueDays ? "is-overdue" : ""}">${item.overdueDays ? `${item.overdueDays} hari` : "Belum tempo"}</span><div><strong>${escapeHTML(opportunity?.account || "Pelanggan")}</strong><small>${escapeHTML(item.number)} · sisa ${formatIDR(item.outstanding)}</small></div><button class="inline-action" type="button" data-invoice-reminder="${escapeHTML(item.id)}">Siapkan pengingat</button></article>`; }).join("") || `<p class="finance-empty">Tidak ada piutang terbuka.</p>`}</div></section><aside class="surface finance-next-billing"><span class="section-kicker">Jadwal berikutnya</span><h2>${dueSchedules.length} tagihan perlu disiapkan</h2><p>Recurring tetap menjadi draft sampai finance memeriksa dan menerbitkannya.</p>${schedule.filter((item) => ["due", "upcoming", "needs_review"].includes(item.status)).slice(0, 4).map((item) => { const contract = operational.contracts.find((row) => row.id === item.contractId); return `<div><span><strong>${escapeHTML(contract?.title || "Kontrak")}</strong><small>${escapeHTML(item.reason)}</small></span><time>${formatDate(item.dueAt, { year: true })}</time></div>`; }).join("")}<button class="secondary-button" type="button" data-finance-view="schedule">Buka jadwal tagihan</button></aside></div>${invoiceTable}`;
  const receivables = `<section class="aging-grid">${aging.buckets.map((bucket) => `<article class="surface"><span>${escapeHTML(bucket.label)}</span><strong>${formatIDR(bucket.amount, true)}</strong><small>${bucket.count} invoice</small></article>`).join("")}</section><section class="surface finance-register"><div class="finance-register-head"><div><h2>Daftar umur piutang</h2><p>${formatIDR(aging.totalOverdue)} sudah melewati jatuh tempo.</p></div>${helpTip("Umur piutang dihitung sejak tanggal jatuh tempo sampai hari ini. Pembayaran sebagian mengurangi sisa piutang.")}</div><div class="finance-aging-row finance-aging-head"><span>Pelanggan</span><span>Invoice</span><span>Umur</span><span>Sisa</span><span>Tindakan</span></div>${aging.rows.map((item) => { const opportunity = operational.opportunities.find((row) => row.id === item.opportunityId); return `<article class="finance-aging-row"><strong>${escapeHTML(opportunity?.account || "Tidak diketahui")}</strong><span><strong>${escapeHTML(item.number)}</strong><small>Tempo ${formatDate(item.dueAt, { year: true })}</small></span><span class="finance-age ${item.overdueDays ? "is-overdue" : ""}">${item.overdueDays ? `${item.overdueDays} hari` : "Belum tempo"}</span><strong>${formatIDR(item.outstanding)}</strong><span><button class="inline-action" type="button" data-invoice-reminder="${escapeHTML(item.id)}">Siapkan pengingat</button><button class="inline-action" type="button" data-record-payment="${escapeHTML(item.id)}">Catat bayar</button></span></article>`; }).join("")}</section>`;
  const billingSchedule = `<section class="schedule-summary"><article class="surface"><span>Perlu dibuat</span><strong>${dueSchedules.length}</strong><small>Periode sudah tiba</small></article><article class="surface"><span>Akan datang</span><strong>${schedule.filter((item) => item.status === "upcoming").length}</strong><small>120 hari ke depan</small></article><article class="surface"><span>Perlu review</span><strong>${schedule.filter((item) => item.status === "needs_review").length}</strong><small>Milestone / usage</small></article><article class="surface"><span>Sudah dibuat</span><strong>${schedule.filter((item) => item.status === "generated").length}</strong><small>Anti-duplikasi periode</small></article></section><section class="surface finance-register"><div class="finance-register-head"><div><h2>Jadwal penagihan kontrak</h2><p>Sistem menyiapkan periode; finance tetap memeriksa nominal, pajak, dan dokumen sebelum terbit.</p></div>${helpTip("DEKTA tidak menerbitkan invoice recurring secara otomatis pada prototype. Satu kontrak dan periode hanya boleh menghasilkan satu draft.")}</div><div class="billing-schedule-row billing-schedule-head"><span>Kontrak</span><span>Periode</span><span>Jadwal</span><span>Nominal</span><span>Status / tindakan</span></div>${schedule.map((item) => { const contract = operational.contracts.find((row) => row.id === item.contractId); const labels = { due: ["Perlu dibuat", "overdue"], upcoming: ["Akan datang", "running"], generated: ["Sudah dibuat", "paid"], needs_review: ["Perlu review", "review"] }; const copy = labels[item.status]; return `<article class="billing-schedule-row"><span><strong>${escapeHTML(contract?.title || "Kontrak")}</strong><small>${escapeHTML(contract?.number || "")}</small></span><span><strong>${escapeHTML(item.periodKey)}</strong><small>${escapeHTML(item.reason)}</small></span><time>${formatDate(item.dueAt, { year: true })}</time><strong>${item.amount ? formatIDR(item.amount) : "Menunggu dasar hitung"}</strong><span><span class="status-badge ${copy[1]}">${copy[0]}</span>${["due", "upcoming"].includes(item.status) ? `<button class="inline-action" type="button" data-create-scheduled-invoice="${escapeHTML(item.id)}">Buat draft</button>` : ""}</span></article>`; }).join("")}</section>`;
  const reconciliation = `<section class="reconciliation-metrics"><article class="surface"><span>Pembayaran tercatat</span><strong>${operational.payments.length}</strong><small>${formatIDR(financial.collected, true)} dengan bukti</small></article><article class="surface"><span>Belum cocok</span><strong>${operational.payments.filter((item) => !operational.invoices.some((invoice) => invoice.id === item.invoiceId)).length}</strong><small>Perlu ditelusuri</small></article><article class="surface"><span>Cakupan bukti</span><strong>${operational.payments.length ? Math.round(operational.payments.filter((item) => item.evidence).length / operational.payments.length * 100) : 100}%</strong><small>Referensi pembayaran tersedia</small></article></section><section class="surface finance-register"><div class="finance-register-head"><div><h2>Rekonsiliasi pembayaran</h2><p>Pembayaran harus cocok ke satu invoice dan memiliki referensi bukti.</p></div>${helpTip("Ini rekonsiliasi operasional, bukan rekonsiliasi bank otomatis. Integrasi bank/accounting tetap memerlukan provider terverifikasi.")}</div><div class="reconciliation-row reconciliation-head"><span>Pembayaran</span><span>Invoice</span><span>Pelanggan</span><span>Nominal</span><span>Hasil pencocokan</span></div>${operational.payments.map((payment) => { const invoice = operational.invoices.find((item) => item.id === payment.invoiceId); const opportunity = operational.opportunities.find((item) => item.id === (invoice?.opportunityId || payment.opportunityId)); return `<article class="reconciliation-row"><span><strong>${escapeHTML(payment.evidence || "Tanpa bukti")}</strong><small>${formatDate(payment.receivedAt, { year: true })}</small></span><strong>${escapeHTML(invoice?.number || "Tidak ditemukan")}</strong><span>${escapeHTML(opportunity?.account || "Tidak diketahui")}</span><strong>${formatIDR(payment.amount)}</strong><span class="status-badge ${invoice && payment.evidence ? "paid" : "overdue"}">${invoice && payment.evidence ? "Cocok" : "Perlu review"}</span></article>`; }).join("")}</section>`;
  const consultingExpenses = renderConsultingExpenseFinance(expenseQueue);
  const content = { overview, expenses: consultingExpenses, invoices: invoiceTable, receivables, schedule: billingSchedule, reconciliation }[state.financeView] || overview;
  root.innerHTML = `
    <section class="view" data-rendered-view="collection">
      ${viewHeading("Pengelolaan tagihan", "Jaga tagihan sampai benar-benar menjadi uang masuk.", "Kelola tagihan, umur pembayaran, jadwal berulang, pengingat, dan pencocokan pembayaran tanpa mencampur nilai penjualan dengan kas.", `<button class="primary-button" type="button" data-create-record="invoice">${icon("plus")}<span>Buat tagihan</span></button>`)}
      <section class="financial-boundary"><div class="financial-grid">${financialMetric("Pesanan disetujui", financial.contracted, "Komitmen pelanggan tercatat")}${financialMetric("Sudah ditagihkan", financial.invoiced, "Tagihan terbit, bukan draf")}${financialMetric("Belum dibayar", financial.receivable, "Sisa pembayaran")}${financialMetric("Sudah terlambat", aging.totalOverdue, `${aging.rows.filter((item) => item.overdueDays > 0).length} tagihan perlu tindakan`)}${financialMetric("Pembayaran diterima", financial.collected, "Dana dengan bukti")}</div></section>
      <nav class="finance-tabs" aria-label="Bagian pengelolaan tagihan">${tabs.map(([value, label]) => `<button type="button" class="${state.financeView === value ? "is-active" : ""}" data-finance-view="${value}">${label}</button>`).join("")}</nav>
      ${content}
    </section>`;
}

function renderConsultingExpenseFinance(queue) {
  return `<div class="expense-finance-workspace">
    <section class="expense-finance-metrics" aria-label="Ringkasan biaya pekerjaan">
      <article class="surface"><span>Perlu diperiksa</span><strong>${formatIDR(queue.awaitingTotal, true)}</strong><small>${queue.awaitingCount} pengeluaran</small></article>
      <article class="surface"><span>Siap masuk draft tagihan</span><strong>${formatIDR(queue.rebillableTotal, true)}</strong><small>Belum menjadi invoice terbit</small></article>
      <article class="surface"><span>Reimbursement tim</span><strong>${formatIDR(queue.reimbursementTotal, true)}</strong><small>Belum berarti sudah dibayar</small></article>
    </section>
    <section class="surface finance-register consulting-expense-register">
      <div class="finance-register-head"><div><h2>Review biaya per tugas</h2><p>Periksa bukti dan tentukan perlakuan sebelum biaya diteruskan ke proses keuangan berikutnya.</p></div>${helpTip("Setujui berarti klasifikasi biaya diterima. Sistem tidak membuat kas keluar, jurnal, atau invoice pelanggan secara otomatis.")}</div>
      <div class="consulting-expense-row consulting-expense-head"><span>Klien / pekerjaan</span><span>Biaya & bukti</span><span>Perlakuan</span><span>Status berikutnya</span><span></span></div>
      ${queue.rows.map((expense) => {
        const account = customerPipelineData().accounts.find((item) => item.id === expense.accountId);
        const status = consultingStatusCopy(expense.financeState);
        const nextState = expense.billingState !== "not_applicable" ? expense.billingState : expense.settlementState;
        const next = consultingStatusCopy(nextState);
        return `<article class="consulting-expense-row"><span><strong>${escapeHTML(account?.name || "Pelanggan")}</strong><small>${escapeHTML(expense.engagementTitle)} · ${escapeHTML(expense.task?.title || "Tugas tidak ditemukan")}</small></span><span><strong>${formatIDR(expense.amount)}</strong><small>${escapeHTML(expense.category)} · bukti ${escapeHTML(expense.evidence)}</small></span><span><strong>${escapeHTML(expenseTreatmentCopy(expense.treatment))}</strong><small>Dibayar oleh ${escapeHTML(expense.paidBy)}</small></span><span><span class="status-badge ${status[1]}">${status[0]}</span>${expense.financeState === "approved" ? `<small>${next[0]}</small>` : ""}</span><span>${expense.financeState === "awaiting_review" ? `<button class="primary-button compact" type="button" data-review-task-expense="${escapeHTML(expense.engagementId)}" data-expense-id="${escapeHTML(expense.id)}">Periksa</button>` : `<button class="inline-action" type="button" data-open-engagement="${escapeHTML(expense.engagementId)}">Lihat sumber</button>`}</span></article>`;
      }).join("") || emptyState("file", "Belum ada biaya pekerjaan", "Pengeluaran dari tugas konsultasi akan masuk ke antrean ini.")}
    </section>
    <aside class="finance-boundary-note"><strong>Tiga angka yang tidak boleh disamakan</strong><p>Biaya disetujui adalah klasifikasi operasional. Kas keluar baru terjadi saat pembayaran dibuktikan. Rebillable baru menjadi pendapatan setelah masuk draft, diperiksa, lalu invoice diterbitkan.</p></aside>
  </div>`;
}

function openInvoice(id) {
  const operational = customerPipelineData();
  const invoice = operational.invoices.find((item) => item.id === id);
  if (!invoice) return;
  const opportunity = operational.opportunities.find((item) => item.id === invoice.opportunityId);
  const contract = operational.contracts.find((item) => item.id === invoice.contractId);
  const payments = operational.payments.filter((item) => item.invoiceId === invoice.id);
  const paid = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const statusLabels = { draft: "Draf", issued: "Terbit", partial: "Dibayar sebagian", paid: "Lunas", disputed: "Dipermasalahkan", void: "Dibatalkan", overdue: "Terlambat" };
  detailDialog.classList.remove("account-detail-dialog");
  detailDialog.querySelector("#detail-content").innerHTML = `<div class="modal-head"><div><span class="section-kicker">Pengelolaan tagihan</span><h2 id="detail-title">${escapeHTML(invoice.number)}</h2><p>${escapeHTML(opportunity?.account || "Pelanggan tidak diketahui")} · ${statusLabels[invoice.status] || invoice.status}</p></div><button class="icon-button" type="button" data-close-detail aria-label="Tutup detail">${icon("close")}</button></div><div class="detail-body invoice-workspace"><div class="detail-summary"><div><span>Total</span><strong>${formatIDR(invoice.amount)}</strong></div><div><span>Terbayar</span><strong>${formatIDR(paid)}</strong></div><div><span>Sisa</span><strong>${formatIDR(Math.max(0, invoice.amount - paid))}</strong></div><div><span>Jatuh tempo</span><strong>${formatDate(invoice.dueAt, { year: true })}</strong></div></div>${contract ? `<aside class="invoice-source"><strong>Sumber kontrak</strong><span>${escapeHTML(contract.number)} · ${escapeHTML(contract.title)}${invoice.billingPeriodKey ? ` · periode ${escapeHTML(invoice.billingPeriodKey)}` : ""}</span></aside>` : ""}<section><div class="panel-head"><div><h3>Rincian tagihan</h3><p>Subtotal, diskon, dan pajak tetap terlihat terpisah.</p></div></div><div class="invoice-items"><div class="invoice-item invoice-item-head"><span>Deskripsi</span><span>Jumlah</span><span>Harga</span><span>Total</span></div>${(invoice.items || []).map((item) => `<div class="invoice-item"><strong>${escapeHTML(item.description)}</strong><span>${item.quantity}</span><span>${formatIDR(item.unitPrice)}</span><strong>${formatIDR(item.quantity * item.unitPrice)}</strong></div>`).join("")}<div class="invoice-totals"><span>Subtotal <strong>${formatIDR(invoice.subtotal ?? invoice.amount)}</strong></span><span>Diskon <strong>−${formatIDR(invoice.discountAmount || 0)}</strong></span><span>Pajak ${invoice.taxRate || 0}% <strong>${formatIDR(invoice.taxAmount || 0)}</strong></span><span>Total <strong>${formatIDR(invoice.amount)}</strong></span></div></div></section><section><div class="panel-head"><div><h3>Pembayaran & audit</h3><p>Bukti pembayaran dan perubahan status tersimpan di sumber yang sama.</p></div></div><div class="workspace-list">${payments.map((payment) => `<article><span><strong>${formatIDR(payment.amount)}</strong><small>${escapeHTML(payment.evidence)} · ${formatDate(payment.receivedAt, { year: true })}</small></span><span class="status-badge paid">Cocok</span></article>`).join("") || `<p>Belum ada pembayaran.</p>`}${(invoice.activity || []).map((item) => `<article><span><strong>${escapeHTML(userFacingText(item.label))}</strong><small>${escapeHTML(userFacingText(item.evidence || item.source || "Audit internal"))} · ${formatDate(item.at, { year: true })}</small></span></article>`).join("")}</div></section><div class="detail-actions"><button class="text-button" type="button" data-close-detail>Tutup</button><div class="detail-action-group">${invoice.status === "draft" ? `<button class="primary-button" type="button" data-invoice-action="${escapeHTML(invoice.id)}" data-invoice-action-type="issue">Terbitkan tagihan</button>` : ""}${["draft", "issued", "overdue", "disputed"].includes(invoice.status) ? `<button class="secondary-button" type="button" data-invoice-action="${escapeHTML(invoice.id)}" data-invoice-action-type="void">Batalkan</button>` : ""}${Math.max(0, invoice.amount - paid) > 0 && invoice.status !== "draft" ? `<button class="secondary-button" type="button" data-record-payment="${escapeHTML(invoice.id)}">Catat bayar</button>` : ""}</div></div></div>`;
  if (!detailDialog.open) detailDialog.showModal();
}

function contractStatusCopy(status) {
  return { draft: ["Draf", "review"], sent: ["Dikirim", "running"], signed: ["Ditandatangani", "paid"], active: ["Aktif", "paid"], expired: ["Berakhir", "overdue"], cancelled: ["Dibatalkan", "stopped"] }[status] || [status, "review"];
}

function billingPlanCopy(plan) {
  const labels = { one_time: "Sekali selesai", milestone: "Berdasarkan tahapan", recurring: "Berulang", usage: "Sesuai pemakaian", hybrid: "Gabungan" };
  const intervals = { monthly: "bulanan", quarterly: "triwulanan", yearly: "tahunan" };
  const detail = plan?.model === "recurring" || plan?.model === "hybrid"
    ? `${formatIDR(plan.cycleAmount, true)} ${intervals[plan.interval] || "berulang"} · ${plan.cycles || "∞"} siklus`
    : plan?.model === "milestone" ? `${plan.cycles} termin × ${formatIDR(plan.cycleAmount, true)}`
      : plan?.model === "usage" ? "Nilai dihitung setelah pemakaian disetujui"
        : formatIDR(plan?.cycleAmount || 0, true);
  return { label: labels[plan?.model] || "Belum diatur", detail };
}

function renderContracts() {
  const operational = customerPipelineData();
  const contracts = (operational.contracts || []).map((item) => ({ ...item, opportunity: operational.opportunities.find((opportunity) => opportunity.id === item.opportunityId), account: operational.accounts.find((account) => account.id === item.accountId) }));
  const values = contracts.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const signed = contracts.filter((item) => ["signed", "active"].includes(item.status));
  const drafts = contracts.filter((item) => ["draft", "sent"].includes(item.status));
  const patternCounts = ["one_time", "milestone", "recurring", "usage", "hybrid"].map((model) => ({ model, count: contracts.filter((item) => item.billingPlan?.model === model).length })).filter((item) => item.count);
  root.innerHTML = `<section class="view" data-rendered-view="contracts">
    ${viewHeading("Kontrak pelanggan", "Kesepakatan harus punya versi dan status yang jelas.", "Draft, persetujuan, masa berlaku, dan nilai kontrak terhubung ke pelanggan serta peluang penjualan.", `<button class="primary-button" type="button" data-create-record="contract">${icon("plus")}<span>Buat draft kontrak</span></button>`)}
    <div class="record-metrics"><article><span>Total kontrak</span><strong>${contracts.length}</strong><small>${formatIDR(values, true)} tercatat</small></article><article><span>Aktif / ditandatangani</span><strong>${signed.length}</strong><small>Memiliki bukti komitmen</small></article><article><span>Perlu tindakan</span><strong>${drafts.length}</strong><small>Draft atau menunggu pelanggan</small></article></div>
    <div class="billing-patterns" aria-label="Pola penagihan kontrak">${patternCounts.map((item) => `<span><strong>${item.count}</strong> ${escapeHTML(billingPlanCopy({ model: item.model }).label)}</span>`).join("")}</div>
    <section class="surface record-table"><div class="record-row record-head"><span>Pelanggan / kontrak</span><span>Versi</span><span>Nilai &amp; pola tagihan</span><span>Berlaku sampai</span><span>Status</span></div>${contracts.map((item) => { const copy = contractStatusCopy(item.status); const billing = billingPlanCopy(item.billingPlan); return `<article class="record-row"><span><strong>${escapeHTML(item.account?.name || item.opportunity?.account || "Tidak diketahui")}</strong><small>${escapeHTML(item.number)} · ${escapeHTML(item.title)}</small></span><strong>v${item.version || 1}</strong><span><strong>${formatIDR(item.value, true)}</strong><small>${escapeHTML(billing.label)} · ${escapeHTML(billing.detail)}</small></span><span>${formatDate(item.validUntil, { year: true })}</span><span class="record-status-actions"><span class="status-badge ${copy[1]}">${copy[0]}</span>${!["expired", "cancelled"].includes(item.status) ? `<button class="inline-action" type="button" data-contract-action="${escapeHTML(item.id)}">Kelola</button>` : ""}</span></article>`; }).join("")}</section>
  </section>`;
}

function renderProjects() {
  const columns = [["planned", "Disiapkan"], ["active", "Dikerjakan"], ["review", "Pemeriksaan"], ["done", "Selesai"]];
  const projects = state.data.projects || [];
  const workload = [...new Set(projects.map((item) => item.owner))].map((owner) => ({ owner, projects: projects.filter((item) => item.owner === owner && item.status !== "done").length, tasks: projects.flatMap((item) => item.tasks || []).filter((task) => task.owner === owner && task.status !== "done").length }));
  const primaryAction = state.projectView === "consulting"
    ? `<button class="primary-button" type="button" data-create-record="consulting_engagement">${icon("plus")}<span>Buat engagement</span></button>`
    : `<button class="primary-button" type="button" data-create-record="project">${icon("plus")}<span>Buat proyek</span></button>`;
  root.innerHTML = `<section class="view work-hub-view" data-rendered-view="projects">
    ${viewHeading("Pengelolaan pekerjaan", "Pekerjaan pelanggan", "Mulai dari klien dan hasil berikutnya. Detail layanan, tugas, diskusi, biaya, dan riwayat dibuka saat dibutuhkan.", `<div class="heading-action-stack"><div class="view-switcher" role="group" aria-label="Tampilan pekerjaan"><button type="button" class="chip-button ${state.projectView === "consulting" ? "is-active" : ""}" data-project-view="consulting">Klien konsultasi</button><button type="button" class="chip-button ${state.projectView === "list" ? "is-active" : ""}" data-project-view="list">Daftar proyek</button><button type="button" class="chip-button ${state.projectView === "status" ? "is-active" : ""}" data-project-view="status">Papan status</button><button type="button" class="chip-button ${state.projectView === "customer" ? "is-active" : ""}" data-project-view="customer">Per pelanggan</button></div>${primaryAction}</div>`)}
    <aside class="addon-context-note"><span class="addon-mini-badge">ADD-ON AKTIF</span><p><strong>Project Operations</strong> · tugas, milestone, diskusi, assignment, dan biaya pekerjaan.</p>${helpTip("Add-on tetap terlihat pada prototype. Aktivasi, paket, dan fitur yang ditampilkan nantinya dikendalikan dari Pusat kontrol.")}</aside>
    ${state.projectView === "consulting" ? renderConsultingPortfolio() : `<section class="workload-strip" aria-label="Beban kerja tim">${workload.map((item) => `<article><span class="account-mark">${escapeHTML(initials(item.owner))}</span><div><strong>${escapeHTML(item.owner)}</strong><small>${item.projects} proyek · ${item.tasks} tugas terbuka</small></div></article>`).join("")}</section>${state.projectView === "status" ? `${horizontalScrollHint("Geser untuk melihat seluruh tahap pekerjaan")}<section class="project-kanban" tabindex="0" aria-label="Papan status pekerjaan; dapat digeser mendatar">${columns.map(([status, label]) => { const items = projects.filter((item) => item.status === status); return `<section class="project-column"><header><h2>${label}</h2><span>${items.length}</span></header><div>${items.map(renderProjectCard).join("") || `<p class="kanban-empty">Belum ada proyek</p>`}</div></section>`; }).join("")}</section>` : state.projectView === "customer" ? renderProjectsByCustomer(projects) : renderProjectList(projects)}`}
  </section>`;
}

function consultingStatusCopy(status) {
  return {
    active: ["Dikerjakan", "running"], planned: ["Disiapkan", "review"], done: ["Selesai", "paid"],
    blocked: ["Menunggu pelanggan", "overdue"], open: ["Belum dimulai", "review"],
    awaiting_acceptance: ["Menunggu diterima", "review"], accepted: ["Diterima", "paid"], rejected: ["Dikembalikan", "overdue"],
    awaiting_review: ["Menunggu Finance", "review"], approved: ["Disetujui", "paid"],
    ready_for_invoice_draft: ["Siap masuk draft tagihan", "running"], awaiting_reimbursement: ["Menunggu reimbursement", "review"],
    awaiting_supplier_payment: ["Menunggu bayar pemasok", "review"], approved_cost: ["Biaya disetujui", "paid"], not_posted: ["Belum diposting", "review"]
  }[status] || [status || "Belum diketahui", "review"];
}

function expenseTreatmentCopy(value) {
  return {
    company_cost: "Biaya perusahaan", included_in_fee: "Termasuk fee", employee_reimbursement: "Reimbursement tim",
    supplier_payable: "Utang pemasok", client_rebillable: "Ditagihkan kembali ke klien"
  }[value] || value;
}

function pricingModelCopy(value) {
  return { fixed_fee: "Sekali selesai", retainer: "Retainer bulanan", milestone: "Per tahap", hourly: "Per jam" }[value] || value;
}

function renderConsultingPortfolio() {
  const search = normalize(state.search);
  const portfolio = buildConsultingPortfolio(customerPipelineData())
    .filter((item) => !search || normalize(`${item.account?.name} ${item.title} ${item.manager} ${(item.workstreams || []).map((row) => row.name).join(" ")}`).includes(search));
  const active = portfolio.filter((item) => item.status === "active");
  const waitingHandoffs = portfolio.reduce((sum, item) => sum + item.waitingHandoffCount, 0);
  const financeQueue = portfolio.reduce((sum, item) => sum + item.financeQueueCount, 0);
  const blocked = portfolio.reduce((sum, item) => sum + item.blockedTaskCount, 0);
  return `<div class="consulting-portfolio consulting-portfolio-calm">
    <section class="work-attention-bar surface" aria-label="Ringkasan pekerjaan"><div><span class="section-kicker">Fokus pekerjaan</span><strong>${blocked || waitingHandoffs ? `${blocked + waitingHandoffs} hal perlu perhatian tim` : "Pekerjaan berjalan tanpa hambatan baru"}</strong><small>Daftar di bawah diurutkan per pelanggan; buka detail hanya saat perlu.</small></div><div class="attention-totals"><span><strong>${new Set(active.map((item) => item.accountId)).size}</strong> klien aktif</span><span class="${blocked ? "needs-attention" : ""}"><strong>${blocked}</strong> hambatan</span><span class="${waitingHandoffs ? "needs-attention" : ""}"><strong>${waitingHandoffs}</strong> serah tugas</span><span class="${financeQueue ? "needs-review" : ""}"><strong>${financeQueue}</strong> review Finance</span></div></section>
    <section class="consulting-list-surface surface" aria-label="Engagement per pelanggan"><header class="consulting-list-head"><span>Klien & pekerjaan</span><span>Progress</span><span>Yang dikerjakan</span><span>Hasil berikutnya</span><span></span></header>
      <div>${portfolio.map((item) => {
        const current = item.workstreams.find((row) => ["active", "blocked"].includes(row.status)) || item.workstreams[0];
        const due = item.nextTask?.dueAt || item.targetAt;
        const attention = item.blockedTaskCount + item.waitingHandoffCount + item.financeQueueCount;
        return `<article class="consulting-client-row"><div class="consulting-client-identity"><span class="account-mark">${escapeHTML(initials(item.account?.name))}</span><div><strong>${escapeHTML(item.account?.name || "Pelanggan belum diketahui")}</strong><small>${escapeHTML(item.title)}</small><span>${escapeHTML(item.manager)} · ${escapeHTML(pricingModelCopy(item.pricingModel))}</span></div></div><div class="client-progress-cell"><strong>${item.progress}%</strong><div class="progress-track"><i style="width:${item.progress}%"></i></div><small>${item.openTaskCount} tugas terbuka</small></div><div class="client-current-cell"><strong>${escapeHTML(current?.name || "Belum dijadwalkan")}</strong><small>${escapeHTML(current?.owner || item.manager)}</small>${attention ? `<span class="attention-badge">${attention} perlu perhatian</span>` : ""}</div><div class="client-next-cell"><strong>${escapeHTML(item.nextTask?.title || item.nextMilestone)}</strong><small>Target ${formatDate(due, { year: true })}</small></div><button class="row-open-button" type="button" data-open-engagement="${escapeHTML(item.id)}" aria-label="Buka pekerjaan ${escapeHTML(item.account?.name || item.title)}">${icon("chevron")}</button></article>`;
      }).join("") || emptyState("briefcase", "Engagement tidak ditemukan", "Ubah pencarian atau tambahkan engagement konsultasi.")}</div>
    </section>
  </div>`;
}

function openConsultingEngagement(id) {
  const operational = customerPipelineData();
  const item = operational.consultingEngagements.find((engagement) => engagement.id === id);
  if (!item) return;
  const account = operational.accounts.find((row) => row.id === item.accountId);
  const portfolio = buildConsultingPortfolio({ accounts: operational.accounts, consultingEngagements: [item] })[0];
  const tasks = (item.workstreams || []).flatMap((workstream) => (workstream.tasks || []).map((task) => ({ ...task, workstream })));
  const expenses = item.expenses || [];
  detailDialog.classList.remove("task-detail-dialog");
  detailDialog.classList.add("consulting-detail-dialog");
  detailDialog.querySelector("#detail-content").innerHTML = `<div class="modal-head"><div><span class="section-kicker">${escapeHTML(item.reference)} · ${escapeHTML(pricingModelCopy(item.pricingModel))}</span><h2 id="detail-title">${escapeHTML(item.title)}</h2><p>${escapeHTML(account?.name || "Pelanggan belum diketahui")} · ${escapeHTML(item.manager)}</p></div><button class="icon-button" type="button" data-close-detail aria-label="Tutup detail">${icon("close")}</button></div><div class="detail-body consulting-workspace">
    <section class="consulting-focus"><div><span>Hasil berikutnya untuk pelanggan</span><h3>${escapeHTML(item.nextMilestone)}</h3><p>Target keseluruhan ${formatDate(item.targetAt, { year: true })}. Kemajuan hanya bertambah ketika milestone dinyatakan selesai.</p></div><strong>${portfolio.progress}%</strong></section>
    <div class="detail-summary"><div><span>Layanan</span><strong>${item.workstreams.length}</strong></div><div><span>Tugas terbuka</span><strong>${portfolio.openTaskCount}</strong></div><div><span>Serah tugas</span><strong>${portfolio.waitingHandoffCount}</strong></div><div><span>Biaya tercatat</span><strong>${formatIDR(portfolio.expenseTotal, true)}</strong></div></div>
    <section><div class="panel-head"><div><h3>Alur layanan & milestone</h3><p>Susun pekerjaan per spesialis. Progres engagement berasal dari bobot milestone yang selesai.</p></div><button class="inline-action" type="button" data-add-consulting-workstream="${escapeHTML(item.id)}">Tambah layanan</button></div><div class="engagement-workstreams">${item.workstreams.length ? item.workstreams.map((workstream, index) => {
      const status = consultingStatusCopy(workstream.status);
      const done = (workstream.milestones || []).filter((milestone) => milestone.status === "done").length;
      return `<article class="workstream-card"><div class="workstream-card-head"><div class="workstream-index">${index + 1}</div><div><span class="status-badge ${status[1]}">${status[0]}</span><h4>${escapeHTML(workstream.name)}</h4><p>${escapeHTML(workstream.owner)}</p>${workstream.dependency ? `<small>Menunggu/berdasarkan: ${escapeHTML(workstream.dependency)}</small>` : `<small>Dapat dimulai langsung</small>`}</div><strong>${done}/${workstream.milestones.length} milestone</strong></div><div class="milestone-list">${workstream.milestones.length ? workstream.milestones.map((milestone) => { const milestoneStatus = consultingStatusCopy(milestone.status); const nextStatus = milestone.status === "done" ? "open" : "done"; return `<div class="milestone-row"><span class="milestone-check ${milestone.status === "done" ? "is-done" : ""}" aria-hidden="true">${milestone.status === "done" ? "✓" : ""}</span><div><strong>${escapeHTML(milestone.title)}</strong><small>Bobot ${milestone.weight}%${milestone.dueAt ? ` · target ${formatDate(milestone.dueAt, { year: true })}` : ""}${milestone.evidence ? ` · ${escapeHTML(milestone.evidence)}` : ""}</small></div><span class="status-badge ${milestoneStatus[1]}">${milestoneStatus[0]}</span><button class="inline-action" type="button" data-consulting-milestone-status="${escapeHTML(item.id)}" data-milestone-id="${escapeHTML(milestone.id)}" data-workstream-id="${escapeHTML(workstream.id)}" data-next-status="${nextStatus}">${nextStatus === "done" ? "Tandai selesai" : "Buka lagi"}</button></div>`; }).join("") : `<p class="compact-empty">Belum ada milestone. Tambahkan hasil terukur agar progres dapat dihitung.</p>`}</div><div class="workstream-actions"><button class="text-button" type="button" data-add-consulting-milestone="${escapeHTML(item.id)}" data-workstream-id="${escapeHTML(workstream.id)}">+ Milestone</button><button class="text-button" type="button" data-add-consulting-task="${escapeHTML(item.id)}" data-workstream-id="${escapeHTML(workstream.id)}">+ Tugas</button></div></article>`;
    }).join("") : `<div class="engagement-empty-setup"><span>${icon("briefcase")}</span><div><strong>Mulai dari layanan pertama</strong><p>Pisahkan pekerjaan hukum, pajak, keuangan, atau layanan lain agar PIC dan hasilnya jelas.</p></div><button class="primary-button" type="button" data-add-consulting-workstream="${escapeHTML(item.id)}">Tambah layanan</button></div>`}</div></section>
    <section><div class="panel-head"><div><h3>Tugas & assignment</h3><p>Buka satu tugas untuk melihat diskusi, bukti, PIC, dan perpindahan assignment tanpa kehilangan konteks.</p></div></div><div class="consulting-task-list">${tasks.length ? tasks.map(({ workstream, ...task }) => { const taskStatus = consultingStatusCopy(task.status); const commentCount = (task.comments || []).length; return `<article><button class="task-row-main" type="button" data-open-consulting-task="${escapeHTML(item.id)}" data-task-id="${escapeHTML(task.id)}"><span class="eyebrow">${escapeHTML(workstream.name)}</span><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(task.owner)} · target ${formatDate(task.dueAt, { year: true })} · ${commentCount} komentar</small>${task.blocker ? `<p class="task-blocker">Butuh bantuan: ${escapeHTML(task.blocker)}</p>` : ""}</button><div class="consulting-row-actions"><span class="status-badge ${taskStatus[1]}">${taskStatus[0]}</span><button class="inline-action" type="button" data-open-consulting-task="${escapeHTML(item.id)}" data-task-id="${escapeHTML(task.id)}">Buka tugas</button></div></article>`; }).join("") : `<p class="compact-empty">Belum ada tugas. Tambahkan dari layanan yang sesuai supaya konteks dan PIC tidak terlepas.</p>`}</div></section>
    <section><div class="panel-head"><div><h3>Pengeluaran pekerjaan</h3><p>Biaya dicatat pada tugas asalnya dan menunggu keputusan Finance.</p></div><button class="inline-action" type="button" data-add-task-expense="${escapeHTML(item.id)}">Catat pengeluaran</button></div><div class="consulting-expense-list">${expenses.map((expense) => { const status = consultingStatusCopy(expense.financeState); const task = tasks.find((row) => row.id === expense.taskId); const nextState = expense.billingState !== "not_applicable" ? expense.billingState : expense.settlementState; const next = consultingStatusCopy(nextState); return `<article><span><strong>${escapeHTML(expense.description || expense.category)}</strong><small>${escapeHTML(task?.title || "Tugas tidak ditemukan")} · ${escapeHTML(expenseTreatmentCopy(expense.treatment))}</small></span><strong>${formatIDR(expense.amount)}</strong><span><span class="status-badge ${status[1]}">${status[0]}</span>${expense.financeState === "approved" ? `<small>${next[0]}</small>` : ""}</span></article>`; }).join("") || `<p>Belum ada pengeluaran.</p>`}</div></section>
    <aside class="finance-boundary-note"><strong>Batas pencatatan</strong><p>Pengeluaran di sini belum otomatis membayar pemasok, mengganti uang karyawan, mem-posting jurnal, atau menerbitkan invoice. Finance harus memeriksa perlakuannya lebih dulu.</p><button class="secondary-button" type="button" data-view-jump="collection" data-finance-expenses>Buka antrean Finance</button></aside>
    <div class="detail-actions"><button class="text-button" type="button" data-close-detail>Tutup</button><button class="secondary-button" type="button" data-open-account="${escapeHTML(item.accountId)}">Lihat pelanggan 360</button></div></div>`;
  detailDialog.scrollTop = 0;
  if (!detailDialog.open) detailDialog.showModal();
}

function openConsultingTask(engagementId, taskId) {
  const operational = customerPipelineData();
  const engagement = operational.consultingEngagements.find((item) => item.id === engagementId);
  const workstream = engagement?.workstreams?.find((item) => item.tasks?.some((task) => task.id === taskId));
  const task = workstream?.tasks?.find((item) => item.id === taskId);
  if (!engagement || !workstream || !task) return;
  const account = operational.accounts.find((item) => item.id === engagement.accountId);
  const owner = memberById(task.ownerId);
  const taskStatus = consultingStatusCopy(task.status);
  const comments = [...(task.comments || [])].toSorted((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
  const activities = (task.activity || []).slice(0, 6);
  detailDialog.classList.remove("account-detail-dialog");
  detailDialog.classList.add("consulting-detail-dialog", "task-detail-dialog");
  detailDialog.querySelector("#detail-content").innerHTML = `<div class="modal-head task-modal-head"><div><button class="task-back-link" type="button" data-open-engagement="${escapeHTML(engagement.id)}">← Kembali ke progress klien</button><span class="section-kicker">${escapeHTML(account?.name || "Pelanggan")} · ${escapeHTML(workstream.name)}</span><h2 id="detail-title">${escapeHTML(task.title)}</h2></div><button class="icon-button" type="button" data-close-detail aria-label="Tutup detail tugas">${icon("close")}</button></div>
    <div class="detail-body task-detail-workspace">
      <main class="task-conversation">
        <section class="task-outcome-card"><div><span>Target hasil</span><strong>${escapeHTML(engagement.nextMilestone)}</strong><small>Tugas ini bagian dari ${escapeHTML(engagement.title)}.</small></div><span class="status-badge ${taskStatus[1]}">${taskStatus[0]}</span></section>
        ${task.blocker ? `<aside class="task-alert"><strong>Sedang terhambat</strong><p>${escapeHTML(task.blocker)}</p></aside>` : ""}
        ${task.handoff ? `<section class="task-handoff-card"><span>Serah tugas</span><strong>${escapeHTML(task.handoff.fromAssignee)} → ${escapeHTML(task.handoff.toAssignee)}</strong><p>${escapeHTML(task.handoff.reason)}</p><small>${consultingStatusCopy(task.handoff.status)[0]} · batas ${formatDate(task.handoff.dueAt, { year: true })}</small></section>` : ""}
        <section class="task-discussion" aria-labelledby="task-discussion-title"><header><div><h3 id="task-discussion-title">Diskusi tugas</h3><p>Perkembangan dan keputusan tetap menempel pada pekerjaan ini.</p></div><button class="primary-button compact" type="button" data-comment-consulting-task="${escapeHTML(engagement.id)}" data-task-id="${escapeHTML(task.id)}">${icon("plus")} Tulis komentar</button></header><div class="comment-thread">${comments.length ? comments.map((comment) => `<article class="task-comment"><span class="comment-avatar">${escapeHTML(initials(comment.author))}</span><div><header><strong>${escapeHTML(comment.author)}</strong><time>${formatDate(comment.createdAt, { year: true })}</time></header><p>${escapeHTML(comment.body)}</p>${comment.mentions?.length ? `<div class="comment-mentions">${comment.mentions.map((mention) => `<span>@${escapeHTML(mention.name)}</span>`).join("")}</div>` : ""}</div></article>`).join("") : `<div class="discussion-empty"><span>${icon("inbox")}</span><strong>Belum ada diskusi</strong><p>Tulis perkembangan atau mention rekan agar keputusan tidak tercecer di chat pribadi.</p></div>`}</div></section>
      </main>
      <aside class="task-side-panel">
        <section><h3>Detail tugas</h3><dl><div><dt>Penanggung jawab</dt><dd><span class="mini-member-avatar">${escapeHTML(initials(task.owner))}</span><span>${escapeHTML(task.owner)}<small>${escapeHTML(owner?.jobTitle || "Tim Operasional")}</small></span></dd></div><div><dt>Target selesai</dt><dd>${formatDate(task.dueAt, { year: true })}</dd></div><div><dt>Layanan</dt><dd>${escapeHTML(workstream.name)}</dd></div></dl></section>
        <section><h3>Tindakan</h3><div class="task-side-actions"><button class="secondary-button" type="button" data-consulting-task-status="${escapeHTML(engagement.id)}" data-task-id="${escapeHTML(task.id)}" data-next-status="${task.status === "done" ? "open" : escapeHTML(task.status)}">Perbarui status</button>${task.handoff?.status === "awaiting_acceptance" ? `<button class="secondary-button" type="button" data-review-assignment="${escapeHTML(engagement.id)}" data-task-id="${escapeHTML(task.id)}">Periksa serah tugas</button>` : !["done", "cancelled"].includes(task.status) ? `<button class="text-button" type="button" data-handoff-assignment="${escapeHTML(engagement.id)}" data-task-id="${escapeHTML(task.id)}">Serahkan ke PIC lain</button>` : ""}<button class="text-button" type="button" data-add-task-expense="${escapeHTML(engagement.id)}">Catat pengeluaran</button></div></section>
        ${activities.length ? `<section><h3>Aktivitas terakhir</h3><div class="task-activity-list">${activities.map((activity) => `<div><i></i><span><strong>${escapeHTML(userFacingText(activity.kind))}</strong><small>${formatDate(activity.at, { year: true })}</small></span></div>`).join("")}</div></section>` : ""}
      </aside>
    </div>`;
  detailDialog.scrollTop = 0;
  if (!detailDialog.open) detailDialog.showModal();
}

function renderProjectList(projects) {
  return `<section class="project-mobile-list" aria-label="Daftar pekerjaan">${projects.map((item) => renderProjectCard(item)).join("") || emptyState("check", "Belum ada pekerjaan", "Pekerjaan akan muncul setelah serah terima diterima.")}</section>`;
}

function renderProjectCard(item) {
  const account = state.data.accounts.find((account) => account.id === item.accountId);
  const openTasks = (item.tasks || []).filter((task) => task.status !== "done").length;
  return `<article class="project-card"><div><span class="account-mark">${escapeHTML(initials(account?.name))}</span><span class="status-badge running">${item.progress}%</span></div><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(account?.name || "Pelanggan belum dipilih")}</p><div class="progress-track"><i style="width:${Math.max(0, Math.min(100, item.progress))}%"></i></div><small>Berikutnya</small><strong>${escapeHTML(item.nextMilestone)}</strong><footer><span>${escapeHTML(item.owner)} · ${openTasks} tugas</span><time>${formatDate(item.dueAt, { year: true })}</time></footer><button class="inline-action" type="button" data-open-project="${escapeHTML(item.id)}">Buka pekerjaan</button></article>`;
}

function openProject(id) {
  const item = state.data.projects.find((project) => project.id === id);
  if (!item) return;
  const account = state.data.accounts.find((row) => row.id === item.accountId);
  const tasks = item.tasks || [];
  detailDialog.classList.remove("account-detail-dialog");
  detailDialog.querySelector("#detail-content").innerHTML = `<div class="modal-head"><div><span class="section-kicker">Pengelolaan pekerjaan</span><h2 id="detail-title">${escapeHTML(item.name)}</h2><p>${escapeHTML(account?.name || "Pelanggan belum diketahui")} · ${escapeHTML(item.owner)}</p></div><button class="icon-button" type="button" data-close-detail aria-label="Tutup detail">${icon("close")}</button></div><div class="detail-body project-workspace">
    <div class="detail-summary"><div><span>Kemajuan</span><strong>${item.progress}%</strong></div><div><span>Tugas terbuka</span><strong>${tasks.filter((task) => task.status !== "done").length}</strong></div><div><span>Berkas</span><strong>${(item.files || []).length}</strong></div><div><span>Target</span><strong>${formatDate(item.dueAt, { year: true })}</strong></div></div>
    <section><div class="panel-head"><div><h3>Tugas</h3><p>Pemilik dan tenggat setiap pekerjaan.</p></div><button class="inline-action" type="button" data-project-entry="task" data-project-id="${escapeHTML(item.id)}">Tambah tugas</button></div><div class="workspace-list">${tasks.map((task) => `<article><span><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(task.owner)} · ${formatDate(task.dueAt, { year: true })}</small></span><span class="status-badge ${task.status === "done" ? "paid" : "running"}">${task.status === "done" ? "Selesai" : "Terbuka"}</span></article>`).join("") || `<p>Belum ada tugas.</p>`}</div></section>
    <section><div class="panel-head"><div><h3>File kerja</h3><p>Simpan referensi dokumen yang dipakai tim.</p></div><button class="inline-action" type="button" data-project-entry="file" data-project-id="${escapeHTML(item.id)}">Tambah file</button></div><div class="workspace-list">${(item.files || []).map((file) => `<article><span><strong>${escapeHTML(file.name)}</strong><small>${escapeHTML(file.addedBy)} · ${formatDate(file.addedAt, { year: true })}</small></span><a href="${escapeHTML(file.url)}">Buka referensi</a></article>`).join("") || `<p>Belum ada file.</p>`}</div></section>
    <section><div class="panel-head"><div><h3>Diskusi</h3><p>Catatan tetap melekat pada proyek.</p></div><button class="inline-action" type="button" data-project-entry="comment" data-project-id="${escapeHTML(item.id)}">Tambah catatan</button></div><div class="workspace-list">${(item.comments || []).map((comment) => `<article><span><strong>${escapeHTML(comment.author)}</strong><small>${formatDate(comment.at, { year: true })}</small><p>${escapeHTML(comment.body)}</p></span></article>`).join("") || `<p>Belum ada catatan.</p>`}</div></section>
    <div class="detail-actions"><button class="text-button" type="button" data-close-detail>Tutup</button></div></div>`;
  if (!detailDialog.open) detailDialog.showModal();
}

function renderProjectsByCustomer(projects) {
  const groups = new Map();
  projects.forEach((item) => { const key = item.accountId || "unknown"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
  return `<section class="project-customer-groups">${[...groups.entries()].map(([accountId, items]) => { const account = state.data.accounts.find((row) => row.id === accountId); const average = Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length); return `<article class="customer-project-group"><header><span class="account-mark account-mark-lg">${escapeHTML(initials(account?.name))}</span><div><h2>${escapeHTML(account?.name || "Pelanggan belum diketahui")}</h2><p>${items.length} proyek · rata-rata ${average}%</p></div><button type="button" class="secondary-button" data-open-account="${escapeHTML(accountId)}">Lihat pelanggan</button></header><div class="customer-project-list">${items.map((item) => `<div><span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.nextMilestone)}</small></span><div class="progress-track"><i style="width:${Math.max(0, Math.min(100, item.progress))}%"></i></div><span class="status-badge ${item.status === "active" ? "running" : item.status === "review" ? "review" : "paid"}">${item.progress}%</span><time>${formatDate(item.dueAt, { year: true })}</time></div>`).join("")}</div></article>`; }).join("")}</section>`;
}

function renderPartners() {
  const partners = state.data.partners || [];
  const totals = partners.reduce((acc, item) => ({ leads: acc.leads + item.leads, wins: acc.wins + item.wins, revenue: acc.revenue + item.attributedRevenue, accrued: acc.accrued + item.commissionAccrued, paid: acc.paid + item.commissionPaid }), { leads: 0, wins: 0, revenue: 0, accrued: 0, paid: 0 });
  root.innerHTML = `<section class="view" data-rendered-view="partners">
    ${viewHeading("Jaringan mitra", "Mitra tumbuh dengan sumber pendapatan dan komisi yang transparan.", "Database reseller, afiliator, dan mitra referal terhubung ke sumber prospek serta pendapatan yang sudah memiliki bukti.", `<button class="primary-button" type="button" data-create-record="partner">${icon("plus")}<span>Tambah mitra</span></button>`)}
    ${renderAddonBanner("partner_network", "Jaringan Mitra", "Database mitra, referal, performa, komisi, persetujuan, dan pembayaran.")}
    <div class="record-metrics record-metrics-4"><article><span>Prospek mitra</span><strong>${totals.leads}</strong><small>${totals.wins} menjadi pelanggan</small></article><article><span>Pendapatan teratribusi</span><strong>${formatIDR(totals.revenue, true)}</strong><small>Nilai dengan hubungan mitra</small></article><article><span>Komisi tercatat</span><strong>${formatIDR(totals.accrued, true)}</strong><small>Masih memerlukan approval</small></article><article><span>Belum dibayar</span><strong>${formatIDR(Math.max(0, totals.accrued - totals.paid), true)}</strong><small>Bukan piutang pelanggan</small></article></div>
    <section class="surface record-table partner-table"><div class="record-row partner-row record-head"><span>Mitra</span><span>Performa</span><span>Pendapatan</span><span>Komisi</span><span>Status</span></div>${partners.map((item) => `<article class="record-row partner-row"><span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.type)} · ${escapeHTML(item.owner)}</small></span><span><strong>${item.wins} menang / ${item.leads} prospek</strong><small>${item.qualified} layak ditindaklanjuti</small></span><strong>${formatIDR(item.attributedRevenue, true)}</strong><span><strong>${formatIDR(item.commissionAccrued, true)}</strong><small>${formatIDR(item.commissionPaid, true)} dibayar · ${item.commissionRate}%</small></span><span class="record-status-actions"><span class="status-badge ${item.status === "active" ? "paid" : "review"}">${item.status === "active" ? "Aktif" : "Review"}</span><button class="inline-action" type="button" data-open-partner="${escapeHTML(item.id)}">Lihat komisi</button></span></article>`).join("")}</section>
  </section>`;
}

function openPartner(id) {
  const item = state.data.partners.find((partner) => partner.id === id);
  if (!item) return;
  const statusCopy = { pending: ["Menunggu approval", "review"], approved: ["Siap dibayar", "running"], paid: ["Dibayar", "paid"] };
  detailDialog.classList.remove("account-detail-dialog");
  detailDialog.querySelector("#detail-content").innerHTML = `<div class="modal-head"><div><span class="section-kicker">Partner Network</span><h2 id="detail-title">${escapeHTML(item.name)}</h2><p>${escapeHTML(item.type)} · komisi ${item.commissionRate}%</p></div><button class="icon-button" type="button" data-close-detail aria-label="Tutup detail">${icon("close")}</button></div><div class="detail-body"><div class="detail-summary"><div><span>Prospek</span><strong>${item.leads}</strong></div><div><span>Menang</span><strong>${item.wins}</strong></div><div><span>Komisi</span><strong>${formatIDR(item.commissionAccrued, true)}</strong></div><div><span>Dibayar</span><strong>${formatIDR(item.commissionPaid, true)}</strong></div></div><section><div class="panel-head"><div><h3>Ledger komisi</h3><p>Approval wajib didasarkan pada transaksi pelanggan yang terbukti.</p></div></div><div class="workspace-list">${(item.commissions || []).map((commission) => { const copy = statusCopy[commission.status] || [commission.status, "review"]; return `<article><span><strong>${escapeHTML(commission.revenueRef)}</strong><small>${formatIDR(commission.baseAmount)} × ${commission.rate}% = ${formatIDR(commission.amount)}</small></span><span class="record-status-actions"><span class="status-badge ${copy[1]}">${copy[0]}</span>${commission.status === "pending" ? `<button class="inline-action" type="button" data-commission-action="approve" data-partner-id="${escapeHTML(item.id)}" data-commission-id="${escapeHTML(commission.id)}">Setujui</button>` : commission.status === "approved" ? `<button class="inline-action" type="button" data-commission-action="pay" data-partner-id="${escapeHTML(item.id)}" data-commission-id="${escapeHTML(commission.id)}">Catat payout</button>` : ""}</span></article>`; }).join("") || `<p>Belum ada komisi.</p>`}</div></section><div class="detail-actions"><button class="text-button" type="button" data-close-detail>Tutup</button></div></div>`;
  if (!detailDialog.open) detailDialog.showModal();
}

function repeatStatusCopy(status) {
  return {
    dormant: ["Sudah lama tidak kembali", "overdue"],
    due: ["Waktunya ditinjau", "review"],
    in_progress: ["Sudah ditindaklanjuti", "running"],
    upcoming: ["Belum waktunya", "paid"]
  }[status] || [status, "review"];
}

function renderRepeatOrder() {
  if (customerPipelineUsesServer()) {
    root.innerHTML = `<section class="view retention-view" data-rendered-view="repeat">
      ${viewHeading("Repeat order", "Hubungi lagi saat konteksnya masuk akal.", "Riwayat pembelian belum menjadi bagian dari data server staging.", `<button class="secondary-button" type="button" data-view-jump="relationships">Lihat database pelanggan</button>`)}
      ${sampleModuleBoundary("Repeat order")}
      ${emptyState("refresh", "Belum ada riwayat pembelian live", "Modul tetap terlihat, tetapi rekomendasi tidak dibuat dari data contoh saat workspace server aktif.")}
    </section>`;
    return;
  }
  const all = buildRepeatOrderCenter(state.data, { reorderDays: 90, dormantDays: 120 }, new Date());
  const attention = all.filter((item) => ["dormant", "due"].includes(item.status));
  const items = state.repeatFilter === "all" ? all : state.repeatFilter === "attention" ? attention : all.filter((item) => item.status === state.repeatFilter);
  const count = (status) => all.filter((item) => item.status === status).length;
  root.innerHTML = `<section class="view retention-view" data-rendered-view="repeat">
    ${viewHeading("Repeat order", "Hubungi lagi saat konteksnya masuk akal.", "DEKTA membaca riwayat pembelian untuk membantu tim meninjau kebutuhan berikutnya. Rekomendasi tidak otomatis menjadi peluang penjualan.", `<button class="secondary-button" type="button" data-view-jump="relationships">Lihat database pelanggan</button>`)}
    <aside class="policy-note">${icon("alert")}<div><strong>Aturan sampel yang dipakai</strong><p>Ditinjau setelah 90 hari; dianggap lama tidak kembali setelah 120 hari. Tim tetap harus membaca riwayat dan mengonfirmasi kebutuhan pelanggan.</p></div>${helpTip("Aturan ini hanya asumsi prototype. Di staging, siklus perlu dapat diatur per produk, layanan, dan segmen pelanggan.")}</aside>
    <div class="record-metrics record-metrics-4 retention-metrics"><article><span>Perlu ditinjau</span><strong>${attention.length}</strong><small>Ada dasar transaksi lama</small></article><article><span>Sudah lama</span><strong>${count("dormant")}</strong><small>Lewat 120 hari</small></article><article><span>Sedang ditindaklanjuti</span><strong>${count("in_progress")}</strong><small>Signal pelanggan lama terbuka</small></article><article><span>Belum waktunya</span><strong>${count("upcoming")}</strong><small>Masih dalam perkiraan siklus</small></article></div>
    <div class="toolbar"><div class="filter-group">${[["attention", "Perlu perhatian"], ["dormant", "Sudah lama"], ["due", "Jatuh tempo"], ["in_progress", "Ditindaklanjuti"], ["all", "Semua"]].map(([value, label]) => `<button class="chip-button ${state.repeatFilter === value ? "is-active" : ""}" type="button" data-repeat-filter="${value}">${label}</button>`).join("")}</div><span class="result-count">${items.length} pelanggan</span></div>
    <section class="retention-list" aria-label="Rekomendasi repeat order">${items.length ? items.map((item) => { const copy = repeatStatusCopy(item.status); return `<article class="surface retention-card"><div class="retention-identity"><span class="account-mark account-mark-lg">${escapeHTML(initials(item.account.name))}</span><div><span class="status-badge ${copy[1]}">${copy[0]}</span><h2>${escapeHTML(item.account.name)}</h2><p>${escapeHTML(item.account.segment || "Belum disegmentasi")}</p></div></div><div class="retention-purchase"><small>Pembelian terakhir</small><strong>${escapeHTML(item.latest.service)}</strong><span>${formatDate(item.latest.completedAt, { year: true })} · ${formatIDR(item.latest.amount, true)}</span><em>${escapeHTML(item.latest.sourceReference || "Referensi belum tersedia")}</em></div><div class="retention-reason"><small>Mengapa muncul?</small><strong>${escapeHTML(item.reason)}</strong><span>Perkiraan siklus ${item.latest.reorderCycleDays || 90} hari · ${item.history.length} transaksi tersimpan</span></div><div class="retention-actions"><button class="text-button" type="button" data-open-account="${escapeHTML(item.account.id)}">Lihat riwayat</button>${item.openSignalId ? `<button class="primary-button" type="button" data-triage-signal="${escapeHTML(item.openSignalId)}">Lanjutkan review</button>` : `<button class="primary-button" type="button" data-open-expansion="${escapeHTML(item.account.id)}">Catat kebutuhan baru</button>`}</div></article>`; }).join("") : emptyState("check", "Tidak ada pelanggan di filter ini", "Coba lihat semua pelanggan atau tunggu sampai siklus berikutnya.")}</section>
  </section>`;
}

function notificationEntries() {
  const operational = customerPipelineData();
  const preferences = state.data.notificationPreferences || {};
  const now = new Date();
  return buildNotificationCenter(operational, { reorderDays: 90, dormantDays: 120 }, now).filter((item) => preferences[item.type] !== false).map((item) => {
    const saved = state.data.notificationState?.[item.id] || {};
    const snoozed = saved.snoozedUntil && new Date(saved.snoozedUntil) > now;
    return { ...item, saved, snoozed, read: Boolean(saved.readAt) };
  });
}

function renderNotifications() {
  const all = notificationEntries();
  const items = all.filter((item) => state.notificationFilter === "all" || (state.notificationFilter === "unread" && !item.read && !item.snoozed) || (state.notificationFilter === "snoozed" && item.snoozed) || item.type === state.notificationFilter);
  const unread = all.filter((item) => !item.read && !item.snoozed).length;
  const preferences = state.data.notificationPreferences || {};
  const typeCopy = { followup: "Tindak lanjut", invoice: "Tagihan", contract: "Kontrak", project: "Pekerjaan", repeat: "Repeat order" };
  root.innerHTML = `<section class="view notification-view" data-rendered-view="notifications">
    ${viewHeading("Notifikasi", "Satu tempat untuk hal yang tidak boleh terlewat.", "Setiap pengingat berasal dari data sumber. Tandai dibaca, tunda, atau naikkan menjadi perhatian internal—tanpa mengirim pesan otomatis ke pelanggan.")}
    <div class="notification-layout"><section><div class="toolbar"><div class="filter-group">${[["unread", `Belum dibaca (${unread})`], ["snoozed", "Ditunda"], ["followup", "Tindak lanjut"], ["invoice", "Tagihan"], ["repeat", "Repeat order"], ["all", "Semua"]].map(([value, label]) => `<button class="chip-button ${state.notificationFilter === value ? "is-active" : ""}" type="button" data-notification-filter="${value}">${label}</button>`).join("")}</div></div><div class="notification-list">${items.length ? items.map((item) => `<article class="notification-card ${item.read ? "is-read" : ""} ${item.priority === "high" ? "is-high" : ""}"><span class="notification-icon">${icon(item.type === "repeat" ? "refresh" : item.type === "invoice" || item.type === "contract" ? "file" : "alert")}</span><div class="notification-copy"><div><span>${escapeHTML(typeCopy[item.type] || item.type)}</span>${item.saved.escalatedAt ? `<em>Perhatian internal</em>` : ""}</div><h2>${escapeHTML(item.title)}</h2><p>${escapeHTML(item.detail)}</p><small>${item.snoozed ? `Ditunda sampai ${formatDate(item.saved.snoozedUntil, { year: true })}` : `Sumber jatuh tempo ${formatDate(item.dueAt, { year: true })}`}</small></div><div class="notification-actions"><button class="primary-button" type="button" data-notification-open="${escapeHTML(item.id)}" data-target-view="${escapeHTML(item.view)}">Buka sumber</button>${!item.read ? `<button class="text-button" type="button" data-notification-action="read" data-notification-id="${escapeHTML(item.id)}">Tandai dibaca</button>` : ""}<button class="text-button" type="button" data-notification-action="snooze" data-notification-id="${escapeHTML(item.id)}">Tunda 1 hari</button>${!item.saved.escalatedAt ? `<button class="text-button" type="button" data-notification-action="escalate" data-notification-id="${escapeHTML(item.id)}">Jadikan perhatian</button>` : ""}</div></article>`).join("") : emptyState("check", "Tidak ada notifikasi di sini", "Semua pekerjaan pada filter ini sudah ditinjau.")}</div></section><aside class="surface notification-preferences"><div class="panel-head"><div><h2>Jenis pengingat</h2><p>Pilih yang ingin muncul di dalam DEKTA.</p></div>${helpTip("Preferensi ini hanya mengatur pusat notifikasi prototype. WhatsApp dan email belum terhubung.")}</div><div class="preference-list">${Object.entries(typeCopy).map(([value, label]) => `<label><span><strong>${label}</strong><small>Dari status dan tanggal pada data sumber.</small></span><input type="checkbox" data-notification-preference="${value}" ${preferences[value] !== false ? "checked" : ""} /></label>`).join("")}</div><div class="external-channel-note"><strong>Email & WhatsApp belum aktif</strong><p>Integrasi eksternal membutuhkan consent, template, delivery log, retry, dan opt-out sebelum boleh digunakan.</p></div></aside></div>
  </section>`;
}

function renderReports() {
  const operational = customerPipelineData();
  const snapshot = buildReportSnapshot(operational, { days: state.reportDays, owner: state.reportOwner, reorderDays: 90, dormantDays: 120 }, new Date());
  const owners = [...new Set(operational.opportunities.map((item) => item.owner).filter(Boolean))];
  const schedules = customerPipelineUsesServer() ? [] : (state.data.reportSchedules || []);
  root.innerHTML = `<section class="view report-view" data-rendered-view="reports">
    ${viewHeading("Laporan", "Angka untuk mengambil keputusan, bukan sekadar ramai.", "Setiap metrik menyebutkan sumber dan batasnya. Nilai peluang, kontrak, dan uang masuk tetap dipisahkan.", `<button class="primary-button" type="button" data-export-report>${icon("trend")}<span>Ekspor CSV</span></button>`)}
    <div class="surface report-controls"><div><span class="section-kicker">Periode</span><div class="filter-group">${[["30", "30 hari"], ["90", "90 hari"], ["all", "Semua waktu"]].map(([value, label]) => `<button class="chip-button ${state.reportDays === value ? "is-active" : ""}" type="button" data-report-days="${value}">${label}</button>`).join("")}</div></div><label><span>PIC peluang</span><select data-report-owner><option value="all">Semua PIC</option>${owners.map((owner) => `<option ${state.reportOwner === owner ? "selected" : ""}>${escapeHTML(owner)}</option>`).join("")}</select></label><p>Data sampai ${formatDate(snapshot.window.until, { year: true })}</p></div>
    <div class="report-kpis">${dashboardMetric("Signal masuk", String(snapshot.counts.signals), `${snapshot.counts.qualified} menjadi peluang`, "Signal berdasarkan tanggal masuk dalam periode terpilih.", "accent", "inbox")}${dashboardMetric("Pipeline aktif", formatIDR(snapshot.values.pipeline, true), `${snapshot.counts.activePipeline} peluang aktif`, "Perkiraan nilai peluang aktif atau on hold. Belum menjadi kontrak.", "", "pipeline")}${dashboardMetric("Terkontrak", formatIDR(snapshot.values.contracted, true), `${snapshot.counts.won} komitmen dalam periode`, "Nilai opportunity won dengan bukti komitmen pada periode terpilih.", "accent", "file")}${dashboardMetric("Ditagihkan", formatIDR(snapshot.values.invoiced, true), "Invoice terbit dalam periode", "Total invoice berdasarkan tanggal terbit. Belum berarti dibayar.", "", "file")}${dashboardMetric("Belum dibayar", formatIDR(snapshot.values.receivable, true), "Outstanding dari invoice periode", "Sisa invoice dalam periode setelah seluruh pembayaran terkait diperhitungkan.", "warning", "clock")}${dashboardMetric("Pembayaran diterima", formatIDR(snapshot.values.collected, true), "Berdasarkan tanggal pembayaran", "Kas yang benar-benar dicatat diterima. Tidak sama dengan nilai invoice.", "success", "check")}${dashboardMetric("Repeat perlu ditinjau", String(snapshot.counts.repeatDue), "Seluruh workspace", "Pelanggan melewati siklus repeat dan belum memiliki signal lanjutan terbuka. Metrik ini belum dipengaruhi filter periode atau PIC.", "warning", "refresh")}</div>
    <div class="report-grid"><section class="surface report-source"><div class="panel-head"><div><h2>Kualitas sumber calon pelanggan</h2><p>Signal dan konversi pada periode terpilih.</p></div><button class="text-button" type="button" data-view-jump="signals">Buka calon pelanggan</button></div><div class="report-table"><div class="report-row report-head"><span>Sumber</span><span>Signal</span><span>Menjadi peluang</span><span>Rasio</span></div>${snapshot.sources.length ? snapshot.sources.map((item) => `<div class="report-row"><strong>${escapeHTML(item.source)}</strong><span>${item.signals}</span><span>${item.qualified}</span><strong>${item.signals ? Math.round(item.qualified / item.signals * 100) : 0}%</strong></div>`).join("") : `<p class="report-empty">Belum ada signal pada periode ini.</p>`}</div></section><aside class="surface report-schedule"><div class="panel-head"><div><h2>Jadwal laporan</h2><p>Simpan konfigurasi review rutin.</p></div><button class="inline-action" type="button" data-create-record="report_schedule">Tambah</button></div><div class="schedule-list">${schedules.map((item) => `<article><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.frequency)} · ${escapeHTML(item.owner)}</small></span><span class="status-badge review">Siap di DEKTA</span></article>`).join("") || `<p>Belum ada jadwal.</p>`}</div><div class="external-channel-note"><strong>Belum mengirim otomatis</strong><p>Jadwal hanya menyimpan konfigurasi. Pengiriman email/PDF memerlukan worker, otorisasi penerima, dan delivery log di staging.</p></div></aside></div>
  </section>`;
}

function exportReportCSV() {
  const snapshot = buildReportSnapshot(customerPipelineData(), { days: state.reportDays, owner: state.reportOwner, reorderDays: 90, dormantDays: 120 }, new Date());
  const rows = [["Metrik", "Nilai", "Definisi"], ["Signal masuk", snapshot.counts.signals, "Tanggal capturedAt dalam periode"], ["Signal menjadi peluang", snapshot.counts.qualified, "Status converted dalam periode"], ["Peluang aktif", snapshot.counts.activePipeline, "Status active atau on_hold"], ["Nilai pipeline", snapshot.values.pipeline, "Bukan kontrak atau kas"], ["Nilai terkontrak", snapshot.values.contracted, "Won dalam periode"], ["Nilai ditagihkan", snapshot.values.invoiced, "Invoice issuedAt dalam periode"], ["Belum dibayar", snapshot.values.receivable, "Outstanding invoice yang terbit dalam periode"], ["Pembayaran diterima", snapshot.values.collected, "Payment receivedAt dalam periode"], ["Repeat perlu ditinjau", snapshot.counts.repeatDue, "Due atau dormant tanpa signal terbuka"]];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const blob = new Blob([rows.map((row) => row.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `dekta-laporan-${state.reportDays}hari-${dateInputAfter(0)}.csv`; link.click(); URL.revokeObjectURL(link.href);
  showToast("Laporan diekspor bersama definisi metriknya.");
}

function renderReferenceSettings() {
  const audit = state.data.research?.layanaAudit;
  const filters = [
    ["all", "Semua"],
    ["implemented", "Sudah diadaptasi"],
    ["partial", "Parsial"],
    ["next", "Berikutnya"],
    ["gated", "Production gate"]
  ];
  const allItems = audit?.items || [];
  const search = normalize(state.search);
  const items = allItems.filter((item) => {
    const matchesFilter = state.adaptationFilter === "all" || item.status === state.adaptationFilter;
    const matchesSearch = !search || normalize(`${item.layanaConcept} ${item.observed} ${item.decision} ${item.growthForm} ${item.control}`).includes(search);
    return matchesFilter && matchesSearch;
  });
  const counts = Object.fromEntries(["implemented", "partial", "next", "gated"].map((status) => [status, allItems.filter((item) => item.status === status).length]));

  return `
    <section class="adaptation-view">
      ${viewHeading("Catatan pengembangan", "Yang dipelajari dan diperkuat.", "Perbandingan pola yang terlihat di CRM Layana dengan bentuk yang diterapkan pada workspace pelanggan ini.")}

      <aside class="evidence-boundary" aria-label="Batas bukti audit">
        <span class="evidence-icon">${icon("check")}</span>
        <div><strong>Berdasarkan audit UI terautentikasi · 30 Agustus 2026</strong><p>${escapeHTML(audit?.evidenceBoundary || "Batas bukti belum tersedia.")}</p></div>
        <span class="evidence-coverage">${escapeHTML(audit?.coverage || "")}</span>
      </aside>

      <section class="adaptation-summary" aria-label="Ringkasan keputusan adaptasi">
        ${adaptationMetric("implemented", counts.implemented, "Sudah diadaptasi", "Masuk workflow inti")}
        ${adaptationMetric("partial", counts.partial, "Parsial", "Batas makna sudah ada")}
        ${adaptationMetric("next", counts.next, "Berikutnya", "Setelah core stabil")}
        ${adaptationMetric("gated", counts.gated, "Production gate", "Tidak disalin mentah")}
      </section>

      <div class="toolbar adaptation-toolbar">
        <div class="filter-group" aria-label="Filter status adaptasi">${filters.map(([value, label]) => `<button class="chip-button ${state.adaptationFilter === value ? "is-active" : ""}" type="button" data-adaptation-filter="${value}">${label}</button>`).join("")}</div>
        <span class="result-count">${items.length} dari ${allItems.length} konsep</span>
      </div>

      <section class="surface adaptation-surface" aria-labelledby="adaptation-table-title">
        <div class="panel-head adaptation-panel-head"><div><h2 id="adaptation-table-title">Referensi CRM → DEKTA</h2><p>Keputusan produk, bukan checklist penyalinan fitur.</p></div><span class="adaptation-rule">Adaptasi dengan kontrol</span></div>
        ${items.length ? `
          <div class="adaptation-table-wrap">
            <table class="adaptation-table">
              <thead><tr><th>Konsep referensi</th><th>Yang terlihat</th><th>Keputusan</th><th>Bentuk di DEKTA</th><th>Status</th><th>Kontrol / alasan</th></tr></thead>
              <tbody>${items.map(renderAdaptationRow).join("")}</tbody>
            </table>
          </div>` : emptyState("search", "Tidak ada hasil", "Ubah filter atau kata pencarian untuk melihat konsep adaptasi lain.")}
      </section>
    </section>`;
}

function adaptationMetric(status, value, label, caption) {
  return `<article class="adaptation-metric ${status}"><span>${escapeHTML(label)}</span><strong>${value}</strong><small>${escapeHTML(caption)}</small></article>`;
}

function renderAdaptationRow(item) {
  return `
    <tr>
      <td data-label="Konsep Layana"><strong class="adaptation-concept">${escapeHTML(item.layanaConcept)}</strong></td>
      <td data-label="Yang terlihat"><p>${escapeHTML(item.observed)}</p></td>
      <td data-label="Keputusan"><span class="decision-badge">${escapeHTML(item.decision)}</span></td>
      <td data-label="Bentuk di DEKTA"><strong class="growth-form">${escapeHTML(item.growthForm)}</strong></td>
      <td data-label="Status"><span class="adaptation-status ${escapeHTML(item.status)}"><i></i>${escapeHTML(item.statusLabel)}</span></td>
      <td data-label="Kontrol / alasan"><p class="control-copy">${escapeHTML(item.control)}</p></td>
    </tr>`;
}

function settingsStatusLabel(status) {
  const copy = {
    active: "Aktif",
    trialing: "Trial",
    active_preview: "Aktif · preview",
    trial_preview: "Trial add-on",
    not_connected: "Belum terhubung",
    verification_required: "Perlu verifikasi",
    draft: "Draft",
    awaiting_human_review: "Menunggu review",
    approved_for_manual_action: "Disetujui · manual",
    dismissed: "Ditolak"
  };
  return copy[status] || status;
}

function renderTeamSettings() {
  const roleMap = Object.fromEntries(ROLE_CATALOG.map((role) => [role.id, role]));
  const serverBacked = customerPipelineUsesServer();
  const members = serverBacked
    ? (state.dataAuthority.snapshot?.members || []).map((member) => ({ ...member, id: member.userId, name: member.displayName || member.email || "Anggota", lastActiveAt: member.lastActiveAt || member.createdAt }))
    : state.data.memberships;
  return `<section class="control-section"><div class="control-section-head"><div><span class="section-kicker">1 · User & role</span><h2>Tim bekerja sesuai kewenangannya</h2><p>Role mengikuti fungsi kerja. Perubahan akses menyimpan alasan dan jejak pelaku.</p></div><button class="primary-button" type="button" data-create-record="member_invite">${icon("plus")}<span>Undang anggota</span></button></div>
    <div class="control-list">${members.map((member) => `<article class="member-row"><span class="member-avatar">${initials(member.name)}</span><div><strong>${escapeHTML(member.name)}</strong><small>${escapeHTML(member.email || "Email belum tersedia")}${member.lastActiveAt ? ` · aktif ${formatDate(member.lastActiveAt)}` : ""}</small></div><div class="role-tags">${(member.roles || []).map((role) => `<span>${escapeHTML(roleMap[role]?.label || role)}</span>`).join("")}</div><span class="status-badge paid">${member.status === "active" ? "Aktif" : escapeHTML(member.status || "Aktif")}</span>${serverBacked ? `<span class="inline-help">Perubahan role via server menyusul</span>` : `<button class="secondary-button" type="button" data-create-record="role_change" data-record-target="${escapeHTML(member.id)}">Atur akses</button>`}</article>`).join("")}</div>
    <aside class="control-note"><strong>Default deny</strong><p>Menu yang terlihat bukan bukti izin. API produksi tetap wajib memeriksa organisasi, role, resource, dan action pada setiap request.</p></aside></section>`;
}

function renderWorkspaceModuleSettings() {
  const modules = [...state.data.workspaceModules].sort((left, right) => left.order - right.order);
  const visibleCount = modules.filter((module) => module.visible).length;
  return `<section class="control-section"><div class="control-section-head"><div><span class="section-kicker">1 · Komposisi workspace</span><h2>Menu mengikuti cara perusahaan bekerja</h2><p>Semua modul dan add-on ditampilkan sebagai titik awal. Owner dapat menyusun urutan atau menyembunyikan yang belum dipakai tanpa menghapus data.</p></div><span class="workspace-count">${visibleCount}/${modules.length} menu terlihat</span></div>
    <aside class="control-note"><strong>Aman untuk berubah</strong><p>Menyembunyikan menu bukan menghapus record, bukan mencabut entitlement, dan bukan mengganti permission. Hari ini dan Pusat kontrol selalu tersedia sebagai jalur pulih.</p></aside>
    <div class="workspace-module-list" aria-label="Susunan modul workspace">${modules.map((module, index) => {
      const featureCounts = (module.features || []).reduce((result, feature) => ({ ...result, [feature.status]: (result[feature.status] || 0) + 1 }), {});
      return `<article class="workspace-module-row ${module.visible ? "" : "is-hidden-module"}">
        <span class="module-drag-index" aria-hidden="true">${String(module.order).padStart(2, "0")}</span>
        <div class="workspace-module-copy"><div class="workspace-module-title"><strong>${escapeHTML(module.label)}</strong><span class="module-tier ${module.tier}">${module.tier === "addon" ? "Add-on" : module.tier === "system" ? "Sistem" : "Core"}</span>${module.required ? `<span class="module-required">Wajib</span>` : ""}</div><p>${escapeHTML(module.purpose)}</p><details><summary>${module.features.length} kemampuan · ${featureCounts.available || 0} tersedia</summary><div class="module-feature-list">${module.features.map((feature) => `<span class="feature-state ${escapeHTML(feature.status)}">${escapeHTML(feature.label)} · ${feature.status === "available" ? "tersedia" : feature.status === "planned" ? "direncanakan" : "perlu integrasi"}</span>`).join("")}</div></details></div>
        <span class="module-visibility ${module.visible ? "visible" : "hidden"}">${module.visible ? "Tampil" : "Disembunyikan"}</span>
        <div class="module-order-actions" aria-label="Atur posisi ${escapeHTML(module.label)}"><button type="button" class="icon-button" data-module-action="up" data-module-code="${escapeHTML(module.code)}" aria-label="Naikkan ${escapeHTML(module.label)}" title="Naikkan satu posisi" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" class="icon-button" data-module-action="down" data-module-code="${escapeHTML(module.code)}" aria-label="Turunkan ${escapeHTML(module.label)}" title="Turunkan satu posisi" ${index === modules.length - 1 ? "disabled" : ""}>↓</button></div>
        <button type="button" class="secondary-button" data-module-action="toggle" data-module-code="${escapeHTML(module.code)}" ${module.required ? "disabled" : ""}>${module.required ? "Selalu tampil" : module.visible ? "Sembunyikan" : "Tampilkan"}</button>
      </article>`;
    }).join("")}</div>
    <aside class="control-note"><strong>Kontrol fitur per modul</strong><p>Katalog kemampuan sudah dipisahkan per modul dan statusnya terlihat. CRUD fitur, preset per industri, serta entitlement per paket menjadi lapisan berikutnya setelah nama dan batas fitur disetujui owner.</p></aside>
    ${state.data.workspaceModuleAudit.length ? `<div class="workspace-audit"><div class="panel-head"><div><h2>Perubahan terbaru</h2><p>Jejak perubahan komposisi workspace lokal.</p></div></div>${state.data.workspaceModuleAudit.slice(0, 5).map((entry) => `<article><span>${formatDate(entry.at, { year: true })}</span><strong>${escapeHTML(modules.find((module) => module.code === entry.moduleCode)?.label || entry.moduleCode)}</strong><p>${escapeHTML(entry.reason)}</p><small>${escapeHTML(entry.actor)} · data tidak dihapus</small></article>`).join("")}</div>` : ""}</section>`;
}

function renderDataAuthoritySettings() {
  const authority = state.dataAuthority;
  const failClosed = operationalFallbackHidesSample();
  const labels = {
    checking: "Memeriksa",
    local_only: "Sintetis lokal",
    api_unreachable: "API tidak terjangkau",
    api_not_ready: "Database belum siap",
    authentication_required: "Perlu login staging",
    api_denied: "Akses ditolak",
    foundation_connected: "Fondasi server siap",
    customer_pipeline_connected: "Operasi inti tersambung",
    connected: "Terhubung ke staging"
  };
  const values = authority.summary?.values;
  const snapshot = authority.snapshot;
  return `<section class="control-section"><div class="control-section-head"><div><span class="section-kicker">Data authority</span><h2>Satu sumber kebenaran, tanpa dual write</h2><p>Halaman ini membedakan data sampel browser dan data PostgreSQL staging sebelum tim memasukkan data nyata.</p></div><span class="workspace-count">${escapeHTML(labels[authority.status] || authority.status)}</span></div>
    <article class="subscription-hero data-authority-hero"><div><span>Mode aktif</span><h3>${authority.status === "customer_pipeline_connected" ? "Pelanggan, pipeline & pekerjaan nyata" : authority.status === "foundation_connected" ? "Transisi terkontrol" : failClosed ? "Data operasional disembunyikan" : authority.mode === "staging" ? "Server-authoritative" : "Synthetic prototype"}</h3><p>${escapeHTML(authority.reason)}</p></div><div><span>Endpoint</span><strong>${escapeHTML(authority.base || "Belum dikonfigurasi")}</strong><small>Browser tidak menyimpan token staging atau kredensial database.</small></div></article>
    ${values ? `<div class="data-authority-values">${[["Pipeline", values.pipeline], ["Terkontrak", values.contracted], ["Ditagihkan", values.invoiced], ["Piutang", values.receivable], ["Kas diterima", values.collected]].map(([label, value]) => `<article><span>${label}</span><strong>${formatIDR(value)}</strong></article>`).join("")}</div>` : ""}
    ${snapshot ? `<div class="data-authority-values">${[["Pelanggan server", snapshot.accounts?.length || 0], ["Peluang server", snapshot.opportunities?.length || 0], ["Kontrak server", snapshot.contracts?.length || 0], ["Invoice server", snapshot.invoices?.length || 0], ["Audit server", snapshot.auditEvents?.length || 0]].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join("")}</div>` : ""}
    <div class="data-authority-actions"><button class="secondary-button" type="button" data-refresh-api>${icon("refresh")}<span>Periksa ulang koneksi</span></button><p>${failClosed ? "Workspace kosong/impor tidak beralih ke data contoh ketika server gagal. Pulihkan koneksi untuk membaca data operasional." : "Mode contoh tetap lokal dan tidak mengirim perubahan apa pun saat server belum tersedia."}</p></div>
    <aside class="control-note"><strong>Batas implementasi saat ini</strong><p>Pelanggan, pipeline, keputusan menang, kontrak aktif, pekerjaan pelanggan, invoice, pembayaran, engagement konsultasi, tugas, komentar/mention internal, serah tugas, serta review biaya sudah server-authoritative. Draft dan versi kontrak, jadwal tagihan recurring, penyimpanan file, komunikasi eksternal, dan UAT role-negatif tetap menjadi gate berikutnya.</p></aside></section>`;
}

async function refreshDataAuthority({ rerender = true } = {}) {
  state.dataAuthority = await inspectDataAuthority();
  const note = document.querySelector(".system-note");
  if (note) {
    const title = note.querySelector("strong");
    const caption = note.querySelector("span:not(.system-pulse)");
    if (title) title.textContent = state.dataAuthority.status === "connected" ? "Staging terhubung" : state.dataAuthority.status === "customer_pipeline_connected" ? "Operasi inti tersimpan" : state.dataAuthority.status === "foundation_connected" ? "Full stack lokal siap" : operationalFallbackHidesSample() ? "Server belum tersedia" : "Prototype lokal";
    if (caption) caption.textContent = state.dataAuthority.status === "connected" ? "PostgreSQL · server-authoritative" : state.dataAuthority.status === "customer_pipeline_connected" ? "Pelanggan · pipeline · pekerjaan" : state.dataAuthority.status === "foundation_connected" ? "API + database · UI masih sampel" : operationalFallbackHidesSample() ? "Data operasional disembunyikan · server belum siap" : "Data sampel · belum live";
  }
  const announcement = document.querySelector("#data-authority-announcement");
  if (announcement) announcement.textContent = state.dataAuthority.status === "customer_pipeline_connected"
    ? "Operasi inti pelanggan hingga pembayaran tersimpan di server; fitur preview selalu diberi penanda"
    : operationalFallbackHidesSample()
      ? "Data operasional belum tersedia; data contoh disembunyikan agar tidak tertukar dengan workspace perusahaan"
      : "Data contoh; belum terhubung ke server";
  if (rerender) render();
}

function renderSubscriptionSettings() {
  const trial = calculateTrialState(state.data.subscription, new Date());
  const current = state.data.planCatalog.find((plan) => plan.code === state.data.subscription.planCode);
  return `<section class="control-section"><div class="control-section-head"><div><span class="section-kicker">2 · Paket & entitlement</span><h2>Coba dulu, pilih paket setelah terasa manfaatnya</h2><p>Status trial, paket, add-on, invoice SaaS, dan hak fitur dipisahkan supaya tidak rancu.</p></div><span class="trial-pill">${trial.state === "trialing" ? `${trial.daysRemaining} hari trial tersisa` : settingsStatusLabel(trial.state)}</span></div>
    <article class="subscription-hero"><div><span>Paket saat ini</span><h3>${escapeHTML(current?.name || state.data.subscription.planCode)}</h3><p>${escapeHTML(current?.description || "")}</p></div><div><span>Status</span><strong>${settingsStatusLabel(state.data.subscription.status)}</strong><small>Aktivasi berbayar menunggu event provider yang terverifikasi.</small></div></article>
    <div class="plan-grid">${state.data.planCatalog.map((plan) => `<article class="plan-card ${plan.code === state.data.subscription.planCode ? "is-current" : ""}"><span>${plan.code === state.data.subscription.planCode ? "Sedang digunakan" : "Pilihan paket"}</span><h3>${escapeHTML(plan.name)}</h3><p>${escapeHTML(plan.description)}</p><ul>${plan.features.map((feature) => `<li>${icon("check")}${escapeHTML(feature)}</li>`).join("")}</ul><strong class="price-pending">Harga menunggu keputusan komersial</strong>${plan.code === state.data.subscription.planCode ? "" : `<button class="secondary-button" type="button" data-create-record="plan_change" data-record-target="${escapeHTML(plan.code)}">Ajukan perubahan</button>`}</article>`).join("")}</div>
    <div class="addon-control"><div class="panel-head"><div><h2>Add-on workspace</h2><p>Semua add-on tetap terlihat di menu agar owner bisa menilai alur lengkapnya. Status preview dan visibilitas menu diatur terpisah.</p></div>${helpTip("Entitlement produksi hanya boleh berasal dari subscription dan bukti pembayaran yang terverifikasi server. Menyembunyikan menu juga tidak menghapus data add-on.")}</div>${state.data.addons.map((addon) => `<article><div><strong>${escapeHTML(addon.name)}</strong><p>${escapeHTML(addon.description)}</p></div><span class="status-badge review">${settingsStatusLabel(addon.status)}</span><button class="text-button" type="button" data-toggle-addon="${escapeHTML(addon.code)}">${addon.status === "inactive" ? "Aktifkan preview" : "Nonaktifkan preview"}</button></article>`).join("")}</div></section>`;
}

function renderDocumentSettings() {
  return `<section class="control-section"><div class="control-section-head"><div><span class="section-kicker">3 · Document automation</span><h2>Dokumen dibuat dari record yang bisa ditelusuri</h2><p>Template mempercepat draft, bukan menggantikan review isi, approval, PDF resmi, atau e-sign.</p></div><button class="primary-button" type="button" data-create-record="document_generate">${icon("plus")}<span>Buat draft</span></button></div>
    <div class="template-grid">${state.data.documentTemplates.map((template) => `<article><span>${escapeHTML(template.type)}</span><h3>${escapeHTML(template.name)}</h3><p>${template.requiredVariables.length} variabel wajib · selalu mulai sebagai draft</p></article>`).join("")}</div>
    <div class="document-list"><div class="document-row document-head"><span>Dokumen</span><span>Sumber</span><span>Versi</span><span>Status</span><span>Aksi</span></div>${state.data.generatedDocuments.length ? state.data.generatedDocuments.map((document) => `<div class="document-row"><span><strong>${escapeHTML(document.title)}</strong><small>${formatDate(document.createdAt, { year: true })} · ${escapeHTML(document.createdBy)}</small></span><code>${escapeHTML(document.sourceType)}:${escapeHTML(document.sourceId)}</code><strong>v${document.version}</strong><span class="status-badge review">${settingsStatusLabel(document.status)}</span><button class="text-button" type="button" data-download-document="${escapeHTML(document.id)}">Unduh draft</button></div>`).join("") : emptyState("file", "Belum ada draft", "Buat dokumen dari kontrak, invoice, atau peluang yang sudah tercatat.")}</div>
    <aside class="control-note"><strong>Belum e-sign dan PDF resmi</strong><p>Versi prototype mengunduh HTML ber-watermark DRAFT. E-sign, immutable version, object storage, dan sertifikat tanda tangan adalah production gate.</p></aside></section>`;
}

function renderIntegrationCard(connection) {
  return `<article class="integration-card"><span class="integration-icon">${icon(connection.kind === "payment" ? "file" : connection.kind === "accounting" ? "trend" : "inbox")}</span><div><small>${escapeHTML(connection.kind)}</small><h3>${escapeHTML(connection.provider)}</h3><p>${connection.reference ? `Referensi: ${escapeHTML(connection.reference)}` : "Provider dan kredensial belum dipilih."}</p></div><span class="status-badge ${connection.status === "not_connected" ? "overdue" : "review"}">${settingsStatusLabel(connection.status)}</span><button class="secondary-button" type="button" data-create-record="integration_setup" data-record-target="${escapeHTML(connection.kind)}">Siapkan</button></article>`;
}

function renderFinanceSettings() {
  const connections = state.data.integrations.filter((item) => ["accounting", "payment"].includes(item.kind));
  return `<section class="control-section"><div class="control-section-head"><div><span class="section-kicker">4 · Integrasi keuangan</span><h2>DEKTA menjaga konteks, sistem keuangan menjaga pembukuan</h2><p>Invoice, pembayaran, piutang, dan sinkronisasi akuntansi memiliki status sendiri.</p></div><button class="primary-button" type="button" data-view-jump="collection">Buka tagihan</button></div><div class="integration-grid">${connections.map(renderIntegrationCard).join("")}</div><div class="boundary-flow"><span>Kontrak</span>${icon("arrow")}<span>Invoice & item</span>${icon("arrow")}<span>Pembayaran terbukti</span>${icon("arrow")}<span>Antrean sinkronisasi</span>${icon("arrow")}<span>Sistem akuntansi</span></div><aside class="control-note"><strong>Tidak ada posting otomatis pada prototype</strong><p>Status “perlu verifikasi” tidak berarti koneksi live. Rahasia provider, webhook, idempotensi, rekonsiliasi, retry, dan void wajib dibangun di server staging.</p></aside></section>`;
}

function renderCommunicationSettings() {
  const connections = state.data.integrations.filter((item) => ["email", "whatsapp"].includes(item.kind));
  return `<section class="control-section"><div class="control-section-head"><div><span class="section-kicker">5 · Integrasi komunikasi</span><h2>Pesan berangkat dari konteks dan consent</h2><p>Tim menyiapkan draft, memeriksa penerima, lalu mengirim melalui provider yang sudah terverifikasi.</p></div><button class="primary-button" type="button" data-create-record="communication_draft">${icon("plus")}<span>Buat draft pesan</span></button></div><div class="integration-grid">${connections.map(renderIntegrationCard).join("")}</div><div class="message-outbox"><div class="panel-head"><div><h2>Outbox review</h2><p>Tidak ada pesan keluar dari prototype.</p></div><span>${state.data.communicationDrafts.length} draft</span></div>${state.data.communicationDrafts.length ? state.data.communicationDrafts.map((draft) => `<article><span class="channel-mark">${draft.channel === "whatsapp" ? "WA" : "@"}</span><div><strong>${escapeHTML(draft.recipient)}</strong><p>${escapeHTML(draft.message)}</p><small>Sumber ${escapeHTML(draft.sourceType)}:${escapeHTML(draft.sourceId)} · consent ${escapeHTML(draft.consentReference)}</small></div><span class="status-badge review">Draft · belum terkirim</span></article>`).join("") : emptyState("inbox", "Outbox masih kosong", "Buat draft dari record pelanggan yang memiliki rujukan consent.")}</div></section>`;
}

function renderCopilotSettings() {
  const reviewedById = new Map(state.data.copilotReviews.map((item) => [item.opportunityId, item]));
  const suggestions = state.data.opportunities.filter((item) => item.status === "active").map((item) => buildCopilotSuggestion(item, new Date())).filter((item) => item.ok).map((item) => reviewedById.get(item.suggestion.opportunityId) || item.suggestion);
  return `<section class="control-section"><div class="control-section-head"><div><span class="section-kicker">6 · AI Copilot</span><h2>Saran yang menjelaskan “karena apa”</h2><p>Copilot membaca record lokal, menunjukkan bukti, lalu menunggu keputusan manusia. Tidak mengirim pesan atau mengubah data diam-diam.</p></div><span class="prototype-ai-label">Baseline aturan · bukan model AI live</span></div><div class="copilot-list">${suggestions.map((suggestion) => `<article class="copilot-card"><div class="copilot-card-head"><span class="copilot-orb">${icon("trend")}</span><div><small>Keyakinan ${escapeHTML(suggestion.confidence)}</small><h3>${escapeHTML(suggestion.title)}</h3></div><span class="status-badge ${suggestion.status === "awaiting_human_review" ? "review" : "paid"}">${settingsStatusLabel(suggestion.status)}</span></div><p>${escapeHTML(suggestion.rationale)}</p><details><summary>Lihat ${suggestion.evidence.length} bukti</summary>${suggestion.evidence.map((evidence) => `<div><code>${escapeHTML(evidence.field)}</code><span>${escapeHTML(evidence.value)}</span></div>`).join("")}</details>${suggestion.status === "awaiting_human_review" ? `<div class="copilot-actions"><button class="primary-button" type="button" data-review-copilot="approved" data-copilot-id="${escapeHTML(suggestion.id)}">Gunakan sebagai arahan</button><button class="text-button" type="button" data-review-copilot="dismissed" data-copilot-id="${escapeHTML(suggestion.id)}">Tolak saran</button></div>` : `<small>Ditinjau ${formatDate(suggestion.reviewedAt, { year: true })} oleh ${escapeHTML(suggestion.reviewedBy)}</small>`}</article>`).join("")}</div><aside class="control-note"><strong>AI live belum siap produksi</strong><p>Baru ada dataset kontrak sintetis dan baseline aturan. Model provider, held-out test, pengukuran groundedness, biaya, waktu respons, monitoring, dan approval rollout masih wajib diselesaikan.</p></aside></section>`;
}

function renderAdaptation() {
  const tabs = [["modules", "Modul & menu"], ["data", "Data & staging"], ["team", "Tim & akses"], ["subscription", "Paket"], ["documents", "Dokumen"], ["finance", "Keuangan"], ["communication", "Komunikasi"], ["copilot", "Copilot"], ["reference", "Referensi"]];
  const sections = { modules: renderWorkspaceModuleSettings, data: renderDataAuthoritySettings, team: renderTeamSettings, subscription: renderSubscriptionSettings, documents: renderDocumentSettings, finance: renderFinanceSettings, communication: renderCommunicationSettings, copilot: renderCopilotSettings, reference: renderReferenceSettings };
  root.innerHTML = `<section class="view settings-view" data-rendered-view="adaptation">${viewHeading("Pusat kontrol", "Atur sistem tanpa kehilangan konteks kerja.", "Kelola tim, paket, dokumen, integrasi, dan bantuan keputusan dari satu tempat yang bisa diaudit.")}<nav class="settings-tabs" aria-label="Bagian pusat kontrol">${tabs.map(([value, label]) => `<button type="button" class="${state.settingsTab === value ? "is-active" : ""}" data-settings-tab="${value}">${label}</button>`).join("")}</nav>${sections[state.settingsTab]?.() || renderTeamSettings()}</section>`;
}

function downloadDocumentDraft(id) {
  const document = state.data.generatedDocuments.find((item) => item.id === id);
  if (!document) return;
  const content = `<!doctype html><html lang="id"><meta charset="utf-8"><title>${escapeHTML(document.title)}</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:64px auto;color:#0f172a;line-height:1.7;padding:0 24px}header{border-bottom:2px solid #a33dc3;margin-bottom:32px;padding-bottom:16px}.draft{color:#a33dc3;font-weight:800;letter-spacing:.14em}pre{font:inherit;white-space:pre-wrap}footer{margin-top:48px;color:#64748b;font-size:12px}</style><header><span class="draft">DRAFT · BELUM UNTUK DIKIRIM</span><h1>${escapeHTML(document.title)}</h1></header><pre>${escapeHTML(document.body)}</pre><footer>Sumber ${escapeHTML(document.sourceType)}:${escapeHTML(document.sourceId)} · v${document.version} · dibuat ${escapeHTML(document.createdAt)}</footer></html>`;
  const blob = new Blob([content], { type: "text/html;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${slug(document.title)}-draft-v${document.version}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Draft diunduh dengan watermark dan referensi sumber.");
}

function emptyState(iconName, title, description) {
  return `<div class="empty-state">${icon(iconName)}<div><h2>${escapeHTML(title)}</h2><p>${escapeHTML(description)}</p></div></div>`;
}

function dateInputValue(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

function dateInputToISO(value) {
  return value ? new Date(`${value}T12:00:00+07:00`).toISOString() : "";
}

function clearControlErrors() {
  controlForm.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  controlForm.querySelectorAll(".field-error").forEach((message) => { message.textContent = ""; });
  controlErrors.hidden = true;
  controlErrors.replaceChildren();
}

function syncControlFields() {
  const type = controlForm.elements.controlType.value;
  controlForm.querySelectorAll("[data-control-types]").forEach((field) => {
    field.hidden = !field.dataset.controlTypes.split(" ").includes(type);
  });
  const overrideReason = controlForm.querySelector("[data-override-reason]");
  overrideReason.hidden = type !== "stage" || !controlForm.elements.override.checked;
  const overrideControl = controlForm.querySelector(".override-control");
  if (customerPipelineUsesServer()) {
    overrideControl.hidden = true;
    controlForm.elements.override.checked = false;
    overrideReason.hidden = true;
  }
  const reasonLabels = {
    next_action: "Alasan perubahan / reschedule",
    hold: "Alasan hold",
    lost: "Penjelasan tambahan",
    reactivate: "Alasan reaktivasi"
  };
  controlForm.querySelector("[data-reason-label]").textContent = reasonLabels[type] || "Alasan perubahan";
}

function openControlDialog(id) {
  const item = customerPipelineData().opportunities.find((opportunity) => opportunity.id === id);
  if (!item) return;
  state.controlOpportunityId = id;
  controlForm.reset();
  clearControlErrors();
  const inactive = ["on_hold", "lost"].includes(item.status);
  [...controlForm.elements.controlType.options].forEach((option) => {
    option.disabled = customerPipelineUsesServer() ? option.value !== "stage" : inactive ? option.value !== "reactivate" : option.value === "reactivate";
  });
  controlForm.elements.controlType.value = customerPipelineUsesServer() ? "stage" : inactive ? "reactivate" : "next_action";
  const currentIndex = ["Qualified", "Discovery", "Solution", "Proposal", "Decision"].indexOf(item.stage);
  controlForm.elements.targetStage.value = inactive && currentIndex >= 0
    ? item.stage
    : currentIndex >= 0 && currentIndex < 4
      ? ["Qualified", "Discovery", "Solution", "Proposal", "Decision"][currentIndex + 1]
      : currentIndex === 4 ? "Proposal" : "Qualified";
  controlForm.elements.nextAction.value = item.nextAction?.label || "";
  controlForm.elements.due.value = dateInputValue(item.nextAction?.due) || dateInputValue(new Date(Date.now() + 86_400_000));
  controlForm.elements.reviewDate.value = dateInputValue(item.reviewDate) || dateInputValue(new Date(Date.now() + 7 * 86_400_000));
  controlForm.elements.reference.value = item.proposalReference || "";
  controlContext.textContent = `${item.account} · ${item.stage} · ${item.owner}. Semua perubahan masuk activity trail.`;
  syncControlFields();
  detailDialog.open && detailDialog.close();
  controlDialog.showModal();
  window.setTimeout(() => controlForm.elements.controlType.focus(), 0);
}

async function handleControlSubmit(event) {
  event.preventDefault();
  clearControlErrors();
  const data = new FormData(controlForm);
  if (customerPipelineUsesServer()) {
    const current = customerPipelineData().opportunities.find((item) => item.id === state.controlOpportunityId);
    if (!current) return;
    if (data.get("controlType") !== "stage") {
      controlErrors.hidden = false;
      controlErrors.textContent = "Untuk data server, sprint ini hanya mengaktifkan perpindahan tahap. Kontrol hold/lost menyusul pada slice berikutnya.";
      return;
    }
    setFormSubmitting(controlForm, true);
    const result = await executeServerCommand("opportunity.stage", {
      opportunityId: current.id,
      targetStage: data.get("targetStage"),
      nextAction: data.get("nextAction"),
      nextActionDueAt: dateInputToISO(data.get("due")),
      evidence: data.get("evidence"),
      reference: data.get("reference"),
      expectedLockVersion: current.lockVersion
    });
    setFormSubmitting(controlForm, false);
    if (!result.ok) {
      controlErrors.hidden = false;
      controlErrors.innerHTML = `<strong>Perubahan belum disimpan.</strong><p>${escapeHTML(serverErrorMessage(result.code))}</p>`;
      if (result.code === "OPPORTUNITY_VERSION_CONFLICT") await refreshDataAuthority({ rerender: false });
      return;
    }
    await refreshDataAuthority({ rerender: false });
    controlDialog.close();
    render();
    updateNavCounts();
    openOpportunity(result.record.id);
    showToast("Tahap peluang tersimpan di server dan audit log diperbarui.");
    return;
  }
  const index = state.data.opportunities.findIndex((item) => item.id === state.controlOpportunityId);
  if (index < 0) return;
  const result = applyOpportunityControl(state.data.opportunities[index], {
    type: data.get("controlType"),
    actor: "Anggit",
    authority: "Executive Admin",
    targetStage: data.get("targetStage"),
    nextAction: data.get("nextAction"),
    due: dateInputToISO(data.get("due")),
    reviewDate: dateInputToISO(data.get("reviewDate")),
    evidence: data.get("evidence"),
    reference: data.get("reference"),
    reason: data.get("reason"),
    lostReason: data.get("lostReason"),
    override: data.get("override") === "on",
    overrideReason: data.get("overrideReason")
  }, new Date());

  if (!result.ok) {
    result.errors.forEach((error) => {
      const field = controlForm.elements[error.field];
      if (field) {
        field.setAttribute("aria-invalid", "true");
        field.closest(".field")?.querySelector(".field-error")?.replaceChildren(error.message);
      }
    });
    controlErrors.hidden = false;
    controlErrors.innerHTML = `<strong>Perubahan belum disimpan.</strong><ul>${result.errors.map((error) => `<li>${escapeHTML(error.message)}</li>`).join("")}</ul>`;
    controlForm.elements[result.errors[0]?.field]?.focus?.();
    return;
  }

  state.data.opportunities[index] = result.opportunity;
  persist();
  controlDialog.close();
  render();
  updateNavCounts();
  openOpportunity(result.opportunity.id);
  showToast("Kontrol opportunity diperbarui dan activity trail disimpan.");
}

function clearHandoffErrors() {
  handoffForm.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  handoffForm.querySelectorAll(".field-error").forEach((message) => { message.textContent = ""; });
  handoffErrors.hidden = true;
  handoffErrors.replaceChildren();
}

function syncHandoffFields() {
  const mode = state.handoffMode;
  handoffForm.querySelectorAll("[data-handoff-modes]").forEach((field) => {
    const available = field.dataset.handoffModes.split(" ").includes(mode);
    const decisionMatches = !field.dataset.reviewDecision || field.dataset.reviewDecision === handoffForm.elements.decision.value;
    field.hidden = !available || !decisionMatches;
  });
}

function openHandoffDialog(id) {
  const item = state.data.opportunities.find((opportunity) => opportunity.id === id);
  if (!item) return;
  const mode = item.status === "active" && item.stage === "Decision"
    ? "submit"
    : item.status === "won" && item.handoff?.status === "submitted"
      ? "review"
      : item.status === "won" && item.handoff?.status === "rejected" ? "resubmit" : null;
  if (!mode) {
    showToast("Tidak ada tindakan pekerjaan yang tersedia untuk status ini.");
    return;
  }

  state.handoffOpportunityId = id;
  state.handoffMode = mode;
  handoffForm.reset();
  clearHandoffErrors();
  const tomorrow = new Date(Date.now() + 86_400_000);
  const returnDue = new Date(Date.now() + (2 * 86_400_000));
  const handoff = item.handoff || {};
  populateMemberNameSelect(handoffForm.elements.deliveryOwner, ["executive_admin", "delivery"], handoff.deliveryOwner || "Nadia");
  populateMemberNameSelect(handoffForm.elements.reviewer, ["executive_admin", "delivery"], handoff.deliveryOwner || handoff.reviewer || "Nadia");
  handoffForm.elements.commitmentReference.value = item.commitment?.reference || "";
  handoffForm.elements.commitmentDate.value = dateInputValue(item.commitment?.date || new Date());
  handoffForm.elements.contractedValue.value = item.commitment?.value || item.value || "";
  handoffForm.elements.scope.value = handoff.scope || "";
  handoffForm.elements.clientPIC.value = handoff.clientPIC || item.contact || "";
  handoffForm.elements.deliveryOwner.value = handoff.deliveryOwner || "";
  handoffForm.elements.targetStartDate.value = dateInputValue(handoff.targetStartDate || tomorrow);
  handoffForm.elements.dependencies.value = (handoff.dependencies || []).join("\n");
  handoffForm.elements.constraints.value = (handoff.constraints || []).join("\n");
  handoffForm.elements.decision.value = "accept";
  handoffForm.elements.reviewer.value = handoff.deliveryOwner || "";
  handoffForm.elements.returnDue.value = dateInputValue(returnDue);

  const titles = {
    submit: ["Catat persetujuan dan ajukan pekerjaan", "Ajukan pekerjaan"],
    review: ["Periksa kesiapan pekerjaan", "Simpan keputusan"],
    resubmit: ["Lengkapi dan kirim ulang", "Kirim ulang pekerjaan"]
  };
  document.querySelector("#handoff-title").textContent = titles[mode][0];
  handoffSubmit.textContent = titles[mode][1];
  handoffContext.textContent = mode === "submit"
    ? `${item.account} · menunggu keputusan · ${item.owner}. Bukti persetujuan dan informasi pekerjaan wajib lengkap.`
    : mode === "review"
      ? `${item.account} · diajukan ${formatDate(handoff.submittedAt, { year: true })} oleh ${handoff.submittedBy}. Tim operasional perlu menerima atau mengembalikan dengan alasan.`
      : `${item.account} · dikembalikan karena ${(handoff.missing || []).join(", ")}. Semua perbaikan akan masuk riwayat aktivitas.`;
  syncHandoffFields();
  detailDialog.open && detailDialog.close();
  handoffDialog.showModal();
  window.setTimeout(() => handoffForm.querySelector("[data-handoff-modes]:not([hidden]) input, [data-handoff-modes]:not([hidden]) select, [data-handoff-modes]:not([hidden]) textarea")?.focus(), 0);
}

function handleHandoffSubmit(event) {
  event.preventDefault();
  clearHandoffErrors();
  const index = state.data.opportunities.findIndex((item) => item.id === state.handoffOpportunityId);
  if (index < 0) return;
  const data = new FormData(handoffForm);
  const sharedPackage = {
    scope: data.get("scope"),
    clientPIC: data.get("clientPIC"),
    deliveryOwner: data.get("deliveryOwner"),
    targetStartDate: dateInputToISO(data.get("targetStartDate")),
    dependencies: data.get("dependencies"),
    constraints: data.get("constraints")
  };
  const current = state.data.opportunities[index];
  let result;
  if (state.handoffMode === "submit") {
    result = submitWonHandoff(current, {
      actor: "Anggit",
      commitmentReference: data.get("commitmentReference"),
      commitmentDate: dateInputToISO(data.get("commitmentDate")),
      contractedValue: data.get("contractedValue"),
      ...sharedPackage
    }, new Date());
  } else if (state.handoffMode === "review") {
    result = reviewHandoff(current, {
      decision: data.get("decision"),
      reviewer: data.get("reviewer"),
      reviewNote: data.get("reviewNote"),
      missingItems: data.get("missingItems"),
      returnDue: dateInputToISO(data.get("returnDue"))
    }, new Date());
  } else {
    result = resubmitHandoff(current, {
      actor: "Anggit",
      resolutionNote: data.get("resolutionNote"),
      ...sharedPackage
    }, new Date());
  }

  if (!result.ok) {
    result.errors.forEach((error) => {
      const field = handoffForm.elements[error.field];
      if (field) {
        field.setAttribute("aria-invalid", "true");
        field.closest(".field")?.querySelector(".field-error")?.replaceChildren(error.message);
      }
    });
    handoffErrors.hidden = false;
    handoffErrors.innerHTML = `<strong>Handoff belum disimpan.</strong><ul>${result.errors.map((error) => `<li>${escapeHTML(error.message)}</li>`).join("")}</ul>`;
    const firstField = handoffForm.elements[result.errors[0]?.field];
    firstField?.focus?.();
    return;
  }

  const completedMode = state.handoffMode;
  state.data.opportunities[index] = result.opportunity;
  persist();
  handoffDialog.close();
  render();
  updateNavCounts();
  openOpportunity(result.opportunity.id);
  const messages = {
    submit: "Bukti won dicatat. Handoff menunggu keputusan delivery.",
    review: result.opportunity.handoff.status === "accepted" ? "Handoff diterima delivery." : "Handoff dikembalikan dengan action perbaikan.",
    resubmit: "Handoff dikirim ulang dan kembali menunggu review delivery."
  };
  showToast(messages[completedMode]);
}

function clearGovernanceErrors() {
  governanceForm.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  governanceForm.querySelectorAll(".field-error").forEach((message) => { message.textContent = ""; });
  governanceErrors.hidden = true;
  governanceErrors.replaceChildren();
}

function governanceErrorResult(result) {
  result.errors.forEach((error) => {
    const field = governanceForm.elements[error.field];
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.closest(".field")?.querySelector(".field-error")?.replaceChildren(error.message);
    }
  });
  governanceErrors.hidden = false;
  governanceErrors.innerHTML = `<strong>Tindakan belum disimpan.</strong><ul>${result.errors.map((error) => `<li>${escapeHTML(error.message)}</li>`).join("")}</ul>`;
  governanceForm.elements[result.errors[0]?.field]?.focus?.();
}

function syncGovernanceFields() {
  const item = state.data.opportunities.find((opportunity) => opportunity.id === state.governanceOpportunityId);
  if (!item) return;
  const mode = item.status === "archived" ? "restore" : governanceForm.elements.action.value;
  state.governanceMode = mode;
  governanceForm.querySelectorAll("[data-governance-modes]").forEach((field) => {
    field.hidden = !field.dataset.governanceModes.split(" ").includes(mode);
  });
  const priority = getPriorityOverrideState(item);
  clearPriorityButton.hidden = mode !== "priority" || priority.status === "none";
  const copy = {
    priority: {
      title: priority.status === "none" ? "Atur priority override" : "Review priority override",
      reason: priority.status === "none" ? "Alasan override" : "Alasan perubahan atau pencabutan",
      submit: priority.status === "none" ? "Simpan override" : "Perbarui override",
      principle: priority.status === "none"
        ? "Override mengubah urutan perhatian, bukan fakta pipeline. Ia wajib beralasan, terlihat, dan memiliki masa berlaku."
        : `Override ${priority.status === "expired" ? "sudah kedaluwarsa" : "aktif"}: ${priority.override.direction === "promote" ? "prioritas dinaikkan" : "prioritas diturunkan"} sampai ${formatDate(priority.override.expiresAt, { year: true })}.`
    },
    archive: {
      title: "Archive opportunity",
      reason: "Alasan archive",
      submit: "Archive record",
      principle: "Archive mengeluarkan record dari operasi aktif tanpa menghapus data. Contracted value historis tidak dibalik hanya karena record diarsipkan."
    },
    restore: {
      title: "Restore opportunity",
      reason: "Alasan restore",
      submit: "Restore record",
      principle: `Record akan kembali ke state ${item.archive?.previousState?.stage || item.archive?.previousState?.status || "sebelumnya"}, termasuk next action lamanya. Tanggal yang sudah lewat akan kembali muncul sebagai overdue.`
    }
  }[mode];
  document.querySelector("#governance-title").textContent = copy.title;
  document.querySelector("#governance-reason-label").textContent = copy.reason;
  governanceSubmit.textContent = copy.submit;
  governanceSubmit.className = mode === "archive" ? "danger-button" : "primary-button";
  governancePrinciple.textContent = copy.principle;
}

function openGovernanceDialog(id) {
  const item = state.data.opportunities.find((opportunity) => opportunity.id === id);
  if (!item) return;
  state.governanceOpportunityId = id;
  governanceForm.reset();
  clearGovernanceErrors();
  governanceForm.elements.action.value = "priority";
  const priority = getPriorityOverrideState(item);
  governanceForm.elements.direction.value = priority.override?.direction || "promote";
  governanceForm.elements.expiresAt.value = dateInputValue(priority.status === "active" ? priority.override.expiresAt : new Date(Date.now() + 7 * 86_400_000));
  governanceContext.textContent = `${item.account} · ${item.status === "archived" ? `diarsipkan ${formatDate(item.archive?.archivedAt, { year: true })}` : `${item.stage} · ${item.owner}`}. Setiap tindakan masuk activity trail.`;
  syncGovernanceFields();
  detailDialog.open && detailDialog.close();
  governanceDialog.showModal();
  window.setTimeout(() => governanceForm.elements[item.status === "archived" ? "reason" : "action"].focus(), 0);
}

function finishGovernance(result, message) {
  const index = state.data.opportunities.findIndex((item) => item.id === state.governanceOpportunityId);
  state.data.opportunities[index] = result.opportunity;
  persist();
  governanceDialog.close();
  render();
  updateNavCounts();
  openOpportunity(result.opportunity.id);
  showToast(message);
}

function handleGovernanceSubmit(event) {
  event.preventDefault();
  clearGovernanceErrors();
  const item = state.data.opportunities.find((opportunity) => opportunity.id === state.governanceOpportunityId);
  if (!item) return;
  const data = new FormData(governanceForm);
  const common = { actor: "Anggit", authority: "Executive Admin", reason: data.get("reason") };
  let result;
  if (state.governanceMode === "archive") {
    result = archiveOpportunity(item, common, new Date());
  } else if (state.governanceMode === "restore") {
    result = restoreOpportunity(item, common, new Date());
  } else {
    result = setPriorityOverride(item, {
      ...common,
      direction: data.get("direction"),
      expiresAt: dateInputToISO(data.get("expiresAt"))
    }, new Date());
  }
  if (!result.ok) return governanceErrorResult(result);
  const messages = {
    archive: "Opportunity diarsipkan tanpa menghapus histori.",
    restore: "Opportunity dipulihkan ke state sebelumnya.",
    priority: "Priority override disimpan dengan masa berlaku."
  };
  finishGovernance(result, messages[state.governanceMode]);
}

function handleClearPriority() {
  clearGovernanceErrors();
  const item = state.data.opportunities.find((opportunity) => opportunity.id === state.governanceOpportunityId);
  if (!item) return;
  const result = clearPriorityOverride(item, {
    actor: "Anggit",
    authority: "Executive Admin",
    reason: governanceForm.elements.reason.value
  }, new Date());
  if (!result.ok) return governanceErrorResult(result);
  finishGovernance(result, "Priority override dicabut dan alasan tersimpan.");
}

function renderPriorityPanel(item) {
  const priority = getPriorityOverrideState(item);
  if (priority.status === "none") return "";
  const expired = priority.status === "expired";
  return `<section class="priority-panel ${expired ? "is-expired" : ""}">
    <div><span class="section-kicker">Manual priority override</span><strong>${expired ? "Kedaluwarsa—perlu review" : priority.override.direction === "promote" ? "Prioritas dinaikkan" : "Prioritas diturunkan"}</strong><p>${escapeHTML(priority.override.reason)}</p></div>
    <div class="priority-meta"><span>Berlaku sampai</span><strong>${formatDate(priority.override.expiresAt, { year: true })}</strong><small>Oleh ${escapeHTML(priority.override.actor)}</small></div>
  </section>`;
}

function renderArchivePanel(item) {
  if (item.status !== "archived") return "";
  const archive = item.archive || {};
  return `<section class="archive-panel">
    <div><span class="section-kicker">Recoverable archive</span><h3>Record keluar dari operasi aktif</h3><p>${escapeHTML(archive.reason || "Alasan tidak tercatat.")}</p></div>
    <dl><div><dt>State sebelumnya</dt><dd>${escapeHTML(archive.previousState?.stage || archive.previousState?.status || "—")}</dd></div><div><dt>Diarsipkan</dt><dd>${formatDate(archive.archivedAt, { year: true })}</dd></div><div><dt>Oleh</dt><dd>${escapeHTML(archive.archivedBy || "—")}</dd></div></dl>
  </section>`;
}

function renderHandoffPanel(item) {
  if (item.status !== "won" && !(item.status === "archived" && item.archive?.previousState?.status === "won")) return "";
  const handoff = item.handoff || {};
  const commitment = item.commitment || {};
  if (customerPipelineUsesServer()) return `
    <section class="handoff-package" aria-labelledby="handoff-package-title">
      <div class="handoff-package-head"><div><span class="section-kicker">Keputusan pelanggan</span><h3 id="handoff-package-title">Komitmen sudah tercatat</h3></div><span class="status-badge paid">Terverifikasi</span></div>
      <div class="commitment-strip"><div><span>Bukti komitmen</span><strong>${escapeHTML(commitment.reference || "Belum dicatat")}</strong></div><div><span>Tanggal</span><strong>${formatDate(commitment.date, { year: true })}</strong></div><div><span>Nilai terkontrak</span><strong>${formatIDR(commitment.value || item.value, true)}</strong></div></div>
      <p class="handoff-scope">Lanjutkan sesuai kebutuhan: catat kontrak aktif, buat pekerjaan pelanggan, lalu terbitkan invoice. Setiap langkah tersimpan sebagai record dan audit terpisah.</p>
    </section>`;
  const statusCopy = {
    submitted: ["Menunggu review", "review"],
    rejected: ["Perlu perbaikan", "overdue"],
    accepted: ["Diterima operasional", "paid"]
  }[handoff.status] || ["Belum lengkap", "review"];
  const list = (items) => (items || []).map((value) => `<li>${escapeHTML(value)}</li>`).join("") || "<li>Belum dicatat</li>";
  return `
    <section class="handoff-package" aria-labelledby="handoff-package-title">
      <div class="handoff-package-head"><div><span class="section-kicker">Serah terima operasional</span><h3 id="handoff-package-title">Paket keputusan &amp; eksekusi</h3></div><span class="status-badge ${statusCopy[1]}">${statusCopy[0]}</span></div>
      <div class="commitment-strip"><div><span>Bukti komitmen</span><strong>${escapeHTML(commitment.reference || "Belum dicatat")}</strong></div><div><span>Tanggal</span><strong>${formatDate(commitment.date, { year: true })}</strong></div><div><span>Nilai terkontrak</span><strong>${formatIDR(commitment.value || item.value, true)}</strong></div></div>
      ${handoff.status === "rejected" && handoff.missing?.length ? `<div class="handoff-missing"><strong>Dikembalikan untuk diperbaiki</strong><ul>${list(handoff.missing)}</ul><small>${escapeHTML(handoff.reviewNote || "")}</small></div>` : ""}
      <p class="handoff-scope">${escapeHTML(handoff.scope || "Ruang lingkup belum dicatat.")}</p>
      <div class="handoff-owners"><div><span>Penanggung jawab pelanggan</span><strong>${escapeHTML(handoff.clientPIC || "—")}</strong></div><div><span>Penanggung jawab operasional</span><strong>${escapeHTML(handoff.deliveryOwner || "—")}</strong></div><div><span>Target mulai</span><strong>${formatDate(handoff.targetStartDate, { year: true })}</strong></div></div>
      <div class="handoff-lists"><div><span>Ketergantungan</span><ul>${list(handoff.dependencies)}</ul></div><div><span>Batasan</span><ul>${list(handoff.constraints)}</ul></div></div>
      ${handoff.reviewNote && !handoff.missing?.length ? `<p class="handoff-review-note"><strong>Catatan operasional:</strong> ${escapeHTML(handoff.reviewNote)}</p>` : ""}
    </section>`;
}

function renderOpportunityActions(item) {
  if (customerPipelineUsesServer()) {
    const copyAction = item.nextAction ? `<button class="secondary-button" type="button" data-copy-action="${escapeHTML(item.id)}">Salin tindakan berikutnya</button>` : "";
    if (item.status === "won") {
      const operational = customerPipelineData();
      const contract = operational.contracts.find((record) => record.opportunityId === item.id);
      const project = operational.projects.find((record) => record.opportunityId === item.id);
      const actions = [];
      if (!contract) actions.push(`<button class="primary-button" type="button" data-create-record="contract" data-record-target="${escapeHTML(item.id)}">Catat kontrak</button>`);
      if (contract && !project) actions.push(`<button class="primary-button" type="button" data-create-record="project" data-record-target="${escapeHTML(item.id)}">Buat pekerjaan</button>`);
      if (contract) actions.push(`<button class="secondary-button" type="button" data-create-record="invoice" data-record-target="${escapeHTML(item.id)}">Buat invoice</button>`);
      return actions.join("");
    }
    const winAction = item.status === "active" && item.stage === "Decision"
      ? `<button class="primary-button" type="button" data-win-opportunity="${escapeHTML(item.id)}">Catat persetujuan pelanggan</button>`
      : "";
    return `${copyAction}<button class="secondary-button" type="button" data-open-control="${escapeHTML(item.id)}">Ubah tahap</button>${winAction}`;
  }
  if (item.status === "archived") return `<button class="primary-button" type="button" data-open-governance="${escapeHTML(item.id)}">Pulihkan data</button>`;
  const copyAction = item.nextAction ? `<button class="secondary-button" type="button" data-copy-action="${escapeHTML(item.id)}">Salin tindakan berikutnya</button>` : "";
  const governanceAction = `<button class="text-button governance-trigger" type="button" data-open-governance="${escapeHTML(item.id)}">Atur status</button>`;
  if (item.status === "active") {
    const wonAction = item.stage === "Decision" ? `<button class="primary-button" type="button" data-open-handoff="${escapeHTML(item.id)}">Catat persetujuan &amp; serah terima</button>` : "";
    return `${governanceAction}${copyAction}<button class="secondary-button" type="button" data-open-control="${escapeHTML(item.id)}">Perbarui kendali</button>${wonAction}`;
  }
  if (["on_hold", "lost"].includes(item.status)) return `${governanceAction}${copyAction}<button class="primary-button" type="button" data-open-control="${escapeHTML(item.id)}">Perbarui kendali</button>`;
  if (item.handoff?.status === "submitted") return `${governanceAction}<button class="secondary-button" type="button" data-view-jump="collection">Buka penagihan</button><button class="primary-button" type="button" data-open-handoff="${escapeHTML(item.id)}">Tinjau serah terima</button>`;
  if (item.handoff?.status === "rejected") return `${governanceAction}${copyAction}<button class="primary-button" type="button" data-open-handoff="${escapeHTML(item.id)}">Perbaiki serah terima</button>`;
  return `${governanceAction}<button class="secondary-button" type="button" data-view-jump="collection">Buka penagihan</button>`;
}

function openOpportunity(id) {
  const item = customerPipelineData().opportunities.find((opportunity) => opportunity.id === id);
  if (!item) return;
  detailDialog.classList.remove("account-detail-dialog");
  const flags = attentionFlagsForUI(item);
  const timingLabel = item.status === "archived" ? "Diarsipkan" : item.status === "on_hold" ? "Tinjau ulang" : item.status === "won" ? "Serah terima" : "Tenggat";
  const timingValue = item.status === "archived" ? item.archive?.archivedAt : item.status === "on_hold" ? item.reviewDate : item.status === "won" ? item.handoff?.acceptedAt || item.handoff?.submittedAt || item.lastActivityAt : item.nextAction?.due;
  const stateBadge = item.status === "on_hold"
    ? `<span class="status-badge review">Ditunda</span>`
    : item.status === "lost" ? `<span class="status-badge overdue">Tidak dilanjutkan</span>`
      : item.status === "won" ? `<span class="status-badge paid">Disetujui pelanggan</span>`
        : item.status === "archived" ? `<span class="status-badge stopped">Diarsipkan</span>` : "";
  detailDialog.querySelector("#detail-content").innerHTML = `
    <div class="modal-head"><div><span class="section-kicker">${escapeHTML(serviceLabel(item.service))}</span><h2 id="detail-title">${escapeHTML(item.account)}</h2><p>${escapeHTML(item.contact)} · ${escapeHTML(sourceLabel(item.source))}</p></div><button class="icon-button" type="button" data-close-detail aria-label="Tutup detail">${icon("close")}</button></div>
    <div class="detail-body">
      <div class="flag-stack">${stateBadge}${flags.length ? flags.map(flagMarkup).join("") : stateBadge ? "" : `<span class="status-badge paid">Dalam kontrol</span>`}</div>
      <div class="detail-summary"><div><span>Tahap</span><strong>${escapeHTML(item.status === "won" ? "Disetujui" : stageLabel(item.stage))}</strong></div><div><span>Penanggung jawab</span><strong>${escapeHTML(item.owner)}</strong></div><div><span>Nilai</span><strong>${formatIDR(item.value, true)}</strong></div><div><span>${timingLabel}</span><strong>${formatDate(timingValue, { year: true })}</strong></div></div>
      <div class="detail-note"><strong>${item.status === "won" ? "Konteks peluang (historis)" : "Catatan konteks"}</strong><span>${escapeHTML(item.note || "Belum ada catatan konteks.")}</span></div>
      ${renderPriorityPanel(item)}
      ${renderArchivePanel(item)}
      ${renderHandoffPanel(item)}
      <div class="timeline"><h3>Riwayat aktivitas</h3>${(item.activity || []).map((activity) => `<div class="timeline-item"><i></i><span class="timeline-copy"><strong>${escapeHTML(userFacingText(activity.label))}</strong>${activity.detail ? `<small>${escapeHTML(userFacingText(activity.detail))}</small>` : ""}${activity.previousDue ? `<small>Jadwal: ${formatDate(activity.previousDue, { year: true })} → ${formatDate(activity.nextDue, { year: true })}</small>` : ""}${activity.expiresAt ? `<small>Berlaku sampai ${formatDate(activity.expiresAt, { year: true })}</small>` : ""}${activity.previousStatus ? `<small>Status sebelumnya: ${escapeHTML(stageLabel(activity.previousStage))} · ${escapeHTML(statusLabel(activity.previousStatus))}</small>` : ""}${activity.restoredStatus ? `<small>Dipulihkan ke: ${escapeHTML(stageLabel(activity.restoredStage))} · ${escapeHTML(statusLabel(activity.restoredStatus))}</small>` : ""}${activity.reference ? `<small>Referensi: ${escapeHTML(activity.reference)}</small>` : ""}${activity.unmetRules?.length ? `<small>Ketentuan belum terpenuhi: ${escapeHTML(activity.unmetRules.map(userFacingText).join(", "))}</small>` : ""}${activity.overrideReason ? `<small>Alasan pengecualian: ${escapeHTML(activity.overrideReason)}</small>` : ""}</span><time>${formatDate(activity.at)}</time></div>`).join("") || `<p class="result-count">Belum ada aktivitas.</p>`}</div>
      <div class="detail-actions"><button class="text-button" type="button" data-close-detail>Tutup</button><div class="detail-action-group">${renderOpportunityActions(item)}</div></div>
    </div>`;
  if (!detailDialog.open) detailDialog.showModal();
}

function sourceLabel(value) {
  return {
    "Existing client": "Pelanggan lama",
    "Organic search": "Pencarian Google",
    Outbound: "Dicari tim",
    Partner: "Mitra",
    Referral: "Rujukan",
    Unknown: "Belum diketahui"
  }[value] || value || "Belum diketahui";
}

function serviceLabel(value) {
  return {
    "Operations App": "Aplikasi operasional",
    "SEO Growth": "Pertumbuhan pencarian",
    "Brand & Web": "Merek dan website",
    "ERP & Commerce": "ERP dan perdagangan digital",
    "Commerce Platform": "Platform perdagangan",
    "Website & Acquisition": "Website dan akuisisi"
  }[value] || value || "Layanan belum ditentukan";
}

function stageLabel(value) {
  return {
    Qualified: "Layak ditindaklanjuti",
    Discovery: "Memahami kebutuhan",
    Solution: "Menyiapkan solusi",
    Proposal: "Penawaran",
    Decision: "Menunggu keputusan",
    Won: "Disetujui pelanggan",
    Closed: "Ditutup"
  }[value] || value || "Belum ditentukan";
}

function statusLabel(value) {
  return {
    active: "Aktif",
    on_hold: "Ditunda",
    lost: "Tidak dilanjutkan",
    won: "Disetujui pelanggan",
    archived: "Diarsipkan",
    draft: "Draf",
    issued: "Terbit",
    partial: "Dibayar sebagian",
    paid: "Lunas",
    overdue: "Terlambat"
  }[value] || value || "Belum ditentukan";
}

function userFacingText(value) {
  return String(value || "")
    .replaceAll("Existing client", "Pelanggan lama")
    .replaceAll("Qualified", "Layak ditindaklanjuti")
    .replaceAll("Menunggu triage", "Menunggu peninjauan")
    .replaceAll("Signal", "Kebutuhan")
    .replaceAll("signal", "kebutuhan")
    .replaceAll("Opportunity", "Peluang")
    .replaceAll("opportunity", "peluang")
    .replaceAll("Handoff", "Serah terima")
    .replaceAll("handoff", "serah terima")
    .replaceAll("delivery", "operasional")
    .replaceAll("Invoice", "Tagihan")
    .replaceAll("invoice", "tagihan")
    .replaceAll("paid", "lunas")
    .replaceAll("review", "peninjauan")
    .replaceAll("Won", "Disetujui pelanggan");
}

function accountTimeline(snapshot) {
  const entries = [
    ...(snapshot.account.activity || []),
    ...snapshot.signals.flatMap((item) => [{
      at: item.capturedAt,
      kind: "signal",
      label: item.status === "converted" ? `Kebutuhan dijadikan peluang: ${item.need}` : `Kebutuhan dicatat: ${item.need}`,
      detail: `${sourceLabel(item.source)} · ${item.status === "converted" ? "Layak ditindaklanjuti" : "Menunggu peninjauan"}`
    }, ...(item.activity || []).map((activity) => ({ ...activity, label: userFacingText(activity.label), detail: userFacingText([item.need, activity.detail].filter(Boolean).join(" · ")) }))]),
    ...snapshot.opportunities.flatMap((opportunity) => (opportunity.activity || []).map((activity) => ({
      ...activity,
      label: userFacingText(activity.label),
      detail: userFacingText([serviceLabel(opportunity.service), activity.detail].filter(Boolean).join(" · "))
    }))),
    ...snapshot.invoices.map((item) => ({ at: item.issuedAt, kind: "invoice", label: `Tagihan ${item.number} diterbitkan`, detail: `${formatIDR(item.amount)} · ${statusLabel(item.status)}` })),
    ...snapshot.payments.map((item) => ({ at: item.receivedAt, kind: "payment", label: "Pembayaran tercatat", detail: `${formatIDR(item.amount)} · bukti ${item.evidence}` }))
  ];
  return entries.filter((item) => item.at).toSorted((a, b) => new Date(b.at) - new Date(a.at));
}

function accountFinancialMetric(label, value, caption) {
  return `<div><span>${escapeHTML(label)}</span><strong>${formatIDR(value, true)}</strong><small>${escapeHTML(caption)}</small></div>`;
}

function openAccount(id) {
  const snapshot = buildAccountSnapshot(customerPipelineData(), id);
  if (!snapshot) return;
  detailDialog.classList.add("account-detail-dialog");
  const [relationshipLabel, relationshipClass] = relationshipStateCopy(snapshot.relationshipState);
  const timeline = accountTimeline(snapshot);
  const primaryContact = snapshot.contacts[0];
  const isClient = ["client", "client_active"].includes(snapshot.relationshipState);
  const opportunities = snapshot.opportunities.toSorted((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));

  detailDialog.querySelector("#detail-content").innerHTML = `
    <div class="modal-head account-modal-head"><div><span class="section-kicker">Ringkasan pelanggan · ${escapeHTML(snapshot.account.segment || "Belum disegmentasi")}</span><h2 id="detail-title">${escapeHTML(snapshot.account.name)}</h2><p>${escapeHTML(primaryContact?.name || "Kontak belum teridentifikasi")} · sumber awal ${escapeHTML(sourceLabel(snapshot.account.source))}</p></div><button class="icon-button" type="button" data-close-detail aria-label="Tutup detail pelanggan">${icon("close")}</button></div>
    <div class="detail-body account-detail-body">
      <section class="account-focus">
        <div><span class="relationship-state ${relationshipClass}"><i></i>${escapeHTML(relationshipLabel)}</span><h3>${isClient ? "Jangan mulai dari nol saat mereka datang lagi." : "Bangun konteks sebelum mengejar transaksi."}</h3><p>${snapshot.openSignals.length ? `${snapshot.openSignals.length} kebutuhan baru masih menunggu keputusan tim.` : isClient ? "Belum ada kebutuhan lanjutan terbuka. Catat hanya jika ada kebutuhan atau bukti baru." : "Belum ada kebutuhan terbuka pada pelanggan ini."}</p></div>
        <div class="account-focus-meta"><span>Interaksi terakhir</span><strong>${formatDate(snapshot.lastTouchAt, { year: true })}</strong><small>${snapshot.contacts.length} kontak · ${snapshot.opportunities.length} peluang</small></div>
      </section>

      <section class="account-financial-grid" aria-label="Ringkasan nilai akun">
        ${accountFinancialMetric("Potensi penjualan", snapshot.financial.pipeline, "Belum menjadi kesepakatan")}
        ${accountFinancialMetric("Nilai disepakati", snapshot.financial.contracted, "Persetujuan tercatat")}
        ${accountFinancialMetric("Sudah ditagihkan", snapshot.financial.invoiced, "Tagihan diterbitkan")}
        ${accountFinancialMetric("Belum dibayar", snapshot.financial.receivable, "Sisa tagihan terbuka")}
        ${accountFinancialMetric("Uang diterima", snapshot.financial.collected, "Pembayaran terbukti diterima")}
      </section>

      <div class="account-context-grid">
        <section class="account-context-panel"><div class="section-title-row"><h3>Kontak</h3><span>${snapshot.contacts.length}</span></div><div class="account-contact-stack">${snapshot.contacts.length ? snapshot.contacts.map((item) => `<div><span class="account-mark">${escapeHTML(initials(item.name))}</span><p><strong>${escapeHTML(item.name)}</strong><small>Terhubung ke ${escapeHTML(snapshot.account.name)}</small></p></div>`).join("") : `<p class="result-count">Belum ada kontak.</p>`}</div></section>
        <section class="account-context-panel"><div class="section-title-row"><h3>Kebutuhan baru</h3><span>${snapshot.openSignals.length}</span></div><div class="account-signal-stack">${snapshot.openSignals.length ? snapshot.openSignals.map((item) => { const copy = signalStateCopy(item); return `<div><span class="status-badge ${copy.className}">${escapeHTML(copy.label)}</span><p><strong>${escapeHTML(item.need)}</strong><small>${escapeHTML(item.status === "nurture" ? `${item.nurtureReason} · ${copy.timing}` : item.note || "Belum ada catatan pendukung.")}</small></p></div>`; }).join("") : `<p class="result-count">Belum ada kebutuhan yang perlu ditinjau.</p>`}</div></section>
      </div>

      ${Object.keys(snapshot.account.customFields || {}).length ? `<section class="detail-note"><strong>Informasi tambahan</strong><span>${Object.entries(snapshot.account.customFields).map(([key, value]) => `${escapeHTML(key)}: ${escapeHTML(value)}`).join(" · ")}</span></section>` : ""}

      <section class="account-opportunities"><div class="section-title-row"><h3>Riwayat peluang</h3><span>${opportunities.length}</span></div><div>${opportunities.length ? opportunities.map((item) => {
        const stateText = item.status === "won" ? "Disetujui pelanggan" : item.status === "lost" ? "Tidak dilanjutkan" : item.status === "on_hold" ? `${stageLabel(item.stage)} · Ditunda` : item.status === "archived" ? `${stageLabel(item.stage)} · Diarsipkan` : stageLabel(item.stage);
        return `<button type="button" data-open-opportunity="${escapeHTML(item.id)}"><span><strong>${escapeHTML(serviceLabel(item.service))}</strong><small>${escapeHTML(stateText)}</small></span><span><strong>${formatIDR(item.value, true)}</strong><small>${formatDate(item.lastActivityAt, { year: true })}</small></span>${icon("chevron")}</button>`;
      }).join("") : `<p class="result-count">Belum ada peluang.</p>`}</div></section>

      <div class="timeline account-timeline"><h3>Riwayat hubungan</h3>${timeline.slice(0, 12).map((activity) => `<div class="timeline-item"><i></i><span class="timeline-copy"><strong>${escapeHTML(activity.label)}</strong>${activity.detail ? `<small>${escapeHTML(activity.detail)}</small>` : ""}</span><time>${formatDate(activity.at)}</time></div>`).join("") || `<p class="result-count">Belum ada riwayat hubungan.</p>`}</div>
      <div class="detail-actions"><button class="text-button" type="button" data-close-detail>Tutup</button><div class="detail-action-group"><button class="text-button" type="button" data-customer-merge="${escapeHTML(snapshot.account.id)}">Gabungkan duplikat</button><button class="secondary-button" type="button" data-customer-edit="${escapeHTML(snapshot.account.id)}">Edit pelanggan</button>${customerPipelineUsesServer() ? `<button class="primary-button" type="button" data-add-opportunity-account="${escapeHTML(snapshot.account.id)}">Tambah peluang</button>` : `<button class="primary-button" type="button" data-open-expansion="${escapeHTML(snapshot.account.id)}">${isClient ? "Catat peluang lanjutan" : "Catat kebutuhan baru"}</button>`}</div></div>
    </div>`;
  if (!detailDialog.open) detailDialog.showModal();
}

function updateNavCounts() {
  const serverOnlyWorkspace = identitySession.organization?.startMode !== "sample";
  const activeCount = customerPipelineData().opportunities.filter((item) => ["active", "on_hold"].includes(item.status)).length;
  const signalCount = serverOnlyWorkspace ? 0 : (state.data.signals || []).filter((item) => ["inbox", "review"].includes(item.status) || ["overdue", "due_today"].includes(getSignalReviewState(item))).length;
  const collectionCount = serverOnlyWorkspace ? 0 : getCollectionFlags(state.data.invoices, state.data.payments).length;
  const repeatCount = serverOnlyWorkspace ? 0 : buildRepeatOrderCenter(state.data, { reorderDays: 90, dormantDays: 120 }).filter((item) => ["due", "dormant"].includes(item.status)).length;
  const notificationCount = serverOnlyWorkspace ? 0 : notificationEntries().filter((item) => !item.read && !item.snoozed).length;
  if (document.querySelector("#pipeline-count")) document.querySelector("#pipeline-count").textContent = activeCount + signalCount;
  if (document.querySelector("#signal-count")) document.querySelector("#signal-count").textContent = signalCount;
  if (document.querySelector("#collection-count")) document.querySelector("#collection-count").textContent = collectionCount;
  if (document.querySelector("#repeat-count")) document.querySelector("#repeat-count").textContent = repeatCount;
  if (document.querySelector("#notification-count")) document.querySelector("#notification-count").textContent = notificationCount;
  document.querySelector("#open-notifications")?.setAttribute("aria-label", `Buka notifikasi, ${notificationCount} belum dibaca`);
}

function syncWorkspaceNavigation() {
  const modules = state.data.workspaceModules || [];
  const visibleViews = new Set(modules.filter((module) => module.visible).map((module) => module.view));
  document.querySelectorAll("[data-module-code]").forEach((button) => {
    const groupedViews = (button.dataset.navViews || button.dataset.view || "").split(",").filter(Boolean);
    const module = modules.find((item) => item.code === button.dataset.moduleCode);
    const visible = module?.required || module?.visible || groupedViews.some((view) => visibleViews.has(view));
    button.hidden = !visible;
    button.setAttribute("aria-hidden", visible ? "false" : "true");
  });
}

function renderContextNavigation() {
  const groups = {
    relationships: {
      label: "Pelanggan",
      views: [["relationships", "Database pelanggan"], ["repeat", "Repeat order"]]
    },
    repeat: {
      label: "Pelanggan",
      views: [["relationships", "Database pelanggan"], ["repeat", "Repeat order"]]
    },
    signals: {
      label: "Penjualan",
      dashboard: ["sales", "Ringkasan"],
      views: [["signals", "Calon pelanggan"], ["pipeline", "Pipeline"], ["experiments", "Kampanye"], ["partners", "Mitra", "Add-on"]]
    },
    pipeline: {
      label: "Penjualan",
      dashboard: ["sales", "Ringkasan"],
      views: [["signals", "Calon pelanggan"], ["pipeline", "Pipeline"], ["experiments", "Kampanye"], ["partners", "Mitra", "Add-on"]]
    },
    experiments: {
      label: "Penjualan",
      dashboard: ["sales", "Ringkasan"],
      views: [["signals", "Calon pelanggan"], ["pipeline", "Pipeline"], ["experiments", "Kampanye"], ["partners", "Mitra", "Add-on"]]
    },
    partners: {
      label: "Penjualan",
      dashboard: ["sales", "Ringkasan"],
      views: [["signals", "Calon pelanggan"], ["pipeline", "Pipeline"], ["experiments", "Kampanye"], ["partners", "Mitra", "Add-on"]]
    },
    collection: {
      label: "Keuangan",
      dashboard: ["finance", "Ringkasan"],
      views: [["collection", "Tagihan & pembayaran"], ["contracts", "Kontrak"]]
    },
    contracts: {
      label: "Keuangan",
      dashboard: ["finance", "Ringkasan"],
      views: [["collection", "Tagihan & pembayaran"], ["contracts", "Kontrak"]]
    }
  };
  const group = groups[state.view];
  const container = root.querySelector(".view");
  if (!group || !container) return;
  const modules = state.data.workspaceModules || [];
  const moduleVisible = (view) => modules.find((item) => item.view === view)?.visible !== false;
  const dashboardTab = group.dashboard ? `<button type="button" data-dashboard="${group.dashboard[0]}">${group.dashboard[1]}</button>` : "";
  const tabs = group.views.filter(([view]) => moduleVisible(view)).map(([view, label, badge]) => `<button type="button" class="${state.view === view ? "is-active" : ""}" data-view="${view}" ${state.view === view ? 'aria-current="page"' : ""}>${label}${badge ? `<span>${badge}</span>` : ""}</button>`).join("");
  container.insertAdjacentHTML("afterbegin", `<nav class="context-navigation" aria-label="Bagian ${group.label}"><strong>${group.label}</strong><div>${dashboardTab}${tabs}</div></nav>`);
}

function render() {
  syncWorkspaceNavigation();
  updateNavCounts();
  const renderers = {
    command: renderCommand,
    calendar: renderCalendar,
    signals: renderSignals,
    pipeline: renderPipeline,
    relationships: renderRelationships,
    repeat: renderRepeatOrder,
    notifications: renderNotifications,
    reports: renderReports,
    experiments: renderExperiments,
    collection: renderCollection,
    contracts: renderContracts,
    projects: renderProjects,
    partners: renderPartners,
    adaptation: renderAdaptation
  };
  renderers[state.view]();
  renderContextNavigation();
  syncDashboardChrome();
  syncRoleActionVisibility();
}

function recordOpportunityOptions(items = state.data.opportunities) {
  return items.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.account)} — ${escapeHTML(item.service)}</option>`).join("");
}

function activeMembers(allowedRoles = ["executive_admin", "delivery", "sales", "marketing", "finance", "reviewer"]) {
  if (customerPipelineUsesServer()) return (state.dataAuthority.snapshot?.members || [])
    .filter((member) => (member.roles || []).some((role) => allowedRoles.includes(role)))
    .map((member) => ({ id: member.userId, name: member.displayName, status: "active", roles: member.roles || [], organizationId: state.data.organization.id }));
  return listAssignableMembers(state.data.memberships, state.data.organization.id, allowedRoles);
}

function memberOptionList(allowedRoles, selectedId = null, legacyName = "", excludedIds = []) {
  const members = activeMembers(allowedRoles).filter((member) => !excludedIds.includes(member.id));
  const selectedMember = members.find((member) => member.id === selectedId)
    || members.find((member) => String(legacyName || "").toLocaleLowerCase("id-ID").startsWith(member.name.toLocaleLowerCase("id-ID")));
  return `<option value="">Pilih anggota tim</option>${members.map((member) => `<option value="${escapeHTML(member.id)}" ${member.id === selectedMember?.id ? "selected" : ""}>${escapeHTML(member.name)}${member.jobTitle ? ` — ${escapeHTML(member.jobTitle)}` : ""}</option>`).join("")}`;
}

function memberById(id) {
  if (customerPipelineUsesServer()) {
    const member = (state.dataAuthority.snapshot?.members || []).find((item) => item.userId === id);
    if (member) return { id: member.userId, name: member.displayName, status: "active", roles: member.roles || [], organizationId: state.data.organization.id };
  }
  return state.data.memberships.find((member) => member.id === id) || null;
}

function populateMemberNameSelect(select, allowedRoles, selectedName = "Anggit") {
  if (!select) return;
  const members = activeMembers(allowedRoles);
  const matched = members.find((member) => String(selectedName || "").toLocaleLowerCase("id-ID").startsWith(member.name.toLocaleLowerCase("id-ID"))) || members[0];
  select.innerHTML = `<option value="">Pilih anggota tim</option>${members.map((member) => `<option value="${escapeHTML(member.name)}" ${member.id === matched?.id ? "selected" : ""}>${escapeHTML(member.name)}${member.jobTitle ? ` — ${escapeHTML(member.jobTitle)}` : ""}</option>`).join("")}`;
}

function getCopilotSuggestionById(id) {
  const reviewed = state.data.copilotReviews.find((item) => item.id === id);
  if (reviewed) return reviewed;
  return state.data.opportunities.map((item) => buildCopilotSuggestion(item, new Date())).find((item) => item.ok && item.suggestion.id === id)?.suggestion || null;
}

function openRecordDialog(type, targetId = null, subtargetId = null, action = null) {
  if (customerPipelineUsesServer() && type === "customer_import") {
    showToast("Impor server belum dibuka pada sprint ini. Tambahkan pelanggan satu per satu agar deduplikasi dan audit tetap aman.");
    return;
  }
  state.recordType = type;
  state.recordTargetId = targetId;
  state.recordSubtargetId = subtargetId;
  state.recordAction = action;
  const tomorrow = dateInputAfter(1);
  const inThirtyDays = dateInputAfter(30);
  const operationalConsultingData = customerPipelineData();
  const targetContract = operationalConsultingData.contracts.find((item) => item.id === targetId);
  const targetInvoice = operationalConsultingData.invoices.find((item) => item.id === targetId);
  const targetSchedule = type === "scheduled_invoice" ? buildBillingSchedule(operationalConsultingData.contracts, operationalConsultingData.invoices, new Date(), 120).find((item) => item.id === targetId) : null;
  const targetInvoiceOpportunity = targetInvoice ? operationalConsultingData.opportunities.find((item) => item.id === targetInvoice.opportunityId) : null;
  const targetProject = operationalConsultingData.projects.find((item) => item.id === targetId);
  const targetEngagement = operationalConsultingData.consultingEngagements?.find((item) => item.id === targetId);
  const targetEngagementTasks = targetEngagement?.workstreams?.flatMap((workstream) => workstream.tasks.map((task) => ({ ...task, workstreamName: workstream.name }))) || [];
  const targetEngagementTask = targetEngagementTasks.find((item) => item.id === subtargetId);
  const targetWorkstream = targetEngagement?.workstreams?.find((item) => item.id === subtargetId);
  const targetMilestoneWorkstream = targetEngagement?.workstreams?.find((workstream) => workstream.milestones?.some((item) => item.id === subtargetId));
  const targetMilestone = targetMilestoneWorkstream?.milestones?.find((item) => item.id === subtargetId);
  const targetExpense = targetEngagement?.expenses?.find((item) => item.id === subtargetId);
  const targetPartner = state.data.partners.find((item) => item.id === targetId);
  const targetCommission = targetPartner?.commissions?.find((item) => item.id === subtargetId);
  const targetCalendarEvent = state.data.calendarEvents.find((item) => item.id === targetId);
  const targetSignal = state.data.signals.find((item) => item.id === targetId);
  const operationalCustomerData = customerPipelineData();
  const targetAccount = operationalCustomerData.accounts.find((item) => item.id === targetId);
  const targetContact = operationalCustomerData.contacts.find((item) => item.accountId === targetId);
  const targetMember = state.data.memberships.find((item) => item.id === targetId);
  const targetPlan = state.data.planCatalog.find((item) => item.code === targetId);
  const targetIntegration = state.data.integrations.find((item) => item.kind === targetId);
  const targetCopilot = getCopilotSuggestionById(targetId);
  const targetPayments = operationalConsultingData.payments.filter((item) => item.invoiceId === targetId);
  const invoiceOutstanding = targetInvoice ? Math.max(0, targetInvoice.amount - targetPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0)) : 0;
  const nextContractStatus = { draft: "sent", sent: "signed", signed: "active", active: "cancelled" }[targetContract?.status];
  const nextContractLabel = { sent: "Tandai telah dikirim", signed: "Catat ditandatangani", active: "Aktifkan kontrak", cancelled: "Batalkan kontrak" }[nextContractStatus];
  const configurations = {
    opportunity_win: {
      kicker: "Keputusan pelanggan", title: `Catat persetujuan ${escapeHTML(operationalConsultingData.opportunities.find((item) => item.id === targetId)?.account || "pelanggan")}`, description: "Status disetujui hanya dicatat setelah bukti komitmen pelanggan tersedia.", submit: "Simpan persetujuan",
      fields: `<label class="field field-wide">Referensi komitmen<input name="commitmentReference" required placeholder="Contoh: PO/2026/001 atau kontrak ditandatangani" /><span class="field-error"></span></label><label class="field">Tanggal persetujuan<input name="committedAt" type="date" value="${dateInputAfter(0)}" required /><span class="field-error"></span></label><label class="field">Nilai disetujui<span class="input-prefix"><span>Rp</span><input name="value" type="number" min="1" step="1000" value="${escapeHTML(String(operationalConsultingData.opportunities.find((item) => item.id === targetId)?.value || ""))}" required /></span><span class="field-error"></span></label><p class="inline-help field-wide">Penyimpanan akan mengunci nilai terkontrak dan membuat jejak audit. Kontrak, pekerjaan, dan invoice tetap dibuat sebagai record terpisah.</p>`
    },
    invoice: {
      kicker: "Invoice pelanggan", title: "Buat invoice", description: "Invoice baru tetap terpisah dari status kontrak dan pembayaran.", submit: "Simpan invoice",
      fields: `<label class="field field-wide">Pesanan / pelanggan<select name="opportunityId" required><option value="">Pilih pesanan</option>${recordOpportunityOptions(state.data.opportunities.filter((item) => item.status === "won"))}</select><span class="field-error"></span></label><label class="field">Nomor invoice<input name="number" required placeholder="INV/2026/001" /><span class="field-error"></span></label><div class="invoice-form-items field-wide"><div><strong>Rincian item</strong><span>Isi minimal satu item. Baris kosong tidak akan disimpan.</span></div>${[1, 2, 3].map((index) => `<div class="invoice-form-item"><label class="field">Deskripsi ${index}<input name="itemDescription${index}" ${index === 1 ? "required" : ""} placeholder="${index === 1 ? "Implementasi sistem fase 1" : "Item tambahan (opsional)"}" /><span class="field-error"></span></label><label class="field">Jumlah<input name="quantity${index}" type="number" min="0.01" step="0.01" value="${index === 1 ? "1" : ""}" ${index === 1 ? "required" : ""} /><span class="field-error"></span></label><label class="field">Harga satuan<span class="input-prefix"><span>Rp</span><input name="unitPrice${index}" type="number" min="0" step="1000" ${index === 1 ? "required" : ""} /></span><span class="field-error"></span></label></div>`).join("")}</div><label class="field">Diskon nominal<span class="input-prefix"><span>Rp</span><input name="discount" type="number" min="0" step="1000" value="0" /></span></label><label class="field">Pajak (%)<input name="taxRate" type="number" min="0" max="100" step="0.1" value="0" /></label><label class="field">Tanggal terbit<input name="issuedAt" type="date" value="${dateInputAfter(0)}" required /><span class="field-error"></span></label><label class="field">Jatuh tempo<input name="dueAt" type="date" value="${inThirtyDays}" required /><span class="field-error"></span></label>`
    },
    scheduled_invoice: {
      kicker: "Jadwal penagihan", title: "Buat draft invoice recurring", description: `${escapeHTML(state.data.contracts.find((item) => item.id === targetSchedule?.contractId)?.title || "Kontrak")} · ${escapeHTML(targetSchedule?.reason || "Periode terjadwal")}. Draft belum dihitung sebagai tagihan terbit.`, submit: "Buat draft",
      fields: `<label class="field field-wide">Nomor draft invoice<input name="number" required value="DRAFT/INV/${escapeHTML(String(targetSchedule?.periodKey || "PERIODE").replaceAll("-", "/").toUpperCase())}" /><span class="field-error"></span></label><div class="schedule-draft-summary field-wide"><span>Periode <strong>${escapeHTML(targetSchedule?.periodKey || "—")}</strong></span><span>Jadwal <strong>${targetSchedule?.dueAt ? formatDate(targetSchedule.dueAt, { year: true }) : "—"}</strong></span><span>Nominal <strong>${targetSchedule?.amount ? formatIDR(targetSchedule.amount) : "Perlu review"}</strong></span></div><p class="inline-help field-wide">Finance masih harus memeriksa item, diskon, pajak, dokumen, lalu menerbitkannya secara terpisah.</p>`
    },
    invoice_action: {
      kicker: "Lifecycle invoice", title: state.recordSubtargetId === "issue" ? `Terbitkan ${escapeHTML(targetInvoice?.number || "invoice")}` : `Batalkan ${escapeHTML(targetInvoice?.number || "invoice")}`, description: state.recordSubtargetId === "issue" ? "Setelah terbit, nilai invoice masuk ke total tagihan dan piutang." : "Pembatalan tidak menghapus histori dan ditolak bila sudah ada pembayaran.", submit: state.recordSubtargetId === "issue" ? "Terbitkan invoice" : "Batalkan invoice",
      fields: `<label class="field field-wide">Bukti atau alasan<textarea name="evidence" rows="4" required placeholder="${state.recordSubtargetId === "issue" ? "Contoh: disetujui finance, dokumen sudah diperiksa" : "Jelaskan alasan pembatalan dan referensi koreksinya"}"></textarea><span class="field-error"></span></label>`
    },
    invoice_reminder: {
      kicker: "Pengingat pembayaran", title: `Siapkan pengingat ${escapeHTML(targetInvoice?.number || "invoice")}`, description: `${escapeHTML(targetInvoiceOpportunity?.account || "Pelanggan")} · sisa ${formatIDR(invoiceOutstanding)}. Pesan hanya disimpan sebagai draft dan tidak dikirim.`, submit: "Simpan draft pengingat",
      fields: `<label class="field">Channel<select name="channel" required><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label><label class="field">Penerima<input name="recipient" required placeholder="Nomor atau email pelanggan" /><span class="field-error"></span></label><label class="field field-wide">Referensi consent<input name="consentReference" required placeholder="Contoh: persetujuan komunikasi pada kontrak / form pelanggan" /><span class="field-error"></span></label><label class="field field-wide">Pesan<textarea name="message" rows="6" required>Halo, kami ingin mengingatkan bahwa invoice ${escapeHTML(targetInvoice?.number || "")} dengan sisa pembayaran ${escapeHTML(formatIDR(invoiceOutstanding))} jatuh tempo pada ${escapeHTML(targetInvoice?.dueAt ? formatDate(targetInvoice.dueAt, { year: true }) : "tanggal yang tercantum")}. Mohon kabari bila pembayaran sudah diproses atau ada hal yang perlu kami bantu. Terima kasih.</textarea><span class="field-error"></span></label><p class="inline-help field-wide">Tidak ada WhatsApp atau email yang dikirim dari prototype.</p>`
    },
    contract: {
      kicker: "Kontrak pelanggan", title: "Buat draf kontrak", description: "Kontrak menyimpan pola kesepakatan; tagihan dibuat per tahap atau periode.", submit: "Simpan draf",
      fields: `<label class="field field-wide">Peluang pelanggan<select name="opportunityId" required><option value="">Pilih peluang</option>${recordOpportunityOptions()}</select><span class="field-error"></span></label><label class="field field-wide">Judul kontrak<input name="title" required placeholder="Contoh: Implementasi sistem fase 1" /><span class="field-error"></span></label><label class="field">Nomor kontrak<input name="number" required placeholder="CTR/2026/001" /><span class="field-error"></span></label><label class="field">Nilai kontrak<span class="input-prefix"><span>Rp</span><input name="value" type="number" min="1" step="1000" required /></span><span class="field-error"></span></label><label class="field">Versi<input name="version" type="number" min="1" value="1" required /><span class="field-error"></span></label><label class="field">Berlaku sampai<input name="validUntil" type="date" value="${inThirtyDays}" required /><span class="field-error"></span></label><label class="field">Pola tagihan<select name="billingModel" required><option value="one_time">Sekali selesai</option><option value="milestone">Berdasarkan tahapan</option><option value="recurring">Berulang tetap</option><option value="usage">Sesuai pemakaian</option><option value="hybrid">Gabungan: biaya awal + berulang</option></select></label><label class="field" data-billing-for="one_time milestone recurring hybrid">Nilai per tagihan<span class="input-prefix"><span>Rp</span><input name="cycleAmount" type="number" min="0" step="1000" /></span><span class="field-error"></span></label><label class="field" data-billing-for="milestone recurring hybrid">Jumlah tahap / siklus<input name="cycles" type="number" min="1" value="1" /></label><label class="field" data-billing-for="recurring hybrid">Periode tagihan berulang<select name="billingInterval"><option value="monthly">Bulanan</option><option value="quarterly">Triwulanan</option><option value="yearly">Tahunan</option></select></label><label class="field">Tagihan pertama<input name="billingStartAt" type="date" value="${dateInputAfter(0)}" required /><span class="field-error"></span></label><label class="field">Waktu penagihan<select name="invoiceTiming"><option value="advance">Di muka</option><option value="arrears">Setelah periode/pemakaian</option></select></label><label class="field field-wide" data-billing-for="milestone usage hybrid">Rincian jadwal / dasar hitung<textarea name="scheduleNote" rows="3" placeholder="Tahapan, unit pemakaian, biaya awal, atau ketentuan prorata"></textarea><span class="field-error"></span></label>`
    },
    project: {
      kicker: "Pengelolaan pekerjaan · Fitur tambahan", title: "Buat proyek", description: "Proyek harus berangkat dari pesanan yang sudah disetujui.", submit: "Simpan proyek",
      fields: `<label class="field field-wide">Pesanan pelanggan<select name="opportunityId" required><option value="">Pilih pesanan</option>${recordOpportunityOptions(state.data.opportunities.filter((item) => item.status === "won"))}</select><span class="field-error"></span></label><label class="field field-wide">Nama proyek<input name="title" required placeholder="Nama pekerjaan yang mudah dikenali tim" /><span class="field-error"></span></label><label class="field">Penanggung jawab<select name="ownerId" required>${memberOptionList(["executive_admin", "delivery"], "mem-nadia")}</select><span class="field-error"></span></label><label class="field">Tanggal mulai<input name="startAt" type="date" value="${tomorrow}" required /><span class="field-error"></span></label><label class="field">Target selesai<input name="dueAt" type="date" value="${inThirtyDays}" required /><span class="field-error"></span></label><label class="field field-wide">Milestone berikutnya<input name="nextMilestone" required placeholder="Contoh: kickoff dan serah terima akses" /><span class="field-error"></span></label>`
    },
    consulting_engagement: {
      kicker: "Pekerjaan konsultasi", title: "Buat engagement klien", description: "Mulai ruang kerja lintas spesialis untuk pelanggan yang sudah terdaftar. Ini belum membuat kontrak atau invoice.", submit: "Buat engagement",
      fields: `<label class="field field-wide">Pelanggan<select name="accountId" required><option value="">Pilih pelanggan</option>${operationalConsultingData.accounts.map((account) => `<option value="${escapeHTML(account.id)}">${escapeHTML(account.name)}</option>`).join("")}</select><span class="field-error"></span></label><label class="field field-wide">Nama engagement<input name="title" required placeholder="Contoh: Pendirian PT dan aktivasi pajak" /><span class="field-error"></span></label><label class="field">Nomor referensi<input name="reference" placeholder="Dibuat otomatis oleh sistem" ${customerPipelineUsesServer() ? "disabled" : ""} /></label><label class="field">Engagement manager<select name="managerId" required>${memberOptionList(["executive_admin", "delivery"], state.dataAuthority.snapshot?.currentUserId || "mem-anggit")}</select><span class="field-error"></span></label><label class="field">Model komersial<select name="pricingModel" required><option value="fixed_fee">Sekali selesai</option><option value="retainer">Retainer bulanan</option><option value="milestone">Per tahap</option><option value="hourly">Per jam</option></select></label><label class="field">Nilai engagement<span class="input-prefix"><span>Rp</span><input name="contractValue" type="number" min="0" step="1000" value="0" required /></span><span class="field-error"></span></label><label class="field">Target selesai<input name="targetAt" type="date" value="${inThirtyDays}" required /><span class="field-error"></span></label><label class="field field-wide">Hasil pelanggan berikutnya<input name="nextMilestone" required placeholder="Contoh: Akta pendirian siap ditandatangani" /><span class="field-error"></span></label><p class="inline-help field-wide">PIC dipilih dari anggota aktif tenant. Nomor referensi dan audit dibuat server.</p>`
    },
    consulting_workstream: {
      kicker: "Struktur engagement", title: "Tambah layanan", description: `${escapeHTML(targetEngagement?.title || "Engagement")} · pisahkan tanggung jawab per keahlian agar perpindahan PIC tidak menghilangkan konteks.`, submit: "Tambah layanan",
      fields: `<label class="field field-wide">Nama layanan<input name="name" required placeholder="Contoh: Legal pendirian PT, pajak, atau pembukuan" /><span class="field-error"></span></label><label class="field">PIC layanan<select name="ownerId" required>${memberOptionList(["executive_admin", "delivery"], targetEngagement?.managerId, targetEngagement?.manager)}</select><span class="field-error"></span></label><label class="field">Bergantung pada<input name="dependency" placeholder="Opsional: dokumen atau layanan sebelumnya" /></label>`
    },
    consulting_milestone: {
      kicker: escapeHTML(targetWorkstream?.name || "Layanan"), title: "Tambah milestone", description: "Milestone adalah hasil yang bisa dibuktikan. Bobotnya dipakai menghitung progres engagement.", submit: "Tambah milestone",
      fields: `<input type="hidden" name="workstreamId" value="${escapeHTML(targetWorkstream?.id || "")}" /><label class="field field-wide">Hasil yang dituju<input name="title" required placeholder="Contoh: Akta pendirian terbit" /><span class="field-error"></span></label><label class="field">Bobot progres (%)<input name="weight" type="number" min="1" max="100" step="1" value="20" required /><span class="field-error"></span></label><label class="field">Target selesai<input name="dueAt" type="date" value="${inThirtyDays}" /></label>`
    },
    consulting_task: {
      kicker: escapeHTML(targetWorkstream?.name || "Layanan"), title: "Tambah tugas", description: "Catat pekerjaan operasional dengan PIC dan tenggat yang jelas.", submit: "Tambah tugas",
      fields: `<input type="hidden" name="workstreamId" value="${escapeHTML(targetWorkstream?.id || "")}" /><label class="field field-wide">Nama tugas<input name="title" required placeholder="Contoh: Verifikasi dokumen pemegang saham" /><span class="field-error"></span></label><label class="field">Penanggung jawab<select name="ownerId" required>${memberOptionList(["executive_admin", "delivery"], targetWorkstream?.ownerId, targetWorkstream?.owner)}</select><span class="field-error"></span></label><label class="field">Target selesai<input name="dueAt" type="date" value="${tomorrow}" required /><span class="field-error"></span></label>`
    },
    consulting_milestone_status: {
      kicker: "Kontrol progres", title: state.recordAction === "done" ? "Selesaikan milestone" : "Buka kembali milestone", description: `${escapeHTML(targetMilestone?.title || "Milestone")} · ${escapeHTML(targetMilestoneWorkstream?.name || "layanan")}. Progres akan dihitung ulang otomatis.`, submit: state.recordAction === "done" ? "Tandai selesai" : "Buka kembali",
      fields: `<input type="hidden" name="workstreamId" value="${escapeHTML(targetMilestoneWorkstream?.id || "")}" /><input type="hidden" name="milestoneId" value="${escapeHTML(targetMilestone?.id || "")}" /><input type="hidden" name="status" value="${escapeHTML(state.recordAction || "")}" /><label class="field field-wide">${state.recordAction === "done" ? "Bukti penyelesaian" : "Alasan dibuka kembali"}<textarea name="evidence" rows="4" required placeholder="${state.recordAction === "done" ? "Nomor dokumen, hasil review, atau tautan berkas" : "Jelaskan koreksi atau pekerjaan yang masih diperlukan"}"></textarea><span class="field-error"></span></label>`
    },
    consulting_task_status: {
      kicker: "Lifecycle tugas", title: "Perbarui status tugas", description: `${escapeHTML(targetEngagementTask?.title || "Tugas")} · PIC ${escapeHTML(targetEngagementTask?.owner || "belum diketahui")}. Setiap perubahan disimpan sebagai riwayat.`, submit: "Simpan status",
      fields: `<input type="hidden" name="taskId" value="${escapeHTML(targetEngagementTask?.id || "")}" /><label class="field">Status<select name="status" required><option value="done" ${(state.recordAction || targetEngagementTask?.status) === "done" ? "selected" : ""}>Selesai</option><option value="open" ${(state.recordAction || targetEngagementTask?.status) === "open" ? "selected" : ""}>Terbuka</option><option value="blocked" ${(state.recordAction || targetEngagementTask?.status) === "blocked" ? "selected" : ""}>Terhambat</option></select></label><label class="field field-wide">Bukti atau alasan<textarea name="evidence" rows="3" required placeholder="Hasil pekerjaan, keputusan klien, atau alasan perubahan"></textarea><span class="field-error"></span></label><label class="field field-wide">Bantuan atau dokumen yang dibutuhkan<textarea name="blocker" rows="3" placeholder="Wajib diisi bila status Terhambat"></textarea><span class="field-error"></span></label>`
    },
    assignment_handoff: {
      kicker: "Assignment lintas spesialis", title: "Serahkan tugas", description: `${escapeHTML(targetEngagementTask?.title || "Tugas")} · PIC saat ini ${escapeHTML(targetEngagementTask?.owner || "belum diketahui")}. PIC belum berubah sampai penerima menyetujui.`, submit: "Ajukan serah tugas",
      fields: `<input type="hidden" name="taskId" value="${escapeHTML(targetEngagementTask?.id || "")}" /><input type="hidden" name="fromAssignee" value="${escapeHTML(targetEngagementTask?.owner || "")}" /><label class="field field-wide">Penerima berikutnya<select name="toAssigneeId" required>${memberOptionList(["executive_admin", "delivery"], null, "", [targetEngagementTask?.ownerId].filter(Boolean))}</select><span class="field-error"></span></label><label class="field field-wide">Alasan dan hasil yang diteruskan<textarea name="reason" rows="3" required placeholder="Tahap apa yang selesai dan pekerjaan apa yang harus dilanjutkan?"></textarea><span class="field-error"></span></label><label class="field field-wide">Bukti / checklist serah tugas<textarea name="evidence" rows="3" required placeholder="Nomor dokumen, tautan berkas, keputusan klien, atau checklist yang sudah lengkap"></textarea><span class="field-error"></span></label><label class="field">Batas waktu penerimaan<input name="dueAt" type="date" value="${tomorrow}" required /><span class="field-error"></span></label><p class="inline-help field-wide">PIC saat ini tidak ditampilkan sebagai penerima. PIC baru berlaku setelah penerima menyetujui serah tugas.</p>`
    },
    assignment_review: {
      kicker: "Penerimaan assignment", title: "Periksa serah tugas", description: `${escapeHTML(targetEngagementTask?.handoff?.fromAssignee || "PIC sebelumnya")} → ${escapeHTML(targetEngagementTask?.handoff?.toAssignee || "PIC berikutnya")} · ${escapeHTML(targetEngagementTask?.handoff?.reason || "")}`, submit: "Simpan keputusan",
      fields: `<input type="hidden" name="taskId" value="${escapeHTML(targetEngagementTask?.id || "")}" /><label class="field">Keputusan<select name="decision" required><option value="accept">Terima assignment</option><option value="reject">Kembalikan untuk dilengkapi</option></select></label><div class="field"><span>Pemeriksa</span><strong>${escapeHTML(memberById(state.dataAuthority.snapshot?.currentUserId)?.name || targetEngagementTask?.handoff?.toAssignee || "Pengguna aktif")}</strong><small>Identitas diambil dari sesi, bukan diketik manual.</small></div><label class="field field-wide">Catatan pemeriksaan<textarea name="note" rows="4" required placeholder="Sebutkan dokumen yang sudah cukup atau yang masih kurang"></textarea><span class="field-error"></span></label>`
    },
    consulting_task_comment: {
      kicker: "Diskusi tugas", title: `Tulis komentar`, description: `${escapeHTML(targetEngagementTask?.title || "Tugas")} · komentar tersimpan pada konteks pekerjaan ini.`, submit: "Kirim komentar",
      fields: `<input type="hidden" name="taskId" value="${escapeHTML(targetEngagementTask?.id || "")}" /><label class="field field-wide">Komentar<textarea name="body" rows="5" maxlength="4000" required placeholder="Tulis perkembangan, pertanyaan, keputusan, atau hambatan..."></textarea><span class="field-error"></span></label><fieldset class="mention-picker field-wide"><legend>Beritahu anggota</legend><p>Pilih orang yang perlu melihat komentar ini. Notifikasi masih di dalam DEKTA.</p><div>${activeMembers(["executive_admin", "delivery", "sales", "reviewer"]).filter((member) => member.id !== (state.dataAuthority.snapshot?.currentUserId || "mem-anggit")).map((member) => `<label><input type="checkbox" name="mentionMemberIds" value="${escapeHTML(member.id)}" /><span class="mention-avatar">${escapeHTML(initials(member.name))}</span><span><strong>${escapeHTML(member.name)}</strong><small>${escapeHTML(member.jobTitle || ROLE_CATALOG.find((role) => member.roles.includes(role.id))?.label || "Anggota tim")}</small></span></label>`).join("")}</div></fieldset>`
    },
    task_expense: {
      kicker: "Biaya pekerjaan", title: "Catat pengeluaran tugas", description: `${escapeHTML(targetEngagement?.title || "Engagement")} · data akan masuk antrean Finance dan belum dianggap sebagai kas keluar.`, submit: "Kirim ke Finance",
      fields: `<label class="field field-wide">Tugas asal<select name="taskId" required><option value="">Pilih tugas</option>${targetEngagementTasks.map((task) => `<option value="${escapeHTML(task.id)}">${escapeHTML(task.workstreamName)} — ${escapeHTML(task.title)}</option>`).join("")}</select><span class="field-error"></span></label><label class="field">Kategori<input name="category" required placeholder="PNBP, transport, materai, vendor" /><span class="field-error"></span></label><label class="field">Nominal<span class="input-prefix"><span>Rp</span><input name="amount" type="number" min="1" step="1000" required /></span><span class="field-error"></span></label><label class="field field-wide">Keterangan<input name="description" required placeholder="Pengeluaran ini untuk apa?" /><span class="field-error"></span></label><label class="field">Dibayar oleh<input name="paidBy" value="Anggit" required /><span class="field-error"></span></label><label class="field">Perlakuan biaya<select name="treatment" required><option value="company_cost">Biaya perusahaan</option><option value="included_in_fee">Sudah termasuk fee</option><option value="employee_reimbursement">Reimbursement tim</option><option value="supplier_payable">Utang pemasok</option><option value="client_rebillable">Ditagihkan kembali ke klien</option></select></label><label class="field">Tanggal pengeluaran<input name="incurredAt" type="date" value="${dateInputAfter(0)}" required /><span class="field-error"></span></label><label class="field field-wide">Referensi bukti<input name="evidence" required placeholder="Nomor kuitansi, bukti transfer, atau tautan dokumen" /><span class="field-error"></span></label>`
    },
    expense_review: {
      kicker: "Finance review", title: "Periksa biaya pekerjaan", description: `${escapeHTML(targetExpense?.description || targetExpense?.category || "Pengeluaran")} · ${formatIDR(targetExpense?.amount || 0)} · ${escapeHTML(expenseTreatmentCopy(targetExpense?.treatment))}`, submit: "Simpan keputusan",
      fields: `<label class="field">Keputusan<select name="decision" required><option value="approve">Setujui klasifikasi</option><option value="reject">Kembalikan ke pengaju</option></select></label><div class="field"><span>Pemeriksa Finance</span><strong>${escapeHTML(memberById(state.dataAuthority.snapshot?.currentUserId)?.name || "Pengguna aktif")}</strong><small>Diambil dari sesi dan hak akses aktif.</small></div><label class="field field-wide">Catatan pemeriksaan<textarea name="note" rows="4" required placeholder="Validasi bukti, perlakuan pajak, dan tindakan berikutnya"></textarea><span class="field-error"></span></label><p class="inline-help field-wide">Persetujuan tidak mem-posting jurnal, membayar, atau menerbitkan invoice secara otomatis.</p>`
    },
    partner: {
      kicker: "Jaringan mitra · Fitur tambahan", title: "Tambah mitra", description: "Atur jenis hubungan dan komisi tanpa mengubah kebenaran transaksi pelanggan.", submit: "Simpan mitra",
      fields: `<label class="field field-wide">Nama mitra<input name="title" required placeholder="Nama perusahaan atau individu" /><span class="field-error"></span></label><label class="field">Jenis mitra<select name="partnerType" required><option>Reseller</option><option>Afiliator</option><option>Mitra referral</option></select></label><label class="field">Penanggung jawab<select name="ownerId" required>${memberOptionList(["executive_admin", "sales", "marketing"], "mem-anggit")}</select><span class="field-error"></span></label><label class="field">Komisi (%)<input name="commissionRate" type="number" min="0" max="100" step="0.5" value="5" required /><span class="field-error"></span></label><label class="field">Status<select name="status"><option value="review">Review</option><option value="active">Aktif</option></select></label>`
    },
    customer: {
      kicker: "Daftar pelanggan", title: "Tambah pelanggan", description: "Identitas yang sama akan digunakan oleh calon pelanggan, peluang, kontrak, proyek, dan tagihan.", submit: "Simpan pelanggan",
      fields: `<label class="field field-wide">Nama perusahaan atau usaha<input name="title" required placeholder="Contoh: PT Nusantara Sejahtera" /><span class="field-error"></span></label><label class="field">Nama kontak utama<input name="contact" required placeholder="Nama pengambil keputusan" /><span class="field-error"></span></label><label class="field">Sumber awal<select name="source" required><option value="">Pilih sumber</option><option value="Referral">Rujukan</option><option value="Organic search">Pencarian Google</option><option value="Instagram">Instagram</option><option value="Outbound">Dicari tim</option><option value="Partner">Mitra</option><option value="Existing client">Pelanggan lama</option><option value="Unknown">Belum diketahui</option></select><span class="field-error"></span></label>`
    },
    customer_edit: {
      kicker: "Database pelanggan", title: "Edit pelanggan", description: "Perubahan identitas mempertahankan relasi dan histori yang sudah ada.", submit: "Simpan perubahan",
      fields: `<label class="field field-wide">Nama perusahaan atau usaha<input name="title" value="${escapeHTML(targetAccount?.name || "")}" required /><span class="field-error"></span></label><label class="field">Kontak utama<input name="contact" value="${escapeHTML(targetContact?.displayName || "")}" required placeholder="Nama pengambil keputusan" /><span class="field-error"></span></label><label class="field">Sumber awal<select name="source" required>${[{ value: "Referral", label: "Rujukan" }, { value: "Organic search", label: "Pencarian Google" }, { value: "Instagram", label: "Instagram" }, { value: "Outbound", label: "Dicari tim" }, { value: "Partner", label: "Mitra" }, { value: "Existing client", label: "Pelanggan lama" }, { value: "Unknown", label: "Belum diketahui" }].map((source) => `<option value="${source.value}" ${targetAccount?.source === source.value ? "selected" : ""}>${source.label}</option>`).join("")}</select><span class="field-error"></span></label><label class="field">Segmentasi<select name="segment"><option ${targetAccount?.segment === "Prospek prioritas" ? "selected" : ""}>Prospek prioritas</option><option ${targetAccount?.segment === "UMKM" ? "selected" : ""}>UMKM</option><option ${targetAccount?.segment === "Enterprise" ? "selected" : ""}>Enterprise</option><option ${targetAccount?.segment === "Pelanggan aktif" ? "selected" : ""}>Pelanggan aktif</option><option ${targetAccount?.segment === "Dormant" ? "selected" : ""}>Dormant</option><option ${targetAccount?.segment === "Belum disegmentasi" ? "selected" : ""}>Belum disegmentasi</option></select></label><label class="field field-wide">Custom fields<span class="field-hint">Satu baris: nama field = nilai</span><textarea name="customFields" rows="4" placeholder="Industri = Retail\nJumlah cabang = 4">${escapeHTML(Object.entries(targetAccount?.customFields || {}).map(([key, value]) => `${key} = ${value}`).join("\n"))}</textarea></label>`
    },
    customer_merge: {
      kicker: "Deduplikasi pelanggan", title: "Gabungkan duplikat", description: `Data ${escapeHTML(targetAccount?.name || "pelanggan")} akan dipindahkan ke pelanggan tujuan. Histori tidak dihapus.`, submit: "Gabungkan pelanggan",
      fields: `<label class="field field-wide">Pelanggan tujuan<select name="targetAccountId" required><option value="">Pilih pelanggan utama</option>${operationalCustomerData.accounts.filter((item) => item.id !== targetId).map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join("")}</select><span class="field-error"></span></label><label class="field field-wide">Alasan merge<textarea name="reason" rows="3" required placeholder="Contoh: perusahaan yang sama dengan penulisan berbeda"></textarea><span class="field-error"></span></label>`
    },
    customer_import: {
      kicker: "Database pelanggan", title: "Impor pelanggan", description: "Format sederhana untuk prototype. Duplikat nama akan ditautkan, bukan dibuat ulang.", submit: "Tinjau dan impor",
      fields: `<label class="field field-wide">Format: perusahaan | kontak | sumber | segmen<textarea name="rows" rows="7" required placeholder="PT Nusantara | Budi | Referral | Enterprise"></textarea><span class="field-error"></span></label>`
    },
    report_schedule: {
      kicker: "Jadwal laporan", title: "Simpan jadwal review", description: "Konfigurasi ini menyiapkan kebiasaan review di DEKTA. Tidak mengirim email atau WhatsApp otomatis.", submit: "Simpan jadwal",
      fields: `<label class="field field-wide">Nama laporan<input name="title" required placeholder="Contoh: Review penjualan mingguan" /><span class="field-error"></span></label><label class="field">Frekuensi<select name="frequency" required><option>Mingguan</option><option>Bulanan</option><option>Kuartalan</option></select></label><label class="field">Penanggung jawab<select name="ownerId" required>${memberOptionList(["executive_admin", "delivery", "sales", "marketing", "finance", "reviewer"], "mem-anggit")}</select><span class="field-error"></span></label><label class="field field-wide">Catatan review<textarea name="note" rows="3" placeholder="Keputusan apa yang harus diambil dari laporan ini?"></textarea></label>`
    },
    calendar_event: {
      kicker: "Kalender kerja", title: "Tambah agenda", description: "Agenda manual tidak mengubah status follow-up, proyek, atau invoice.", submit: "Simpan agenda",
      fields: `<label class="field field-wide">Judul agenda<input name="title" required placeholder="Contoh: Review proposal bersama pelanggan" /><span class="field-error"></span></label><label class="field">Mulai<input name="startsAt" type="datetime-local" value="${dateInputAfter(1)}T09:00" required /><span class="field-error"></span></label><label class="field">Penanggung jawab<select name="ownerId" required>${memberOptionList(["executive_admin", "delivery", "sales", "marketing", "finance", "reviewer"], "mem-anggit")}</select><span class="field-error"></span></label><label class="field">Berulang<select name="recurrence"><option value="none">Tidak berulang</option><option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option></select></label><label class="field">Jumlah kejadian<input name="occurrences" type="number" min="1" max="52" value="1" required /></label><label class="field field-wide">Catatan<textarea name="note" rows="3" placeholder="Konteks atau bahan yang perlu disiapkan"></textarea></label>`
    },
    calendar_reschedule: {
      kicker: "Kalender kerja", title: "Jadwalkan ulang", description: escapeHTML(targetCalendarEvent?.title || "Agenda manual"), submit: "Simpan jadwal baru",
      fields: `<label class="field">Waktu baru<input name="startsAt" type="datetime-local" value="${targetCalendarEvent ? new Date(targetCalendarEvent.startsAt).toISOString().slice(0, 16) : `${dateInputAfter(1)}T09:00`}" required /><span class="field-error"></span></label><label class="field field-wide">Alasan perubahan<textarea name="reason" rows="3" required placeholder="Mengapa jadwal diubah?"></textarea><span class="field-error"></span></label>`
    },
    canvassing_visit: {
      kicker: "Kunjungan lapangan", title: `Catat hasil ${escapeHTML(targetSignal?.account || "prospek")}`, description: escapeHTML(targetSignal?.canvassing?.address || "Lokasi belum dicatat"), submit: "Simpan hasil kunjungan",
      fields: `<label class="field">Status kunjungan<select name="visitStatus" required><option value="completed">Selesai dikunjungi</option><option value="reschedule">Jadwalkan ulang</option><option value="not_found">Lokasi tidak ditemukan</option></select></label><label class="field field-wide">Hasil / bukti kunjungan<textarea name="result" rows="3" required placeholder="Siapa yang ditemui, kebutuhan, dan hasil percakapan"></textarea><span class="field-error"></span></label><label class="field">Jadwal berikutnya<input name="nextVisitAt" type="datetime-local" value="${dateInputAfter(7)}T09:00" /></label>`
    },
    canvassing_import: {
      kicker: "Impor kunjungan lapangan", title: "Impor daftar prospek", description: "Satu baris per prospek. Data tetap masuk sebagai calon pelanggan dan belum menjadi potensi penjualan.", submit: "Tinjau dan impor",
      fields: `<label class="field field-wide">Format: usaha | alamat | area | kontak | kebutuhan<textarea name="rows" rows="7" required placeholder="Bima Teknik | Jl. Magelang 8 | Sleman Barat | Pak Budi | POS dan stok"></textarea><span class="field-error"></span></label><label class="field">Mulai kunjungan<input name="visitAt" type="datetime-local" value="${dateInputAfter(1)}T09:00" required /></label><label class="field">Penanggung jawab<select name="ownerId" required>${memberOptionList(["executive_admin", "sales", "marketing"], "mem-anggit")}</select></label>`
    },
    contract_action: {
      kicker: "Lifecycle kontrak", title: `Kelola ${escapeHTML(targetContract?.number || "kontrak")}`, description: "Perubahan status dan revisi disimpan sebagai riwayat yang dapat ditelusuri.", submit: "Simpan perubahan",
      fields: `<label class="field field-wide">Tindakan<select name="action" required><option value="transition">${escapeHTML(nextContractLabel || "Perbarui status")}</option>${["draft", "sent"].includes(targetContract?.status) ? `<option value="revise">Buat versi revisi</option>` : ""}</select></label><input type="hidden" name="targetStatus" value="${escapeHTML(nextContractStatus || "")}" /><label class="field field-wide">Bukti atau alasan<textarea name="evidence" rows="3" required placeholder="Referensi email, dokumen, atau alasan revisi"></textarea><span class="field-error"></span></label>${nextContractStatus === "signed" ? `<label class="field">Tanggal ditandatangani<input name="effectiveAt" type="date" value="${dateInputAfter(0)}" required /><span class="field-error"></span></label>` : ""}`
    },
    payment: {
      kicker: "Pembayaran pelanggan", title: `Catat pembayaran ${escapeHTML(targetInvoice?.number || "invoice")}`, description: `Sisa tagihan ${formatIDR(invoiceOutstanding)}. Status invoice dihitung dari pembayaran yang terbukti.`, submit: "Simpan pembayaran",
      fields: `<label class="field">Nominal diterima<span class="input-prefix"><span>Rp</span><input name="amount" type="number" min="1" max="${invoiceOutstanding}" step="1000" value="${invoiceOutstanding}" required /></span><span class="field-error"></span></label><label class="field">Tanggal diterima<input name="receivedAt" type="date" value="${dateInputAfter(0)}" required /><span class="field-error"></span></label><label class="field field-wide">Referensi bukti<input name="evidence" required placeholder="Contoh: mutasi bank / bukti transfer #123" /><span class="field-error"></span></label>`
    },
    project_task: {
      kicker: "Pekerjaan proyek", title: "Tambah tugas", description: escapeHTML(targetProject?.name || "Proyek"), submit: "Simpan tugas",
      fields: `<label class="field field-wide">Tugas<input name="title" required placeholder="Hasil kerja yang jelas" /><span class="field-error"></span></label><label class="field">Penanggung jawab<select name="ownerId" required>${memberOptionList(["executive_admin", "delivery"], targetProject?.ownerId, targetProject?.owner)}</select><span class="field-error"></span></label><label class="field">Jatuh tempo<input name="dueAt" type="date" value="${tomorrow}" required /><span class="field-error"></span></label>`
    },
    project_file: {
      kicker: "File proyek", title: "Tambah referensi file", description: "Prototype menyimpan metadata dan tautan; upload storage asli masih production gate.", submit: "Simpan referensi",
      fields: `<label class="field field-wide">Nama file<input name="title" required placeholder="Contoh: BA-UAT-v2.pdf" /><span class="field-error"></span></label><label class="field field-wide">Tautan file<input name="url" type="url" required placeholder="https://drive.google.com/..." /><span class="field-error"></span></label>`
    },
    project_comment: {
      kicker: "Diskusi proyek", title: "Tambah catatan", description: escapeHTML(targetProject?.name || "Proyek"), submit: "Simpan catatan",
      fields: `<label class="field field-wide">Catatan<textarea name="body" rows="4" required placeholder="Keputusan, hambatan, atau konteks untuk tim"></textarea><span class="field-error"></span></label>`
    },
    commission_approve: {
      kicker: "Approval komisi", title: "Setujui komisi", description: `${escapeHTML(targetPartner?.name || "Mitra")} · ${formatIDR(targetCommission?.amount || 0)}`, submit: "Setujui komisi",
      fields: `<label class="field field-wide">Bukti transaksi pelanggan<input name="evidence" required placeholder="Nomor invoice atau bukti pembayaran pelanggan" /><span class="field-error"></span></label>`
    },
    commission_pay: {
      kicker: "Payout mitra", title: "Catat pembayaran komisi", description: `${escapeHTML(targetPartner?.name || "Mitra")} · ${formatIDR(targetCommission?.amount || 0)}`, submit: "Simpan payout",
      fields: `<label class="field">Tanggal dibayar<input name="paidAt" type="date" value="${dateInputAfter(0)}" required /><span class="field-error"></span></label><label class="field field-wide">Bukti payout<input name="evidence" required placeholder="Referensi transfer ke mitra" /><span class="field-error"></span></label>`
    },
    member_invite: {
      kicker: "Tim & akses", title: "Siapkan undangan anggota", description: "Prototype menyimpan undangan lokal. Email tidak dikirim sebelum provider terhubung.", submit: "Simpan undangan",
      fields: `<label class="field">Nama lengkap<input name="name" required placeholder="Nama anggota tim" /><span class="field-error"></span></label><label class="field">Email kerja<input name="email" type="email" required placeholder="nama@perusahaan.co.id" /><span class="field-error"></span></label><label class="field field-wide">Role awal<select name="role" required>${ROLE_CATALOG.filter((role) => role.id !== "executive_admin").map((role) => `<option value="${role.id}">${escapeHTML(role.label)} — ${escapeHTML(role.purpose)}</option>`).join("")}</select></label>`
    },
    role_change: {
      kicker: "Hak akses", title: `Atur akses ${escapeHTML(targetMember?.name || "anggota")}`, description: "Perubahan role dicatat bersama alasan dan identitas admin.", submit: "Terapkan perubahan",
      fields: `<label class="field field-wide">Role utama<select name="role" required>${ROLE_CATALOG.map((role) => `<option value="${role.id}" ${targetMember?.roles?.includes(role.id) ? "selected" : ""}>${escapeHTML(role.label)} — ${escapeHTML(role.purpose)}</option>`).join("")}</select></label><label class="field field-wide">Alasan perubahan<textarea name="reason" rows="3" required placeholder="Contoh: pindah fungsi kerja per 1 September"></textarea><span class="field-error"></span></label>`
    },
    plan_change: {
      kicker: "Paket & entitlement", title: `Ajukan paket ${escapeHTML(targetPlan?.name || "baru")}`, description: "Permintaan ini tidak mengaktifkan paket. Aktivasi menunggu event billing yang terverifikasi.", submit: "Simpan permintaan",
      fields: `<label class="field field-wide">Alasan kebutuhan<textarea name="reason" rows="3" required placeholder="Fitur, jumlah tim, atau kebutuhan operasi yang berubah"></textarea><span class="field-error"></span></label>`
    },
    document_generate: {
      kicker: "Document automation", title: "Buat draft dari record", description: "Sumber dan variabel akan disimpan pada audit dokumen.", submit: "Buat draft",
      fields: `<label class="field field-wide">Template<select name="templateId" required>${state.data.documentTemplates.map((template) => `<option value="${template.id}">${escapeHTML(template.name)}</option>`).join("")}</select></label><label class="field field-wide">Record sumber<select name="source" required><optgroup label="Kontrak">${state.data.contracts.map((item) => `<option value="contract:${item.id}">${escapeHTML(item.number)} — ${escapeHTML(item.title)}</option>`).join("")}</optgroup><optgroup label="Invoice">${state.data.invoices.map((item) => `<option value="invoice:${item.id}">${escapeHTML(item.number)}</option>`).join("")}</optgroup><optgroup label="Peluang">${state.data.opportunities.map((item) => `<option value="opportunity:${item.id}">${escapeHTML(item.account)} — ${escapeHTML(item.service)}</option>`).join("")}</optgroup></select></label><label class="field">Nama pelanggan<input name="customerName" required placeholder="Nama pada dokumen" /></label><label class="field">Nilai / nomor invoice<input name="value" required placeholder="Contoh: Rp 68.000.000" /></label><label class="field field-wide">Ruang lingkup / kebutuhan<textarea name="scope" rows="3" required placeholder="Ringkas dari record sumber, lalu periksa kembali"></textarea></label><label class="field field-wide">Langkah berikutnya<input name="nextStep" required placeholder="Contoh: review dan persetujuan kedua pihak" /></label>`
    },
    integration_setup: {
      kicker: "Integration Center", title: `Siapkan ${escapeHTML(targetIntegration?.kind || "integrasi")}`, description: "Jangan masukkan API key atau password di prototype ini.", submit: "Simpan konfigurasi",
      fields: `<label class="field">Provider<input name="provider" required placeholder="Nama provider yang akan dievaluasi" /></label><label class="field">Referensi sandbox / akun<input name="reference" required placeholder="Tanpa rahasia atau token" /></label><p class="inline-help field-wide">Hasilnya berstatus “perlu verifikasi”, bukan “terhubung”.</p>`
    },
    communication_draft: {
      kicker: "Outbox komunikasi", title: "Buat draft pesan", description: "Draft tidak dikirim keluar. Pastikan consent dan sumber konteksnya jelas.", submit: "Simpan draft",
      fields: `<label class="field">Channel<select name="channel" required><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label><label class="field">Penerima<input name="recipient" required placeholder="Nomor atau email pelanggan" /></label><label class="field field-wide">Sumber<select name="source" required>${state.data.invoices.map((item) => `<option value="invoice:${item.id}">Invoice ${escapeHTML(item.number)}</option>`).join("")}${state.data.contracts.map((item) => `<option value="contract:${item.id}">Kontrak ${escapeHTML(item.number)}</option>`).join("")}</select></label><label class="field field-wide">Referensi consent<input name="consentReference" required placeholder="Contoh: opt-in form 2026-08-20 / persetujuan kontrak pasal 5" /></label><label class="field field-wide">Pesan<textarea name="message" rows="5" required placeholder="Tulis pesan yang manusiawi dan spesifik"></textarea></label>`
    },
    copilot_review: {
      kicker: "Copilot review", title: state.recordSubtargetId === "approved" ? "Gunakan saran sebagai arahan" : "Tolak saran", description: escapeHTML(targetCopilot?.title || "Saran perlu ditinjau manusia."), submit: state.recordSubtargetId === "approved" ? "Setujui arahan" : "Tolak saran",
      fields: `<label class="field field-wide">Catatan keputusan<textarea name="note" rows="4" required placeholder="Mengapa saran ini relevan atau ditolak?"></textarea><span class="field-error"></span></label>`
    }
  };
  const config = configurations[type];
  if (!config) return;
  if (customerPipelineUsesServer() && type === "contract") {
    config.title = "Catat kontrak disetujui";
    config.description = "Kontrak aktif hanya dicatat dari peluang yang sudah disetujui pelanggan.";
    config.submit = "Simpan kontrak aktif";
    config.fields = `<label class="field field-wide">Peluang pelanggan<select name="opportunityId" required><option value="">Pilih peluang</option></select><span class="field-error"></span></label><label class="field field-wide">Judul kontrak<input name="title" required placeholder="Contoh: Implementasi sistem fase 1" /><span class="field-error"></span></label><label class="field">Nomor kontrak<input name="number" required placeholder="CTR/2026/001" /><span class="field-error"></span></label><label class="field">Nilai kontrak<span class="input-prefix"><span>Rp</span><input name="value" type="number" min="1" step="1000" required /></span><span class="field-error"></span></label><label class="field">Tanggal ditandatangani<input name="signedAt" type="date" value="${dateInputAfter(0)}" required /><span class="field-error"></span></label><p class="inline-help field-wide">Gunakan hanya setelah kontrak disetujui kedua pihak. Draft, revisi, dan approval dokumen belum disimpan pada alur server ini.</p>`;
  }
  if (customerPipelineUsesServer() && type === "project") {
    config.kicker = "Pekerjaan pelanggan";
    config.description = "Buat pekerjaan dari kontrak aktif agar delivery tetap terhubung ke pelanggan dan nilai komersialnya.";
    config.fields = `<label class="field field-wide">Pesanan pelanggan<select name="opportunityId" required><option value="">Pilih pesanan</option></select><span class="field-error"></span></label><label class="field field-wide">Nama pekerjaan<input name="title" required placeholder="Nama pekerjaan yang mudah dikenali tim" /><span class="field-error"></span></label><label class="field">Penanggung jawab<select name="ownerId" required>${memberOptionList(["executive_admin", "delivery"], state.dataAuthority.snapshot?.currentUserId || "")}</select><span class="field-error"></span></label><label class="field">Target selesai<input name="dueAt" type="date" value="${inThirtyDays}" required /><span class="field-error"></span></label>`;
  }
  if (customerPipelineUsesServer() && type === "invoice") {
    config.description = "Terbitkan nilai tagihan dari kontrak aktif. Rincian item, diskon, dan pajak tetap menjadi pengembangan berikutnya.";
    config.submit = "Terbitkan invoice";
    config.fields = `<label class="field field-wide">Pesanan pelanggan<select name="opportunityId" required><option value="">Pilih pesanan</option></select><span class="field-error"></span></label><label class="field">Nomor invoice<input name="number" required placeholder="INV/2026/001" /><span class="field-error"></span></label><label class="field">Nilai tagihan<span class="input-prefix"><span>Rp</span><input name="amount" type="number" min="1" step="1000" required /></span><span class="field-error"></span></label><label class="field">Tanggal terbit<input name="issuedAt" type="date" value="${dateInputAfter(0)}" required /><span class="field-error"></span></label><label class="field">Jatuh tempo<input name="dueAt" type="date" value="${inThirtyDays}" required /><span class="field-error"></span></label><label class="field field-wide">Referensi penerbitan<input name="evidence" required placeholder="Contoh: approval finance FIN-2026-001" /><span class="field-error"></span></label>`;
  }
  recordFormContent.innerHTML = `<div class="modal-head"><div><span class="section-kicker">${config.kicker}</span><h2 id="record-title">${config.title}</h2><p>${config.description}</p></div><button class="icon-button" type="button" data-close-record aria-label="Tutup form">${icon("close")}</button></div><div class="form-grid">${config.fields}<div class="record-errors field-wide" role="alert" hidden></div></div><div class="modal-actions"><button class="text-button" type="button" data-close-record>Batal</button><button class="primary-button" type="submit">${config.submit}</button></div>`;
  if (customerPipelineUsesServer() && ["contract", "project", "invoice"].includes(type) && recordForm.elements.opportunityId) {
    const won = operationalConsultingData.opportunities.filter((item) => item.status === "won");
    recordForm.elements.opportunityId.innerHTML = `<option value="">Pilih pesanan</option>${recordOpportunityOptions(won)}`;
    if (targetId && won.some((item) => item.id === targetId)) recordForm.elements.opportunityId.value = targetId;
  }
  recordDialog.showModal();
  syncBillingPlanFields();
  window.setTimeout(() => recordForm.querySelector("input, select")?.focus(), 0);
}

function syncBillingPlanFields() {
  if (state.recordType !== "contract") return;
  const model = recordForm.elements.billingModel?.value || "one_time";
  recordForm.querySelectorAll("[data-billing-for]").forEach((field) => { field.hidden = !field.dataset.billingFor.split(" ").includes(model); });
  if (model === "one_time") {
    if (recordForm.elements.cycles) recordForm.elements.cycles.value = 1;
    if (recordForm.elements.value?.value && recordForm.elements.cycleAmount) recordForm.elements.cycleAmount.value = recordForm.elements.value.value;
  }
}

async function handleRecordSubmit(event) {
  event.preventDefault();
  const invalid = [...recordForm.querySelectorAll("[required]")].filter((field) => !String(field.value).trim());
  recordForm.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  recordForm.querySelectorAll(".field-error").forEach((node) => { node.textContent = ""; });
  if (invalid.length) {
    invalid.forEach((field) => { field.setAttribute("aria-invalid", "true"); field.closest(".field")?.querySelector(".field-error")?.replaceChildren("Wajib diisi."); });
    invalid[0].focus();
    return;
  }
  const data = new FormData(recordForm);
  const now = new Date().toISOString();
  const opportunity = state.data.opportunities.find((item) => item.id === data.get("opportunityId"));
  let message = "Data baru disimpan.";
  let detailAfterSubmitId = null;
  let taskDetailAfterSubmitId = null;
  const showRecordErrors = (result) => {
    const box = recordForm.querySelector(".record-errors");
    box.hidden = false;
    box.textContent = result.errors.map((item) => item.message).join(" ");
    for (const error of result.errors) {
      const field = recordForm.elements[error.field];
      field?.setAttribute("aria-invalid", "true");
      field?.closest(".field")?.querySelector(".field-error")?.replaceChildren(error.message);
    }
    recordForm.querySelector("[aria-invalid='true']")?.focus();
  };
  const serverConsultingTypes = new Set(["consulting_engagement", "consulting_workstream", "consulting_milestone", "consulting_task", "consulting_milestone_status", "consulting_task_status", "consulting_task_comment", "assignment_handoff", "assignment_review", "task_expense", "expense_review"]);
  const serverTransactionTypes = new Set(["opportunity_win", "contract", "project", "invoice", "payment"]);
  if (customerPipelineUsesServer() && serverTransactionTypes.has(state.recordType)) {
    const operational = customerPipelineData();
    const selectedOpportunity = operational.opportunities.find((item) => item.id === (data.get("opportunityId") || state.recordTargetId));
    const selectedContract = operational.contracts.find((item) => item.opportunityId === selectedOpportunity?.id);
    const selectedInvoice = operational.invoices.find((item) => item.id === state.recordTargetId);
    const isoDate = (value) => value ? new Date(`${value}T12:00:00.000Z`).toISOString() : null;
    let command;
    let payload;
    if (state.recordType === "opportunity_win") {
      command = "opportunity.win";
      payload = { opportunityId: selectedOpportunity?.id, commitmentReference: data.get("commitmentReference"), committedAt: isoDate(data.get("committedAt")), value: Number(data.get("value")) };
    } else if (state.recordType === "contract") {
      command = "contract.create";
      payload = { opportunityId: selectedOpportunity?.id, accountId: selectedOpportunity?.accountId, number: data.get("number"), title: data.get("title"), value: Number(data.get("value")), currency: "IDR", signedAt: isoDate(data.get("signedAt")) };
    } else if (state.recordType === "project") {
      command = "project.create";
      payload = { accountId: selectedOpportunity?.accountId, opportunityId: selectedOpportunity?.id, contractId: selectedContract?.id, title: data.get("title"), ownerUserId: data.get("ownerId"), dueAt: isoDate(data.get("dueAt")) };
    } else if (state.recordType === "invoice") {
      command = "invoice.issue";
      payload = { accountId: selectedOpportunity?.accountId, contractId: selectedContract?.id, number: data.get("number"), amount: Number(data.get("amount")), currency: "IDR", issuedAt: isoDate(data.get("issuedAt")), dueAt: isoDate(data.get("dueAt")), evidenceReference: data.get("evidence") };
    } else {
      command = "payment.record";
      payload = { invoiceId: selectedInvoice?.id, amount: Number(data.get("amount")), currency: "IDR", receivedAt: isoDate(data.get("receivedAt")), evidenceReference: data.get("evidence") };
    }
    setFormSubmitting(recordForm, true);
    const result = await executeServerCommand(command, payload);
    setFormSubmitting(recordForm, false);
    if (!result.ok) {
      const box = recordForm.querySelector(".record-errors");
      box.hidden = false;
      box.textContent = serverErrorMessage(result.code);
      return;
    }
    await refreshDataAuthority({ rerender: false });
    recordDialog.close();
    render();
    updateNavCounts();
    if (state.recordType === "opportunity_win") openOpportunity(result.record.id);
    if (["contract", "project"].includes(state.recordType)) openOpportunity(selectedOpportunity.id);
    if (state.recordType === "invoice") openInvoice(result.record.id);
    if (state.recordType === "payment") openInvoice(selectedInvoice.id);
    showToast({ opportunity_win: "Persetujuan pelanggan tersimpan; nilai terkontrak dan audit diperbarui.", contract: "Kontrak aktif tersimpan di server.", project: "Pekerjaan pelanggan tersimpan di server.", invoice: "Invoice diterbitkan dan tersimpan di server.", payment: "Pembayaran berbukti tersimpan di server." }[state.recordType]);
    return;
  }
  if (customerPipelineUsesServer() && serverConsultingTypes.has(state.recordType)) {
    const operational = customerPipelineData();
    const engagement = operational.consultingEngagements.find((item) => item.id === state.recordTargetId);
    const tasks = engagement?.workstreams?.flatMap((workstream) => workstream.tasks || []) || [];
    const task = tasks.find((item) => item.id === (data.get("taskId") || state.recordSubtargetId));
    const milestone = engagement?.workstreams?.flatMap((workstream) => workstream.milestones || []).find((item) => item.id === (data.get("milestoneId") || state.recordSubtargetId));
    const expense = engagement?.expenses?.find((item) => item.id === state.recordSubtargetId);
    const isoDate = (value) => value ? new Date(`${value}T12:00:00.000Z`).toISOString() : null;
    let command;
    let payload;
    let reopenEngagementId = engagement?.id || null;
    let reopenTaskId = null;
    if (state.recordType === "consulting_engagement") {
      command = "consulting.engagement.create";
      payload = { accountId: data.get("accountId"), title: data.get("title"), managerUserId: data.get("managerId"), pricingModel: data.get("pricingModel"), contractValue: Number(data.get("contractValue")), currency: "IDR", targetAt: isoDate(data.get("targetAt")), nextMilestone: data.get("nextMilestone") };
    } else if (state.recordType === "consulting_workstream") {
      command = "consulting.workstream.create";
      payload = { engagementId: engagement?.id, name: data.get("name"), ownerUserId: data.get("ownerId"), dependency: data.get("dependency") };
    } else if (state.recordType === "consulting_milestone") {
      command = "consulting.milestone.create";
      payload = { engagementId: engagement?.id, workstreamId: data.get("workstreamId"), title: data.get("title"), weight: Number(data.get("weight")), dueAt: data.get("dueAt") ? isoDate(data.get("dueAt")) : null };
    } else if (state.recordType === "consulting_task") {
      command = "consulting.task.create";
      payload = { engagementId: engagement?.id, workstreamId: data.get("workstreamId"), title: data.get("title"), ownerUserId: data.get("ownerId"), dueAt: isoDate(data.get("dueAt")) };
    } else if (state.recordType === "consulting_milestone_status") {
      command = "consulting.milestone.status";
      payload = { milestoneId: milestone?.id, status: data.get("status"), evidence: data.get("evidence"), expectedLockVersion: milestone?.lockVersion };
    } else if (state.recordType === "consulting_task_status") {
      command = "consulting.task.status";
      payload = { taskId: task?.id, status: data.get("status"), evidence: data.get("evidence"), blocker: data.get("blocker"), expectedLockVersion: task?.lockVersion };
      reopenTaskId = task?.id;
    } else if (state.recordType === "consulting_task_comment") {
      command = "consulting.task.comment";
      payload = { taskId: task?.id, body: data.get("body"), mentionUserIds: data.getAll("mentionMemberIds") };
      reopenTaskId = task?.id;
    } else if (state.recordType === "assignment_handoff") {
      command = "consulting.assignment.submit";
      payload = { taskId: task?.id, toUserId: data.get("toAssigneeId"), reason: data.get("reason"), evidence: data.get("evidence"), dueAt: isoDate(data.get("dueAt")) };
      reopenTaskId = task?.id;
    } else if (state.recordType === "assignment_review") {
      command = "consulting.assignment.review";
      payload = { handoffId: task?.handoff?.id, decision: data.get("decision"), note: data.get("note"), expectedTaskLockVersion: task?.lockVersion };
      reopenTaskId = task?.id;
    } else if (state.recordType === "task_expense") {
      command = "consulting.expense.create";
      const expenseTask = tasks.find((item) => item.id === data.get("taskId"));
      payload = { taskId: expenseTask?.id, category: data.get("category"), description: data.get("description"), amount: Number(data.get("amount")), currency: "IDR", paidBy: data.get("paidBy"), treatment: data.get("treatment"), evidenceReference: data.get("evidence"), incurredAt: isoDate(data.get("incurredAt")) };
    } else if (state.recordType === "expense_review") {
      command = "consulting.expense.review";
      payload = { expenseId: expense?.id, decision: data.get("decision"), note: data.get("note"), expectedLockVersion: expense?.lockVersion };
    }
    setFormSubmitting(recordForm, true);
    const result = await executeConsultingServerCommand(command, payload);
    setFormSubmitting(recordForm, false);
    if (!result.ok) {
      const box = recordForm.querySelector(".record-errors");
      box.hidden = false;
      box.textContent = serverErrorMessage(result.code);
      if (result.code?.endsWith("_VERSION_CONFLICT")) await refreshDataAuthority({ rerender: false });
      return;
    }
    if (state.recordType === "consulting_engagement") reopenEngagementId = result.record.id;
    const continueActivation = state.activationMode;
    state.activationMode = false;
    await refreshDataAuthority({ rerender: false });
    recordDialog.close();
    const successCopy = {
      consulting_engagement: "Engagement tersimpan di server. Tambahkan layanan pertama untuk mulai bekerja.",
      consulting_workstream: "Layanan ditambahkan dan dapat langsung diberi milestone atau tugas.",
      consulting_milestone: "Milestone ditambahkan; progres akan mengikuti bobot hasil yang selesai.",
      consulting_task: "Tugas ditambahkan dengan PIC anggota aktif.",
      consulting_milestone_status: `Status milestone tersimpan. Progres kini ${result.progress ?? 0}%.`,
      consulting_task_status: "Status tugas dan bukti perubahannya tersimpan.",
      consulting_task_comment: `${result.notificationIntents?.length || 0} mention masuk antrean notifikasi internal.`,
      assignment_handoff: "Serah tugas diajukan; PIC belum berubah sebelum penerima menyetujui.",
      assignment_review: result.record?.status === "accepted" ? "Assignment diterima dan PIC resmi diperbarui." : "Serah tugas dikembalikan; PIC lama tetap bertanggung jawab.",
      task_expense: "Pengeluaran masuk antrean Finance dan belum menjadi kas keluar.",
      expense_review: result.record?.financeState === "approved" ? "Klasifikasi biaya disetujui tanpa transaksi eksternal otomatis." : "Biaya dikembalikan ke pengaju."
    };
    if (continueActivation) {
      state.view = "command";
      state.dashboard = "summary";
      render();
      focusActivationNext();
      showToast(`${successCopy[state.recordType] || "Perubahan tersimpan di server."} Lanjutkan langkah berikutnya.`);
      return;
    }
    render();
    if (reopenEngagementId) reopenTaskId ? openConsultingTask(reopenEngagementId, reopenTaskId) : openConsultingEngagement(reopenEngagementId);
    showToast(successCopy[state.recordType] || "Perubahan tersimpan di server.");
    return;
  }
  if (state.recordType === "consulting_engagement") {
    const result = createConsultingEngagement(state.data.accounts, { accountId: data.get("accountId"), title: data.get("title"), reference: data.get("reference"), managerId: data.get("managerId"), memberships: state.data.memberships, organizationId: state.data.organization.id, pricingModel: data.get("pricingModel"), contractValue: data.get("contractValue"), targetAt: data.get("targetAt"), nextMilestone: data.get("nextMilestone"), actor: "Anggit" }, new Date());
    if (!result.ok) { showRecordErrors(result); return; }
    state.data.consultingEngagements.unshift(result.engagement);
    detailAfterSubmitId = result.engagement.id;
    message = `Engagement ${result.engagement.title} dibuat. Tambahkan layanan pertama untuk mulai bekerja.`;
  } else if (state.recordType === "consulting_workstream") {
    const index = state.data.consultingEngagements.findIndex((item) => item.id === state.recordTargetId);
    const result = addConsultingWorkstream(state.data.consultingEngagements[index], { name: data.get("name"), ownerId: data.get("ownerId"), memberships: state.data.memberships, organizationId: state.data.organization.id, dependency: data.get("dependency"), actor: "Anggit" }, new Date());
    if (!result.ok) { showRecordErrors(result); return; }
    state.data.consultingEngagements[index] = result.engagement;
    detailAfterSubmitId = result.engagement.id;
    message = `Layanan ${result.workstream.name} ditambahkan.`;
  } else if (state.recordType === "consulting_milestone") {
    const index = state.data.consultingEngagements.findIndex((item) => item.id === state.recordTargetId);
    const result = addConsultingMilestone(state.data.consultingEngagements[index], { workstreamId: data.get("workstreamId"), title: data.get("title"), weight: data.get("weight"), dueAt: data.get("dueAt"), actor: "Anggit" }, new Date());
    if (!result.ok) { showRecordErrors(result); return; }
    state.data.consultingEngagements[index] = result.engagement;
    detailAfterSubmitId = result.engagement.id;
    message = `Milestone ${result.milestone.title} ditambahkan dengan bobot ${result.milestone.weight}%.`;
  } else if (state.recordType === "consulting_task") {
    const index = state.data.consultingEngagements.findIndex((item) => item.id === state.recordTargetId);
    const result = addConsultingTask(state.data.consultingEngagements[index], { workstreamId: data.get("workstreamId"), title: data.get("title"), ownerId: data.get("ownerId"), memberships: state.data.memberships, organizationId: state.data.organization.id, dueAt: data.get("dueAt"), actor: "Anggit" }, new Date());
    if (!result.ok) { showRecordErrors(result); return; }
    state.data.consultingEngagements[index] = result.engagement;
    detailAfterSubmitId = result.engagement.id;
    message = `Tugas ${result.task.title} ditambahkan untuk ${result.task.owner}.`;
  } else if (state.recordType === "consulting_milestone_status") {
    const index = state.data.consultingEngagements.findIndex((item) => item.id === state.recordTargetId);
    const result = changeConsultingMilestoneStatus(state.data.consultingEngagements[index], { workstreamId: data.get("workstreamId"), milestoneId: data.get("milestoneId"), status: data.get("status"), evidence: data.get("evidence"), actor: "Anggit" }, new Date());
    if (!result.ok) { showRecordErrors(result); return; }
    state.data.consultingEngagements[index] = result.engagement;
    detailAfterSubmitId = result.engagement.id;
    message = data.get("status") === "done" ? `Milestone selesai. Progres engagement kini ${result.progress}%.` : `Milestone dibuka kembali. Progres engagement kini ${result.progress}%.`;
  } else if (state.recordType === "consulting_task_status") {
    const index = state.data.consultingEngagements.findIndex((item) => item.id === state.recordTargetId);
    const result = changeConsultingTaskStatus(state.data.consultingEngagements[index], { taskId: data.get("taskId"), status: data.get("status"), evidence: data.get("evidence"), blocker: data.get("blocker"), actor: "Anggit" }, new Date());
    if (!result.ok) { showRecordErrors(result); return; }
    state.data.consultingEngagements[index] = result.engagement;
    detailAfterSubmitId = result.engagement.id;
    message = `Status tugas diperbarui menjadi ${consultingStatusCopy(result.task.status)[0]}.`;
  } else if (state.recordType === "consulting_task_comment") {
    const index = state.data.consultingEngagements.findIndex((item) => item.id === state.recordTargetId);
    const result = addConsultingTaskComment(state.data.consultingEngagements[index], { taskId: data.get("taskId"), body: data.get("body"), authorId: "mem-anggit", mentionMemberIds: data.getAll("mentionMemberIds"), memberships: state.data.memberships, organizationId: state.data.organization.id }, new Date());
    if (!result.ok) { showRecordErrors(result); return; }
    state.data.consultingEngagements[index] = result.engagement;
    detailAfterSubmitId = result.engagement.id;
    taskDetailAfterSubmitId = result.task.id;
    message = result.comment.mentions.length ? `Komentar disimpan dan ${result.comment.notificationIntents.length} mention masuk antrean notifikasi DEKTA.` : "Komentar disimpan pada tugas.";
  } else if (state.recordType === "assignment_handoff") {
    const index = state.data.consultingEngagements.findIndex((item) => item.id === state.recordTargetId);
    const result = submitAssignmentHandoff(state.data.consultingEngagements[index], { taskId: data.get("taskId"), fromAssignee: data.get("fromAssignee"), toAssigneeId: data.get("toAssigneeId"), memberships: state.data.memberships, organizationId: state.data.organization.id, reason: data.get("reason"), evidence: data.get("evidence"), dueAt: data.get("dueAt"), actor: "Anggit" }, new Date());
    if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = result.errors.map((item) => item.message).join(" "); return; }
    state.data.consultingEngagements[index] = result.engagement;
    detailAfterSubmitId = result.engagement.id;
    message = `Serah tugas diajukan ke ${result.handoff.toAssignee}; PIC belum berubah.`;
  } else if (state.recordType === "assignment_review") {
    const index = state.data.consultingEngagements.findIndex((item) => item.id === state.recordTargetId);
    const result = reviewAssignmentHandoff(state.data.consultingEngagements[index], { taskId: data.get("taskId"), decision: data.get("decision"), reviewerId: data.get("reviewerId"), memberships: state.data.memberships, organizationId: state.data.organization.id, note: data.get("note") }, new Date());
    if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = result.errors.map((item) => item.message).join(" "); return; }
    state.data.consultingEngagements[index] = result.engagement;
    detailAfterSubmitId = result.engagement.id;
    message = result.handoff.status === "accepted" ? `Assignment diterima oleh ${result.handoff.toAssignee}.` : "Serah tugas dikembalikan dan PIC lama tetap bertanggung jawab.";
  } else if (state.recordType === "task_expense") {
    const index = state.data.consultingEngagements.findIndex((item) => item.id === state.recordTargetId);
    const result = createTaskExpense(state.data.consultingEngagements[index], { taskId: data.get("taskId"), category: data.get("category"), description: data.get("description"), amount: data.get("amount"), paidBy: data.get("paidBy"), treatment: data.get("treatment"), evidence: data.get("evidence"), incurredAt: data.get("incurredAt"), actor: "Anggit" }, new Date());
    if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = result.errors.map((item) => item.message).join(" "); return; }
    state.data.consultingEngagements[index] = result.engagement;
    detailAfterSubmitId = result.engagement.id;
    message = `Pengeluaran ${formatIDR(result.expense.amount)} masuk antrean review Finance.`;
  } else if (state.recordType === "expense_review") {
    const index = state.data.consultingEngagements.findIndex((item) => item.id === state.recordTargetId);
    const reviewer = memberById(data.get("reviewerId"));
    const result = reviewTaskExpense(state.data.consultingEngagements[index], state.recordSubtargetId, { decision: data.get("decision"), reviewer: reviewer?.name || "Belum ditentukan", note: data.get("note") }, new Date());
    if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = result.errors.map((item) => item.message).join(" "); return; }
    state.data.consultingEngagements[index] = result.engagement;
    detailAfterSubmitId = result.engagement.id;
    message = result.expense.financeState === "approved" ? "Klasifikasi biaya disetujui; belum ada transaksi eksternal yang dijalankan." : "Biaya dikembalikan ke pengaju untuk diperbaiki.";
  } else if (state.recordType === "member_invite") {
    state.data.memberships.unshift({ id: createId("mem"), organizationId: state.data.organization.id, name: data.get("name").trim(), email: data.get("email").trim(), status: "invited_preview", roles: [data.get("role")], invitedBy: "Anggit", invitedAt: now, externalInvitationSent: false });
    message = `Undangan ${data.get("name")} disimpan tanpa mengirim email.`;
  } else if (state.recordType === "role_change") {
    const index = state.data.memberships.findIndex((item) => item.id === state.recordTargetId);
    const actor = state.data.memberships.find((item) => item.id === "mem-anggit") || state.data.memberships[0];
    const result = requestRoleChange({ actor, member: state.data.memberships[index], nextRoles: [data.get("role")], reason: data.get("reason"), organizationId: state.data.organization.id }, new Date());
    if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = "Perubahan role ditolak oleh aturan akses."; return; }
    state.data.memberships[index] = result.member;
    state.data.roleChangeAudit.unshift(result.request);
    message = `Akses ${result.member.name} diperbarui dan diaudit.`;
  } else if (state.recordType === "plan_change") {
    const result = requestPlanChange({ subscription: state.data.subscription, planCode: state.recordTargetId, actor: "Anggit", reason: data.get("reason") }, new Date());
    if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = "Permintaan paket belum lengkap."; return; }
    state.data.planChangeRequests.unshift(result.request);
    message = "Permintaan paket disimpan; belum mengubah entitlement.";
  } else if (state.recordType === "document_generate") {
    const template = state.data.documentTemplates.find((item) => item.id === data.get("templateId"));
    const [sourceType, sourceId] = String(data.get("source")).split(":");
    const result = generateDocumentDraft({ template, source: { type: sourceType, id: sourceId }, variables: { customerName: data.get("customerName"), scope: data.get("scope"), value: data.get("value"), invoiceNumber: data.get("value"), nextStep: data.get("nextStep") }, actor: "Anggit" }, new Date());
    if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = `Variabel dokumen belum lengkap: ${(result.missing || []).join(", ")}.`; return; }
    state.data.generatedDocuments.unshift(result.document);
    message = `${result.document.title} dibuat sebagai draft.`;
  } else if (state.recordType === "integration_setup") {
    const result = prepareIntegrationConnection({ kind: state.recordTargetId, provider: data.get("provider"), actor: "Anggit", reference: data.get("reference") }, new Date());
    if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = "Konfigurasi integrasi belum lengkap."; return; }
    const index = state.data.integrations.findIndex((item) => item.kind === state.recordTargetId);
    state.data.integrations[index] = result.connection;
    message = `${result.connection.provider} disiapkan dan masih perlu verifikasi.`;
  } else if (state.recordType === "communication_draft") {
    const [sourceType, sourceId] = String(data.get("source")).split(":");
    const result = createCommunicationDraft({ channel: data.get("channel"), recipient: data.get("recipient"), message: data.get("message"), consentReference: data.get("consentReference"), source: { type: sourceType, id: sourceId }, actor: "Anggit" }, new Date());
    if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = "Penerima, consent, sumber, dan isi pesan wajib lengkap."; return; }
    state.data.communicationDrafts.unshift(result.draft);
    message = "Draft pesan disimpan; tidak ada pesan yang dikirim.";
  } else if (state.recordType === "copilot_review") {
    const suggestion = getCopilotSuggestionById(state.recordTargetId);
    const result = reviewCopilotSuggestion(suggestion, { decision: state.recordSubtargetId, actor: "Anggit", note: data.get("note") }, new Date());
    if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = "Keputusan dan catatan review wajib diisi."; return; }
    state.data.copilotReviews = [result.suggestion, ...state.data.copilotReviews.filter((item) => item.id !== result.suggestion.id)];
    message = result.suggestion.status === "approved_for_manual_action" ? "Arahan disetujui; tetap perlu dikerjakan manusia." : "Saran Copilot ditolak dan alasannya disimpan.";
  } else if (state.recordType === "calendar_event") {
    const owner = memberById(data.get("ownerId"));
    const result = createManualCalendarEvent({ title: data.get("title"), startsAt: data.get("startsAt"), owner: owner?.name || "Belum ditentukan", recurrence: data.get("recurrence"), occurrences: data.get("occurrences"), note: data.get("note") }, new Date());
    if (!result.ok) {
      const box = recordForm.querySelector(".record-errors");
      box.hidden = false;
      box.textContent = result.errors.map((item) => item.message).join(" ");
      return;
    }
    state.data.calendarEvents.unshift(result.event);
    message = `Agenda ${result.event.title} ditambahkan.`;
  } else if (state.recordType === "calendar_reschedule") {
    const index = state.data.calendarEvents.findIndex((item) => item.id === state.recordTargetId);
    const result = rescheduleManualCalendarEvent(state.data.calendarEvents[index], { startsAt: data.get("startsAt"), reason: data.get("reason"), actor: "Anggit" }, new Date());
    if (!result.ok) {
      const box = recordForm.querySelector(".record-errors");
      box.hidden = false;
      box.textContent = result.errors.map((item) => item.message).join(" ");
      return;
    }
    state.data.calendarEvents[index] = result.event;
    message = `Agenda ${result.event.title} dijadwalkan ulang.`;
  } else if (state.recordType === "canvassing_visit") {
    const index = state.data.signals.findIndex((item) => item.id === state.recordTargetId);
    const signal = { ...state.data.signals[index], canvassing: { ...state.data.signals[index].canvassing } };
    const visitStatus = data.get("visitStatus");
    signal.canvassing.result = data.get("result").trim();
    signal.canvassing.checkedInAt = now;
    signal.canvassing.visitStatus = visitStatus === "reschedule" ? "planned" : visitStatus;
    if (visitStatus === "reschedule" && data.get("nextVisitAt")) signal.canvassing.visitAt = new Date(data.get("nextVisitAt")).toISOString();
    signal.activity = [{ at: now, kind: "canvassing_visit", label: `Hasil kunjungan dicatat oleh Anggit`, detail: signal.canvassing.result, visitStatus }, ...(signal.activity || [])];
    state.data.signals[index] = signal;
    message = visitStatus === "reschedule" ? `Kunjungan ${signal.account} dijadwalkan ulang.` : `Hasil kunjungan ${signal.account} disimpan.`;
  } else if (state.recordType === "canvassing_import") {
    const rows = String(data.get("rows") || "").split("\n").map((row) => row.split("|").map((value) => value.trim())).filter((row) => row[0] && row[1] && row[2]);
    if (!rows.length) {
      const box = recordForm.querySelector(".record-errors");
      box.hidden = false;
      box.textContent = "Tidak ada baris valid. Minimal isi usaha, alamat, dan area.";
      return;
    }
    const baseVisit = new Date(data.get("visitAt"));
    rows.forEach((row, index) => {
      const relation = linkRelationship(state.data, { account: row[0], contact: row[3] || "", source: "Canvassing", at: now });
      const visitAt = new Date(baseVisit); visitAt.setMinutes(baseVisit.getMinutes() + (index * 45));
      const owner = memberById(data.get("ownerId"));
      state.data.signals.unshift({ id: createId("sig"), account: row[0], accountId: relation.accountId, contact: row[3] || "Belum teridentifikasi", contactId: relation.contactId, need: row[4] || "Perlu observasi lapangan", source: "Canvassing", ownerId: owner?.id || null, owner: owner?.name || "Belum ditentukan", capturedAt: now, status: "inbox", note: "Diimpor melalui daftar canvassing.", canvassing: { address: row[1], area: row[2], visitAt: visitAt.toISOString(), routeOrder: index + 1, visitStatus: "planned", checkedInAt: null, result: null } });
    });
    message = `${rows.length} prospek canvassing diimpor untuk ditinjau.`;
  } else if (state.recordType === "invoice") {
    const items = [1, 2, 3].map((index) => ({ description: data.get(`itemDescription${index}`), quantity: data.get(`quantity${index}`), unitPrice: data.get(`unitPrice${index}`) })).filter((item) => String(item.description || "").trim());
    const breakdown = calculateInvoiceBreakdown({ items, discount: data.get("discount"), taxRate: data.get("taxRate") });
    if (!breakdown.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = "Item, jumlah, dan harga invoice belum valid."; return; }
    state.data.invoices.unshift({ id: createId("inv"), opportunityId: opportunity.id, number: data.get("number").trim(), amount: breakdown.total, status: "issued", issuedAt: dateInputToISO(data.get("issuedAt")), dueAt: dateInputToISO(data.get("dueAt")), ...breakdown, activity: [{ at: now, kind: "invoice_issued", label: "Invoice dibuat dan diterbitkan oleh Anggit", evidence: "Pembuatan manual dari Finance Operations" }] });
    message = `Invoice ${data.get("number")} dibuat untuk ${opportunity.account}.`;
  } else if (state.recordType === "scheduled_invoice") {
    const scheduleItem = buildBillingSchedule(state.data.contracts, state.data.invoices, new Date(), 120).find((item) => item.id === state.recordTargetId);
    const contract = state.data.contracts.find((item) => item.id === scheduleItem?.contractId);
    const sourceOpportunity = state.data.opportunities.find((item) => item.id === scheduleItem?.opportunityId);
    const result = createScheduledInvoiceDraft(contract, sourceOpportunity, scheduleItem, { number: data.get("number"), actor: "Anggit" }, new Date());
    if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = result.errors.map((item) => item.message).join(" "); return; }
    state.data.invoices.unshift(result.invoice);
    message = `Draft ${result.invoice.number} dibuat; belum masuk total tagihan.`;
  } else if (state.recordType === "invoice_action") {
    const invoiceIndex = state.data.invoices.findIndex((item) => item.id === state.recordTargetId);
    const result = applyInvoiceAction(state.data.invoices[invoiceIndex], state.data.payments, { action: state.recordSubtargetId, actor: "Anggit", evidence: data.get("evidence") }, new Date());
    if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = result.errors.map((item) => item.message).join(" "); return; }
    state.data.invoices[invoiceIndex] = result.invoice;
    message = state.recordSubtargetId === "issue" ? `Invoice ${result.invoice.number} diterbitkan.` : `Invoice ${result.invoice.number} dibatalkan dengan audit.`;
  } else if (state.recordType === "invoice_reminder") {
    const invoice = state.data.invoices.find((item) => item.id === state.recordTargetId);
    const result = createCommunicationDraft({ channel: data.get("channel"), recipient: data.get("recipient"), message: data.get("message"), consentReference: data.get("consentReference"), source: { type: "invoice", id: invoice?.id }, actor: "Anggit" }, new Date());
    if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = "Penerima, consent, invoice, dan isi pengingat wajib lengkap."; return; }
    result.draft.kind = "payment_reminder";
    state.data.communicationDrafts.unshift(result.draft);
    message = `Draft pengingat ${invoice.number} disimpan; belum dikirim.`;
  } else if (state.recordType === "contract") {
    const plan = createBillingPlan({ model: data.get("billingModel"), cycleAmount: data.get("cycleAmount"), cycles: data.get("cycles"), interval: data.get("billingInterval"), startAt: dateInputToISO(data.get("billingStartAt")), invoiceTiming: data.get("invoiceTiming"), scheduleNote: data.get("scheduleNote") }, Number(data.get("value")));
    if (!plan.ok) {
      const box = recordForm.querySelector(".record-errors");
      box.hidden = false;
      box.textContent = plan.errors.map((item) => item.message).join(" ");
      return;
    }
    state.data.contracts.unshift({ id: createId("ctr"), opportunityId: opportunity.id, accountId: opportunity.accountId, number: data.get("number").trim(), title: data.get("title").trim(), value: Number(data.get("value")), status: "draft", version: Number(data.get("version")), validUntil: dateInputToISO(data.get("validUntil")), signedAt: null, owner: opportunity.owner, updatedAt: now, billingPlan: plan.billingPlan });
    message = `Draft kontrak ${data.get("number")} dibuat.`;
  } else if (state.recordType === "contract_action") {
    const index = state.data.contracts.findIndex((item) => item.id === state.recordTargetId);
    const contract = state.data.contracts[index];
    const result = data.get("action") === "revise"
      ? reviseContract(contract, { actor: "Anggit", reason: data.get("evidence") }, new Date())
      : applyContractAction(contract, { actor: "Anggit", targetStatus: data.get("targetStatus"), evidence: data.get("evidence"), effectiveAt: data.get("effectiveAt") }, new Date());
    if (!result.ok) {
      const box = recordForm.querySelector(".record-errors");
      box.hidden = false;
      box.textContent = result.errors.map((item) => item.message).join(" ");
      return;
    }
    state.data.contracts[index] = result.contract;
    message = data.get("action") === "revise" ? `Kontrak ${contract.number} direvisi menjadi v${result.contract.version}.` : `Status kontrak ${contract.number} menjadi ${contractStatusCopy(result.contract.status)[0]}.`;
  } else if (state.recordType === "payment") {
    const invoiceIndex = state.data.invoices.findIndex((item) => item.id === state.recordTargetId);
    const invoice = state.data.invoices[invoiceIndex];
    const result = recordInvoicePayment(invoice, state.data.payments, { actor: "Anggit", amount: data.get("amount"), receivedAt: dateInputToISO(data.get("receivedAt")), evidence: data.get("evidence") }, new Date());
    if (!result.ok) {
      const box = recordForm.querySelector(".record-errors");
      box.hidden = false;
      box.textContent = result.errors.map((item) => item.message).join(" ");
      return;
    }
    state.data.invoices[invoiceIndex] = result.invoice;
    state.data.payments.unshift(result.payment);
    message = result.outstanding === 0 ? `Invoice ${invoice.number} sekarang lunas.` : `Pembayaran dicatat. Sisa ${formatIDR(result.outstanding)}.`;
  } else if (["project_task", "project_file", "project_comment"].includes(state.recordType)) {
    const projectIndex = state.data.projects.findIndex((item) => item.id === state.recordTargetId);
    const project = { ...state.data.projects[projectIndex] };
    if (state.recordType === "project_task") {
      const owner = memberById(data.get("ownerId"));
      project.tasks = [{ id: createId("tsk"), title: data.get("title").trim(), ownerId: owner?.id || null, owner: owner?.name || "Belum ditentukan", dueAt: dateInputToISO(data.get("dueAt")), status: "open", createdAt: now }, ...(project.tasks || [])];
      message = `Tugas ditambahkan ke ${project.name}.`;
    } else if (state.recordType === "project_file") {
      project.files = [{ id: createId("fil"), name: data.get("title").trim(), url: data.get("url").trim(), addedBy: "Anggit", addedAt: now }, ...(project.files || [])];
      message = `Referensi file ditambahkan ke ${project.name}.`;
    } else {
      project.comments = [{ id: createId("cmt"), body: data.get("body").trim(), author: "Anggit", at: now }, ...(project.comments || [])];
      message = `Catatan ditambahkan ke ${project.name}.`;
    }
    state.data.projects[projectIndex] = project;
  } else if (["commission_approve", "commission_pay"].includes(state.recordType)) {
    const partnerIndex = state.data.partners.findIndex((item) => item.id === state.recordTargetId);
    const partner = state.data.partners[partnerIndex];
    const result = state.recordType === "commission_approve"
      ? approvePartnerCommission(partner, state.recordSubtargetId, { actor: "Anggit", evidence: data.get("evidence") }, new Date())
      : recordPartnerPayout(partner, state.recordSubtargetId, { actor: "Anggit", evidence: data.get("evidence"), paidAt: dateInputToISO(data.get("paidAt")) }, new Date());
    if (!result.ok) {
      const box = recordForm.querySelector(".record-errors");
      box.hidden = false;
      box.textContent = result.errors.map((item) => item.message).join(" ");
      return;
    }
    state.data.partners[partnerIndex] = result.partner;
    message = state.recordType === "commission_approve" ? `Komisi ${partner.name} disetujui.` : `Payout ${partner.name} dicatat.`;
  } else if (state.recordType === "project") {
    const owner = memberById(data.get("ownerId"));
    state.data.projects.unshift({ id: createId("prj"), opportunityId: opportunity.id, accountId: opportunity.accountId, contractId: state.data.contracts.find((item) => item.opportunityId === opportunity.id)?.id || null, name: data.get("title").trim(), status: "planned", ownerId: owner?.id || null, owner: owner?.name || "Belum ditentukan", progress: 0, startAt: dateInputToISO(data.get("startAt")), dueAt: dateInputToISO(data.get("dueAt")), nextMilestone: data.get("nextMilestone").trim() });
    message = `Proyek ${data.get("title")} disiapkan.`;
  } else if (state.recordType === "partner") {
    const owner = memberById(data.get("ownerId"));
    state.data.partners.unshift({ id: createId("ptr"), name: data.get("title").trim(), type: data.get("partnerType"), ownerId: owner?.id || null, owner: owner?.name || "Belum ditentukan", status: data.get("status"), leads: 0, qualified: 0, wins: 0, attributedRevenue: 0, commissionRate: Number(data.get("commissionRate")), commissionAccrued: 0, commissionPaid: 0, lastActivityAt: now });
    message = `Mitra ${data.get("title")} ditambahkan.`;
  } else if (state.recordType === "customer") {
    if (identitySession.authenticated || customerPipelineUsesServer()) {
      setFormSubmitting(recordForm, true);
      await initialDataAuthority;
      const result = await executeServerCommand("account.create", { name: data.get("title"), contactName: data.get("contact"), source: data.get("source"), segment: "Belum disegmentasi", customFields: {} });
      setFormSubmitting(recordForm, false);
      if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = serverErrorMessage(result.code); return; }
      await refreshDataAuthority({ rerender: false });
      state.selectedCustomerId = result.record.id;
      recordDialog.close();
      if (state.activationMode) {
        state.activationMode = false;
        state.view = "command";
        state.dashboard = "summary";
        render();
        focusActivationNext();
        showToast(`${result.record.name} tersimpan. Lanjutkan dengan membuat pekerjaan pelanggan.`);
        return;
      }
      renderRelationships();
      updateNavCounts();
      openAccount(result.record.id);
      showToast(`${result.record.name} tersimpan di database pelanggan.`);
      return;
    }
    const before = state.data.accounts.length;
    const relation = linkRelationship(state.data, { account: data.get("title").trim(), contact: data.get("contact").trim(), source: data.get("source"), at: now });
    const duplicate = state.data.accounts.length === before;
    message = duplicate ? `${data.get("title")} sudah ada. Kontak dihubungkan ke pelanggan yang sama.` : `${data.get("title")} ditambahkan ke database pelanggan.`;
    state.selectedCustomerId = relation.accountId;
  } else if (state.recordType === "customer_edit") {
    if (customerPipelineUsesServer()) {
      const customFields = Object.fromEntries(String(data.get("customFields") || "").split("\n").map((row) => row.split("=").map((value) => value.trim())).filter((row) => row[0] && row[1]));
      setFormSubmitting(recordForm, true);
      const result = await executeServerCommand("account.update", { accountId: state.recordTargetId, name: data.get("title"), contactName: data.get("contact"), source: data.get("source"), segment: data.get("segment"), customFields });
      setFormSubmitting(recordForm, false);
      if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = serverErrorMessage(result.code); return; }
      await refreshDataAuthority({ rerender: false });
      recordDialog.close();
      renderRelationships();
      openAccount(result.record.id);
      showToast(`Data ${result.record.name} diperbarui di server.`);
      return;
    }
    const index = state.data.accounts.findIndex((item) => item.id === state.recordTargetId);
    const previousName = state.data.accounts[index].name;
    const customFields = Object.fromEntries(String(data.get("customFields") || "").split("\n").map((row) => row.split("=").map((value) => value.trim())).filter((row) => row[0] && row[1]));
    state.data.accounts[index] = { ...state.data.accounts[index], name: data.get("title").trim(), source: data.get("source"), segment: data.get("segment"), customFields, updatedAt: now };
    const contact = state.data.contacts.find((item) => item.accountId === state.recordTargetId);
    if (contact) contact.name = data.get("contact").trim();
    [...state.data.signals, ...state.data.opportunities].filter((item) => item.accountId === state.recordTargetId).forEach((item) => { item.account = data.get("title").trim(); });
    state.data.customerAudit.unshift({ at: now, kind: "customer_updated", accountId: state.recordTargetId, actor: "Anggit", detail: `${previousName} → ${data.get("title").trim()}` });
    message = `Data ${data.get("title")} diperbarui.`;
  } else if (state.recordType === "customer_merge") {
    if (customerPipelineUsesServer()) {
      setFormSubmitting(recordForm, true);
      const result = await executeServerCommand("account.merge", { sourceAccountId: state.recordTargetId, targetAccountId: data.get("targetAccountId"), reason: data.get("reason") });
      setFormSubmitting(recordForm, false);
      if (!result.ok) { const box = recordForm.querySelector(".record-errors"); box.hidden = false; box.textContent = serverErrorMessage(result.code); return; }
      await refreshDataAuthority({ rerender: false });
      state.selectedCustomerId = result.targetRecord.id;
      recordDialog.close();
      renderRelationships();
      updateNavCounts();
      openAccount(result.targetRecord.id);
      showToast(`${result.record.name} digabungkan ke ${result.targetRecord.name}; histori tetap tersimpan.`);
      return;
    }
    const sourceId = state.recordTargetId;
    const targetId = data.get("targetAccountId");
    const source = state.data.accounts.find((item) => item.id === sourceId);
    const target = state.data.accounts.find((item) => item.id === targetId);
    if (!source || !target || sourceId === targetId) return;
    state.data.contacts.filter((item) => item.accountId === sourceId).forEach((item) => { item.accountId = targetId; });
    [...state.data.signals, ...state.data.opportunities].filter((item) => item.accountId === sourceId).forEach((item) => { item.accountId = targetId; item.account = target.name; });
    [...state.data.contracts, ...state.data.projects].filter((item) => item.accountId === sourceId).forEach((item) => { item.accountId = targetId; });
    state.data.accounts = state.data.accounts.filter((item) => item.id !== sourceId);
    state.data.customerAudit.unshift({ at: now, kind: "customer_merged", sourceAccountId: sourceId, targetAccountId: targetId, actor: "Anggit", reason: data.get("reason").trim() });
    state.selectedCustomerId = targetId;
    message = `${source.name} digabungkan ke ${target.name}.`;
  } else if (state.recordType === "customer_import") {
    const rows = String(data.get("rows") || "").split("\n").map((row) => row.split("|").map((value) => value.trim())).filter((row) => row[0]);
    if (!rows.length) return;
    rows.forEach((row) => {
      const relation = linkRelationship(state.data, { account: row[0], contact: row[1] || "", source: row[2] || "Unknown", at: now });
      const account = state.data.accounts.find((item) => item.id === relation.accountId);
      if (row[3]) account.segment = row[3];
    });
    state.data.customerAudit.unshift({ at: now, kind: "customer_imported", actor: "Anggit", count: rows.length });
    message = `${rows.length} baris pelanggan ditinjau dan diimpor.`;
  } else if (state.recordType === "report_schedule") {
    const owner = memberById(data.get("ownerId"));
    state.data.reportSchedules.unshift({ id: createId("rpt"), title: data.get("title").trim(), frequency: data.get("frequency"), ownerId: owner?.id || null, owner: owner?.name || "Belum ditentukan", note: data.get("note").trim(), deliveryMode: "in_app_only", createdAt: now, createdBy: "Anggit" });
    message = `Jadwal ${data.get("title")} disimpan tanpa pengiriman otomatis.`;
  }
  persist();
  recordDialog.close();
  render();
  if (detailAfterSubmitId) taskDetailAfterSubmitId ? openConsultingTask(detailAfterSubmitId, taskDetailAfterSubmitId) : openConsultingEngagement(detailAfterSubmitId);
  showToast(message);
}

function resetFormErrors() {
  opportunityForm.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  opportunityForm.querySelectorAll(".field-error").forEach((message) => { message.textContent = ""; });
}

function populateOpportunityMemberSelect(select) {
  if (!select) return;
  const members = customerPipelineUsesServer()
    ? (state.dataAuthority.snapshot?.members || []).filter((member) => (member.roles || []).some((role) => ["executive_admin", "sales"].includes(role))).map((member) => ({ id: member.userId, name: member.displayName }))
    : activeMembers(["executive_admin", "sales"]);
  select.innerHTML = `<option value="">Pilih anggota tim</option>${members.map((member) => `<option value="${escapeHTML(member.id)}">${escapeHTML(member.name)}</option>`).join("")}`;
  if (members[0]) select.value = members[0].id;
}

function openCreateDialog(preselectedAccountId = null) {
  opportunityForm.reset();
  const operational = customerPipelineData();
  if (!operational.accounts.length) {
    openRecordDialog("customer");
    showToast("Tambahkan pelanggan lebih dulu sebelum membuat peluang.");
    return;
  }
  opportunityForm.elements.accountId.innerHTML = `<option value="">Pilih pelanggan</option>${operational.accounts.map((account) => `<option value="${escapeHTML(account.id)}">${escapeHTML(account.name)}</option>`).join("")}`;
  opportunityForm.elements.accountId.value = preselectedAccountId || "";
  populateOpportunityMemberSelect(opportunityForm.elements.ownerUserId);
  opportunityForm.elements.due.value = dateInputAfter(1);
  resetFormErrors();
  const errors = document.querySelector("#opportunity-errors");
  errors.hidden = true;
  errors.replaceChildren();
  opportunityDialog.showModal();
  window.setTimeout(() => opportunityForm.elements.accountId.focus(), 0);
}

function resetSignalForm() {
  signalForm.reset();
  populateMemberNameSelect(signalForm.elements.owner, ["executive_admin", "sales", "marketing"], "Anggit");
  signalForm.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  signalForm.querySelectorAll(".field-error").forEach((message) => { message.textContent = ""; });
}

function syncCanvassingFields() {
  const isCanvassing = isFieldVisitFollowUp(signalForm.elements.followUpMethod.value);
  signalForm.querySelectorAll(".canvassing-field").forEach((field) => {
    field.hidden = !isCanvassing;
    const input = field.querySelector("input");
    if (input) input.required = isCanvassing && ["area", "address", "visitAt"].includes(input.name);
  });
}

function openSignalDialog(accountId = null) {
  resetSignalForm();
  state.signalContextAccountId = accountId;
  const snapshot = accountId ? buildAccountSnapshot(state.data, accountId) : null;
  const title = document.querySelector("#signal-title");
  const context = document.querySelector("#signal-context");
  if (snapshot) {
    const primaryContact = snapshot.contacts[0];
    signalForm.elements.account.value = snapshot.account.name;
    signalForm.elements.account.readOnly = true;
    signalForm.elements.contact.value = primaryContact?.name || "";
    signalForm.elements.source.value = ["client", "client_active"].includes(snapshot.relationshipState) ? "Existing client" : snapshot.account.source || "Unknown";
    title.textContent = ["client", "client_active"].includes(snapshot.relationshipState) ? "Catat kebutuhan lanjutan" : "Catat kebutuhan baru";
    context.textContent = "Simpan sebagai kebutuhan dulu. Nilai peluang baru muncul setelah tim menyatakan kebutuhan ini layak ditindaklanjuti.";
  } else {
    signalForm.elements.account.readOnly = false;
    title.textContent = "Catat calon pelanggan";
    context.textContent = "Informasi awal boleh belum lengkap. Catatan ini belum menjadi peluang sebelum ditinjau tim.";
  }
  syncCanvassingFields();
  signalDialog.showModal();
  window.setTimeout(() => (snapshot ? signalForm.elements.need : signalForm.elements.account).focus(), 0);
}

function handleSignalSubmit(event) {
  event.preventDefault();
  signalForm.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  signalForm.querySelectorAll(".field-error").forEach((message) => { message.textContent = ""; });
  let firstInvalid = null;
  signalForm.querySelectorAll("[required]").forEach((field) => {
    if (!String(field.value).trim()) {
      field.setAttribute("aria-invalid", "true");
      field.closest(".field")?.querySelector(".field-error")?.replaceChildren("Wajib diisi.");
      firstInvalid ||= field;
    }
  });
  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  const data = new FormData(signalForm);
  const relation = linkRelationship(state.data, {
    account: data.get("account").trim(),
    contact: data.get("contact").trim(),
    source: data.get("source"),
    at: new Date().toISOString()
  });
  state.data.signals.unshift({
    id: createId("sig"),
    account: data.get("account").trim(),
    accountId: relation.accountId,
    contact: data.get("contact").trim() || "Belum teridentifikasi",
    contactId: relation.contactId,
    need: data.get("need").trim(),
    source: data.get("source"),
    owner: data.get("owner").trim(),
    capturedAt: new Date().toISOString(),
    status: "inbox",
    note: data.get("note").trim(),
    followUpMethod: data.get("followUpMethod"),
    canvassing: isFieldVisitFollowUp(data.get("followUpMethod")) ? { area: data.get("area").trim(), address: data.get("address").trim(), visitAt: data.get("visitAt") ? new Date(data.get("visitAt")).toISOString() : null, routeOrder: Number(data.get("routeOrder") || 999), visitStatus: "planned", checkedInAt: null, result: null } : null
  });
  persist();
  signalDialog.close();
  state.signalContextAccountId = null;
  setView("signals");
  showToast(`${data.get("account").trim()} sudah dicatat sebagai calon pelanggan dan belum dihitung sebagai peluang.`);
}

function clearSignalTriageErrors() {
  signalTriageErrors.hidden = true;
  signalTriageErrors.replaceChildren();
  signalTriageForm.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  signalTriageForm.querySelectorAll(".field-error").forEach((message) => { message.textContent = ""; });
}

function dateInputAfter(days) {
  const target = new Date();
  target.setDate(target.getDate() + days);
  return target.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function syncSignalTriageFields() {
  const action = signalTriageForm.elements.action.value;
  signalTriageForm.querySelectorAll("[data-triage-modes]").forEach((field) => {
    field.hidden = !field.dataset.triageModes.split(" ").includes(action);
  });
  const copy = {
    qualify: ["Siap dijadikan peluang", "Pastikan layanan, nilai perkiraan, dan janji berikutnya sudah benar-benar diputuskan.", "Buat peluang"],
    nurture: ["Belum sekarang, bukan hilang", "Simpan alasan dan tanggal untuk menghubungi lagi agar calon pelanggan tidak terlupakan.", "Simpan jadwal"],
    disqualify: ["Tutup dengan jujur", "Simpan alasan agar tim belajar dan daftar calon pelanggan tetap rapi.", "Tutup kebutuhan"],
    reactivate: ["Ada konteks baru", "Buka kembali untuk ditinjau. Riwayat keputusan sebelumnya tetap tersimpan.", "Buka kembali"]
  }[action];
  document.querySelector("#signal-triage-principle").innerHTML = `<strong>${copy[0]}</strong><span>${copy[1]}</span>`;
  signalTriageSubmit.textContent = copy[2];
}

function openSignalTriage(id) {
  const signal = state.data.signals.find((item) => item.id === id);
  if (!signal || signal.status === "converted") return;
  state.triageSignalId = id;
  signalTriageForm.reset();
  clearSignalTriageErrors();

  const allowedActions = signal.status === "disqualified"
    ? ["reactivate"]
    : signal.status === "nurture" ? ["qualify", "nurture", "disqualify", "reactivate"] : ["qualify", "nurture", "disqualify"];
  [...signalTriageForm.elements.action.options].forEach((option) => {
    option.hidden = !allowedActions.includes(option.value);
    option.disabled = !allowedActions.includes(option.value);
  });
  signalTriageForm.elements.action.value = signal.status === "disqualified" ? "reactivate" : signal.status === "nurture" ? "nurture" : "qualify";
  signalTriageForm.elements.service.value = /pos|stok|erp|commerce/i.test(signal.need) ? "ERP & Commerce" : /seo|search/i.test(signal.need) ? "SEO Growth" : /website|web/i.test(signal.need) ? "Website & Acquisition" : "Operations App";
  signalTriageForm.elements.nextAction.value = "Jadwalkan discovery dan validasi kebutuhan";
  signalTriageForm.elements.due.value = dateInputAfter(1);
  signalTriageForm.elements.nurtureReason.value = signal.nurtureReason || "";
  signalTriageForm.elements.reviewDate.value = signal.reviewDate ? new Date(signal.reviewDate).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) : dateInputAfter(14);
  signalTriageForm.elements.disqualifyReason.value = signal.disqualifyReason || "";
  signalTriageForm.elements.disqualifyNote.value = signal.disqualifyNote || "";
  document.querySelector("#signal-triage-title").textContent = signal.account;
  document.querySelector("#signal-triage-context").textContent = `${signal.need} · ${signal.source}`;
  const history = signal.activity || [];
  document.querySelector("#signal-triage-history").innerHTML = history.length
    ? `<strong>Riwayat keputusan</strong>${history.slice(0, 3).map((item) => `<div><span>${escapeHTML(item.label)}</span><small>${escapeHTML(item.detail || "")}</small><time>${formatDate(item.at, { year: true })}</time></div>`).join("")}`
    : `<strong>Riwayat keputusan</strong><p>Belum ada keputusan sebelumnya.</p>`;
  syncSignalTriageFields();
  signalTriageDialog.showModal();
  window.setTimeout(() => signalTriageForm.elements.action.focus(), 0);
}

function handleSignalTriageSubmit(event) {
  event.preventDefault();
  clearSignalTriageErrors();
  const signalIndex = state.data.signals.findIndex((item) => item.id === state.triageSignalId);
  if (signalIndex < 0) return;
  const data = new FormData(signalTriageForm);
  const action = data.get("action");
  const dateValue = (name) => data.get(name) ? new Date(`${data.get(name)}T12:00:00+07:00`).toISOString() : "";
  const input = {
    action,
    actor: state.data.signals[signalIndex].owner || "Anggit",
    service: data.get("service"),
    value: data.get("value"),
    nextAction: data.get("nextAction"),
    due: dateValue("due"),
    reason: action === "nurture" ? data.get("nurtureReason") : action === "disqualify" ? data.get("disqualifyReason") : data.get("reactivateReason"),
    reviewDate: dateValue("reviewDate"),
    note: data.get("disqualifyNote")
  };
  const result = applySignalTriage(state.data.signals[signalIndex], input, new Date());
  if (!result.ok) {
    const fieldMap = { reason: action === "nurture" ? "nurtureReason" : action === "disqualify" ? "disqualifyReason" : "reactivateReason" };
    result.errors.forEach((error) => {
      const field = signalTriageForm.elements[fieldMap[error.field] || error.field];
      field?.setAttribute("aria-invalid", "true");
      field?.closest(".field")?.querySelector(".field-error")?.replaceChildren(error.message);
    });
    signalTriageErrors.innerHTML = `<strong>Keputusan belum tersimpan</strong><ul>${result.errors.map((error) => `<li>${escapeHTML(error.message)}</li>`).join("")}</ul>`;
    signalTriageErrors.hidden = false;
    const firstField = signalTriageForm.querySelector("[aria-invalid='true']");
    firstField?.focus();
    return;
  }

  state.data.signals[signalIndex] = result.signal;
  if (result.opportunity) state.data.opportunities.unshift(result.opportunity);
  persist();
  signalTriageDialog.close();
  state.triageSignalId = null;
  state.signalFilter = action === "nurture" ? "nurture" : action === "reactivate" ? "attention" : "closed";
  renderSignals();
  updateNavCounts();
  const message = action === "qualify" ? `${result.signal.account} masuk pipeline dengan kontrol lengkap.`
    : action === "nurture" ? `${result.signal.account} masuk nurture dan punya jadwal review.`
      : action === "disqualify" ? `${result.signal.account} ditutup tanpa menghapus riwayat.` : `${result.signal.account} dibuka kembali untuk review.`;
  showToast(message);
}

async function handleOpportunitySubmit(event) {
  event.preventDefault();
  resetFormErrors();
  const errorBox = document.querySelector("#opportunity-errors");
  errorBox.hidden = true;
  errorBox.replaceChildren();
  const data = new FormData(opportunityForm);
  let firstInvalid = null;

  opportunityForm.querySelectorAll("[required]").forEach((field) => {
    if (!String(field.value).trim()) {
      field.setAttribute("aria-invalid", "true");
      field.closest(".field")?.querySelector(".field-error")?.replaceChildren("Wajib diisi.");
      firstInvalid ||= field;
    }
  });

  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  const operational = customerPipelineData();
  const account = operational.accounts.find((item) => item.id === data.get("accountId"));
  if (!account) {
    opportunityForm.elements.accountId.setAttribute("aria-invalid", "true");
    opportunityForm.elements.accountId.closest(".field")?.querySelector(".field-error")?.replaceChildren("Pilih pelanggan yang tersedia.");
    opportunityForm.elements.accountId.focus();
    return;
  }

  if (customerPipelineUsesServer()) {
    setFormSubmitting(opportunityForm, true);
    const result = await executeServerCommand("opportunity.create", {
      accountId: account.id,
      service: data.get("service"),
      ownerUserId: data.get("ownerUserId"),
      stage: data.get("stage"),
      nextAction: data.get("nextAction"),
      nextActionDueAt: dateInputToISO(data.get("due")),
      value: Number(data.get("value")),
      currency: "IDR"
    });
    setFormSubmitting(opportunityForm, false);
    if (!result.ok) {
      errorBox.hidden = false;
      errorBox.textContent = serverErrorMessage(result.code);
      return;
    }
    await refreshDataAuthority({ rerender: false });
    opportunityDialog.close();
    state.pipelineFilter = "active";
    setView("pipeline");
    openOpportunity(result.record.id);
    showToast(`${account.name} masuk pipeline dan tersimpan di server.`);
    return;
  }

  const now = new Date().toISOString();
  const owner = memberById(data.get("ownerUserId"));
  const primaryContact = operational.contacts.find((item) => item.accountId === account.id);
  const opportunity = {
    id: createId("opp"),
    account: account.name,
    accountId: account.id,
    contact: primaryContact?.name || "Belum teridentifikasi",
    contactId: primaryContact?.id || null,
    service: data.get("service"),
    source: account.source || "Unknown",
    ownerId: owner?.id || null,
    owner: owner?.name || "Belum ditentukan",
    stage: data.get("stage"),
    status: "active",
    value: Number(data.get("value")),
    probabilityLabel: "Baru dicatat",
    nextAction: { label: data.get("nextAction").trim(), due: new Date(`${data.get("due")}T12:00:00+07:00`).toISOString() },
    lastActivityAt: now,
    note: "Opportunity baru. Validasi konteks dan stage exit sebelum progres berikutnya.",
    activity: [{ at: now, label: "Opportunity dibuat", kind: "created" }]
  };

  state.data.opportunities.unshift(opportunity);
  persist();
  opportunityDialog.close();
  state.pipelineFilter = "active";
  setView("pipeline");
  showToast(`${opportunity.account} ditambahkan dengan tindakan berikutnya yang terkontrol.`);
}

document.addEventListener("click", async (event) => {
  const createMenuItem = event.target.closest(".create-menu-popover button");
  if (createMenuItem) createMenuItem.closest("details")?.removeAttribute("open");

  if (event.target.closest("#open-calendar")) {
    setView("calendar");
    return;
  }

  if (event.target.closest("#open-notifications")) {
    setView("notifications");
    return;
  }

  if (event.target.closest("#open-help")) {
    showToast("Mulai dari Hari ini. Setiap prioritas dapat dibuka untuk melihat konteks dan tindakan berikutnya.");
    return;
  }

  const activationButton = event.target.closest("[data-activation-action]");
  if (activationButton) {
    const journey = currentActivationJourney();
    const action = journey.nextAction?.type === activationButton.dataset.activationAction
      ? journey.nextAction
      : journey.complete && journey.optionalExpense?.type === activationButton.dataset.activationAction
        ? { ...journey.optionalExpense, disabled: !journey.writesAllowed }
        : null;
    if (!action) {
      render();
      showToast("Kemajuan sudah berubah. Panduan telah diperbarui.");
      return;
    }
    if (action.disabled) {
      showToast("Workspace sedang read-only. Data tetap aman, tetapi perubahan baru menunggu aktivasi paket.");
      return;
    }
    state.activationMode = true;
    openRecordDialog(action.type, action.targetId, action.subtargetId);
    return;
  }

  const dashboardNavButton = event.target.closest("button[data-dashboard-nav]");
  if (dashboardNavButton) {
    if (!allowedDashboardKeys.includes(dashboardNavButton.dataset.dashboardNav)) {
      showToast("Tampilan tersebut tidak termasuk akses akun Anda.");
      return;
    }
    state.dashboard = dashboardNavButton.dataset.dashboardNav;
    state.view = "command";
    closeMobileNav();
    renderDepartmentDashboard();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.querySelector("#main-content")?.focus({ preventScroll: true });
    return;
  }

  const dashboardButton = event.target.closest("button[data-dashboard]");
  if (dashboardButton) {
    if (!allowedDashboardKeys.includes(dashboardButton.dataset.dashboard)) {
      showToast("Tampilan tersebut tidak termasuk akses akun Anda.");
      return;
    }
    state.dashboard = dashboardButton.dataset.dashboard;
    state.view = "command";
    document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
      const active = button.dataset.view === "command";
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    renderDepartmentDashboard();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) setView(viewButton.dataset.view);

  const viewJump = event.target.closest("[data-view-jump]");
  if (viewJump) {
    detailDialog.open && detailDialog.close();
    if (viewJump.hasAttribute("data-finance-expenses")) state.financeView = "expenses";
    setView(viewJump.dataset.viewJump);
  }

  const filterButton = event.target.closest("[data-pipeline-filter]");
  if (filterButton) {
    state.pipelineFilter = filterButton.dataset.pipelineFilter;
    renderPipeline();
  }

  const pipelineViewButton = event.target.closest("[data-pipeline-view]");
  if (pipelineViewButton) {
    state.pipelineView = pipelineViewButton.dataset.pipelineView;
    renderPipeline();
  }

  const projectViewButton = event.target.closest("[data-project-view]");
  if (projectViewButton) {
    state.projectView = projectViewButton.dataset.projectView;
    renderProjects();
  }

  const financeViewButton = event.target.closest("[data-finance-view]");
  if (financeViewButton) {
    state.financeView = financeViewButton.dataset.financeView;
    renderCollection();
  }

  const repeatFilterButton = event.target.closest("[data-repeat-filter]");
  if (repeatFilterButton) {
    state.repeatFilter = repeatFilterButton.dataset.repeatFilter;
    renderRepeatOrder();
  }

  const notificationFilterButton = event.target.closest("[data-notification-filter]");
  if (notificationFilterButton) {
    state.notificationFilter = notificationFilterButton.dataset.notificationFilter;
    renderNotifications();
  }

  const reportDaysButton = event.target.closest("[data-report-days]");
  if (reportDaysButton) {
    state.reportDays = reportDaysButton.dataset.reportDays;
    renderReports();
  }

  if (event.target.closest("[data-export-report]")) exportReportCSV();

  const notificationActionButton = event.target.closest("[data-notification-action]");
  if (notificationActionButton) {
    const id = notificationActionButton.dataset.notificationId;
    const action = notificationActionButton.dataset.notificationAction;
    const at = new Date();
    const current = state.data.notificationState[id] || {};
    if (action === "read") current.readAt = at.toISOString();
    if (action === "snooze") { at.setDate(at.getDate() + 1); current.snoozedUntil = at.toISOString(); }
    if (action === "escalate") current.escalatedAt = at.toISOString();
    state.data.notificationState[id] = current;
    state.data.notificationAudit.unshift({ at: new Date().toISOString(), notificationId: id, action, actor: "Anggit" });
    persist(); updateNavCounts(); renderNotifications();
    showToast(action === "read" ? "Notifikasi ditandai dibaca." : action === "snooze" ? "Notifikasi ditunda satu hari." : "Notifikasi dijadikan perhatian internal.");
  }

  const notificationOpenButton = event.target.closest("[data-notification-open]");
  if (notificationOpenButton) {
    const id = notificationOpenButton.dataset.notificationOpen;
    state.data.notificationState[id] = { ...(state.data.notificationState[id] || {}), readAt: new Date().toISOString() };
    state.data.notificationAudit.unshift({ at: new Date().toISOString(), notificationId: id, action: "opened_source", actor: "Anggit" });
    persist();
    setView(notificationOpenButton.dataset.targetView);
  }

  const adaptationFilterButton = event.target.closest("[data-adaptation-filter]");
  if (adaptationFilterButton) {
    state.adaptationFilter = adaptationFilterButton.dataset.adaptationFilter;
    renderAdaptation();
  }

  const settingsTabButton = event.target.closest("[data-settings-tab]");
  if (settingsTabButton) {
    state.settingsTab = settingsTabButton.dataset.settingsTab;
    renderAdaptation();
  }

  if (event.target.closest("[data-refresh-api]")) {
    await refreshDataAuthority();
    showToast(["connected", "customer_pipeline_connected"].includes(state.dataAuthority.status)
      ? "Data pelanggan, pipeline, dan pekerjaan konsultasi terhubung ke server."
      : operationalFallbackHidesSample()
        ? "Data operasional tetap disembunyikan sampai koneksi server pulih."
        : "Mode sampel dipertahankan; tidak ada data yang dikirim.");
  }

  const moduleButton = event.target.closest("[data-module-action]");
  if (moduleButton) {
    const module = state.data.workspaceModules.find((item) => item.code === moduleButton.dataset.moduleCode);
    if (!module) return;
    const action = moduleButton.dataset.moduleAction;
    const suggestedReason = action === "toggle"
      ? module.visible ? `Belum digunakan oleh tim ${module.label}` : `Digunakan kembali oleh tim ${module.label}`
      : `Sesuaikan urutan menu dengan alur kerja tim`;
    const reason = window.prompt("Alasan perubahan (akan disimpan di audit):", suggestedReason);
    if (reason === null) return;
    const actor = state.data.memberships.find((member) => member.roles.includes("executive_admin"));
    const result = requestWorkspaceModuleChange({
      actor,
      organizationId: state.data.organization.id,
      modules: state.data.workspaceModules,
      moduleCode: module.code,
      visible: action === "toggle" ? !module.visible : undefined,
      direction: action === "up" || action === "down" ? action : undefined,
      reason
    }, new Date());
    if (!result.ok) {
      const messages = {
        CHANGE_REASON_REQUIRED: "Alasan perubahan wajib diisi.",
        REQUIRED_MODULE_CANNOT_BE_HIDDEN: "Menu wajib harus tetap terlihat.",
        MODULE_ORDER_BOUNDARY: "Menu sudah berada di batas urutan.",
        ADMIN_AUTHORITY_REQUIRED: "Hanya admin perusahaan yang dapat mengubah komposisi workspace."
      };
      showToast(messages[result.code] || "Perubahan modul belum dapat disimpan.");
      return;
    }
    state.data.workspaceModules = result.modules;
    state.data.workspaceModuleAudit.unshift(result.audit);
    persist();
    syncWorkspaceNavigation();
    if (action === "toggle" && !result.modules.find((item) => item.code === module.code)?.visible && state.view === module.view) setView("command");
    else renderAdaptation();
    showToast(action === "toggle" ? `${module.label} ${module.visible ? "disembunyikan" : "ditampilkan"}; data tetap aman.` : `Urutan ${module.label} diperbarui.`);
  }

  const addonButton = event.target.closest("[data-toggle-addon]");
  if (addonButton) {
    const index = state.data.addons.findIndex((item) => item.code === addonButton.dataset.toggleAddon);
    const addon = state.data.addons[index];
    state.data.addons[index] = { ...addon, status: addon.status === "inactive" ? "active_preview" : "inactive", updatedBy: "Anggit", updatedAt: new Date().toISOString(), entitlementProductionChanged: false };
    persist();
    renderAdaptation();
    showToast("Status add-on preview diperbarui; entitlement produksi tidak berubah.");
  }

  const documentButton = event.target.closest("[data-download-document]");
  if (documentButton) downloadDocumentDraft(documentButton.dataset.downloadDocument);

  const copilotButton = event.target.closest("[data-review-copilot]");
  if (copilotButton) openRecordDialog("copilot_review", copilotButton.dataset.copilotId, copilotButton.dataset.reviewCopilot);

  const signalFilterButton = event.target.closest("[data-signal-filter]");
  if (signalFilterButton) {
    state.signalFilter = signalFilterButton.dataset.signalFilter;
    renderSignals();
  }

  const signalOriginButton = event.target.closest("[data-signal-origin]");
  if (signalOriginButton) {
    state.signalOriginFilter = signalOriginButton.dataset.signalOrigin;
    renderSignals();
  }

  const salesFilterButton = event.target.closest("[data-sales-filter]");
  if (salesFilterButton) {
    state.salesAgendaFilter = salesFilterButton.dataset.salesFilter;
    renderDepartmentDashboard();
  }

  const salesContextButton = event.target.closest("[data-select-sales-context]");
  if (salesContextButton) {
    state.selectedSalesOpportunityId = salesContextButton.dataset.selectSalesContext;
    renderDepartmentDashboard();
  }

  const customerButton = event.target.closest("[data-select-customer]");
  if (customerButton) {
    state.selectedCustomerId = customerButton.dataset.selectCustomer;
    renderDepartmentDashboard();
  }

  const opportunityButton = event.target.closest("[data-open-opportunity]");
  if (opportunityButton) openOpportunity(opportunityButton.dataset.openOpportunity);

  const winOpportunityButton = event.target.closest("[data-win-opportunity]");
  if (winOpportunityButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("opportunity_win", winOpportunityButton.dataset.winOpportunity);
  }

  const accountButton = event.target.closest("[data-open-account]");
  if (accountButton) openAccount(accountButton.dataset.openAccount);

  const projectButton = event.target.closest("[data-open-project]");
  if (projectButton) openProject(projectButton.dataset.openProject);

  const engagementButton = event.target.closest("[data-open-engagement]");
  if (engagementButton) openConsultingEngagement(engagementButton.dataset.openEngagement);

  const consultingTaskButton = event.target.closest("[data-open-consulting-task]");
  if (consultingTaskButton) openConsultingTask(consultingTaskButton.dataset.openConsultingTask, consultingTaskButton.dataset.taskId);

  const consultingCommentButton = event.target.closest("[data-comment-consulting-task]");
  if (consultingCommentButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("consulting_task_comment", consultingCommentButton.dataset.commentConsultingTask, consultingCommentButton.dataset.taskId);
  }

  const addConsultingWorkstreamButton = event.target.closest("[data-add-consulting-workstream]");
  if (addConsultingWorkstreamButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("consulting_workstream", addConsultingWorkstreamButton.dataset.addConsultingWorkstream);
  }

  const addConsultingMilestoneButton = event.target.closest("[data-add-consulting-milestone]");
  if (addConsultingMilestoneButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("consulting_milestone", addConsultingMilestoneButton.dataset.addConsultingMilestone, addConsultingMilestoneButton.dataset.workstreamId);
  }

  const addConsultingTaskButton = event.target.closest("[data-add-consulting-task]");
  if (addConsultingTaskButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("consulting_task", addConsultingTaskButton.dataset.addConsultingTask, addConsultingTaskButton.dataset.workstreamId);
  }

  const consultingMilestoneStatusButton = event.target.closest("[data-consulting-milestone-status]");
  if (consultingMilestoneStatusButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("consulting_milestone_status", consultingMilestoneStatusButton.dataset.consultingMilestoneStatus, consultingMilestoneStatusButton.dataset.milestoneId, consultingMilestoneStatusButton.dataset.nextStatus);
  }

  const consultingTaskStatusButton = event.target.closest("[data-consulting-task-status]");
  if (consultingTaskStatusButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("consulting_task_status", consultingTaskStatusButton.dataset.consultingTaskStatus, consultingTaskStatusButton.dataset.taskId, consultingTaskStatusButton.dataset.nextStatus);
  }

  const handoffAssignmentButton = event.target.closest("[data-handoff-assignment]");
  if (handoffAssignmentButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("assignment_handoff", handoffAssignmentButton.dataset.handoffAssignment, handoffAssignmentButton.dataset.taskId);
  }

  const reviewAssignmentButton = event.target.closest("[data-review-assignment]");
  if (reviewAssignmentButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("assignment_review", reviewAssignmentButton.dataset.reviewAssignment, reviewAssignmentButton.dataset.taskId);
  }

  const taskExpenseButton = event.target.closest("[data-add-task-expense]");
  if (taskExpenseButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("task_expense", taskExpenseButton.dataset.addTaskExpense);
  }

  const reviewTaskExpenseButton = event.target.closest("[data-review-task-expense]");
  if (reviewTaskExpenseButton) openRecordDialog("expense_review", reviewTaskExpenseButton.dataset.reviewTaskExpense, reviewTaskExpenseButton.dataset.expenseId);

  const partnerButton = event.target.closest("[data-open-partner]");
  if (partnerButton) openPartner(partnerButton.dataset.openPartner);

  const controlButton = event.target.closest("[data-open-control]");
  if (controlButton) openControlDialog(controlButton.dataset.openControl);

  const moveButton = event.target.closest("[data-move-opportunity]");
  if (moveButton) {
    openControlDialog(moveButton.dataset.moveOpportunity);
    controlForm.elements.controlType.value = "stage";
    syncControlFields();
  }

  const handoffButton = event.target.closest("[data-open-handoff]");
  if (handoffButton) openHandoffDialog(handoffButton.dataset.openHandoff);

  const governanceButton = event.target.closest("[data-open-governance]");
  if (governanceButton) openGovernanceDialog(governanceButton.dataset.openGovernance);

  if (event.target.closest("#add-opportunity")) openCreateDialog();
  const createRecordButton = event.target.closest("[data-create-record]");
  if (createRecordButton) {
    if (createRecordButton.dataset.createRecord === "member_invite" && customerPipelineUsesServer()) {
      document.dispatchEvent(new CustomEvent("dekta:open-workspace-invitation"));
    } else {
      openRecordDialog(createRecordButton.dataset.createRecord, createRecordButton.dataset.recordTarget || null, createRecordButton.dataset.recordSubtarget || null);
    }
  }
  const contractActionButton = event.target.closest("[data-contract-action]");
  if (contractActionButton) openRecordDialog("contract_action", contractActionButton.dataset.contractAction);
  const paymentButton = event.target.closest("[data-record-payment]");
  if (paymentButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("payment", paymentButton.dataset.recordPayment);
  }
  const openInvoiceButton = event.target.closest("[data-open-invoice]");
  if (openInvoiceButton) openInvoice(openInvoiceButton.dataset.openInvoice);
  const reminderButton = event.target.closest("[data-invoice-reminder]");
  if (reminderButton) openRecordDialog("invoice_reminder", reminderButton.dataset.invoiceReminder);
  const scheduledInvoiceButton = event.target.closest("[data-create-scheduled-invoice]");
  if (scheduledInvoiceButton) openRecordDialog("scheduled_invoice", scheduledInvoiceButton.dataset.createScheduledInvoice);
  const invoiceActionButton = event.target.closest("[data-invoice-action]");
  if (invoiceActionButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("invoice_action", invoiceActionButton.dataset.invoiceAction, invoiceActionButton.dataset.invoiceActionType);
  }
  const projectEntryButton = event.target.closest("[data-project-entry]");
  if (projectEntryButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog(`project_${projectEntryButton.dataset.projectEntry}`, projectEntryButton.dataset.projectId);
  }
  const commissionButton = event.target.closest("[data-commission-action]");
  if (commissionButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog(`commission_${commissionButton.dataset.commissionAction}`, commissionButton.dataset.partnerId, commissionButton.dataset.commissionId);
  }
  const calendarViewButton = event.target.closest("[data-calendar-view]");
  if (calendarViewButton) {
    state.calendarView = calendarViewButton.dataset.calendarView;
    state.calendarCursor = new Date();
    renderCalendar();
  }
  const calendarNavButton = event.target.closest("[data-calendar-nav]");
  if (calendarNavButton) {
    const next = new Date(state.calendarCursor);
    if (state.calendarView === "month") next.setMonth(next.getMonth() + (calendarNavButton.dataset.calendarNav === "next" ? 1 : -1));
    else next.setDate(next.getDate() + (calendarNavButton.dataset.calendarNav === "next" ? 7 : -7));
    state.calendarCursor = next;
    renderCalendar();
  }
  if (event.target.closest("[data-calendar-today]")) {
    state.calendarCursor = new Date();
    renderCalendar();
  }
  const calendarEventButton = event.target.closest("[data-calendar-event]");
  if (calendarEventButton) openRecordDialog("calendar_reschedule", calendarEventButton.dataset.calendarEvent);
  const canvassingVisitButton = event.target.closest("[data-canvassing-visit]");
  if (canvassingVisitButton) openRecordDialog("canvassing_visit", canvassingVisitButton.dataset.canvassingVisit);
  const customerEditButton = event.target.closest("[data-customer-edit]");
  if (customerEditButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("customer_edit", customerEditButton.dataset.customerEdit);
  }
  const customerMergeButton = event.target.closest("[data-customer-merge]");
  if (customerMergeButton) {
    detailDialog.open && detailDialog.close();
    openRecordDialog("customer_merge", customerMergeButton.dataset.customerMerge);
  }
  if (event.target.closest("[data-export-customers]")) exportCustomersCSV();
  if (event.target.closest("#open-onboarding")) openOnboarding();
  if (event.target.closest("[data-close-onboarding]")) onboardingDialog.close();
  if (event.target.closest("#google-auth-demo")) {
    onboardingForm.elements.fullName.value = "Anggit";
    onboardingForm.elements.email.value = "owner@example.test";
    showToast("Akun Google disimulasikan. Integrasi OAuth belum aktif di prototype.");
    setOnboardingStep(2);
  }
  if (event.target.closest("#reset-sample-data")) resetDialog.showModal();
  if (event.target.closest("#confirm-reset")) resetSampleData();
  if (event.target.closest("[data-open-signal]")) openSignalDialog();
  const accountOpportunityButton = event.target.closest("[data-add-opportunity-account]");
  if (accountOpportunityButton) {
    detailDialog.open && detailDialog.close();
    openCreateDialog(accountOpportunityButton.dataset.addOpportunityAccount);
  }
  const expansionButton = event.target.closest("[data-open-expansion]");
  if (expansionButton) {
    detailDialog.open && detailDialog.close();
    openSignalDialog(expansionButton.dataset.openExpansion);
  }
  if (event.target.closest("[data-close-dialog]")) opportunityDialog.close();
  if (event.target.closest("[data-close-detail]")) detailDialog.close();
  if (event.target.closest("[data-close-record]")) { state.activationMode = false; recordDialog.close(); }
  if (event.target.closest("[data-close-control]")) controlDialog.close();
  if (event.target.closest("[data-close-handoff]")) handoffDialog.close();
  if (event.target.closest("[data-close-governance]")) governanceDialog.close();
  if (event.target.closest("[data-close-signal]")) signalDialog.close();
  if (event.target.closest("[data-close-signal-triage]")) signalTriageDialog.close();
  if (event.target.closest("[data-close-reset]")) resetDialog.close();

  const triageButton = event.target.closest("[data-triage-signal]");
  if (triageButton) openSignalTriage(triageButton.dataset.triageSignal);

  const copyButton = event.target.closest("[data-copy-action]");
  if (copyButton) {
    const opportunity = customerPipelineData().opportunities.find((item) => item.id === copyButton.dataset.copyAction);
    const text = `${opportunity.account} — ${opportunity.nextAction.label} (${formatDate(opportunity.nextAction.due, { year: true })})`;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Next action disalin.");
    } catch {
      showToast(text);
    }
  }
});

document.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-drag-opportunity]");
  if (!card) return;
  state.draggingOpportunityId = card.dataset.dragOpportunity;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.draggingOpportunityId);
});

document.addEventListener("dragend", (event) => {
  event.target.closest("[data-drag-opportunity]")?.classList.remove("is-dragging");
  document.querySelectorAll(".kanban-column.is-drop-target").forEach((column) => column.classList.remove("is-drop-target"));
  state.draggingOpportunityId = null;
});

document.addEventListener("dragover", (event) => {
  const column = event.target.closest("[data-drop-stage]");
  if (!column) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".kanban-column.is-drop-target").forEach((item) => item.classList.toggle("is-drop-target", item === column));
});

document.addEventListener("drop", (event) => {
  const column = event.target.closest("[data-drop-stage]");
  if (!column) return;
  event.preventDefault();
  const id = event.dataTransfer.getData("text/plain") || state.draggingOpportunityId;
  const opportunity = customerPipelineData().opportunities.find((item) => item.id === id);
  const targetStage = column.dataset.dropStage;
  document.querySelectorAll(".kanban-column.is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
  if (!opportunity || opportunity.stage === targetStage) return;
  if (targetStage === "Won") {
    openOpportunity(id);
    showToast("Peluang hanya dapat disetujui setelah bukti komitmen dan handoff lengkap.");
    return;
  }
  openControlDialog(id);
  controlForm.elements.controlType.value = "stage";
  controlForm.elements.targetStage.value = targetStage;
  syncControlFields();
  showToast(`Periksa bukti sebelum memindahkan ${opportunity.account} ke ${targetStage}.`);
});

searchInput.addEventListener("input", () => {
  state.search = searchInput.value.trim();
  if (state.search && state.view === "command") setView("pipeline");
  else render();
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
  if (event.key === "Escape" && sidebar.classList.contains("is-open")) closeMobileNav();
});

mobileMenu.addEventListener("click", () => sidebar.classList.contains("is-open") ? closeMobileNav() : openMobileNav());
mobileBackdrop.addEventListener("click", closeMobileNav);
onboardingBack.addEventListener("click", () => setOnboardingStep(state.onboardingStep - 1));
onboardingNext.addEventListener("click", () => {
  if (!validateOnboardingStep()) return;
  if (state.onboardingStep === 4) completeOnboarding();
  else setOnboardingStep(state.onboardingStep + 1);
});
onboardingForm.elements.companyMode.forEach((field) => field.addEventListener("change", syncCompanyMode));
onboardingForm.elements.departmentPreset.forEach((field) => field.addEventListener("change", syncDepartmentPreset));
onboardingForm.addEventListener("change", () => {
  if (state.onboardingStep === 3 && onboardingForm.elements.departmentPreset.value === "custom") syncDepartmentPreset();
  if (state.onboardingStep === 4) updateOnboardingSummary();
});
opportunityForm.addEventListener("submit", handleOpportunitySubmit);
recordForm.addEventListener("submit", handleRecordSubmit);
recordForm.addEventListener("change", (event) => {
  if (event.target.name === "billingModel") syncBillingPlanFields();
  if (String(event.target.value || "").trim()) {
    event.target.removeAttribute("aria-invalid");
    event.target.closest(".field")?.querySelector(".field-error")?.replaceChildren();
    const box = recordForm.querySelector(".record-errors");
    if (box) { box.hidden = true; box.textContent = ""; }
  }
});
document.addEventListener("change", (event) => {
  if (event.target.matches("#dashboard-role-select")) {
    if (!allowedDashboardKeys.includes(event.target.value)) {
      event.target.value = state.dashboard;
      showToast("Tampilan tersebut tidak termasuk akses akun Anda.");
      return;
    }
    state.dashboard = event.target.value;
    state.view = "command";
    renderDepartmentDashboard();
  }
  if (event.target.matches("[data-notification-preference]")) {
    state.data.notificationPreferences[event.target.dataset.notificationPreference] = event.target.checked;
    persist(); updateNavCounts(); renderNotifications();
    showToast("Preferensi notifikasi diperbarui.");
  }
  if (event.target.matches("[data-report-owner]")) {
    state.reportOwner = event.target.value;
    renderReports();
  }
});
recordForm.addEventListener("input", (event) => {
  if (String(event.target.value || "").trim()) {
    event.target.removeAttribute("aria-invalid");
    event.target.closest(".field")?.querySelector(".field-error")?.replaceChildren();
    const box = recordForm.querySelector(".record-errors");
    if (box) { box.hidden = true; box.textContent = ""; }
  }
  if (event.target.name === "value" && state.recordType === "contract" && recordForm.elements.billingModel?.value === "one_time") {
    recordForm.elements.cycleAmount.value = event.target.value;
  }
});
signalForm.addEventListener("submit", handleSignalSubmit);
signalForm.elements.followUpMethod.addEventListener("change", syncCanvassingFields);
signalTriageForm.addEventListener("submit", handleSignalTriageSubmit);
controlForm.addEventListener("submit", handleControlSubmit);
handoffForm.addEventListener("submit", handleHandoffSubmit);
governanceForm.addEventListener("submit", handleGovernanceSubmit);
clearPriorityButton.addEventListener("click", handleClearPriority);
controlForm.elements.controlType.addEventListener("change", () => {
  clearControlErrors();
  syncControlFields();
});
controlForm.elements.override.addEventListener("change", syncControlFields);
handoffForm.elements.decision.addEventListener("change", () => {
  clearHandoffErrors();
  syncHandoffFields();
});
governanceForm.elements.action.addEventListener("change", () => {
  clearGovernanceErrors();
  syncGovernanceFields();
});
signalTriageForm.elements.action.addEventListener("change", () => {
  clearSignalTriageErrors();
  syncSignalTriageFields();
});

opportunityDialog.addEventListener("click", (event) => {
  if (event.target === opportunityDialog) opportunityDialog.close();
});
detailDialog.addEventListener("click", (event) => {
  if (event.target === detailDialog) detailDialog.close();
});
recordDialog.addEventListener("click", (event) => {
  if (event.target === recordDialog) { state.activationMode = false; recordDialog.close(); }
});
controlDialog.addEventListener("click", (event) => {
  if (event.target === controlDialog) controlDialog.close();
});
handoffDialog.addEventListener("click", (event) => {
  if (event.target === handoffDialog) handoffDialog.close();
});
governanceDialog.addEventListener("click", (event) => {
  if (event.target === governanceDialog) governanceDialog.close();
});
signalDialog.addEventListener("click", (event) => {
  if (event.target === signalDialog) signalDialog.close();
});
signalTriageDialog.addEventListener("click", (event) => {
  if (event.target === signalTriageDialog) signalTriageDialog.close();
});
resetDialog.addEventListener("click", (event) => {
  if (event.target === resetDialog) resetDialog.close();
});
onboardingDialog.addEventListener("click", (event) => {
  if (event.target === onboardingDialog) onboardingDialog.close();
});

applyOnboardingProfile();
const topbarDate = document.querySelector("#topbar-date");
if (topbarDate) {
  topbarDate.textContent = new Intl.DateTimeFormat("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta"
  }).format(new Date());
}
let initialDataAuthority;
if (identitySession.authenticated) {
  root.innerHTML = `<section class="view authority-loading-view" aria-live="polite" aria-busy="true"><div class="surface authority-loading-card"><span class="activation-spinner" aria-hidden="true"></span><div><h1>Menyiapkan data perusahaan…</h1><p>DEKTA sedang mengambil pelanggan, pekerjaan, dan angka keuangan dari server. Data contoh tidak akan ditampilkan selama proses ini.</p></div></div></section>`;
  initialDataAuthority = refreshDataAuthority();
} else {
  render();
  initialDataAuthority = refreshDataAuthority();
}

const HANDOFF_REQUIRED_FIELDS = ["taskId", "fromAssignee", "reason", "evidence", "dueAt", "actor"];

function required(value) {
  return String(value ?? "").trim().length > 0;
}

function validationError(field, message) {
  return { field, message };
}

function findTask(engagement, taskId) {
  for (const workstream of engagement?.workstreams || []) {
    const task = (workstream.tasks || []).find((item) => item.id === taskId);
    if (task) return { workstream, task };
  }
  return null;
}

const DELIVERY_ASSIGNMENT_ROLES = ["executive_admin", "delivery"];
const TASK_COLLABORATION_ROLES = ["executive_admin", "delivery", "sales", "reviewer"];

export function listAssignableMembers(memberships = [], organizationId, allowedRoles = DELIVERY_ASSIGNMENT_ROLES) {
  return memberships
    .filter((member) => member.organizationId === organizationId && member.status === "active")
    .filter((member) => (member.roles || []).some((role) => allowedRoles.includes(role)))
    .toSorted((left, right) => left.name.localeCompare(right.name, "id-ID"));
}

function resolveActiveMember(input, memberId, allowedRoles = DELIVERY_ASSIGNMENT_ROLES) {
  return listAssignableMembers(input?.memberships || [], input?.organizationId, allowedRoles)
    .find((member) => member.id === memberId) || null;
}

function cloneEngagement(engagement) {
  return structuredClone(engagement);
}

function findWorkstream(engagement, workstreamId) {
  return (engagement?.workstreams || []).find((item) => item.id === workstreamId) || null;
}

function syncWorkstreamStatus(workstream) {
  const milestones = workstream.milestones || [];
  const tasks = workstream.tasks || [];
  if (milestones.length && milestones.every((item) => item.status === "done")) return "done";
  if (tasks.some((item) => item.status === "blocked")) return "blocked";
  if (milestones.some((item) => item.status === "done") || tasks.some((item) => ["active", "done"].includes(item.status))) return "active";
  return "planned";
}

export function createConsultingEngagement(accounts, input, now = new Date()) {
  const errors = [];
  const account = (accounts || []).find((item) => item.id === input?.accountId);
  const selectedManager = input?.managerId ? resolveActiveMember(input, input.managerId) : null;
  if (!account) errors.push(validationError("accountId", "Pilih pelanggan yang terdaftar."));
  for (const field of ["title", "pricingModel", "targetAt", "nextMilestone", "actor"]) {
    if (!required(input?.[field])) errors.push(validationError(field, "Wajib diisi."));
  }
  if (input?.managerId && !selectedManager) errors.push(validationError("managerId", "Pilih anggota aktif dengan akses Operasional."));
  if (!input?.managerId && !required(input?.manager)) errors.push(validationError("manager", "Wajib diisi."));
  const pricingModels = ["fixed_fee", "retainer", "milestone", "hourly"];
  if (required(input?.pricingModel) && !pricingModels.includes(input.pricingModel)) errors.push(validationError("pricingModel", "Model komersial tidak dikenal."));
  const contractValue = Number(input?.contractValue || 0);
  if (!Number.isInteger(contractValue) || contractValue < 0) errors.push(validationError("contractValue", "Nilai harus berupa rupiah bulat, minimal nol."));
  const targetAt = new Date(input?.targetAt);
  if (required(input?.targetAt) && Number.isNaN(targetAt.getTime())) errors.push(validationError("targetAt", "Tanggal target tidak valid."));
  if (errors.length) return { ok: false, errors };

  const at = now.toISOString();
  const engagement = {
    id: `eng-${now.getTime()}`,
    accountId: account.id,
    title: String(input.title).trim(),
    reference: String(input.reference || `SAMPLE/ENG/${now.getTime()}`).trim(),
    status: "active",
    managerId: selectedManager?.id || null,
    manager: selectedManager?.name || String(input.manager).trim(),
    pricingModel: input.pricingModel,
    contractValue,
    targetAt: targetAt.toISOString(),
    nextMilestone: String(input.nextMilestone).trim(),
    workstreams: [],
    expenses: [],
    activity: [{ at, kind: "consulting_engagement_created", actor: String(input.actor).trim() }]
  };
  return { ok: true, engagement };
}

export function addConsultingWorkstream(engagement, input, now = new Date()) {
  const errors = [];
  const selectedOwner = input?.ownerId ? resolveActiveMember(input, input.ownerId) : null;
  for (const field of ["name", "actor"]) if (!required(input?.[field])) errors.push(validationError(field, "Wajib diisi."));
  if (input?.ownerId && !selectedOwner) errors.push(validationError("ownerId", "Pilih anggota aktif dengan akses Operasional."));
  if (!input?.ownerId && !required(input?.owner)) errors.push(validationError("owner", "Wajib diisi."));
  if ((engagement?.workstreams || []).some((item) => item.name.trim().toLocaleLowerCase("id-ID") === String(input?.name || "").trim().toLocaleLowerCase("id-ID"))) {
    errors.push(validationError("name", "Layanan dengan nama yang sama sudah ada."));
  }
  if (errors.length) return { ok: false, errors };
  const next = cloneEngagement(engagement);
  const at = now.toISOString();
  const workstream = {
    id: `ws-${now.getTime()}`,
    name: String(input.name).trim(),
    ownerId: selectedOwner?.id || null,
    owner: selectedOwner?.name || String(input.owner).trim(),
    status: "planned",
    dependency: String(input.dependency || "").trim() || null,
    milestones: [],
    tasks: [],
    activity: [{ at, kind: "workstream_created", actor: String(input.actor).trim() }]
  };
  next.workstreams.push(workstream);
  next.activity = [{ at, kind: "workstream_created", actor: input.actor, workstreamId: workstream.id }, ...(next.activity || [])];
  return { ok: true, engagement: next, workstream };
}

export function addConsultingMilestone(engagement, input, now = new Date()) {
  const errors = [];
  const workstream = findWorkstream(engagement, input?.workstreamId);
  if (!workstream) errors.push(validationError("workstreamId", "Layanan tidak ditemukan."));
  if (!required(input?.title)) errors.push(validationError("title", "Nama milestone wajib diisi."));
  const weight = Number(input?.weight);
  if (!Number.isInteger(weight) || weight < 1 || weight > 100) errors.push(validationError("weight", "Bobot harus berupa angka bulat 1 sampai 100."));
  if (!required(input?.actor)) errors.push(validationError("actor", "Aktor wajib diisi."));
  if (errors.length) return { ok: false, errors };
  const next = cloneEngagement(engagement);
  const target = findWorkstream(next, input.workstreamId);
  const at = now.toISOString();
  const milestone = { id: `mil-${now.getTime()}`, title: String(input.title).trim(), weight, status: "open", dueAt: required(input.dueAt) ? new Date(input.dueAt).toISOString() : null, completedAt: null, evidence: null, activity: [{ at, kind: "milestone_created", actor: input.actor }] };
  target.milestones.push(milestone);
  target.status = syncWorkstreamStatus(target);
  next.activity = [{ at, kind: "milestone_created", actor: input.actor, workstreamId: target.id, milestoneId: milestone.id }, ...(next.activity || [])];
  return { ok: true, engagement: next, milestone };
}

export function addConsultingTask(engagement, input, now = new Date()) {
  const errors = [];
  const workstream = findWorkstream(engagement, input?.workstreamId);
  const selectedOwner = input?.ownerId ? resolveActiveMember(input, input.ownerId) : null;
  if (!workstream) errors.push(validationError("workstreamId", "Layanan tidak ditemukan."));
  for (const field of ["title", "dueAt", "actor"]) if (!required(input?.[field])) errors.push(validationError(field, "Wajib diisi."));
  if (input?.ownerId && !selectedOwner) errors.push(validationError("ownerId", "Pilih anggota aktif dengan akses Operasional."));
  if (!input?.ownerId && !required(input?.owner)) errors.push(validationError("owner", "Wajib diisi."));
  const dueAt = new Date(input?.dueAt);
  if (required(input?.dueAt) && Number.isNaN(dueAt.getTime())) errors.push(validationError("dueAt", "Tanggal target tidak valid."));
  if (errors.length) return { ok: false, errors };
  const next = cloneEngagement(engagement);
  const target = findWorkstream(next, input.workstreamId);
  const at = now.toISOString();
  const task = { id: `tsk-${now.getTime()}`, title: String(input.title).trim(), ownerId: selectedOwner?.id || null, owner: selectedOwner?.name || String(input.owner).trim(), status: "open", dueAt: dueAt.toISOString(), blocker: null, handoff: null, comments: [], completedAt: null, activity: [{ at, kind: "consulting_task_created", actor: input.actor }] };
  target.tasks.push(task);
  target.status = syncWorkstreamStatus(target);
  next.activity = [{ at, kind: "consulting_task_created", actor: input.actor, workstreamId: target.id, taskId: task.id }, ...(next.activity || [])];
  return { ok: true, engagement: next, task };
}

export function changeConsultingMilestoneStatus(engagement, input, now = new Date()) {
  const errors = [];
  const workstream = findWorkstream(engagement, input?.workstreamId);
  const milestone = workstream?.milestones?.find((item) => item.id === input?.milestoneId);
  if (!workstream) errors.push(validationError("workstreamId", "Layanan tidak ditemukan."));
  if (!milestone) errors.push(validationError("milestoneId", "Milestone tidak ditemukan."));
  if (!["done", "open"].includes(input?.status)) errors.push(validationError("status", "Status milestone tidak valid."));
  if (!required(input?.actor)) errors.push(validationError("actor", "Aktor wajib diisi."));
  if (!required(input?.evidence)) errors.push(validationError("evidence", "Bukti atau alasan perubahan wajib diisi."));
  if (errors.length) return { ok: false, errors };
  const next = cloneEngagement(engagement);
  const targetWorkstream = findWorkstream(next, input.workstreamId);
  const target = targetWorkstream.milestones.find((item) => item.id === input.milestoneId);
  const at = now.toISOString();
  target.status = input.status;
  target.completedAt = input.status === "done" ? at : null;
  target.evidence = String(input.evidence).trim();
  target.activity = [{ at, kind: input.status === "done" ? "milestone_completed" : "milestone_reopened", actor: input.actor, evidence: input.evidence }, ...(target.activity || [])];
  targetWorkstream.status = syncWorkstreamStatus(targetWorkstream);
  next.activity = [{ at, kind: input.status === "done" ? "milestone_completed" : "milestone_reopened", actor: input.actor, milestoneId: target.id }, ...(next.activity || [])];
  return { ok: true, engagement: next, milestone: target, progress: calculateEngagementProgress(next) };
}

export function changeConsultingTaskStatus(engagement, input, now = new Date()) {
  const errors = [];
  const located = findTask(engagement, input?.taskId);
  if (!located) errors.push(validationError("taskId", "Tugas tidak ditemukan."));
  if (!["done", "open", "blocked"].includes(input?.status)) errors.push(validationError("status", "Status tugas tidak valid."));
  if (!required(input?.actor)) errors.push(validationError("actor", "Aktor wajib diisi."));
  if (!required(input?.evidence)) errors.push(validationError("evidence", "Bukti atau alasan perubahan wajib diisi."));
  if (input?.status === "blocked" && !required(input?.blocker)) errors.push(validationError("blocker", "Jelaskan bantuan atau dokumen yang dibutuhkan."));
  if (errors.length) return { ok: false, errors };
  const next = cloneEngagement(engagement);
  const target = findTask(next, input.taskId);
  const at = now.toISOString();
  target.task.status = input.status;
  target.task.completedAt = input.status === "done" ? at : null;
  target.task.blocker = input.status === "blocked" ? String(input.blocker).trim() : null;
  target.task.activity = [{ at, kind: `consulting_task_${input.status}`, actor: input.actor, evidence: input.evidence }, ...(target.task.activity || [])];
  target.workstream.status = syncWorkstreamStatus(target.workstream);
  next.activity = [{ at, kind: `consulting_task_${input.status}`, actor: input.actor, taskId: target.task.id }, ...(next.activity || [])];
  return { ok: true, engagement: next, task: target.task };
}

export function addConsultingTaskComment(engagement, input, now = new Date()) {
  const errors = [];
  const located = findTask(engagement, input?.taskId);
  const author = resolveActiveMember(input, input?.authorId, TASK_COLLABORATION_ROLES);
  const mentionIds = [...new Set((input?.mentionMemberIds || []).filter(Boolean))];
  const mentionableMembers = listAssignableMembers(input?.memberships || [], input?.organizationId, TASK_COLLABORATION_ROLES);
  const mentionedMembers = mentionIds.map((id) => mentionableMembers.find((member) => member.id === id)).filter(Boolean);
  if (!located) errors.push(validationError("taskId", "Tugas tidak ditemukan."));
  if (!author) errors.push(validationError("authorId", "Hanya anggota aktif yang dapat menulis komentar."));
  if (!required(input?.body)) errors.push(validationError("body", "Komentar tidak boleh kosong."));
  if (String(input?.body || "").trim().length > 4000) errors.push(validationError("body", "Komentar maksimal 4.000 karakter."));
  if (mentionedMembers.length !== mentionIds.length) errors.push(validationError("mentionMemberIds", "Satu atau lebih mention tidak memiliki akses ke pekerjaan ini."));
  if (mentionIds.length > 10) errors.push(validationError("mentionMemberIds", "Maksimal 10 orang dalam satu komentar."));
  if (errors.length) return { ok: false, errors };

  const next = cloneEngagement(engagement);
  const task = findTask(next, input.taskId).task;
  const at = now.toISOString();
  const mentions = mentionedMembers.map((member) => ({ memberId: member.id, name: member.name }));
  const notificationIntents = mentions
    .filter((mention) => mention.memberId !== author.id)
    .map((mention) => ({ memberId: mention.memberId, channel: "in_app", status: "pending", externalDelivery: false }));
  const comment = {
    id: `cmt-${input.taskId}-${now.getTime()}`,
    body: String(input.body).trim(),
    authorId: author.id,
    author: author.name,
    mentions,
    notificationIntents,
    createdAt: at,
    editedAt: null
  };
  task.comments = [...(task.comments || []), comment];
  task.activity = [{ at, kind: "consulting_task_commented", actor: author.name, commentId: comment.id, mentionMemberIds: mentionIds }, ...(task.activity || [])];
  next.activity = [{ at, kind: "consulting_task_commented", actor: author.name, taskId: task.id, commentId: comment.id }, ...(next.activity || [])];
  return { ok: true, engagement: next, task, comment };
}

export function calculateEngagementProgress(engagement) {
  const milestones = (engagement?.workstreams || []).flatMap((workstream) => workstream.milestones || []);
  if (!milestones.length) return 0;
  const totalWeight = milestones.reduce((sum, item) => sum + Number(item.weight || 1), 0);
  const completedWeight = milestones
    .filter((item) => item.status === "done")
    .reduce((sum, item) => sum + Number(item.weight || 1), 0);
  return totalWeight ? Math.round((completedWeight / totalWeight) * 100) : 0;
}

export function buildConsultingPortfolio(data) {
  const accounts = new Map((data?.accounts || []).map((item) => [item.id, item]));
  return (data?.consultingEngagements || []).map((engagement) => {
    const tasks = (engagement.workstreams || []).flatMap((workstream) => workstream.tasks || []);
    const expenses = engagement.expenses || [];
    const waitingHandoffs = tasks.filter((task) => task.handoff?.status === "awaiting_acceptance");
    const openTasks = tasks.filter((task) => !["done", "cancelled"].includes(task.status));
    const blockedTasks = openTasks.filter((task) => task.status === "blocked");
    const financeQueue = expenses.filter((expense) => expense.financeState === "awaiting_review");
    return {
      ...engagement,
      account: accounts.get(engagement.accountId) || null,
      progress: calculateEngagementProgress(engagement),
      taskCount: tasks.length,
      openTaskCount: openTasks.length,
      blockedTaskCount: blockedTasks.length,
      waitingHandoffCount: waitingHandoffs.length,
      expenseTotal: expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      financeQueueTotal: financeQueue.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      financeQueueCount: financeQueue.length,
      nextTask: openTasks.toSorted((left, right) => new Date(left.dueAt) - new Date(right.dueAt))[0] || null
    };
  });
}

export function submitAssignmentHandoff(engagement, input, now = new Date()) {
  const errors = HANDOFF_REQUIRED_FIELDS.filter((field) => !required(input?.[field]))
    .map((field) => validationError(field, "Wajib diisi sebelum tugas diserahkan."));
  const located = findTask(engagement, input?.taskId);
  const selectedRecipient = input?.toAssigneeId ? resolveActiveMember(input, input.toAssigneeId) : null;
  const recipientName = selectedRecipient?.name || String(input?.toAssignee || "").trim();
  if (!located) errors.push(validationError("taskId", "Tugas tidak ditemukan pada engagement ini."));
  if (input?.toAssigneeId && !selectedRecipient) errors.push(validationError("toAssigneeId", "Pilih penerima aktif dengan akses Operasional."));
  if (!input?.toAssigneeId && !required(input?.toAssignee)) errors.push(validationError("toAssignee", "Penerima wajib dipilih."));
  if (located && located.task.owner !== String(input.fromAssignee).trim()) {
    errors.push(validationError("fromAssignee", "Penyerah harus sama dengan pemilik tugas saat ini."));
  }
  if (required(input?.fromAssignee) && String(input.fromAssignee).trim() === recipientName) {
    errors.push(validationError(input?.toAssigneeId ? "toAssigneeId" : "toAssignee", "Penerima harus berbeda dari pemilik saat ini."));
  }
  if (errors.length) return { ok: false, errors };

  const next = cloneEngagement(engagement);
  const task = findTask(next, input.taskId).task;
  const at = now.toISOString();
  task.handoff = {
    id: `hnd-${input.taskId}-${now.getTime()}`,
    status: "awaiting_acceptance",
    fromAssigneeId: located?.task?.ownerId || null,
    fromAssignee: String(input.fromAssignee).trim(),
    toAssigneeId: selectedRecipient?.id || null,
    toAssignee: recipientName,
    reason: String(input.reason).trim(),
    evidence: String(input.evidence).trim(),
    dueAt: new Date(input.dueAt).toISOString(),
    submittedBy: String(input.actor).trim(),
    submittedAt: at,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null
  };
  task.activity = [{ at, kind: "assignment_handoff_submitted", actor: input.actor, detail: `${task.owner} → ${task.handoff.toAssignee}` }, ...(task.activity || [])];
  next.activity = [{ at, kind: "assignment_handoff_submitted", actor: input.actor, taskId: task.id }, ...(next.activity || [])];
  return { ok: true, engagement: next, handoff: task.handoff };
}

export function reviewAssignmentHandoff(engagement, input, now = new Date()) {
  const errors = [];
  const located = findTask(engagement, input?.taskId);
  if (!located) errors.push(validationError("taskId", "Tugas tidak ditemukan."));
  if (located && located.task.handoff?.status !== "awaiting_acceptance") errors.push(validationError("handoff", "Serah tugas ini tidak sedang menunggu penerimaan."));
  if (!["accept", "reject"].includes(input?.decision)) errors.push(validationError("decision", "Pilih terima atau kembalikan."));
  const selectedReviewer = input?.reviewerId ? resolveActiveMember(input, input.reviewerId) : null;
  const reviewerName = selectedReviewer?.name || String(input?.reviewer || "").trim();
  if (input?.reviewerId && !selectedReviewer) errors.push(validationError("reviewerId", "Pilih pemeriksa aktif dengan akses Operasional."));
  if (!input?.reviewerId && !required(input?.reviewer)) errors.push(validationError("reviewer", "Nama pemeriksa wajib diisi."));
  if (located?.task?.handoff?.toAssigneeId && selectedReviewer?.id !== located.task.handoff.toAssigneeId) {
    errors.push(validationError("reviewerId", "Hanya penerima assignment yang dapat memberi keputusan."));
  }
  if (!required(input?.note)) errors.push(validationError("note", "Catatan pemeriksaan wajib diisi."));
  if (errors.length) return { ok: false, errors };

  const next = cloneEngagement(engagement);
  const task = findTask(next, input.taskId).task;
  const at = now.toISOString();
  const accepted = input.decision === "accept";
  task.handoff = {
    ...task.handoff,
    status: accepted ? "accepted" : "rejected",
    reviewedById: selectedReviewer?.id || null,
    reviewedBy: reviewerName,
    reviewedAt: at,
    reviewNote: String(input.note).trim()
  };
  if (accepted) {
    task.ownerId = task.handoff.toAssigneeId || null;
    task.owner = task.handoff.toAssignee;
  }
  task.activity = [{ at, kind: accepted ? "assignment_handoff_accepted" : "assignment_handoff_rejected", actor: reviewerName, detail: input.note }, ...(task.activity || [])];
  next.activity = [{ at, kind: accepted ? "assignment_handoff_accepted" : "assignment_handoff_rejected", actor: reviewerName, taskId: task.id }, ...(next.activity || [])];
  return { ok: true, engagement: next, handoff: task.handoff };
}

export function createTaskExpense(engagement, input, now = new Date()) {
  const errors = [];
  const located = findTask(engagement, input?.taskId);
  if (!located) errors.push(validationError("taskId", "Pilih tugas yang valid."));
  const amount = Number(input?.amount);
  if (!Number.isInteger(amount) || amount <= 0) errors.push(validationError("amount", "Nominal harus berupa rupiah bulat dan lebih dari nol."));
  for (const field of ["category", "treatment", "paidBy", "evidence", "incurredAt", "actor"]) {
    if (!required(input?.[field])) errors.push(validationError(field, "Wajib diisi."));
  }
  const treatments = ["company_cost", "included_in_fee", "employee_reimbursement", "supplier_payable", "client_rebillable"];
  if (required(input?.treatment) && !treatments.includes(input.treatment)) errors.push(validationError("treatment", "Perlakuan biaya tidak dikenal."));
  if (errors.length) return { ok: false, errors };

  const at = now.toISOString();
  const expense = {
    id: `exp-${now.getTime()}`,
    taskId: input.taskId,
    workstreamId: located.workstream.id,
    category: String(input.category).trim(),
    description: String(input.description || "").trim(),
    amount,
    paidBy: String(input.paidBy).trim(),
    treatment: input.treatment,
    evidence: String(input.evidence).trim(),
    incurredAt: new Date(input.incurredAt).toISOString(),
    submittedBy: String(input.actor).trim(),
    submittedAt: at,
    financeState: "awaiting_review",
    billingState: "not_applicable",
    settlementState: "not_posted",
    externalPosting: false,
    activity: [{ at, kind: "expense_submitted", actor: input.actor }]
  };
  const next = cloneEngagement(engagement);
  next.expenses = [expense, ...(next.expenses || [])];
  next.activity = [{ at, kind: "expense_submitted", actor: input.actor, expenseId: expense.id }, ...(next.activity || [])];
  return { ok: true, engagement: next, expense };
}

export function reviewTaskExpense(engagement, expenseId, input, now = new Date()) {
  const index = (engagement?.expenses || []).findIndex((item) => item.id === expenseId);
  const errors = [];
  if (index < 0) errors.push(validationError("expenseId", "Pengeluaran tidak ditemukan."));
  if (index >= 0 && engagement.expenses[index].financeState !== "awaiting_review") errors.push(validationError("financeState", "Pengeluaran ini sudah selesai diperiksa."));
  if (!["approve", "reject"].includes(input?.decision)) errors.push(validationError("decision", "Pilih setujui atau kembalikan."));
  if (!required(input?.reviewer)) errors.push(validationError("reviewer", "Pemeriksa Finance wajib diisi."));
  if (!required(input?.note)) errors.push(validationError("note", "Catatan pemeriksaan wajib diisi."));
  if (errors.length) return { ok: false, errors };

  const next = cloneEngagement(engagement);
  const expense = next.expenses[index];
  const approved = input.decision === "approve";
  const at = now.toISOString();
  expense.financeState = approved ? "approved" : "rejected";
  expense.reviewedBy = String(input.reviewer).trim();
  expense.reviewedAt = at;
  expense.reviewNote = String(input.note).trim();
  if (approved) {
    if (expense.treatment === "client_rebillable") expense.billingState = "ready_for_invoice_draft";
    if (expense.treatment === "employee_reimbursement") expense.settlementState = "awaiting_reimbursement";
    if (expense.treatment === "supplier_payable") expense.settlementState = "awaiting_supplier_payment";
    if (["company_cost", "included_in_fee"].includes(expense.treatment)) expense.settlementState = "approved_cost";
  }
  expense.activity = [{ at, kind: approved ? "expense_approved" : "expense_rejected", actor: input.reviewer, detail: input.note }, ...(expense.activity || [])];
  next.activity = [{ at, kind: approved ? "expense_approved" : "expense_rejected", actor: input.reviewer, expenseId }, ...(next.activity || [])];
  return { ok: true, engagement: next, expense };
}

export function buildExpenseReviewQueue(engagements = []) {
  const rows = engagements.flatMap((engagement) => (engagement.expenses || []).map((expense) => ({
    ...expense,
    engagementId: engagement.id,
    engagementTitle: engagement.title,
    accountId: engagement.accountId,
    task: findTask(engagement, expense.taskId)?.task || null,
    workstream: findTask(engagement, expense.taskId)?.workstream || null
  })));
  return {
    rows: rows.toSorted((left, right) => new Date(right.incurredAt) - new Date(left.incurredAt)),
    awaitingCount: rows.filter((item) => item.financeState === "awaiting_review").length,
    awaitingTotal: rows.filter((item) => item.financeState === "awaiting_review").reduce((sum, item) => sum + Number(item.amount || 0), 0),
    rebillableTotal: rows.filter((item) => item.billingState === "ready_for_invoice_draft").reduce((sum, item) => sum + Number(item.amount || 0), 0),
    reimbursementTotal: rows.filter((item) => item.settlementState === "awaiting_reimbursement").reduce((sum, item) => sum + Number(item.amount || 0), 0)
  };
}

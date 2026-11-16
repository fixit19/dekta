const STEP_CATALOG = Object.freeze([
  { key: "workspace", label: "Workspace siap", description: "Perusahaan, departemen, dan akses awal sudah tersimpan." },
  { key: "customer", label: "Pelanggan pertama", description: "Simpan satu pelanggan agar tim memakai identitas yang sama." },
  { key: "engagement", label: "Pekerjaan pelanggan", description: "Buat engagement untuk kebutuhan yang benar-benar ditangani." },
  { key: "workstream", label: "Layanan pertama", description: "Pisahkan jalur legal, pajak, keuangan, atau layanan lainnya." },
  { key: "milestone", label: "Hasil yang dituju", description: "Tambahkan milestone agar progres dihitung dari hasil yang terbukti." },
  { key: "task", label: "Tugas pertama", description: "Tentukan pekerjaan, PIC aktif, dan target selesainya." }
]);

function activeRows(rows = []) {
  return rows.filter((item) => !["archived", "cancelled"].includes(item.status));
}

function newest(rows = []) {
  return [...rows].toSorted((left, right) => new Date(right.createdAt || right.updatedAt || 0) - new Date(left.createdAt || left.updatedAt || 0))[0] || null;
}

function subscriptionAllowsWrites(subscription, at) {
  if (!subscription || !["trialing", "active", "grace"].includes(subscription.status)) return false;
  if (subscription.status === "trialing") {
    const trialEnd = new Date(subscription.trialEndsAt).getTime();
    if (!Number.isFinite(trialEnd) || trialEnd <= at.getTime()) return false;
  }
  if (subscription.status === "grace") {
    const graceEnd = new Date(subscription.graceEndsAt).getTime();
    if (!Number.isFinite(graceEnd) || graceEnd <= at.getTime()) return false;
  }
  return true;
}

function latestTimestamp(snapshot) {
  const rows = [
    ...(snapshot.accounts || []),
    ...(snapshot.consultingEngagements || []),
    ...(snapshot.consultingWorkstreams || []),
    ...(snapshot.consultingMilestones || []),
    ...(snapshot.consultingTasks || []),
    ...(snapshot.consultingExpenses || [])
  ];
  const timestamps = rows.flatMap((item) => [item.updatedAt, item.createdAt, item.incurredAt]).filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

export function buildActivationJourney({ organization, subscription, snapshot, at = new Date() } = {}) {
  if (!organization || !snapshot) {
    return { ready: false, complete: false, completedCount: organization ? 1 : 0, totalCount: STEP_CATALOG.length, progress: organization ? 17 : 0, steps: [], nextAction: null, writesAllowed: subscriptionAllowsWrites(subscription, at) };
  }

  const accounts = activeRows(snapshot.accounts);
  const engagements = activeRows(snapshot.consultingEngagements);
  const workstreams = activeRows(snapshot.consultingWorkstreams);
  const milestones = activeRows(snapshot.consultingMilestones);
  const tasks = activeRows(snapshot.consultingTasks);
  const expenses = activeRows(snapshot.consultingExpenses);
  const engagement = newest(engagements);
  const engagementWorkstreams = engagement ? workstreams.filter((item) => item.engagementId === engagement.id) : [];
  const workstream = newest(engagementWorkstreams);
  const workstreamMilestones = workstream ? milestones.filter((item) => item.workstreamId === workstream.id) : [];
  const workstreamTasks = workstream ? tasks.filter((item) => item.workstreamId === workstream.id) : [];
  const completion = {
    workspace: true,
    customer: accounts.length > 0,
    engagement: engagements.length > 0,
    workstream: engagementWorkstreams.length > 0,
    milestone: workstreamMilestones.length > 0,
    task: workstreamTasks.length > 0
  };
  const actions = {
    customer: { type: "customer", label: "Tambah pelanggan", targetId: null, subtargetId: null },
    engagement: { type: "consulting_engagement", label: "Buat pekerjaan pelanggan", targetId: null, subtargetId: null },
    workstream: { type: "consulting_workstream", label: "Tambah layanan", targetId: engagement?.id || null, subtargetId: null },
    milestone: { type: "consulting_milestone", label: "Tambah milestone", targetId: engagement?.id || null, subtargetId: workstream?.id || null },
    task: { type: "consulting_task", label: "Tambah tugas", targetId: engagement?.id || null, subtargetId: workstream?.id || null }
  };
  const steps = STEP_CATALOG.map((step) => ({ ...step, complete: completion[step.key], action: actions[step.key] || null }));
  const completedCount = steps.filter((step) => step.complete).length;
  const nextStep = steps.find((step) => !step.complete) || null;
  const writesAllowed = subscriptionAllowsWrites(subscription, at);
  return {
    ready: true,
    complete: completedCount === steps.length,
    completedCount,
    totalCount: steps.length,
    progress: Math.round(completedCount / steps.length * 100),
    steps,
    nextAction: nextStep?.action ? { ...nextStep.action, key: nextStep.key, title: nextStep.label, description: nextStep.description, disabled: !writesAllowed } : null,
    writesAllowed,
    lastProgressAt: latestTimestamp(snapshot),
    counts: { customers: accounts.length, engagements: engagements.length, workstreams: workstreams.length, milestones: milestones.length, tasks: tasks.length, expenses: expenses.length },
    optionalExpense: tasks.length > 0 && expenses.length === 0 && engagement ? { type: "task_expense", label: "Catat biaya jika ada", targetId: engagement.id, subtargetId: null } : null
  };
}

export const ACTIVATION_STEP_KEYS = Object.freeze(STEP_CATALOG.map((step) => step.key));

export class InMemoryCustomerToCashRepository {
  constructor() {
    this.records = {
      accounts: [], contacts: [], opportunities: [], contracts: [], projects: [], invoices: [], payments: [],
      consultingEngagements: [], consultingWorkstreams: [], consultingMilestones: [], consultingTasks: [],
      consultingTaskComments: [], consultingNotificationIntents: [], consultingAssignmentHandoffs: [], consultingExpenses: [],
      auditEvents: []
    };
    this.idempotency = new Map();
  }

  async transaction(work) {
    return work(this);
  }

  async lockIdempotency() {}

  async setTenant() {}

  async list(collection, organizationId) {
    return (this.records[collection] || []).filter((item) => item.organizationId === organizationId).map((item) => structuredClone(item));
  }

  async find(collection, organizationId, id) {
    const item = (this.records[collection] || []).find((record) => record.organizationId === organizationId && record.id === id);
    return item ? structuredClone(item) : null;
  }

  async findForUpdate(collection, organizationId, id) {
    return this.find(collection, organizationId, id);
  }

  async insert(collection, record) {
    this.records[collection].push(structuredClone(record));
    return structuredClone(record);
  }

  async update(collection, organizationId, id, updater) {
    const index = this.records[collection].findIndex((item) => item.organizationId === organizationId && item.id === id);
    if (index < 0) return null;
    const next = typeof updater === "function" ? updater(structuredClone(this.records[collection][index])) : updater;
    this.records[collection][index] = structuredClone(next);
    return structuredClone(next);
  }

  async appendAudit(event) {
    this.records.auditEvents.push(structuredClone(event));
    return structuredClone(event);
  }

  async getIdempotent(organizationId, command, key) {
    const item = this.idempotency.get(`${organizationId}:${command}:${key}`);
    return item ? structuredClone(item) : null;
  }

  async saveIdempotent(organizationId, command, key, requestHash, result) {
    this.idempotency.set(`${organizationId}:${command}:${key}`, structuredClone({ requestHash, result }));
  }
}

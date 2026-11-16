import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createDektaClient, loadMcpConfig } from "./dekta-client.mjs";
import { createDektaTools } from "./tools.mjs";

const server = new McpServer({ name: "dekta-growth-os", version: "0.1.0" });
const tools = createDektaTools(createDektaClient(loadMcpConfig()));
const output = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  isError: value?.ok === false
});
const pagination = {
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).max(100_000).default(0)
};
const idempotencyKey = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/).describe("Stable unique key; reuse the same key when retrying the same intended write.");
const rfc3339 = z.string().datetime({ offset: true });

server.registerTool("dekta_status", {
  description: "Periksa health dan readiness DEKTA tanpa membaca data tenant. Read-only."
}, async () => output(await tools.status()));

server.registerTool("dekta_revenue_summary", {
  description: "Baca ringkasan pipeline, kontrak, invoice, piutang, dan kas terkumpul sebagai nilai yang terpisah. Read-only."
}, async () => output(await tools.revenueSummary()));

server.registerTool("dekta_list_opportunities", {
  description: "Daftar peluang tenant aktif dengan filter dan pagination. Tidak mengubah stage atau mengirim pesan.",
  inputSchema: {
    status: z.string().max(40).optional(),
    stage: z.string().max(80).optional(),
    ownerUserId: z.string().max(160).optional(),
    ...pagination
  }
}, async (input) => output(await tools.listOpportunities(input)));

server.registerTool("dekta_list_followups", {
  description: "Daftar tindak lanjut peluang yang terlambat atau jatuh tempo dalam horizon tertentu. Read-only.",
  inputSchema: {
    due: z.enum(["overdue", "upcoming"]).default("overdue"),
    days: z.number().int().min(1).max(90).default(7),
    ownerUserId: z.string().max(160).optional(),
    ...pagination
  }
}, async (input) => output(await tools.listFollowups(input)));

server.registerTool("dekta_account_context", {
  description: "Baca konteks satu pelanggan beserta kontak, peluang, kontrak, dan invoice yang terkait. Read-only.",
  inputSchema: { accountId: z.string().min(1).max(160) }
}, async (input) => output(await tools.accountContext(input)));

server.registerTool("dekta_create_account", {
  description: "Buat pelanggan DEKTA pada tenant dari sesi terautentikasi. Write; tunduk pada role, deduplikasi, idempotency, dan audit DEKTA.",
  inputSchema: {
    idempotencyKey,
    name: z.string().min(1).max(200),
    contactName: z.string().max(200).optional(),
    source: z.string().max(120).optional(),
    segment: z.string().max(120).optional(),
    customFields: z.record(z.string(), z.string().max(500)).optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
}, async (input) => output(await tools.createAccount(input)));

server.registerTool("dekta_update_account", {
  description: "Perbarui identitas, kontak, sumber, segmen, atau custom fields pelanggan. Write dan diaudit.",
  inputSchema: {
    idempotencyKey,
    accountId: z.string().min(1).max(160),
    name: z.string().min(1).max(200),
    contactName: z.string().max(200).optional(),
    source: z.string().max(120).optional(),
    segment: z.string().max(120).optional(),
    customFields: z.record(z.string(), z.string().max(500)).optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
}, async (input) => output(await tools.updateAccount(input)));

server.registerTool("dekta_create_opportunity", {
  description: "Buat peluang aktif dengan owner, stage, nilai, next action, dan due date wajib. Write dan diaudit.",
  inputSchema: {
    idempotencyKey,
    accountId: z.string().min(1).max(160),
    service: z.string().min(1).max(240),
    ownerUserId: z.string().min(1).max(160),
    stage: z.enum(["Qualified", "Discovery", "Solution", "Proposal", "Decision"]),
    nextAction: z.string().min(1).max(500),
    nextActionDueAt: rfc3339,
    value: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.literal("IDR")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
}, async (input) => output(await tools.createOpportunity(input)));

server.registerTool("dekta_move_opportunity_stage", {
  description: "Pindahkan stage peluang aktif menggunakan optimistic lock, bukti, next action baru, dan audit trail.",
  inputSchema: {
    idempotencyKey,
    opportunityId: z.string().min(1).max(160),
    expectedLockVersion: z.number().int().positive(),
    targetStage: z.enum(["Qualified", "Discovery", "Solution", "Proposal", "Decision"]),
    evidence: z.string().min(1).max(1000),
    reference: z.string().max(500).optional(),
    nextAction: z.string().min(1).max(500),
    nextActionDueAt: rfc3339
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
}, async (input) => output(await tools.moveOpportunityStage(input)));

server.registerTool("dekta_mark_opportunity_won", {
  description: "Tandai peluang sebagai won berdasarkan bukti komitmen dan nilai final. Write material; confirmed harus true.",
  inputSchema: {
    idempotencyKey,
    confirmed: z.literal(true),
    opportunityId: z.string().min(1).max(160),
    commitmentReference: z.string().min(1).max(500),
    committedAt: rfc3339,
    value: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
}, async (input) => output(await tools.markOpportunityWon(input)));

await server.connect(new StdioServerTransport());

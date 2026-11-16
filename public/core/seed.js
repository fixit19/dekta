const atNoon = (date) => {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  return result;
};

const shiftDate = (base, days) => {
  const result = atNoon(base);
  result.setDate(result.getDate() + days);
  return result.toISOString();
};

export function makeSeedData(baseDate = new Date()) {
  const date = atNoon(baseDate);

  return {
    meta: {
      kind: "synthetic",
      generatedAt: date.toISOString(),
      version: 11
    },
    accounts: [
      { id: "acc-bima", name: "Bima Teknik", source: "Google Maps", createdAt: shiftDate(date, -1) },
      { id: "acc-cakrawala", name: "Sekolah Cakrawala", source: "Referral", createdAt: shiftDate(date, -2) },
      { id: "acc-kirana", name: "Kirana Foods", source: "Existing client", createdAt: shiftDate(date, -4) },
      { id: "acc-rona", name: "Rona Nusantara", source: "Referral", createdAt: shiftDate(date, -20) },
      { id: "acc-arunika", name: "Klinik Arunika", source: "Organic search", createdAt: shiftDate(date, -8) },
      { id: "acc-kopi", name: "Kopi Tumbuh", source: "Instagram", createdAt: shiftDate(date, -15) },
      { id: "acc-sagara", name: "Sagara Logistik", source: "Partner", createdAt: shiftDate(date, -11) },
      { id: "acc-nara", name: "Atelier Nara", source: "Referral", createdAt: shiftDate(date, -35) },
      { id: "acc-sentosa", name: "Sentosa Furnishing", source: "Existing client", createdAt: shiftDate(date, -60) },
      { id: "acc-pangan", name: "Pangan Kita", source: "Outbound", createdAt: shiftDate(date, -25) },
      { id: "acc-sembada", name: "PT Sembada Niaga", source: "Referral", segment: "Pelanggan aktif", createdAt: shiftDate(date, -28) },
      { id: "acc-laras", name: "Laras Hospitality", source: "Existing client", segment: "Pelanggan aktif", createdAt: shiftDate(date, -90) }
    ],
    contacts: [
      { id: "con-cakrawala-nisa", accountId: "acc-cakrawala", name: "Ibu Nisa", createdAt: shiftDate(date, -2) },
      { id: "con-kirana-reza", accountId: "acc-kirana", name: "Pak Reza", createdAt: shiftDate(date, -4) },
      { id: "con-rona-dimas", accountId: "acc-rona", name: "Dimas Prakoso", createdAt: shiftDate(date, -20) },
      { id: "con-arunika-sari", accountId: "acc-arunika", name: "dr. Sari Wulandari", createdAt: shiftDate(date, -8) },
      { id: "con-kopi-nadia", accountId: "acc-kopi", name: "Nadia Ramadhani", createdAt: shiftDate(date, -15) },
      { id: "con-sagara-raka", accountId: "acc-sagara", name: "Raka Maulana", createdAt: shiftDate(date, -11) },
      { id: "con-nara-maya", accountId: "acc-nara", name: "Maya Kusuma", createdAt: shiftDate(date, -35) },
      { id: "con-sentosa-reza", accountId: "acc-sentosa", name: "Reza Gunawan", createdAt: shiftDate(date, -60) },
      { id: "con-pangan-budi", accountId: "acc-pangan", name: "Budi Santoso", createdAt: shiftDate(date, -25) },
      { id: "con-sembada-raka", accountId: "acc-sembada", name: "Raka Wijaya", createdAt: shiftDate(date, -28) },
      { id: "con-laras-sinta", accountId: "acc-laras", name: "Sinta Larasati", createdAt: shiftDate(date, -90) }
    ],
    signals: [
      {
        id: "sig-bima",
        account: "Bima Teknik",
        accountId: "acc-bima",
        contact: "Belum teridentifikasi",
        contactId: null,
        need: "POS dan kontrol stok multi cabang",
        source: "Google Maps",
        owner: "Anggit",
        capturedAt: shiftDate(date, -1),
        status: "inbox",
        note: "Usaha terlihat berkembang ke cabang kedua; belum ada bukti budget atau authority.",
        canvassing: { area: "Sleman Barat", address: "Jl. Magelang KM 8, Sleman", visitAt: shiftDate(date, 1), routeOrder: 1, visitStatus: "planned", checkedInAt: null, result: null }
      },
      {
        id: "sig-cakrawala",
        account: "Sekolah Cakrawala",
        accountId: "acc-cakrawala",
        contact: "Ibu Nisa",
        contactId: "con-cakrawala-nisa",
        need: "LMS dan portal orang tua",
        source: "Referral",
        owner: "Anggit",
        capturedAt: shiftDate(date, -2),
        status: "nurture",
        note: "Referral menyebut kebutuhan semester depan. Timing perlu divalidasi.",
        nurtureReason: "Menunggu penyusunan anggaran dan agenda semester baru.",
        reviewDate: shiftDate(date, 12),
        lastDispositionAt: shiftDate(date, -1),
        activity: [{
          at: shiftDate(date, -1),
          kind: "signal_nurtured",
          label: "Masuk nurture oleh Anggit",
          detail: "Menunggu penyusunan anggaran dan agenda semester baru.",
          previousReviewDate: null,
          nextReviewDate: shiftDate(date, 12)
        }]
      },
      {
        id: "sig-kirana",
        account: "Kirana Foods",
        accountId: "acc-kirana",
        contact: "Pak Reza",
        contactId: "con-kirana-reza",
        need: "Portal distributor dan repeat order",
        source: "Existing client",
        owner: "Anggit",
        capturedAt: shiftDate(date, -4),
        status: "review",
        note: "Expansion signal dari hubungan lama; cek proyek sebelumnya sebelum menawarkan scope."
      },
      {
        id: "sig-sentosa-expansion",
        account: "Sentosa Furnishing",
        accountId: "acc-sentosa",
        contact: "Reza Gunawan",
        contactId: "con-sentosa-reza",
        need: "Portal mitra penjualan untuk pemesanan ulang cabang",
        source: "Existing client",
        owner: "Anggit",
        capturedAt: shiftDate(date, -2),
        status: "review",
        note: "Peluang lanjutan setelah proyek perdagangan digital selesai. Ruang lingkup dan tingkat kebutuhan masih perlu dikonfirmasi."
      }
    ],
    opportunities: [
      {
        id: "opp-rona",
        account: "Rona Nusantara",
        accountId: "acc-rona",
        contact: "Dimas Prakoso",
        contactId: "con-rona-dimas",
        service: "ERP & Commerce",
        source: "Referral",
        owner: "Anggit",
        stage: "Proposal",
        status: "active",
        value: 185_000_000,
        probabilityLabel: "Berkomitmen",
        nextAction: { label: "Konfirmasi keputusan dan timeline", due: shiftDate(date, -1) },
        lastActivityAt: shiftDate(date, -2),
        blockingReason: "Keputusan bersama finance belum dijadwalkan",
        note: "Proposal revisi sudah diterima. Fokus berikutnya adalah jalur persetujuan, bukan menambah materi.",
        activity: [
          { at: shiftDate(date, -2), label: "Proposal revisi dibagikan", kind: "proposal" },
          { at: shiftDate(date, -5), label: "Scope delivery ditinjau", kind: "review" }
        ]
      },
      {
        id: "opp-arunika",
        account: "Klinik Arunika",
        accountId: "acc-arunika",
        contact: "dr. Sari Wulandari",
        contactId: "con-arunika-sari",
        service: "Website & Acquisition",
        source: "Organic search",
        owner: "Anggit",
        stage: "Discovery",
        status: "active",
        value: 48_000_000,
        probabilityLabel: "Terarah",
        nextAction: { label: "Kirim ringkasan kebutuhan discovery", due: shiftDate(date, 0) },
        lastActivityAt: shiftDate(date, 0),
        note: "Prioritas pada booking pasien dan kredibilitas layanan. Data legal layanan belum lengkap.",
        activity: [
          { at: shiftDate(date, 0), label: "Discovery awal selesai", kind: "meeting" }
        ]
      },
      {
        id: "opp-kopi",
        account: "Kopi Tumbuh",
        accountId: "acc-kopi",
        contact: "Nadia Ramadhani",
        contactId: "con-kopi-nadia",
        service: "SEO Growth",
        source: "Instagram",
        owner: "Anggit",
        stage: "Qualified",
        status: "active",
        value: 24_000_000,
        probabilityLabel: "Perlu bukti",
        nextAction: { label: "Minta akses data baseline", due: shiftDate(date, 2) },
        lastActivityAt: shiftDate(date, -12),
        blockingReason: "Baseline GA4 dan Search Console belum tersedia",
        note: "Jangan menjanjikan target pertumbuhan sebelum baseline dan intent layanan terbaca.",
        activity: [
          { at: shiftDate(date, -12), label: "Kebutuhan awal dicatat", kind: "note" }
        ]
      },
      {
        id: "opp-sagara",
        account: "Sagara Logistik",
        accountId: "acc-sagara",
        contact: "Raka Maulana",
        contactId: "con-sagara-raka",
        service: "Operations App",
        source: "Partner",
        owner: "Anggit",
        stage: "Decision",
        status: "active",
        value: 125_000_000,
        probabilityLabel: "Siap keputusan",
        nextAction: { label: "Finalisasi batas integrasi fase 1", due: shiftDate(date, 1) },
        lastActivityAt: shiftDate(date, -1),
        note: "Integrasi GPS menjadi keputusan pembatas scope. Jangan masukkan sebelum spesifikasi vendor diterima.",
        activity: [
          { at: shiftDate(date, -1), label: "Keberatan integrasi dibahas", kind: "meeting" }
        ]
      },
      {
        id: "opp-nara",
        account: "Atelier Nara",
        accountId: "acc-nara",
        contact: "Maya Kusuma",
        contactId: "con-nara-maya",
        service: "Brand & Web",
        source: "Referral",
        owner: "Anggit",
        stage: "Won",
        status: "won",
        value: 68_000_000,
        probabilityLabel: "Terkontrak",
        nextAction: { label: "Lengkapi dan kirim ulang handoff", due: shiftDate(date, 1) },
        lastActivityAt: shiftDate(date, -3),
        commitment: {
          reference: "SAMPLE/SPK/NARA/008",
          date: shiftDate(date, -4),
          value: 68_000_000,
          recordedBy: "Anggit",
          recordedAt: shiftDate(date, -4)
        },
        handoff: {
          status: "rejected",
          scope: "Brand identity refresh dan website company profile 8 halaman.",
          clientPIC: "Maya Kusuma",
          deliveryOwner: "Nadia — Delivery Lead",
          targetStartDate: shiftDate(date, 3),
          dependencies: ["Aset foto produk", "Copy profil perusahaan"],
          constraints: ["Peluncuran sebelum agenda buyer meeting"],
          submittedBy: "Anggit",
          submittedAt: shiftDate(date, -4),
          rejectedBy: "Nadia — Delivery Lead",
          rejectedAt: shiftDate(date, -3),
          reviewNote: "Delivery belum dapat menyusun timeline final sebelum owner konten dan tanggal aset dikunci.",
          missing: ["PIC konten", "Tanggal penerimaan aset"]
        },
        note: "Komitmen sudah tercatat; delivery belum menerima dua dependency konten.",
        activity: [
          { at: shiftDate(date, -3), label: "Handoff dikembalikan oleh Nadia — Delivery Lead", kind: "handoff_rejected", detail: "PIC konten dan tanggal penerimaan aset belum dikunci." },
          { at: shiftDate(date, -4), label: "Bukti won dicatat dan handoff diajukan oleh Anggit", kind: "won_submitted", detail: "SAMPLE/SPK/NARA/008", contractedValue: 68_000_000 }
        ]
      },
      {
        id: "opp-sentosa",
        account: "Sentosa Furnishing",
        accountId: "acc-sentosa",
        contact: "Reza Gunawan",
        contactId: "con-sentosa-reza",
        service: "Commerce Platform",
        source: "Existing client",
        owner: "Anggit",
        stage: "Won",
        status: "won",
        value: 92_000_000,
        probabilityLabel: "Terkontrak",
        nextAction: null,
        lastActivityAt: shiftDate(date, -20),
        commitment: {
          reference: "SAMPLE/PO/SENTOSA/014",
          date: shiftDate(date, -22),
          value: 92_000_000,
          recordedBy: "Anggit",
          recordedAt: shiftDate(date, -22)
        },
        handoff: {
          status: "accepted",
          scope: "Commerce platform fase 1: katalog, checkout, dan integrasi inventori terbatas.",
          clientPIC: "Reza Gunawan",
          deliveryOwner: "Fikri — Product Lead",
          targetStartDate: shiftDate(date, -18),
          dependencies: ["Akses katalog SKU", "Sandbox payment gateway"],
          constraints: ["Migrasi histori transaksi di luar fase 1"],
          submittedBy: "Anggit",
          submittedAt: shiftDate(date, -21),
          acceptedBy: "Fikri — Product Lead",
          acceptedAt: shiftDate(date, -20),
          reviewNote: "Scope dan dependency fase 1 cukup untuk kickoff.",
          missing: []
        },
        note: "Handoff lengkap dan pembayaran telah diterima.",
        activity: [
          { at: shiftDate(date, -20), label: "Handoff diterima delivery", kind: "handoff" }
        ]
      },
      {
        id: "opp-pangan",
        account: "Pangan Kita",
        accountId: "acc-pangan",
        contact: "Budi Santoso",
        contactId: "con-pangan-budi",
        service: "Digital Commerce",
        source: "Outbound",
        owner: "Anggit",
        stage: "Closed",
        status: "lost",
        value: 38_000_000,
        probabilityLabel: "Ditutup",
        nextAction: null,
        lastActivityAt: shiftDate(date, -18),
        closeReason: "Prioritas internal berubah",
        note: "Tutup dengan alasan, bukan dibiarkan menjadi pipeline semu.",
        activity: [
          { at: shiftDate(date, -18), label: "Opportunity ditutup", kind: "lost" }
        ]
      }
    ],
    calendarEvents: [
      { id: "cal-weekly-review", title: "Review pipeline dan penagihan", startsAt: shiftDate(date, 1), owner: "Anggit", note: "Tinjau follow-up, invoice, dan hambatan delivery.", recurrence: "weekly", occurrences: 4, status: "active", source: "manual", createdAt: shiftDate(date, -3), activity: [] }
    ],
    contracts: [
      { id: "ctr-rona", opportunityId: "opp-rona", accountId: "acc-rona", number: "SAMPLE/CTR/021", title: "Implementasi ERP & Commerce", value: 185_000_000, status: "draft", version: 2, validUntil: shiftDate(date, 90), signedAt: null, owner: "Anggit", updatedAt: shiftDate(date, -2), billingPlan: { model: "milestone", interval: null, cycleAmount: 46_250_000, cycles: 4, startAt: shiftDate(date, 7), invoiceTiming: "advance", generationMode: "draft_only", scheduleNote: "DP, blueprint selesai, UAT, dan go-live.", generatedPeriods: [] } },
      { id: "ctr-nara", opportunityId: "opp-nara", accountId: "acc-nara", number: "SAMPLE/SPK/NARA/008", title: "Brand identity refresh dan website", value: 68_000_000, status: "signed", version: 1, validUntil: shiftDate(date, 45), signedAt: shiftDate(date, -4), owner: "Anggit", updatedAt: shiftDate(date, -4), billingPlan: { model: "one_time", interval: null, cycleAmount: 68_000_000, cycles: 1, startAt: shiftDate(date, -4), invoiceTiming: "advance", generationMode: "draft_only", scheduleNote: "Sekali tagih sesuai komitmen proyek.", generatedPeriods: ["initial"] } },
      { id: "ctr-sentosa", opportunityId: "opp-sentosa", accountId: "acc-sentosa", number: "SAMPLE/PO/SENTOSA/014", title: "Commerce Platform Managed", value: 92_000_000, status: "active", version: 1, validUntil: shiftDate(date, 365), signedAt: shiftDate(date, -22), owner: "Anggit", updatedAt: shiftDate(date, -22), billingPlan: { model: "recurring", interval: "monthly", cycleAmount: 7_666_667, cycles: 12, startAt: shiftDate(date, -22), invoiceTiming: "advance", generationMode: "draft_only", scheduleNote: "Retainer bulanan selama 12 bulan.", generatedPeriods: ["2026-08"] } }
    ],
    projects: [
      { id: "prj-nara", opportunityId: "opp-nara", accountId: "acc-nara", contractId: "ctr-nara", name: "Brand & Website Nara", status: "planned", owner: "Nadia", progress: 10, startAt: shiftDate(date, 3), dueAt: shiftDate(date, 28), nextMilestone: "Terima aset dan kunci PIC konten", tasks: [{ id: "tsk-nara-1", title: "Konfirmasi PIC konten", owner: "Nadia", status: "open", dueAt: shiftDate(date, 2) }], files: [], comments: [] },
      { id: "prj-sentosa", opportunityId: "opp-sentosa", accountId: "acc-sentosa", contractId: "ctr-sentosa", name: "Commerce Platform Sentosa", status: "active", owner: "Raka", progress: 62, startAt: shiftDate(date, -18), dueAt: shiftDate(date, 20), nextMilestone: "UAT katalog dan checkout", tasks: [{ id: "tsk-sentosa-1", title: "Siapkan skenario UAT checkout", owner: "Raka", status: "open", dueAt: shiftDate(date, 3) }, { id: "tsk-sentosa-2", title: "Validasi katalog utama", owner: "Nadia", status: "done", dueAt: shiftDate(date, -1) }], files: [{ id: "fil-sentosa-1", name: "Skenario-UAT-v1.pdf", url: "#sample-file", addedBy: "Raka", addedAt: shiftDate(date, -2) }], comments: [{ id: "cmt-sentosa-1", body: "Pelanggan meminta pengujian metode pembayaran sebelum katalog tambahan.", author: "Raka", at: shiftDate(date, -1) }] },
      { id: "prj-kirana", opportunityId: null, accountId: "acc-kirana", contractId: null, name: "Portal Distributor Kirana", status: "review", owner: "Nadia", progress: 88, startAt: shiftDate(date, -40), dueAt: shiftDate(date, 4), nextMilestone: "Review penerimaan dan peluang lanjutan", tasks: [{ id: "tsk-kirana-1", title: "Jadwalkan review penerimaan", owner: "Nadia", status: "open", dueAt: shiftDate(date, 1) }], files: [], comments: [] }
    ],
    consultingEngagements: [
      {
        id: "eng-sembada-establishment",
        accountId: "acc-sembada",
        title: "Pendirian PT & Aktivasi Pajak",
        reference: "SAMPLE/ENG/SEMN/001",
        status: "active",
        managerId: "mem-maya",
        manager: "Maya",
        pricingModel: "fixed_fee",
        contractValue: 18_500_000,
        targetAt: shiftDate(date, 18),
        nextMilestone: "Aktivasi NPWP badan setelah dokumen legal diterima",
        workstreams: [
          {
            id: "ws-sembada-legal",
            name: "Legal & Korporasi",
            ownerId: "mem-alya",
            owner: "Alya",
            status: "done",
            dependency: null,
            milestones: [
              { id: "mil-sembada-kyc", title: "KYC dan dokumen pendiri lengkap", weight: 15, status: "done", completedAt: shiftDate(date, -7) },
              { id: "mil-sembada-akta", title: "Akta dan SK Kemenkumham terbit", weight: 35, status: "done", completedAt: shiftDate(date, -1) }
            ],
            tasks: [
              {
                id: "tsk-sembada-sk",
                title: "Finalisasi akta dan serahkan SK",
                ownerId: "mem-bima",
                owner: "Bima",
                status: "done",
                dueAt: shiftDate(date, -1),
                handoff: {
                  id: "hnd-sembada-legal-tax",
                  status: "accepted",
                  fromAssigneeId: "mem-alya",
                  fromAssignee: "Alya",
                  toAssigneeId: "mem-bima",
                  toAssignee: "Bima",
                  reason: "Tahap pendirian selesai; lanjut registrasi pajak badan.",
                  evidence: "SAMPLE/SK/KEMENKUMHAM/018 dan checklist dokumen pendiri",
                  dueAt: shiftDate(date, 0),
                  submittedBy: "Maya",
                  submittedAt: shiftDate(date, -1),
                  reviewedById: "mem-bima",
                  reviewedBy: "Bima",
                  reviewedAt: shiftDate(date, -1),
                  reviewNote: "SK dan identitas pengurus lengkap. Tahap pajak dapat dimulai."
                },
                comments: [],
                activity: []
              }
            ]
          },
          {
            id: "ws-sembada-tax",
            name: "Pajak",
            ownerId: "mem-bima",
            owner: "Bima",
            status: "active",
            dependency: "Akta dan SK Kemenkumham terbit",
            milestones: [
              { id: "mil-sembada-npwp", title: "NPWP badan aktif", weight: 25, status: "active" },
              { id: "mil-sembada-pkp", title: "Keputusan status PKP", weight: 10, status: "open" }
            ],
            tasks: [
              { id: "tsk-sembada-npwp", title: "Registrasi dan aktivasi NPWP badan", ownerId: "mem-bima", owner: "Bima", status: "active", dueAt: shiftDate(date, 3), handoff: null, comments: [{ id: "cmt-sembada-1", body: "Dokumen legal sudah lengkap. @Maya mohon cek jadwal konfirmasi klien sebelum submit.", authorId: "mem-bima", author: "Bima", mentions: [{ memberId: "mem-maya", name: "Maya" }], notificationIntents: [{ memberId: "mem-maya", channel: "in_app", status: "pending", externalDelivery: false }], createdAt: shiftDate(date, -1), editedAt: null }], activity: [] },
              { id: "tsk-sembada-pkp", title: "Analisis kebutuhan pengukuhan PKP", ownerId: "mem-bima", owner: "Bima", status: "open", dueAt: shiftDate(date, 7), handoff: null, comments: [], activity: [] }
            ]
          },
          {
            id: "ws-sembada-finance",
            name: "Keuangan Awal",
            ownerId: "mem-dinda",
            owner: "Dinda",
            status: "planned",
            dependency: "NPWP badan aktif",
            milestones: [{ id: "mil-sembada-finance", title: "Bagan akun dan saldo awal siap", weight: 15, status: "open" }],
            tasks: [{
              id: "tsk-sembada-coa",
              title: "Siapkan bagan akun dan saldo awal",
              ownerId: "mem-bima",
              owner: "Bima",
              status: "open",
              dueAt: shiftDate(date, 10),
              handoff: {
                id: "hnd-sembada-tax-finance",
                status: "awaiting_acceptance",
                fromAssigneeId: "mem-bima",
                fromAssignee: "Bima",
                toAssigneeId: "mem-dinda",
                toAssignee: "Dinda",
                reason: "Data legal sudah tersedia; persiapan sistem keuangan dapat dimulai paralel.",
                evidence: "SAMPLE/NIB/018 dan draft daftar rekening bank",
                dueAt: shiftDate(date, 2),
                submittedBy: "Maya",
                submittedAt: shiftDate(date, 0),
                reviewedBy: null,
                reviewedAt: null,
                reviewNote: null
              },
              comments: [],
              activity: []
            }]
          }
        ],
        expenses: [
          { id: "exp-sembada-pnbp", taskId: "tsk-sembada-npwp", workstreamId: "ws-sembada-tax", category: "PNBP & administrasi", description: "Biaya administrasi aktivasi dokumen pajak", amount: 1_250_000, paidBy: "Perusahaan", treatment: "client_rebillable", evidence: "SAMPLE/PNBP/009", incurredAt: shiftDate(date, -1), submittedBy: "Bima — Konsultan Pajak", submittedAt: shiftDate(date, -1), financeState: "awaiting_review", billingState: "not_applicable", settlementState: "not_posted", externalPosting: false, activity: [] },
          { id: "exp-sembada-transport", taskId: "tsk-sembada-sk", workstreamId: "ws-sembada-legal", category: "Transport lokal", description: "Pengambilan dokumen legal", amount: 185_000, paidBy: "Alya — Konsultan Legal", treatment: "employee_reimbursement", evidence: "SAMPLE/RECEIPT/021", incurredAt: shiftDate(date, -2), submittedBy: "Alya — Konsultan Legal", submittedAt: shiftDate(date, -2), financeState: "approved", billingState: "not_applicable", settlementState: "awaiting_reimbursement", externalPosting: false, reviewedBy: "Rani — Finance", reviewedAt: shiftDate(date, -1), reviewNote: "Bukti sesuai kebijakan transport.", activity: [] }
        ],
        activity: []
      },
      {
        id: "eng-laras-retainer",
        accountId: "acc-laras",
        title: "Retainer Kepatuhan Bisnis Bulanan",
        reference: "SAMPLE/ENG/LARAS/004",
        status: "active",
        manager: "Reno — Engagement Manager",
        pricingModel: "retainer",
        contractValue: 12_000_000,
        targetAt: shiftDate(date, 28),
        nextMilestone: "Review kepatuhan pajak dan kontrak vendor bulan berjalan",
        workstreams: [
          {
            id: "ws-laras-tax",
            name: "Pajak Bulanan",
            owner: "Bima — Konsultan Pajak",
            status: "active",
            dependency: null,
            milestones: [{ id: "mil-laras-tax", title: "Review SPT masa", weight: 50, status: "done" }],
            tasks: [{ id: "tsk-laras-spt", title: "Periksa rekonsiliasi SPT masa", owner: "Bima — Konsultan Pajak", status: "done", dueAt: shiftDate(date, -2), handoff: null, activity: [] }]
          },
          {
            id: "ws-laras-legal",
            name: "Legal Komersial",
            owner: "Alya — Konsultan Legal",
            status: "blocked",
            dependency: "Draft kontrak vendor dari pelanggan",
            milestones: [{ id: "mil-laras-contract", title: "Review kontrak vendor", weight: 50, status: "open" }],
            tasks: [{ id: "tsk-laras-contract", title: "Review kontrak vendor properti", owner: "Alya — Konsultan Legal", status: "blocked", dueAt: shiftDate(date, 1), blocker: "Draft kontrak dari pelanggan belum diterima", handoff: null, activity: [] }]
          }
        ],
        expenses: [],
        activity: []
      }
    ],
    partners: [
      { id: "ptr-sinergi", name: "Sinergi Digital", type: "Reseller", owner: "Anggit", status: "active", leads: 14, qualified: 6, wins: 2, attributedRevenue: 210_000_000, commissionRate: 10, commissionAccrued: 21_000_000, commissionPaid: 12_500_000, lastActivityAt: shiftDate(date, -1), commissions: [{ id: "com-sinergi-1", revenueRef: "SAMPLE/INV/SIN/001", baseAmount: 125_000_000, rate: 10, amount: 12_500_000, status: "paid", evidence: "SAMPLE-BANK-SIN-001", paidAt: shiftDate(date, -12) }, { id: "com-sinergi-2", revenueRef: "SAMPLE/INV/SIN/002", baseAmount: 85_000_000, rate: 10, amount: 8_500_000, status: "approved", evidence: "SAMPLE-PAYMENT-SIN-002", approvedAt: shiftDate(date, -1) }], activity: [] },
      { id: "ptr-raka", name: "Raka Business Network", type: "Afiliator", owner: "Anggit", status: "active", leads: 9, qualified: 4, wins: 1, attributedRevenue: 125_000_000, commissionRate: 7.5, commissionAccrued: 9_375_000, commissionPaid: 0, lastActivityAt: shiftDate(date, -3), commissions: [{ id: "com-raka-1", revenueRef: "SAMPLE/INV/RAKA/001", baseAmount: 125_000_000, rate: 7.5, amount: 9_375_000, status: "pending" }], activity: [] },
      { id: "ptr-komunitas", name: "Komunitas UMKM Naik", type: "Mitra referral", owner: "Sinta", status: "review", leads: 11, qualified: 2, wins: 0, attributedRevenue: 0, commissionRate: 5, commissionAccrued: 0, commissionPaid: 0, lastActivityAt: shiftDate(date, -8), commissions: [], activity: [] }
    ],
    invoices: [
      {
        id: "inv-nara-1",
        opportunityId: "opp-nara",
        number: "SAMPLE/INV/001",
        amount: 34_000_000,
        status: "partial",
        issuedAt: shiftDate(date, -14),
        dueAt: shiftDate(date, -4),
        items: [{ id: "item-nara-1", description: "Termin awal brand identity dan website", quantity: 1, unitPrice: 34_000_000 }],
        subtotal: 34_000_000,
        discountAmount: 0,
        taxRate: 0,
        taxAmount: 0
      },
      {
        id: "inv-sentosa-1",
        opportunityId: "opp-sentosa",
        number: "SAMPLE/INV/002",
        amount: 92_000_000,
        status: "paid",
        issuedAt: shiftDate(date, -30),
        dueAt: shiftDate(date, -16),
        items: [{ id: "item-sentosa-1", description: "Commerce Platform Managed", quantity: 1, unitPrice: 92_000_000 }],
        subtotal: 92_000_000,
        discountAmount: 0,
        taxRate: 0,
        taxAmount: 0
      }
    ],
    payments: [
      {
        id: "pay-nara-1",
        invoiceId: "inv-nara-1",
        opportunityId: "opp-nara",
        amount: 17_000_000,
        receivedAt: shiftDate(date, -6),
        evidence: "SAMPLE-BANK-001"
      },
      {
        id: "pay-sentosa-1",
        invoiceId: "inv-sentosa-1",
        opportunityId: "opp-sentosa",
        amount: 92_000_000,
        receivedAt: shiftDate(date, -17),
        evidence: "SAMPLE-BANK-002"
      }
    ],
    purchases: [
      {
        id: "pur-kirana-portal",
        accountId: "acc-kirana",
        service: "Portal Distributor",
        amount: 84_000_000,
        completedAt: shiftDate(date, -42),
        reorderCycleDays: 90,
        sourceReference: "SAMPLE/BAST/KIRANA/004"
      },
      {
        id: "pur-sentosa-commerce",
        accountId: "acc-sentosa",
        service: "Commerce Platform",
        amount: 92_000_000,
        completedAt: shiftDate(date, -100),
        reorderCycleDays: 90,
        sourceReference: "SAMPLE/PO/SENTOSA/014"
      },
      {
        id: "pur-nara-brand",
        accountId: "acc-nara",
        service: "Brand Direction Sprint",
        amount: 28_000_000,
        completedAt: shiftDate(date, -132),
        reorderCycleDays: 90,
        sourceReference: "SAMPLE/BAST/NARA/002"
      },
      {
        id: "pur-nara-web",
        accountId: "acc-nara",
        service: "Website Care",
        amount: 12_000_000,
        completedAt: shiftDate(date, -250),
        reorderCycleDays: 120,
        sourceReference: "SAMPLE/INV/NARA/001"
      }
    ],
    notificationState: {},
    notificationPreferences: {
      followup: true,
      invoice: true,
      contract: true,
      project: true,
      repeat: true
    },
    reportSchedules: [],
    workspaceModules: [
      { code: "command", view: "command", label: "Hari ini", order: 1, visible: true, required: true, tier: "core", purpose: "Prioritas lintas fungsi yang perlu dikerjakan sekarang.", features: [{ code: "attention_queue", label: "Antrean prioritas", status: "available" }, { code: "department_dashboards", label: "Dashboard departemen", status: "available" }] },
      { code: "calendar", view: "calendar", label: "Kalender", order: 2, visible: true, tier: "core", purpose: "Agenda follow-up, pekerjaan, kontrak, dan tagihan dalam satu waktu kerja.", features: [{ code: "calendar_views", label: "Agenda, bulan, minggu", status: "available" }, { code: "calendar_sync", label: "Sinkronisasi kalender", status: "planned" }] },
      { code: "signals", view: "signals", label: "Calon pelanggan", order: 3, visible: true, tier: "core", purpose: "Prospek masuk dan canvassing sebelum menjadi peluang.", features: [{ code: "lead_inbox", label: "Prospek masuk", status: "available" }, { code: "canvassing", label: "Canvassing & kunjungan", status: "available" }, { code: "lead_import", label: "Impor prospek", status: "available" }] },
      { code: "pipeline", view: "pipeline", label: "Peluang", order: 4, visible: true, tier: "core", purpose: "Pipeline, tindak lanjut, nilai peluang, dan bukti perpindahan tahap.", features: [{ code: "pipeline_kanban", label: "Kanban & daftar", status: "available" }, { code: "stage_rules", label: "Validasi tahap", status: "available" }, { code: "forecast", label: "Forecast terkontrol", status: "planned" }] },
      { code: "relationships", view: "relationships", label: "Pelanggan", order: 5, visible: true, tier: "core", purpose: "Database pelanggan dan riwayat hubungan lintas transaksi.", features: [{ code: "account_360", label: "Account 360", status: "available" }, { code: "segments_fields", label: "Segmen & custom field", status: "available" }, { code: "duplicate_merge", label: "Merge duplikat", status: "available" }] },
      { code: "projects", view: "projects", label: "Pekerjaan", order: 6, visible: true, tier: "addon", addonCode: "project_operations", purpose: "Pelaksanaan kerja pelanggan setelah kesepakatan diterima.", features: [{ code: "project_kanban", label: "Kanban proyek", status: "available" }, { code: "tasks_subtasks", label: "Tugas & subtask", status: "available" }, { code: "dependencies", label: "Dependensi", status: "planned" }, { code: "timesheet_capacity", label: "Timesheet & kapasitas", status: "planned" }] },
      { code: "repeat", view: "repeat", label: "Repeat order", order: 7, visible: true, tier: "core", purpose: "Pelanggan lama yang perlu ditinjau untuk kebutuhan berikutnya.", features: [{ code: "reorder_queue", label: "Antrean reorder", status: "available" }, { code: "dormant_accounts", label: "Pelanggan dormant", status: "available" }] },
      { code: "collection", view: "collection", label: "Tagihan", order: 8, visible: true, tier: "core", purpose: "Invoice, piutang, pembayaran, dan pengingat yang tetap terpisah statusnya.", features: [{ code: "invoice_lifecycle", label: "Lifecycle invoice", status: "available" }, { code: "receivable_aging", label: "Umur piutang", status: "available" }, { code: "payment_reconciliation", label: "Rekonsiliasi pembayaran", status: "available" }] },
      { code: "contracts", view: "contracts", label: "Kontrak", order: 9, visible: true, tier: "core", purpose: "Draft, versi, approval, pola tagihan, dan masa berlaku kontrak.", features: [{ code: "contract_versions", label: "Draft & versi", status: "available" }, { code: "billing_models", label: "Sekali, termin, recurring, hybrid", status: "available" }, { code: "esign", label: "E-sign", status: "gated" }] },
      { code: "experiments", view: "experiments", label: "Kampanye", order: 10, visible: true, tier: "core", purpose: "Sumber permintaan dan eksperimen pemasaran yang bisa dinilai.", features: [{ code: "campaign_learning", label: "Hipotesis & keputusan", status: "available" }, { code: "attribution", label: "Atribusi", status: "planned" }] },
      { code: "partners", view: "partners", label: "Mitra", order: 11, visible: true, tier: "addon", addonCode: "partner_network", purpose: "Mitra, reseller, afiliator, komisi, dan payout.", features: [{ code: "partner_database", label: "Database mitra", status: "available" }, { code: "commission_ledger", label: "Komisi & payout", status: "available" }, { code: "referral_links", label: "Referral code/link", status: "planned" }] },
      { code: "notifications", view: "notifications", label: "Notifikasi", order: 12, visible: true, tier: "core", purpose: "Pengingat berbasis record kerja, bukan alarm tanpa konteks.", features: [{ code: "notification_center", label: "Pusat notifikasi", status: "available" }, { code: "external_reminders", label: "Email/WhatsApp reminder", status: "gated" }] },
      { code: "reports", view: "reports", label: "Laporan", order: 13, visible: true, tier: "core", purpose: "Metrik keputusan dengan definisi, periode, PIC, dan sumber data.", features: [{ code: "decision_reports", label: "Laporan keputusan", status: "available" }, { code: "report_builder", label: "Report builder", status: "planned" }] },
      { code: "adaptation", view: "adaptation", label: "Pusat kontrol", order: 14, visible: true, required: true, tier: "system", purpose: "Tim, paket, modul, dokumen, integrasi, dan governance workspace.", features: [{ code: "team_access", label: "Tim & akses", status: "available" }, { code: "workspace_composition", label: "Komposisi workspace", status: "available" }, { code: "entitlements", label: "Paket & entitlement", status: "available" }] }
    ],
    workspaceModuleAudit: [],
    organization: { id: "org-dekta", name: "Fixit" },
    memberships: [
      { id: "mem-anggit", organizationId: "org-dekta", name: "Anggit", email: "owner@example.test", status: "active", roles: ["executive_admin"], lastActiveAt: shiftDate(date, 0) },
      { id: "mem-sinta", organizationId: "org-dekta", name: "Sinta", email: "sinta@example.test", status: "active", roles: ["sales"], lastActiveAt: shiftDate(date, -1) },
      { id: "mem-nadia", organizationId: "org-dekta", name: "Nadia", email: "nadia@example.test", status: "active", roles: ["delivery"], lastActiveAt: shiftDate(date, -1) },
      { id: "mem-reza", organizationId: "org-dekta", name: "Reza", email: "reza@example.test", status: "active", roles: ["finance"], lastActiveAt: shiftDate(date, -2) },
      { id: "mem-maya", organizationId: "org-dekta", name: "Maya", jobTitle: "Engagement Manager", email: "maya@example.test", status: "active", roles: ["delivery"], lastActiveAt: shiftDate(date, 0) },
      { id: "mem-alya", organizationId: "org-dekta", name: "Alya", jobTitle: "Konsultan Legal", email: "alya@example.test", status: "active", roles: ["delivery"], lastActiveAt: shiftDate(date, -1) },
      { id: "mem-bima", organizationId: "org-dekta", name: "Bima", jobTitle: "Konsultan Pajak", email: "bima@example.test", status: "active", roles: ["delivery"], lastActiveAt: shiftDate(date, 0) },
      { id: "mem-dinda", organizationId: "org-dekta", name: "Dinda", jobTitle: "Konsultan Keuangan", email: "dinda@example.test", status: "active", roles: ["delivery"], lastActiveAt: shiftDate(date, -1) },
      { id: "mem-reno", organizationId: "org-dekta", name: "Reno", jobTitle: "Konsultan Bisnis", email: "reno@example.test", status: "active", roles: ["delivery"], lastActiveAt: shiftDate(date, -2) }
    ],
    roleChangeAudit: [],
    planCatalog: [
      { code: "core", name: "Core", description: "Pelanggan, pipeline, kontrak, invoice, dan laporan dasar.", priceStatus: "menunggu_keputusan", features: ["Core CRM", "Kontrak & invoice", "Dashboard departemen"] },
      { code: "team", name: "Team", description: "Kolaborasi lintas departemen dengan kontrol akses.", priceStatus: "menunggu_keputusan", features: ["Semua Core", "Role & permission", "Dokumen terarah"] },
      { code: "scale", name: "Scale", description: "Operasi lebih luas dengan add-on dan integrasi terkontrol.", priceStatus: "menunggu_keputusan", features: ["Semua Team", "Integration Center", "Copilot review"] }
    ],
    subscription: { id: "sub-dekta", organizationId: "org-dekta", status: "trialing", planCode: "team", trialStartedAt: shiftDate(date, -3), trialEndsAt: shiftDate(date, 11), graceEndsAt: null, verificationState: "prototype_only" },
    planChangeRequests: [],
    addons: [
      { code: "project_operations", name: "Project Operations", status: "active_preview", description: "Proyek, tugas, milestone, dan kapasitas." },
      { code: "partner_network", name: "Partner Network", status: "active_preview", description: "Mitra, atribusi revenue, komisi, dan payout." },
      { code: "document_automation", name: "Document Automation", status: "trial_preview", description: "Template dan draft berbasis record sumber." }
    ],
    documentTemplates: [
      { id: "tpl-contract", name: "Draft kontrak", type: "contract", requiredVariables: ["customerName", "scope", "value"], body: "DRAFT — {{customerName}}\n\nRuang lingkup: {{scope}}\nNilai: {{value}}\n\nDokumen ini wajib direview sebelum dikirim atau ditandatangani." },
      { id: "tpl-invoice", name: "Surat pengantar invoice", type: "invoice", requiredVariables: ["customerName", "invoiceNumber", "value"], body: "DRAFT — Kepada {{customerName}}\n\nInvoice {{invoiceNumber}} senilai {{value}} telah disiapkan. Mohon periksa rincian dan jatuh tempo pada dokumen sumber." },
      { id: "tpl-proposal", name: "Ringkasan proposal", type: "opportunity", requiredVariables: ["customerName", "scope", "nextStep"], body: "DRAFT — {{customerName}}\n\nKebutuhan: {{scope}}\nLangkah berikutnya: {{nextStep}}\n\nBelum merupakan penawaran final." }
    ],
    generatedDocuments: [],
    integrations: [
      { id: "int-accounting", kind: "accounting", provider: "Belum dipilih", status: "not_connected", reference: "", secretsStored: false },
      { id: "int-payment", kind: "payment", provider: "Belum dipilih", status: "not_connected", reference: "", secretsStored: false },
      { id: "int-email", kind: "email", provider: "Belum dipilih", status: "not_connected", reference: "", secretsStored: false },
      { id: "int-whatsapp", kind: "whatsapp", provider: "Belum dipilih", status: "not_connected", reference: "", secretsStored: false }
    ],
    communicationDrafts: [],
    copilotReviews: [],
    experiments: [
      {
        id: "exp-referral",
        name: "Referral reactivation",
        channel: "Network",
        hypothesis: "Kontak lama dengan konteks relevan menghasilkan discovery berkualitas lebih cepat.",
        status: "running",
        owner: "Anggit",
        window: "14 hari",
        leads: 8,
        qualified: 3,
        wins: 1,
        decision: "Lanjutkan 7 hari; dokumentasikan pemicu respons."
      },
      {
        id: "exp-seo",
        name: "SEO service-intent pages",
        channel: "Organic",
        hypothesis: "Halaman berbasis kebutuhan bisnis meningkatkan inquiry yang cocok dengan layanan Fixit.",
        status: "review",
        owner: "Anggit",
        window: "30 hari",
        leads: 11,
        qualified: 2,
        wins: 0,
        decision: "Review kualitas intent sebelum menambah volume konten."
      },
      {
        id: "exp-outbound",
        name: "Commerce diagnostic outreach",
        channel: "Outbound",
        hypothesis: "Diagnosis singkat lebih efektif daripada penawaran layanan generik.",
        status: "stopped",
        owner: "Anggit",
        window: "10 hari",
        leads: 14,
        qualified: 1,
        wins: 0,
        decision: "Hentikan versi pesan ini; rasio qualified terlalu rendah."
      }
    ],
    reviewLog: [
      { id: "review-1", at: shiftDate(date, -1), decision: "Pertahankan fokus pada empat opportunity aktif; jangan membuka kampanye baru sebelum follow-up overdue selesai." }
    ]
  };
}

import type {
  ActivityLogItem,
  DashboardCostCenter,
  DashboardNotification,
  DashboardRevenueStream,
  DashboardTicketTier,
  DashboardTransaction,
} from "./dashboard-types";

export const PROTOTYPE_BUDGET_TOTAL = 5_000_000;
export const DISCLAIMER_NOTE =
  "DEMONSTRATION PROTOTYPE DATA ONLY — Configured for ₦5,000,000 event budget. Invented figures for testing; not actual Carpenters Family club records.";

export function formatNaira(amount: number, showDecimals = false): string {
  const formatted = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(amount);
  return `₦${formatted}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function downloadLedgerCSV(transactions: DashboardTransaction[]): void {
  const headers = [
    "Transaction ID",
    "Date",
    "Type",
    "Category",
    "Description",
    "Amount (NGN)",
    "Payer / Payee",
    "Payment Method",
    "Reference",
    "Authorized By",
    "Status",
    "Audit Notes / Void Reason",
  ];

  const rows = transactions.map((t) => [
    `"${t.id}"`,
    `"${t.date}"`,
    `"${t.type.toUpperCase()}"`,
    `"${t.categoryLabel}"`,
    `"${t.description.replace(/"/g, '""')}"`,
    t.amount,
    `"${t.payerPayee.replace(/"/g, '""')}"`,
    `"${t.paymentMethod}"`,
    `"${t.paymentRef}"`,
    `"${t.authorizedBy}"`,
    `"${t.status.toUpperCase()}"`,
    `"${(t.voidReason || "").replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join(
    "\n",
  );
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `CarpentersClub_Event_FinanceLedger_${new Date().toISOString().slice(0, 10)}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const INITIAL_TICKET_TIERS: DashboardTicketTier[] = [
  {
    id: "early_bird",
    name: "Early Bird Pass",
    price: 5_000,
    sold: 150,
    capacity: 150,
    description:
      "Advance discount ticket for registered club members and early patrons.",
    benefits: [
      "General entry access",
      "1x complimentary welcome cocktail",
      "Custom wristband",
    ],
    status: "sold_out",
  },
  {
    id: "regular",
    name: "Regular Admission",
    price: 8_000,
    sold: 215,
    capacity: 250,
    description:
      "Standard access to main rave grounds, stage area, and food vendor concourse.",
    benefits: [
      "Full event access",
      "Access to main bar concourse",
      "Event programme guide",
    ],
    status: "active",
  },
  {
    id: "gate",
    name: "At-the-Gate Ticket",
    price: 10_000,
    sold: 88,
    capacity: 100,
    description:
      "Door purchase ticket allocated for walk-in attendees and late admissions.",
    benefits: ["Door entry verification", "Festival wristband"],
    status: "active",
  },
  {
    id: "vip",
    name: "VIP Executive Cabana",
    price: 150_000,
    sold: 9,
    capacity: 10,
    description:
      "Elevated executive lounge package for groups up to 6 with premium bottle service.",
    benefits: [
      "Elevated VIP deck seating (6 persons)",
      "2x Moët Impérial Champagne bottles",
      "Private security escort & dedicated waiter",
      "Express priority car park pass",
    ],
    status: "limited",
  },
];

export const INITIAL_REVENUE_STREAMS: DashboardRevenueStream[] = [
  {
    id: "ticket_sales",
    name: "Ticket Sales",
    target: 3_500_000,
    actual: 3_485_000,
    pending: 150_000,
    description:
      "Direct ticketing revenue from Early Bird, Regular, Door, and VIP tiers.",
    breakdown: [
      {
        source: "Early Bird (150 @ ₦5,000)",
        amount: 750_000,
        status: "received",
      },
      {
        source: "Regular Passes (215 @ ₦8,000)",
        amount: 1_720_000,
        status: "received",
      },
      {
        source: "At-the-Gate Sales (88 @ ₦10,000)",
        amount: 880_000,
        status: "received",
      },
      {
        source: "VIP Cabanas (1 remaining reserved invoice)",
        amount: 135_000,
        status: "received",
      },
    ],
  },
  {
    id: "bar_merch",
    name: "Bar & Merchandise",
    target: 800_000,
    actual: 585_000,
    pending: 215_000,
    description:
      "Concession revenue share, exclusive club rave jerseys, caps, and tokens.",
    breakdown: [
      {
        source: "Bar Operator Minimum Guarantee Advance",
        amount: 400_000,
        status: "received",
      },
      {
        source: "Carpenters Club Rave Jersey Batch #1",
        amount: 185_000,
        status: "received",
      },
      {
        source: "On-site Cocktail Token Pre-orders",
        amount: 80_000,
        status: "projected",
      },
    ],
  },
  {
    id: "sponsorships",
    name: "Corporate Sponsorships",
    target: 1_200_000,
    actual: 1_350_000,
    pending: 0,
    description:
      "Corporate brand activations, stage title rights, and product placement.",
    breakdown: [
      {
        source: "Nigerian Breweries Plc — Beverage Partner",
        amount: 1_000_000,
        status: "received",
      },
      {
        source: "Pulse Creative Studios — Media Coverage",
        amount: 350_000,
        status: "received",
      },
    ],
  },
  {
    id: "vendor_booths",
    name: "Vendor Booth Fees",
    target: 300_000,
    actual: 250_000,
    pending: 50_000,
    description:
      "Stall lease fees for outdoor artisanal grills, street food, and retail booths.",
    breakdown: [
      {
        source: "Suya Master Kitchen Stall #1 & #2",
        amount: 100_000,
        status: "received",
      },
      {
        source: "Lagos Gourmet Sliders Stall #3",
        amount: 50_000,
        status: "received",
      },
      {
        source: "Tropical Smoothies Stall #4",
        amount: 50_000,
        status: "received",
      },
      {
        source: "Vintage Afro-Streetwear Pop-up",
        amount: 50_000,
        status: "received",
      },
      {
        source: "360 Video Booth Operator (Pending clearance)",
        amount: 50_000,
        status: "invoiced",
      },
    ],
  },
  {
    id: "donations",
    name: "Patron Donations & Club Subsidy",
    target: 200_000,
    actual: 220_000,
    pending: 0,
    description:
      "Voluntary donations and community development support from club elders.",
    breakdown: [
      {
        source: "Chief F. A. Williams (Patron Committee Support)",
        amount: 150_000,
        status: "received",
      },
      {
        source: "Engr. D. K. Adeleke (Special Lighting Support)",
        amount: 70_000,
        status: "received",
      },
    ],
  },
];

export const INITIAL_EXPENSE_CENTERS: DashboardCostCenter[] = [
  {
    id: "talent_booking",
    name: "Talent & Booking",
    allocated: 1_600_000,
    spent: 1_300_000,
    committed: 200_000,
    items: [
      {
        name: "Headliner DJ Neptune Booking (Contract 50% Disbursed)",
        allocated: 900_000,
        spent: 800_000,
        vendor: "Starline Talent Agency",
      },
      {
        name: "Live Percussion Ensemble & Opening DJs",
        allocated: 450_000,
        spent: 350_000,
        vendor: "Roots Live Groove",
      },
      {
        name: "Master of Ceremonies (MC) & Hype Crew",
        allocated: 250_000,
        spent: 150_000,
        vendor: "Lagos Live Events",
      },
    ],
  },
  {
    id: "venue_production",
    name: "Venue & Production",
    allocated: 1_850_000,
    spent: 1_780_000,
    committed: 70_000,
    items: [
      {
        name: "Lekki Meadow Event Grounds Lease (Full Day & Night)",
        allocated: 1_000_000,
        spent: 950_000,
        vendor: "Meadow Estates Ltd",
      },
      {
        name: "Concert Stage, Trussing, Lighting & Sound Array",
        allocated: 550_000,
        spent: 550_000,
        vendor: "AudioWave Sound Lab",
      },
      {
        name: "2x 100kVA Standby Generators + 600L Diesel",
        allocated: 300_000,
        spent: 280_000,
        vendor: "PrimeVolt Power Services",
      },
    ],
  },
  {
    id: "marketing_promotion",
    name: "Marketing & Promotion",
    allocated: 650_000,
    spent: 390_000,
    committed: 110_000,
    items: [
      {
        name: "Digital Ad Placement (Instagram & TikTok campaigns)",
        allocated: 250_000,
        spent: 140_000,
        vendor: "VibeReach Digital",
      },
      {
        name: "RFID Security Fabric Wristbands & QR passes (600 pcs)",
        allocated: 120_000,
        spent: 100_000,
        vendor: "SecurePrint Lagos",
      },
      {
        name: "Promotional Billboard, Roll-up Banners & Posters",
        allocated: 180_000,
        spent: 90_000,
        vendor: "Express Color Press",
      },
      {
        name: "Photography & After-Movie Drone Crew (Deposit)",
        allocated: 100_000,
        spent: 60_000,
        vendor: "Cinematic Eye Lagos",
      },
    ],
  },
  {
    id: "operations_safety",
    name: "Operations & Safety",
    allocated: 900_000,
    spent: 460_000,
    committed: 180_000,
    items: [
      {
        name: "Licensed Security Guard Unit (14 Personnel + K9 Patrol)",
        allocated: 350_000,
        spent: 220_000,
        vendor: "Apex Fortress Security",
      },
      {
        name: "Paramedic Station, Ambulance Standby & First Aid Kit",
        allocated: 250_000,
        spent: 140_000,
        vendor: "LifeCare Paramedics",
      },
      {
        name: "Sanitation Crew, Mobile Flush Restrooms & Post-Clean",
        allocated: 200_000,
        spent: 100_000,
        vendor: "EcoSan Clean Services",
      },
      {
        name: "LASG Safety Commission Permit & Community Liaison",
        allocated: 100_000,
        spent: 0,
        vendor: "Lagos State Gov / Liaison",
      },
    ],
  },
];

export const INITIAL_TRANSACTIONS: DashboardTransaction[] = [
  {
    id: "TXN-2026-001",
    date: "2026-09-28 11:20",
    type: "revenue",
    category: "ticket_sales",
    categoryLabel: "Ticket Sales",
    description:
      "Paystack batch settlement — Early Bird ticket phase (150 passes sold out)",
    amount: 750_000,
    payerPayee: "Paystack Merchant Settlement (Carpenters Club)",
    paymentMethod: "Online Paystack Gateway",
    paymentRef: "PSTK_STL_8830192",
    authorizedBy: "Adeola Balogun",
    authorizerRole: "Admin",
    receiptFileName: "Paystack_EarlyBird_Settlement_8830192.pdf",
    receiptSize: "412 KB",
    status: "posted",
    notes:
      "Sold out in 72 hours. All funds deposited directly into Club Event Escrow account.",
  },
  {
    id: "TXN-2026-002",
    date: "2026-10-01 14:15",
    type: "revenue",
    category: "sponsorships",
    categoryLabel: "Corporate Sponsorships",
    description:
      "Headline Beverage Partner Stage Sponsorship — First tranche disbursement",
    amount: 1_000_000,
    payerPayee: "Nigerian Breweries Plc (Brand Activation Desk)",
    paymentMethod: "Bank Transfer (NIBSS)",
    paymentRef: "NIBSS/NB/RAVE26/00491",
    authorizedBy: "Adeola Balogun",
    authorizerRole: "Admin",
    receiptFileName: "NB_Plc_Sponsorship_Voucher_00491.pdf",
    receiptSize: "820 KB",
    status: "posted",
    notes:
      "Exclusive draught beer and cider rights on event lawn. Includes branded bar backdrop.",
  },
  {
    id: "TXN-2026-003",
    date: "2026-10-03 09:40",
    type: "expense",
    category: "venue_production",
    categoryLabel: "Venue & Production",
    description:
      "Lekki Meadow Grounds — 100% advance lease payment for event day & morning bump-out",
    amount: 950_000,
    payerPayee: "Meadow Estates Management Ltd",
    paymentMethod: "Bank Transfer (NIBSS)",
    paymentRef: "NIBSS/MEML/OCT/4412",
    authorizedBy: "Chuka Okafor",
    authorizerRole: "Executive",
    receiptFileName: "MeadowEstates_Official_Receipt_4412.pdf",
    receiptSize: "1.2 MB",
    status: "posted",
    notes:
      "Signed tenancy agreement covers grounds from 08:00 event day to 06:00 following morning.",
  },
  {
    id: "TXN-2026-004",
    date: "2026-10-05 16:30",
    type: "expense",
    category: "talent_booking",
    categoryLabel: "Talent & Booking",
    description:
      "Headliner DJ Neptune performance contract — 80% contract deposit disbursement",
    amount: 800_000,
    payerPayee: "Starline Talent & Artist Management Agency",
    paymentMethod: "Bank Transfer (NIBSS)",
    paymentRef: "NIBSS/NEPTUNE/ADV/771",
    authorizedBy: "Adeola Balogun",
    authorizerRole: "Admin",
    receiptFileName: "Starline_DJ_Neptune_Contract_Executed.pdf",
    receiptSize: "2.4 MB",
    status: "posted",
    notes:
      "Rider confirmed: flight from Abuja, local executive SUV transport, and dedicated backstage cabana.",
  },
  {
    id: "TXN-2026-005",
    date: "2026-10-06 10:10",
    type: "revenue",
    category: "ticket_sales",
    categoryLabel: "Ticket Sales",
    description:
      "Paystack batch settlement — Regular ticket phase tranche #1 (120 passes)",
    amount: 960_000,
    payerPayee: "Paystack Merchant Settlement",
    paymentMethod: "Online Paystack Gateway",
    paymentRef: "PSTK_STL_8940129",
    authorizedBy: "Adeola Balogun",
    authorizerRole: "Admin",
    receiptFileName: "Paystack_Regular_Tranche1.pdf",
    receiptSize: "390 KB",
    status: "posted",
  },
  {
    id: "TXN-2026-006",
    date: "2026-10-07 12:45",
    type: "expense",
    category: "venue_production",
    categoryLabel: "Venue & Production",
    description:
      "AudioWave Sound Lab — Stage construction, sound line array & intelligent beam lighting",
    amount: 550_000,
    payerPayee: "AudioWave Sound Lab & Rigging Ltd",
    paymentMethod: "Bank Transfer (NIBSS)",
    paymentRef: "NIBSS/AWAVE/INV-391",
    authorizedBy: "Chuka Okafor",
    authorizerRole: "Executive",
    receiptFileName: "AudioWave_Invoice_Receipt_391.pdf",
    receiptSize: "650 KB",
    status: "posted",
    notes:
      "Inspection scheduled 24 hours prior to rave start with Lagos Safety Commission officers.",
  },
  {
    id: "TXN-2026-007",
    date: "2026-10-08 15:00",
    type: "revenue",
    category: "vendor_booths",
    categoryLabel: "Vendor Booth Fees",
    description:
      "Artisanal food concourse concession fees — Suya Master & Gourmet Sliders",
    amount: 150_000,
    payerPayee: "Lagos Culinary Vendors Consortium",
    paymentMethod: "Bank Transfer (NIBSS)",
    paymentRef: "NIBSS/FOODCON/OCT26",
    authorizedBy: "Adeola Balogun",
    authorizerRole: "Admin",
    status: "posted",
  },
  {
    id: "TXN-2026-008",
    date: "2026-10-09 11:30",
    type: "expense",
    category: "operations_safety",
    categoryLabel: "Operations & Safety",
    description:
      "Apex Fortress Security — 14 trained event marshals + K9 sweeps and perimeter control",
    amount: 220_000,
    payerPayee: "Apex Fortress Security Services Ltd",
    paymentMethod: "Bank Transfer (NIBSS)",
    paymentRef: "NIBSS/APEX/SEC-091",
    authorizedBy: "Chuka Okafor",
    authorizerRole: "Executive",
    receiptFileName: "Apex_Security_Receipt_091.pdf",
    receiptSize: "480 KB",
    status: "posted",
  },
  {
    id: "TXN-2026-009",
    date: "2026-10-10 14:00",
    type: "expense",
    category: "marketing_promotion",
    categoryLabel: "Marketing & Promotion",
    description:
      "Duplicate booking fee entry — corrected during weekly financial review",
    amount: 75_000,
    payerPayee: "VibeReach Digital",
    paymentMethod: "Bank Transfer (NIBSS)",
    paymentRef: "NIBSS/VIBE/OCT/DUPL",
    authorizedBy: "Chuka Okafor",
    authorizerRole: "Executive",
    status: "voided",
    voidReason:
      "Accidental duplicate invoice voucher entry. Retained with strike-through styling per club policy.",
    voidedBy: "Adeola Balogun",
    voidedAt: "2026-10-10 16:20",
  },
];

export const INITIAL_ACTIVITY_LOGS: ActivityLogItem[] = [
  {
    id: "LOG-001",
    action: "Ticket Sale Recorded",
    category: "Ticketing",
    details:
      "Issued 2x VIP Executive Cabana passes to Chief Emeka Nwosu. Transaction ref PSTK_TKT_9912.",
    user: "Adeola Balogun",
    userRole: "Admin",
    timestamp: "2026-10-14 11:15",
  },
  {
    id: "LOG-002",
    action: "Disbursement Approved",
    category: "Disbursements",
    details:
      "Disbursed ₦550,000 to AudioWave Sound Lab for concert line-array sound system.",
    user: "Chuka Okafor",
    userRole: "Executive",
    timestamp: "2026-10-13 16:40",
  },
  {
    id: "LOG-003",
    action: "Transaction Voided",
    category: "Audit & Policy",
    details:
      "Voided TXN-2026-009 (₦75,000 duplicate voucher) with reason: Accidental duplicate invoice.",
    user: "Adeola Balogun",
    userRole: "Admin",
    timestamp: "2026-10-10 16:20",
  },
  {
    id: "LOG-004",
    action: "Budget Allocation Verified",
    category: "Governance",
    details:
      "Confirmed ₦5,000,000 event ceiling compliance across all 4 operational cost centers.",
    user: "Bro. Efe Okonkwo",
    userRole: "Event Lead",
    timestamp: "2026-10-08 09:30",
  },
];

export const INITIAL_NOTIFICATIONS: DashboardNotification[] = [
  {
    id: "NOTIF-001",
    title: "VIP Cabana Allocation Near Capacity",
    message: "9 of 10 VIP Executive Cabanas have been booked and confirmed.",
    timestamp: "2026-10-14 10:00",
    read: false,
    type: "warning",
  },
  {
    id: "NOTIF-002",
    title: "Corporate Sponsorship Cleared",
    message:
      "Nigerian Breweries Plc sponsorship first tranche (₦1,000,000) reconciled into escrow.",
    timestamp: "2026-10-12 14:30",
    read: false,
    type: "success",
  },
  {
    id: "NOTIF-003",
    title: "Weekly Financial Audit Completed",
    message:
      "Internal audit committee confirmed zero unreconciled ledger discrepancies.",
    timestamp: "2026-10-11 18:00",
    read: true,
    type: "info",
  },
];

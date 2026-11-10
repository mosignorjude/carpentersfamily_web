(() => {
  'use strict';

  const ROLE_NAMES = {
    member: 'Member', committee: 'Committee', assistant: 'Event assistant',
    lead: 'Event lead', executive: 'Executive', admin: 'Admin / President'
  };
  const seed = {
    event: {
      title: 'Community Heritage Night', status: 'Scheduled', date: '2026-12-12', time: '17:00',
      venue: 'Family Centre, Lagos', code: 'CF · DEMO 001',
      description: 'An evening for members and guests to celebrate our community.', ceiling: 5000000
    },
    categories: [
      { id: 'cat-production', name: 'Production & sound', share: 30 },
      { id: 'cat-venue', name: 'Venue', share: 20 },
      { id: 'cat-hospitality', name: 'Food & hospitality', share: 18 },
      { id: 'cat-safety', name: 'Safety & support', share: 12 },
      { id: 'cat-promotion', name: 'Promotion & print', share: 12 }
    ],
    incomeCategories: ['Sponsorship', 'Vendor contribution', 'Grant', 'Other income'],
    tiers: [
      { id: 'tier-entry', name: 'Early entry', description: 'General admission', price: 10000, capacity: 120, sold: 28, active: true },
      { id: 'tier-table', name: 'Family table', description: 'Admission for a group of six', price: 45000, capacity: 20, sold: 2, active: true },
      { id: 'tier-member', name: 'Member ticket', description: 'Member admission', price: 5000, capacity: 100, sold: 16, active: true }
    ],
    team: [
      { name: 'Adaeze Sample', initials: 'AS', role: 'Event lead' },
      { name: 'Chidi Sample', initials: 'CS', role: 'Event assistant' },
      { name: 'Nneka Sample', initials: 'NS', role: 'Committee member' },
      { name: 'Kelechi Sample', initials: 'KS', role: 'Committee member' }
    ],
    transactions: [
      { id: 'TK-0258', date: '2026-11-08', type: 'ticket', description: 'Early entry · 18 tickets', party: 'Guest sales', category: 'Early entry', tierId: 'tier-entry', amount: 180000, quantity: 18, reviewStatus: 'Approved', paymentStatus: 'Paid', method: 'Bank transfer', receipt: 'Sample receipt.pdf' },
      { id: 'TK-0254', date: '2026-11-06', type: 'ticket', description: 'Early entry · 10 tickets', party: 'Guest sales', category: 'Early entry', tierId: 'tier-entry', amount: 100000, quantity: 10, reviewStatus: 'Approved', paymentStatus: 'Paid', method: 'Bank transfer', receipt: '' },
      { id: 'TK-0252', date: '2026-11-06', type: 'ticket', description: 'Family table · 2 tickets', party: 'Guest sales', category: 'Family table', tierId: 'tier-table', amount: 90000, quantity: 2, reviewStatus: 'Approved', paymentStatus: 'Paid', method: 'Bank transfer', receipt: '' },
      { id: 'TK-0241', date: '2026-11-05', type: 'ticket', description: 'Member ticket · 10 tickets', party: 'Member sales', category: 'Member ticket', tierId: 'tier-member', amount: 50000, quantity: 10, reviewStatus: 'Approved', paymentStatus: 'Paid', method: 'Cash', receipt: '' },
      { id: 'TK-0237', date: '2026-11-04', type: 'ticket', description: 'Member ticket · 6 tickets', party: 'Member sales', category: 'Member ticket', tierId: 'tier-member', amount: 30000, quantity: 6, reviewStatus: 'Approved', paymentStatus: 'Paid', method: 'Cash', receipt: '' },
      { id: 'TX-1182', date: '2026-11-07', type: 'income', description: 'Event sponsorship', party: 'Sample Community Partners', category: 'Sponsorship', amount: 600000, reviewStatus: 'Approved', paymentStatus: 'Paid', method: 'Bank transfer', receipt: 'Sample sponsorship.pdf' },
      { id: 'TX-1174', date: '2026-11-03', type: 'income', description: 'Vendor space contributions', party: 'Event vendors', category: 'Vendor contribution', amount: 320000, reviewStatus: 'Approved', paymentStatus: 'Paid', method: 'Bank transfer', receipt: '' },
      { id: 'TX-1168', date: '2026-11-02', type: 'expense', description: 'Sound and lighting deposit', party: 'Sample Sound Co.', category: 'Production & sound', amount: 450000, reviewStatus: 'Approved', paymentStatus: 'Deposit', method: 'Bank transfer', receipt: 'Sample voucher.pdf' },
      { id: 'TX-1159', date: '2026-10-29', type: 'expense', description: 'Venue booking', party: 'Family Centre', category: 'Venue', amount: 300000, reviewStatus: 'Approved', paymentStatus: 'Paid', method: 'Bank transfer', receipt: '' },
      { id: 'TX-1152', date: '2026-10-25', type: 'expense', description: 'Invitations and printed programme', party: 'Sample Print Shop', category: 'Promotion & print', amount: 84000, reviewStatus: 'Approved', paymentStatus: 'Paid', method: 'Cash', receipt: 'Sample invoice.pdf' },
      { id: 'TX-1148', date: '2026-10-23', type: 'expense', description: 'Catering booking', party: 'Sample Kitchen', category: 'Food & hospitality', amount: 180000, reviewStatus: 'Pending', paymentStatus: 'Pending', method: 'Bank transfer', receipt: '' }
    ],
    activity: [
      { kind: 'transaction', text: 'Sponsorship income approved', detail: 'TX-1182 · Sample Community Partners · ₦600,000', time: '7 Nov 2026' },
      { kind: 'transaction', text: 'Ticket sale recorded', detail: 'TK-0258 · 18 Early entry tickets · ₦180,000', time: '8 Nov 2026' },
      { kind: 'budget', text: 'Budget categories set up', detail: '5 categories · 92% allocated', time: '20 Oct 2026' }
    ]
  };

  const app = {
    data: clone(seed), role: 'lead', scenario: 'active', tab: 'overview', reportTab: 'summary',
    transactionType: 'all', transactionStatus: 'all', search: '', activityFilter: 'all',
    activeTransactionId: null, pendingDetailAction: null, editingTierId: null,
    draftCategories: null, pendingConfirm: null, toastTimer: null
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
  function money(value) { return `₦${Math.round(number(value)).toLocaleString('en-NG')}`; }
  function dateLabel(value) {
    if (!value) return '—';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }
  function longDate(value) {
    if (!value) return '—';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }
  function timeLabel(value) {
    if (!value) return '';
    const [hourText, minuteText] = value.split(':');
    const hour = Number(hourText);
    if (!Number.isFinite(hour)) return value;
    return `${hour % 12 || 12}:${minuteText || '00'} ${hour >= 12 ? 'PM' : 'AM'}`;
  }
  function todayISO() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  function roleName() { return ROLE_NAMES[app.role] || 'Member'; }
  function isManager() { return app.role === 'executive' || app.role === 'admin'; }
  function eventIsOpen() { return app.data.event.status === 'Scheduled'; }
  function canRecord() { return (isManager() || app.role === 'lead') && eventIsOpen(); }
  function canManageBudget() { return eventIsOpen() && (isManager() || app.role === 'lead' || app.role === 'assistant'); }
  function canManageCategories() { return eventIsOpen() && (isManager() || app.role === 'lead'); }
  function canManageTickets() { return eventIsOpen() && (isManager() || app.role === 'lead' || app.role === 'assistant'); }
  function canReview() { return eventIsOpen() && (isManager() || app.role === 'lead' || app.role === 'assistant'); }
  function canCorrect() { return eventIsOpen() && app.role === 'admin'; }
  function isExcluded(tx) { return tx.reviewStatus === 'Voided' || tx.reviewStatus === 'Rejected'; }

  function calculations() {
    const valid = app.data.transactions.filter((tx) => !isExcluded(tx));
    const approvedIncome = valid.filter((tx) => (tx.type === 'income' || tx.type === 'ticket') && tx.reviewStatus === 'Approved').reduce((sum, tx) => sum + number(tx.amount), 0);
    const ticketIncome = valid.filter((tx) => tx.type === 'ticket' && tx.reviewStatus === 'Approved').reduce((sum, tx) => sum + number(tx.amount), 0);
    const approvedExpenses = valid.filter((tx) => tx.type === 'expense' && tx.reviewStatus === 'Approved' && ['Paid', 'Deposit'].includes(tx.paymentStatus)).reduce((sum, tx) => sum + number(tx.amount), 0);
    const commitments = valid.filter((tx) => tx.type === 'expense' && (['Pending', 'Unpaid'].includes(tx.paymentStatus) || tx.reviewStatus === 'Pending')).reduce((sum, tx) => sum + number(tx.amount), 0);
    const pendingReview = app.data.transactions.filter((tx) => tx.reviewStatus === 'Pending').length;
    const totalTickets = app.data.tiers.filter((tier) => tier.active).reduce((sum, tier) => sum + number(tier.sold), 0);
    const capacity = app.data.tiers.filter((tier) => tier.active).reduce((sum, tier) => sum + number(tier.capacity), 0);
    const net = approvedIncome - approvedExpenses;
    const ceiling = number(app.data.event.ceiling);
    const remaining = ceiling - approvedExpenses;
    return { approvedIncome, ticketIncome, approvedExpenses, commitments, pendingReview, totalTickets, capacity, net, ceiling, remaining, valid };
  }

  function addActivity(kind, text, detail) {
    app.data.activity.unshift({ kind, text, detail, time: 'Just now' });
  }
  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }
  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog && !dialog.open) dialog.showModal();
  }
  function closeDialog(dialog) {
    if (typeof dialog === 'string') dialog = document.getElementById(dialog);
    if (dialog?.open) dialog.close();
  }
  function notice(title, message) {
    $('#notice-title').textContent = title;
    $('#notice-body').textContent = message;
    openDialog('notice-dialog');
  }

  function resetScenario(name) {
    app.scenario = name;
    app.data = clone(seed);
    app.search = '';
    app.transactionStatus = 'all';
    app.transactionType = 'all';
    if (name === 'pressure') {
      app.data.event.title = 'Community Heritage Night';
      app.data.event.ceiling = 900000;
      app.data.transactions.unshift({ id: 'TX-1190', date: '2026-11-09', type: 'expense', description: 'Additional stage equipment', party: 'Sample Sound Co.', category: 'Production & sound', amount: 620000, reviewStatus: 'Approved', paymentStatus: 'Paid', method: 'Bank transfer', receipt: '' });
      app.data.transactions.unshift({ id: 'TX-1191', date: '2026-11-09', type: 'expense', description: 'Catering balance due', party: 'Sample Kitchen', category: 'Food & hospitality', amount: 120000, reviewStatus: 'Pending', paymentStatus: 'Unpaid', method: 'Bank transfer', receipt: '' });
      app.data.activity.unshift({ kind: 'budget', text: 'Budget pressure scenario loaded', detail: 'Demo scenario · sample figures', time: 'Just now' });
    } else if (name === 'empty') {
      app.data.event = { title: 'New Community Gathering', status: 'Scheduled', date: '2027-03-20', time: '16:00', venue: 'Add a venue', code: 'CF · DEMO 002', description: 'A new event with no ticket sales or transactions yet.', ceiling: 2500000 };
      app.data.categories = [];
      app.data.incomeCategories = [];
      app.data.tiers = [];
      app.data.team = [];
      app.data.transactions = [];
      app.data.activity = [];
    }
    $('#transaction-search').value = '';
    $('#transaction-type-filter').value = 'all';
    $('#transaction-status-filter').value = 'all';
    app.tab = 'overview';
    app.reportTab = 'summary';
    renderAll();
  }

  function updateEventHeader() {
    const event = app.data.event;
    $('#breadcrumb-event').textContent = event.title;
    $('#event-title').textContent = event.title;
    $('#event-status').textContent = event.status;
    $('#event-status').className = `status-pill ${event.status.toLowerCase()}`;
    $('#event-code').textContent = event.code;
    $('#event-date').textContent = longDate(event.date);
    $('#event-time').textContent = timeLabel(event.time);
    $('#event-venue').textContent = event.venue;
    $('#event-description').textContent = event.description;
  }

  function updateCapabilities() {
    const allowRecord = canRecord();
    $$('[data-action="open-record"]').forEach((button) => { button.hidden = !allowRecord; });
    $$('[data-action="manage-tiers"]').forEach((button) => { button.hidden = !canManageTickets(); });
    $$('[data-action="budget-settings"]').forEach((button) => { button.hidden = !canManageBudget(); });
    $$('[data-action="manage-categories"]').forEach((button) => { button.hidden = !canManageCategories(); });
    $$('[data-action="manage-income-categories"]').forEach((button) => { button.hidden = !canManageCategories(); });
    $$('[data-action="member-admin"]').forEach((button) => { button.hidden = !isManager(); });
    $('#role-note').hidden = allowRecord;
    $('#role-note').textContent = !eventIsOpen() && app.role !== 'admin' ? 'This event is read-only. Only an Admin or President can reopen it.' : app.role === 'assistant' ? 'Record controls are hidden in this dashboard view. Budget and ticket setup actions may be available to this role.' : 'Read-only view. Event actions depend on your role.';
    $('#event-menu-button').hidden = !(isManager() || app.role === 'lead') || (!eventIsOpen() && app.role !== 'admin');
  }

  function setTab(tab) {
    const button = $(`[data-tab="${tab}"]`);
    if (!button) return;
    app.tab = tab;
    $$('[data-tab]').forEach((tabButton) => {
      const selected = tabButton.dataset.tab === tab;
      tabButton.setAttribute('aria-selected', String(selected));
      tabButton.tabIndex = selected ? 0 : -1;
    });
    $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });
    button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (tab === 'transactions') renderTransactions();
    if (tab === 'reports') renderReports();
  }

  function setReportTab(tab) {
    app.reportTab = tab;
    $$('[data-report-tab]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.reportTab === tab)));
    $$('[data-report-panel]').forEach((panel) => { panel.hidden = panel.dataset.reportPanel !== tab; });
    if (tab === 'activity') renderActivity();
  }

  function renderOverview() {
    const calc = calculations();
    const percentage = calc.ceiling > 0 ? (calc.approvedExpenses / calc.ceiling) * 100 : 0;
    const metrics = [
      { label: 'Income received', value: money(calc.approvedIncome), note: 'Approved income and ticket sales', tone: 'accent-green' },
      { label: 'Spent', value: money(calc.approvedExpenses), note: `${money(calc.commitments)} in commitments`, tone: '' },
      { label: 'Balance', value: money(calc.net), note: 'Income received minus spent', tone: calc.net < 0 ? 'accent-red' : 'accent-green' },
      { label: 'Awaiting review', value: String(calc.pendingReview), note: calc.pendingReview === 1 ? 'Transaction' : 'Transactions', tone: calc.pendingReview ? 'accent-amber' : '' }
    ];
    $('#overview-metrics').innerHTML = metrics.map((item) => `<article class="metric-card ${item.tone}"><span class="metric-label">${escapeHTML(item.label)}</span><strong class="metric-value">${escapeHTML(item.value)}</strong><span class="metric-note">${escapeHTML(item.note)}</span></article>`).join('');
    $('#overview-spent').textContent = money(calc.approvedExpenses);
    $('#overview-ceiling').textContent = money(calc.ceiling);
    $('#overview-budget-percent').textContent = `${Math.round(percentage)}% used`;
    $('#overview-pending-amount').textContent = `${money(calc.commitments)} committed`;
    $('#overview-budget-bar').style.width = `${Math.max(0, Math.min(100, percentage))}%`;
    $('#overview-budget-bar').parentElement.classList.toggle('over', percentage > 100);
    $('#budget-health-copy').textContent = percentage > 100 ? 'Spending is over the approved budget ceiling.' : 'Paid and deposit expenses count as spent.';
    $('#overview-tickets-sold').textContent = calc.totalTickets.toLocaleString('en-NG');
    $('#overview-ticket-revenue').textContent = money(calc.ticketIncome);
    $('#overview-ticket-capacity').textContent = calc.capacity.toLocaleString('en-NG');

    const newest = [...app.data.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
    $('#recent-transactions').innerHTML = newest.length ? newest.map((tx) => `<div class="recent-row"><span class="recent-symbol ${tx.type === 'expense' ? 'expense' : ''}" aria-hidden="true">${tx.type === 'expense' ? '−' : '+'}</span><span class="recent-copy"><strong>${escapeHTML(tx.description)}</strong><small>${escapeHTML(dateLabel(tx.date))} · ${escapeHTML(tx.reviewStatus)}</small></span><span class="recent-amount ${tx.type === 'expense' ? 'negative' : 'positive'}">${tx.type === 'expense' ? '−' : '+'}${money(tx.amount)}</span></div>`).join('') : `<div class="empty-state"><h3>No transactions yet</h3><p>New records will show here.</p></div>`;
    const team = app.data.team.slice(0, 3);
    $('#overview-team').innerHTML = team.length ? team.map((member) => `<div class="team-peek"><span class="avatar">${escapeHTML(member.initials)}</span><span><strong>${escapeHTML(member.name)}</strong><small>${escapeHTML(member.role)}</small></span></div>`).join('') : `<div class="empty-state"><h3>No team assigned yet</h3><p>Assignments are managed in Member Administration.</p></div>`;
  }

  function renderTickets() {
    const activeTiers = app.data.tiers.filter((tier) => tier.active);
    const sold = activeTiers.reduce((sum, tier) => sum + number(tier.sold), 0);
    const capacity = activeTiers.reduce((sum, tier) => sum + number(tier.capacity), 0);
    const revenue = calculations().ticketIncome;
    const cards = [
      { label: 'Tickets sold', value: sold.toLocaleString('en-NG'), note: 'Across active ticket types' },
      { label: 'Ticket income', value: money(revenue), note: 'Approved ticket sales' },
      { label: 'Capacity left', value: Math.max(0, capacity - sold).toLocaleString('en-NG'), note: `Of ${capacity.toLocaleString('en-NG')} total places` }
    ];
    $('#ticket-metrics').innerHTML = cards.map((item) => `<article class="metric-card"><span class="metric-label">${escapeHTML(item.label)}</span><strong class="metric-value">${escapeHTML(item.value)}</strong><span class="metric-note">${escapeHTML(item.note)}</span></article>`).join('');
    $('#tier-count').textContent = `${activeTiers.length} ${activeTiers.length === 1 ? 'type' : 'types'}`;
    $('#tier-list').innerHTML = activeTiers.length ? activeTiers.map((tier) => {
      const left = Math.max(0, number(tier.capacity) - number(tier.sold));
      const pct = tier.capacity > 0 ? Math.min(100, Math.round((tier.sold / tier.capacity) * 100)) : 0;
      const actions = canManageTickets() ? `<div class="tier-card-actions"><button class="allocation-edit" type="button" data-action="edit-tier" data-id="${escapeHTML(tier.id)}">Edit</button><button class="allocation-edit tier-retire-button" type="button" data-action="retire-tier" data-id="${escapeHTML(tier.id)}">Retire</button></div>` : '';
      return `<article class="tier-card"><div class="card-heading"><div><h4>${escapeHTML(tier.name)}</h4></div>${actions}</div><p class="tier-description">${escapeHTML(tier.description || 'Admission ticket')}</p><div class="tier-price-line"><strong class="tier-price">${money(tier.price)}</strong><span class="tier-available">${left.toLocaleString('en-NG')} left</span></div><div class="tier-progress progress-track"><span style="width:${pct}%"></span></div><div class="tier-stats"><span>${tier.sold.toLocaleString('en-NG')} sold</span><span>${pct}% full</span><span>${tier.capacity.toLocaleString('en-NG')} capacity</span></div></article>`;
    }).join('') : `<div class="empty-state"><span class="empty-icon">◇</span><h3>No ticket types yet</h3><p>Add a ticket type to begin tracking capacity and sales.</p>${canManageTickets() ? '<button class="button button-secondary" type="button" data-action="manage-tiers">Add ticket type</button>' : ''}</div>`;
  }

  function categorySpend(categoryName) {
    const calc = calculations();
    const spent = app.data.transactions.filter((tx) => tx.type === 'expense' && tx.category === categoryName && tx.reviewStatus === 'Approved' && ['Paid', 'Deposit'].includes(tx.paymentStatus)).reduce((sum, tx) => sum + number(tx.amount), 0);
    const pending = app.data.transactions.filter((tx) => tx.type === 'expense' && tx.category === categoryName && !isExcluded(tx) && (['Pending', 'Unpaid'].includes(tx.paymentStatus) || tx.reviewStatus === 'Pending')).reduce((sum, tx) => sum + number(tx.amount), 0);
    return { spent, pending, ceiling: calc.ceiling };
  }

  function renderBudget() {
    const calc = calculations();
    const pct = calc.ceiling > 0 ? calc.approvedExpenses / calc.ceiling * 100 : 0;
    const assigned = app.data.categories.reduce((sum, category) => sum + number(category.share), 0);
    $('#budget-total-card').innerHTML = `<div class="budget-total-main"><p class="eyebrow">APPROVED CEILING</p><h3>Event budget</h3><div class="budget-total-amounts"><strong>${money(calc.approvedExpenses)}</strong><span>spent of ${money(calc.ceiling)}</span></div><div class="progress-track ${pct > 100 ? 'over' : ''}"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div></div><div class="budget-total-aside"><div><strong>${money(calc.remaining)}</strong><span>${calc.remaining < 0 ? 'Over budget' : 'Remaining'}</span></div><div><strong>${money(calc.commitments)}</strong><span>Committed</span></div></div>`;
    $('#budget-allocation-total').textContent = `${assigned}% allocated · ${100 - assigned}% unallocated`;
    const header = `<div class="allocation-row allocation-heading"><span>Category</span><span class="allocation-track">Spent</span><span>Spent</span><span>Of category</span><span>Manage</span></div>`;
    const rows = app.data.categories.map((category) => {
      const values = categorySpend(category.name);
      const allocated = Math.round(calc.ceiling * category.share / 100);
      const pctUsed = allocated > 0 ? Math.min(100, values.spent / allocated * 100) : 0;
      const edit = canManageCategories() ? `<button class="allocation-edit" type="button" data-action="manage-categories" aria-label="Edit ${escapeHTML(category.name)}">Edit</button>` : '';
      return `<div class="allocation-row"><span class="allocation-name"><strong>${escapeHTML(category.name)}</strong><small>${category.share}% · ${money(allocated)} approved</small></span><span class="allocation-track"><span class="progress-track ${values.spent > allocated ? 'over' : ''}"><span style="width:${pctUsed}%"></span></span></span><span class="allocation-money">${money(values.spent)}</span><span class="allocation-share">${allocated ? Math.round(values.spent / allocated * 100) : 0}%</span><span>${edit}</span></div>`;
    }).join('');
    $('#allocation-list').innerHTML = app.data.categories.length ? header + rows : `<div class="empty-state"><h3>No budget categories yet</h3><p>Add categories to share out the event budget.</p>${canManageCategories() ? '<button class="button button-secondary" type="button" data-action="manage-categories">Add categories</button>' : ''}</div>`;
  }

  function transactionLabel(type) { return type === 'expense' ? 'Expense' : type === 'ticket' ? 'Ticket sale' : 'Income'; }
  function transactionClass(status) { return String(status || '').toLowerCase().replace(/[^a-z]/g, ''); }
  function signedAmount(tx) { return `${tx.type === 'expense' ? '−' : '+'}${money(tx.amount)}`; }
  function transactionSymbol(type) { return type === 'expense' ? '−' : type === 'ticket' ? '◇' : '+'; }
  function filteredTransactions() {
    const query = app.search.trim().toLowerCase();
    return [...app.data.transactions].filter((tx) => {
      const matchesType = app.transactionType === 'all' || tx.type === app.transactionType;
      const matchesStatus = app.transactionStatus === 'all' || tx.reviewStatus === app.transactionStatus;
      const matchesSearch = !query || [tx.id, tx.description, tx.party, tx.category, tx.method].join(' ').toLowerCase().includes(query);
      return matchesType && matchesStatus && matchesSearch;
    }).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }
  function renderTransactions() {
    const rows = filteredTransactions();
    $('#transaction-result-count').textContent = `${rows.length} ${rows.length === 1 ? 'transaction' : 'transactions'}`;
    $('#transaction-empty').hidden = rows.length > 0;
    $('.table-scroll').hidden = rows.length === 0;
    $('#transaction-cards').hidden = rows.length === 0;
    $('#transaction-rows').innerHTML = rows.map((tx) => `<tr><td><div class="transaction-primary"><span class="transaction-type-icon ${tx.type === 'expense' ? 'expense' : ''}" aria-hidden="true">${transactionSymbol(tx.type)}</span><span><strong>${escapeHTML(tx.description)}</strong><small>${escapeHTML(tx.id)} · ${escapeHTML(transactionLabel(tx.type))}</small></span></div></td><td class="date-cell">${escapeHTML(dateLabel(tx.date))}</td><td class="category-cell">${escapeHTML(tx.category || '—')}</td><td><span class="status-badge ${transactionClass(tx.reviewStatus)}">${escapeHTML(tx.reviewStatus === 'Pending' ? 'Pending review' : tx.reviewStatus)}</span></td><td class="amount-cell ${tx.type === 'expense' ? 'negative' : 'positive'}">${signedAmount(tx)}</td><td><button class="row-action" type="button" data-action="open-detail" data-id="${escapeHTML(tx.id)}">View</button></td></tr>`).join('');
    $('#transaction-cards').innerHTML = rows.map((tx) => `<article class="transaction-card"><div class="transaction-card-top"><div class="transaction-primary"><span class="transaction-type-icon ${tx.type === 'expense' ? 'expense' : ''}" aria-hidden="true">${transactionSymbol(tx.type)}</span><span><strong>${escapeHTML(tx.description)}</strong><small>${escapeHTML(tx.id)} · ${escapeHTML(transactionLabel(tx.type))}</small></span></div><span class="status-badge ${transactionClass(tx.reviewStatus)}">${escapeHTML(tx.reviewStatus === 'Pending' ? 'Pending review' : tx.reviewStatus)}</span></div><div class="transaction-card-meta"><span>${escapeHTML(dateLabel(tx.date))}</span><span>${escapeHTML(tx.category || '—')}</span></div><div class="transaction-card-bottom"><strong class="recent-amount ${tx.type === 'expense' ? 'negative' : 'positive'}">${signedAmount(tx)}</strong><button class="button button-secondary" type="button" data-action="open-detail" data-id="${escapeHTML(tx.id)}">View details</button></div></article>`).join('');
  }

  function renderTeam() {
    $('#team-list').innerHTML = app.data.team.length ? app.data.team.map((member) => `<article class="team-card"><div class="team-card-top"><span class="avatar">${escapeHTML(member.initials)}</span><div><h3>${escapeHTML(member.name)}</h3><p>${escapeHTML(member.role)}</p></div></div><div class="team-role">Assigned to this event</div></article>`).join('') : `<div class="empty-state"><span class="empty-icon">♙</span><h3>No team assigned</h3><p>Event roles can be assigned through Member Administration.</p></div>`;
  }

  function renderFinancialReport() {
    const calc = calculations();
    const incomeByCategory = new Map();
    const expenseByCategory = new Map();
    app.data.transactions.filter((tx) => tx.reviewStatus === 'Approved' && !isExcluded(tx)).forEach((tx) => {
      if (tx.type === 'expense' && ['Paid', 'Deposit'].includes(tx.paymentStatus)) expenseByCategory.set(tx.category, (expenseByCategory.get(tx.category) || 0) + number(tx.amount));
      if ((tx.type === 'income' || tx.type === 'ticket') && tx.paymentStatus !== 'Unpaid') incomeByCategory.set(tx.category, (incomeByCategory.get(tx.category) || 0) + number(tx.amount));
    });
    const incomeRows = Array.from(incomeByCategory.entries()).map(([name, amount]) => `<tr><td>${escapeHTML(name)}</td><td>${money(amount)}</td></tr>`).join('') || '<tr><td colspan="2">No approved income recorded</td></tr>';
    const expenseRows = Array.from(expenseByCategory.entries()).map(([name, amount]) => `<tr><td>${escapeHTML(name)}</td><td>${money(amount)}</td></tr>`).join('') || '<tr><td colspan="2">No paid expenses recorded</td></tr>';
    const generated = dateLabel(todayISO());
    return `<div class="report-title-row"><div><p class="eyebrow">CARPENTERS FAMILY · EVENT REPORT</p><h3>${escapeHTML(app.data.event.title)}</h3><p>${escapeHTML(app.data.event.venue)} · ${escapeHTML(longDate(app.data.event.date))}</p></div><div class="report-period">Sample report<br />Prepared ${escapeHTML(generated)}</div></div><div class="report-kpis"><div class="report-kpi"><span>Income received</span><strong>${money(calc.approvedIncome)}</strong></div><div class="report-kpi"><span>Spent</span><strong>${money(calc.approvedExpenses)}</strong></div><div class="report-kpi"><span>Balance</span><strong>${money(calc.net)}</strong></div></div><table class="report-table"><thead><tr><th>Income</th><th>Amount</th></tr></thead><tbody>${incomeRows}<tr class="report-total"><td>Total income</td><td>${money(calc.approvedIncome)}</td></tr></tbody></table><table class="report-table"><thead><tr><th>Expenses paid or deposited</th><th>Amount</th></tr></thead><tbody>${expenseRows}<tr class="report-total"><td>Total expenses</td><td>${money(calc.approvedExpenses)}</td></tr><tr class="report-result"><td>Balance after expenses</td><td>${money(calc.net)}</td></tr></tbody></table><p class="report-footnote">Pending and unpaid expenses are shown as commitments in the event budget and are not included in expenses paid.</p>`;
  }

  function renderActivity() {
    const activity = app.data.activity.filter((item) => app.activityFilter === 'all' || item.kind === app.activityFilter);
    $('#activity-count').textContent = String(app.data.activity.length);
    $('#activity-list').innerHTML = activity.length ? activity.map((item) => `<div class="activity-item"><span class="activity-marker" aria-hidden="true">${item.kind === 'transaction' ? '↗' : item.kind === 'budget' ? '₦' : item.kind === 'tickets' ? '◇' : '•'}</span><span class="activity-copy"><strong>${escapeHTML(item.text)}</strong><span>${escapeHTML(item.detail)}</span></span><time class="activity-time">${escapeHTML(item.time)}</time></div>`).join('') : `<div class="activity-empty">No activity to show.</div>`;
  }

  function renderReports() {
    $('#financial-report').innerHTML = renderFinancialReport();
    $('#print-report').innerHTML = `<div class="print-report-header"><strong>Carpenters Family</strong><span>Sample event report</span></div>${renderFinancialReport()}`;
    renderActivity();
    setReportTab(app.reportTab);
  }

  function renderAll() {
    updateEventHeader();
    updateCapabilities();
    renderOverview();
    renderTickets();
    renderBudget();
    renderTransactions();
    renderTeam();
    renderReports();
    setTab(app.tab);
  }

  function openRecord(type = 'expense') {
    if (!canRecord()) {
      showToast('This role cannot record transactions in the current preview.');
      return;
    }
    $('#record-form').reset();
    $('#record-error').hidden = true;
    $('#record-date').value = todayISO();
    $('#record-kind').value = type;
    $('#receipt-file-note').textContent = 'Optional. This preview does not upload files.';
    updateRecordFields();
    openDialog('record-dialog');
  }

  function updateRecordFields() {
    const kind = $('#record-kind').value;
    const categoryWrap = $('#record-category-wrap');
    const tierWrap = $('#record-tier-wrap');
    const quantityWrap = $('#record-quantity-wrap');
    const amountWrap = $('#record-amount-wrap');
    const partyWrap = $('#record-party-wrap');
    const methodWrap = $('#record-method-wrap');
    const paymentWrap = $('#record-payment-wrap');
    const category = $('#record-category');
    const tier = $('#record-tier');
    const quantity = $('#record-quantity');
    const amount = $('#record-amount');
    const activeTiers = app.data.tiers.filter((item) => item.active && item.capacity > item.sold);
    category.innerHTML = (kind === 'expense' ? app.data.categories.map((item) => item.name) : app.data.incomeCategories).map((name) => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');
    tier.innerHTML = activeTiers.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)} · ${money(item.price)} each · ${item.capacity - item.sold} left</option>`).join('');
    categoryWrap.hidden = kind === 'ticket';
    tierWrap.hidden = kind !== 'ticket';
    quantityWrap.hidden = kind !== 'ticket';
    amountWrap.hidden = kind === 'ticket';
    partyWrap.hidden = false;
    methodWrap.hidden = kind === 'ticket';
    paymentWrap.hidden = kind !== 'expense';
    $('#record-quantity').disabled = activeTiers.length === 0;
    if (kind === 'ticket') {
      amount.required = false;
      $('#record-quantity').value = 1;
      $('#record-error').hidden = activeTiers.length > 0;
      if (!activeTiers.length) showFormError('record-error', 'There are no ticket types with capacity left. Add or update a ticket type first.');
    } else {
      amount.required = true;
      $('#record-error').hidden = true;
    }
    tier.onchange = updateTicketEstimate;
    quantity.oninput = updateTicketEstimate;
    if (kind === 'ticket' && activeTiers.length) updateTicketEstimate();
  }

  function updateTicketEstimate() {
    const selected = app.data.tiers.find((item) => item.id === $('#record-tier').value);
    const qty = Math.max(0, number($('#record-quantity').value));
    $('#record-description').value = selected ? `${selected.name} · ${qty} ${qty === 1 ? 'ticket' : 'tickets'}` : '';
  }

  function showFormError(id, message) {
    const node = document.getElementById(id);
    node.textContent = message;
    node.hidden = false;
  }
  function clearFormError(id) { document.getElementById(id).hidden = true; }

  function submitRecord(event) {
    event.preventDefault();
    clearFormError('record-error');
    const kind = $('#record-kind').value;
    const description = $('#record-description').value.trim();
    const date = $('#record-date').value;
    const party = $('#record-party').value.trim();
    const method = $('#record-method').value;
    const receipt = $('#record-receipt').files?.[0]?.name || '';
    if (!description || !date) return showFormError('record-error', 'Add a description and date.');
    let amount = number($('#record-amount').value);
    let category = $('#record-category').value;
    let quantity = 0;
    let paymentStatus = kind === 'expense' ? $('#record-payment-status').value : 'Paid';
    if (kind === 'ticket') {
      const tier = app.data.tiers.find((item) => item.id === $('#record-tier').value && item.active);
      quantity = Math.floor(number($('#record-quantity').value));
      if (!tier || quantity < 1) return showFormError('record-error', 'Choose a ticket type and enter a quantity of at least 1.');
      if (quantity > tier.capacity - tier.sold) return showFormError('record-error', `Only ${tier.capacity - tier.sold} ${tier.name} tickets are left.`);
      amount = tier.price * quantity;
      category = tier.name;
    }
    if (kind !== 'ticket' && !category) return showFormError('record-error', 'Choose a category before saving.');
    if (kind !== 'ticket' && (!Number.isFinite(amount) || amount <= 0)) return showFormError('record-error', 'Enter an amount greater than zero.');
    const id = `TX-${String(Date.now()).slice(-6)}`;
    const transaction = { id, date, type: kind, description, party: party || 'Not specified', category, tierId: kind === 'ticket' ? $('#record-tier').value : undefined, amount, quantity, reviewStatus: 'Pending', paymentStatus, method: kind === 'ticket' ? 'Ticket sale' : method, receipt };
    app.data.transactions.unshift(transaction);
    if (kind === 'ticket') {
      const tier = app.data.tiers.find((item) => item.id === $('#record-tier').value);
      tier.sold += quantity;
    }
    addActivity('transaction', `${transactionLabel(kind)} recorded`, `${id} · ${description} · ${money(amount)}`);
    closeDialog('record-dialog');
    renderAll();
    showToast('Transaction saved. It is waiting for review.');
  }

  function openTierDialog(id = null) {
    if (!canManageTickets()) return showToast('Your role cannot manage ticket types in this preview.');
    app.editingTierId = id;
    const tier = app.data.tiers.find((item) => item.id === id);
    $('#tier-form').reset();
    clearFormError('tier-error');
    $('#tier-dialog-title').textContent = tier ? 'Edit ticket type' : 'Add ticket type';
    $('#tier-name').value = tier?.name || '';
    $('#tier-price').value = tier?.price ?? '';
    $('#tier-capacity').value = tier?.capacity ?? '';
    $('#tier-description').value = tier?.description || '';
    openDialog('tier-dialog');
  }

  function submitTier(event) {
    event.preventDefault();
    clearFormError('tier-error');
    const name = $('#tier-name').value.trim();
    const price = number($('#tier-price').value);
    const capacity = Math.floor(number($('#tier-capacity').value));
    const description = $('#tier-description').value.trim();
    if (!name || !Number.isFinite(price) || price < 0 || capacity < 1) return showFormError('tier-error', 'Enter a name, a valid price and capacity of at least 1.');
    const duplicate = app.data.tiers.some((item) => item.active && item.name.toLowerCase() === name.toLowerCase() && item.id !== app.editingTierId);
    if (duplicate) return showFormError('tier-error', 'A ticket type with this name already exists.');
    if (app.editingTierId) {
      const tier = app.data.tiers.find((item) => item.id === app.editingTierId);
      if (capacity < tier.sold) return showFormError('tier-error', `Capacity cannot be lower than ${tier.sold} tickets already sold.`);
      Object.assign(tier, { name, price, capacity, description });
      app.data.transactions.filter((tx) => tx.type === 'ticket' && tx.tierId === tier.id).forEach((tx) => { tx.category = name; });
      addActivity('tickets', 'Ticket type updated', `${name} · ${money(price)} · capacity ${capacity}`);
    } else {
      const tier = { id: `tier-${Date.now()}`, name, price, capacity, sold: 0, description, active: true };
      app.data.tiers.push(tier);
      addActivity('tickets', 'Ticket type added', `${name} · ${money(price)} · capacity ${capacity}`);
    }
    closeDialog('tier-dialog');
    renderAll();
    showToast(app.editingTierId ? 'Ticket type updated.' : 'Ticket type added.');
    app.editingTierId = null;
  }

  function openBudgetDialog() {
    if (!canManageBudget()) return showToast('Your role cannot change the budget ceiling in this preview.');
    $('#budget-ceiling-input').value = app.data.event.ceiling;
    $('#budget-reason-input').value = '';
    clearFormError('budget-error');
    openDialog('budget-dialog');
  }

  function submitBudget(event) {
    event.preventDefault();
    clearFormError('budget-error');
    const ceiling = number($('#budget-ceiling-input').value);
    const reason = $('#budget-reason-input').value.trim();
    if (ceiling <= 0) return showFormError('budget-error', 'Enter a budget greater than zero.');
    if (!reason) return showFormError('budget-error', 'Add a short reason for this change.');
    const previous = app.data.event.ceiling;
    app.data.event.ceiling = ceiling;
    addActivity('budget', 'Budget ceiling changed', `${money(previous)} → ${money(ceiling)} · ${reason}`);
    closeDialog('budget-dialog');
    renderAll();
    showToast('Budget ceiling updated.');
  }

  function openCategoryDialog() {
    if (!canManageCategories()) return showToast('Your role cannot manage budget categories in this preview.');
    app.draftCategories = clone(app.data.categories);
    $('#new-category-name').value = '';
    $('#new-category-share').value = '';
    clearFormError('category-error');
    renderCategoryDraft();
    openDialog('category-dialog');
  }

  function renderIncomeCategories() {
    $('#income-category-list').innerHTML = app.data.incomeCategories.length ? app.data.incomeCategories.map((name, index) => {
      const used = app.data.transactions.some((tx) => tx.type === 'income' && tx.category === name);
      return `<div class="income-category-row"><span>${escapeHTML(name)}${used ? '<small> · used by transactions</small>' : ''}</span><button type="button" class="allocation-edit" data-action="remove-income-category" data-index="${index}" ${used ? 'disabled title="This category is used by existing transactions"' : ''}>Remove</button></div>`;
    }).join('') : '<p class="helper-copy">No income categories yet. Add one below.</p>';
  }

  function openIncomeCategoryDialog() {
    if (!canManageCategories()) return showToast('Your role cannot manage income categories in this preview.');
    $('#new-income-category').value = '';
    clearFormError('income-category-error');
    renderIncomeCategories();
    openDialog('income-category-dialog');
  }

  function submitIncomeCategory(event) {
    event.preventDefault();
    clearFormError('income-category-error');
    const name = $('#new-income-category').value.trim();
    if (!name) return showFormError('income-category-error', 'Enter a category name.');
    if (app.data.incomeCategories.some((item) => item.toLowerCase() === name.toLowerCase())) return showFormError('income-category-error', 'This income category already exists.');
    app.data.incomeCategories.push(name);
    addActivity('budget', 'Income category added', name);
    $('#new-income-category').value = '';
    renderIncomeCategories();
    renderTransactions();
    showToast('Income category added.');
  }

  function renderCategoryDraft() {
    const total = app.draftCategories.reduce((sum, category) => sum + number(category.share), 0);
    $('#category-edit-list').innerHTML = app.draftCategories.map((category) => `<div class="category-edit-row"><span><strong>${escapeHTML(category.name)}</strong><small>Current share of event budget</small></span><label class="sr-only" for="share-${escapeHTML(category.id)}">${escapeHTML(category.name)} share percent</label><input id="share-${escapeHTML(category.id)}" type="number" min="0" max="100" step="1" value="${number(category.share)}" data-category-share="${escapeHTML(category.id)}" /><button class="allocation-edit" type="button" data-action="remove-category" data-id="${escapeHTML(category.id)}" aria-label="Remove ${escapeHTML(category.name)}">Remove</button></div>`).join('') || '<div class="empty-state">No categories yet. Add one below.</div>';
    $('#category-total-note').textContent = `${total}% allocated. Up to 100% can be assigned; any remainder stays unallocated.`;
  }

  function addCategoryDraft() {
    clearFormError('category-error');
    captureCategoryInputs();
    const name = $('#new-category-name').value.trim();
    const share = number($('#new-category-share').value);
    if (!name || !Number.isInteger(share) || share < 0 || share > 100) return showFormError('category-error', 'Enter a category name and a whole-number share from 0 to 100.');
    if (app.draftCategories.some((item) => item.name.toLowerCase() === name.toLowerCase())) return showFormError('category-error', 'This category already exists.');
    if (app.draftCategories.reduce((sum, item) => sum + number(item.share), 0) + share > 100) return showFormError('category-error', 'Category shares cannot add up to more than 100%.');
    app.draftCategories.push({ id: `cat-${Date.now()}`, name, share });
    $('#new-category-name').value = '';
    $('#new-category-share').value = '';
    renderCategoryDraft();
  }

  function saveCategoryDraft(event) {
    event.preventDefault();
    clearFormError('category-error');
    const inputs = $$('[data-category-share]');
    for (const input of inputs) {
      const share = Number(input.value);
      if (!Number.isInteger(share) || share < 0 || share > 100) return showFormError('category-error', 'Enter a whole-number share from 0 to 100 for each category.');
      const item = app.draftCategories.find((category) => category.id === input.dataset.categoryShare);
      if (item) item.share = share;
    }
    const total = app.draftCategories.reduce((sum, item) => sum + item.share, 0);
    if (total > 100) return showFormError('category-error', 'Category shares cannot add up to more than 100%.');
    app.data.categories = clone(app.draftCategories);
    addActivity('budget', 'Budget categories updated', `${app.data.categories.length} categories · ${total}% allocated`);
    closeDialog('category-dialog');
    renderAll();
    showToast('Budget categories saved.');
  }

  function captureCategoryInputs() {
    $$('[data-category-share]').forEach((input) => {
      const item = app.draftCategories?.find((category) => category.id === input.dataset.categoryShare);
      if (item && Number.isInteger(Number(input.value))) item.share = Number(input.value);
    });
  }

  function openEventDialog() {
    if (!isManager() && app.role !== 'lead') return showToast('Your role cannot edit event details in this preview.');
    if (!eventIsOpen() && app.role !== 'admin') return showToast('Only an Admin or President can reopen a completed or cancelled event.');
    const event = app.data.event;
    $('#event-name-input').value = event.title;
    $('#event-date-input').value = event.date;
    $('#event-time-input').value = event.time;
    $('#event-venue-input').value = event.venue;
    $('#event-status-input').value = event.status;
    $('#event-reason-input').value = '';
    $('#event-reason-wrap').hidden = true;
    $('#event-error').hidden = true;
    const statusSelect = $('#event-status-input');
    statusSelect.disabled = event.status !== 'Scheduled' && app.role !== 'admin';
    openDialog('event-dialog');
  }

  function submitEvent(event) {
    event.preventDefault();
    clearFormError('event-error');
    const status = $('#event-status-input').value;
    const reason = $('#event-reason-input').value.trim();
    const previousStatus = app.data.event.status;
    if (status !== previousStatus && !reason) return showFormError('event-error', 'Add a reason for changing the event status.');
    if (previousStatus !== 'Scheduled' && status === 'Scheduled' && app.role !== 'admin') return showFormError('event-error', 'Only an admin or president can reopen this event.');
    app.data.event.title = $('#event-name-input').value.trim();
    app.data.event.date = $('#event-date-input').value;
    app.data.event.time = $('#event-time-input').value;
    app.data.event.venue = $('#event-venue-input').value.trim();
    app.data.event.status = status;
    if (status !== previousStatus) addActivity('event', `Event marked ${status.toLowerCase()}`, reason);
    else addActivity('event', 'Event details updated', `${app.data.event.title} · ${dateLabel(app.data.event.date)}`);
    closeDialog('event-dialog');
    renderAll();
    showToast('Event details saved.');
  }

  function openDetail(id) {
    const tx = app.data.transactions.find((item) => item.id === id);
    if (!tx) return;
    app.activeTransactionId = id;
    app.pendingDetailAction = null;
    $('#detail-action-form').hidden = true;
    $('#detail-error').hidden = true;
    $('#detail-title').textContent = tx.description;
    $('#detail-body').innerHTML = `<div class="detail-status-line"><span class="detail-amount ${tx.type === 'expense' ? 'negative' : 'positive'}">${signedAmount(tx)}</span><span class="status-badge ${transactionClass(tx.reviewStatus)}">${escapeHTML(tx.reviewStatus === 'Pending' ? 'Pending review' : tx.reviewStatus)}</span></div><dl class="detail-list"><dt>Reference</dt><dd>${escapeHTML(tx.id)}</dd><dt>Type</dt><dd>${escapeHTML(transactionLabel(tx.type))}</dd><dt>Date</dt><dd>${escapeHTML(dateLabel(tx.date))}</dd><dt>Category</dt><dd>${escapeHTML(tx.category || '—')}</dd><dt>Recorded for</dt><dd>${escapeHTML(tx.party || 'Not specified')}</dd><dt>Payment method</dt><dd>${escapeHTML(tx.method || '—')}</dd>${tx.type === 'expense' ? `<dt>Payment status</dt><dd>${escapeHTML(tx.paymentStatus)}</dd>` : ''}${tx.type === 'ticket' ? `<dt>Quantity</dt><dd>${number(tx.quantity)}</dd>` : ''}</dl><div class="detail-receipt">${tx.receipt ? `Receipt attached in sample data: <strong>${escapeHTML(tx.receipt)}</strong>` : 'No receipt attached.'} <span class="field-hint">Files are not stored or opened by this prototype.</span></div>`;
    const buttons = [];
    if (tx.reviewStatus === 'Pending' && canReview()) {
      buttons.push('<button class="button button-primary" type="button" data-action="approve-transaction">Approve</button>');
      buttons.push('<button class="button button-secondary" type="button" data-action="start-detail-action" data-detail-action="reject">Reject</button>');
    }
    if (tx.reviewStatus !== 'Voided' && tx.reviewStatus !== 'Rejected' && canCorrect()) {
      buttons.push('<button class="button button-secondary" type="button" data-action="start-detail-action" data-detail-action="correct">Correct</button>');
      buttons.push('<button class="button button-danger" type="button" data-action="start-detail-action" data-detail-action="void">Void</button>');
    }
    $('#detail-actions').innerHTML = buttons.length ? buttons.join('') : '<p class="helper-copy">No actions are available for this record in the current role preview.</p>';
    openDialog('detail-dialog');
  }

  function startDetailAction(action) {
    const tx = app.data.transactions.find((item) => item.id === app.activeTransactionId);
    if (!tx) return;
    app.pendingDetailAction = action;
    $('#detail-action-form').hidden = false;
    $('#detail-error').hidden = true;
    $('#detail-amount-wrap').hidden = action !== 'correct';
    $('#detail-reason-wrap').hidden = action !== 'correct' && action !== 'void' && action !== 'reject';
    $('#detail-reason').value = '';
    $('#detail-corrected-amount').value = tx.amount;
    $('#detail-action-submit').textContent = action === 'correct' ? 'Save correction' : action === 'void' ? 'Void transaction' : 'Reject transaction';
    $('#detail-action-submit').className = action === 'void' ? 'button button-danger' : 'button button-primary';
    $('#detail-action-submit').focus();
  }

  function submitDetailAction(event) {
    event.preventDefault();
    const tx = app.data.transactions.find((item) => item.id === app.activeTransactionId);
    if (!tx) return;
    const reason = $('#detail-reason').value.trim();
    if (!reason) return showFormError('detail-error', 'Add a reason to continue.');
    if (app.pendingDetailAction === 'void') {
      openConfirm('Void this transaction?', 'It will be removed from the event totals. The reason you entered will be added to the change history.', () => {
        if (tx.type === 'ticket' && tx.reviewStatus !== 'Voided' && tx.reviewStatus !== 'Rejected') {
          const soldTier = app.data.tiers.find((tier) => tier.id === tx.tierId) || app.data.tiers.find((tier) => tier.name === tx.category);
          if (soldTier) soldTier.sold = Math.max(0, soldTier.sold - number(tx.quantity));
        }
        tx.reviewStatus = 'Voided';
        addActivity('transaction', 'Transaction voided', `${tx.id} · ${money(tx.amount)} · ${reason}`);
        closeDialog('detail-dialog');
        renderAll();
        showToast('Transaction voided.');
      }, 'Void transaction', true);
      return;
    }
    if (app.pendingDetailAction === 'correct') {
      const amount = number($('#detail-corrected-amount').value);
      if (amount <= 0) return showFormError('detail-error', 'Enter a corrected amount greater than zero.');
      const before = tx.amount;
      tx.amount = amount;
      tx.reviewStatus = 'Approved';
      addActivity('transaction', 'Transaction corrected', `${tx.id} · ${money(before)} → ${money(amount)} · ${reason}`);
      showToast('Transaction corrected.');
    } else if (app.pendingDetailAction === 'reject') {
      if (tx.type === 'ticket' && tx.reviewStatus !== 'Voided' && tx.reviewStatus !== 'Rejected') {
        const soldTier = app.data.tiers.find((tier) => tier.id === tx.tierId) || app.data.tiers.find((tier) => tier.name === tx.category);
        if (soldTier) soldTier.sold = Math.max(0, soldTier.sold - number(tx.quantity));
      }
      tx.reviewStatus = 'Rejected';
      addActivity('transaction', 'Transaction rejected', `${tx.id} · ${money(tx.amount)} · ${reason}`);
      showToast('Transaction rejected.');
    }
    closeDialog('detail-dialog');
    renderAll();
  }

  function approveTransaction() {
    const tx = app.data.transactions.find((item) => item.id === app.activeTransactionId);
    if (!tx || !canReview()) return;
    tx.reviewStatus = 'Approved';
    addActivity('transaction', 'Transaction approved', `${tx.id} · ${money(tx.amount)}`);
    closeDialog('detail-dialog');
    renderAll();
    showToast('Transaction approved.');
  }

  function openConfirm(title, message, callback, confirmText = 'Continue', danger = false) {
    app.pendingConfirm = callback;
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    $('#confirm-submit').textContent = confirmText;
    $('#confirm-submit').className = danger ? 'button button-danger' : 'button button-primary';
    openDialog('confirm-dialog');
  }

  function confirmPendingAction() {
    const callback = app.pendingConfirm;
    app.pendingConfirm = null;
    closeDialog('confirm-dialog');
    if (typeof callback === 'function') callback();
  }

  function openEventMenu() {
    const menu = $('#event-menu');
    const button = $('#event-menu-button');
    const isOpen = !menu.hidden;
    menu.hidden = isOpen;
    button.setAttribute('aria-expanded', String(!isOpen));
  }

  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
  function exportCSV() {
    const headings = ['Reference', 'Date', 'Type', 'Description', 'Name', 'Category', 'Amount (NGN)', 'Review status', 'Payment status', 'Payment method'];
    const lines = [headings, ...app.data.transactions.map((tx) => [tx.id, tx.date, transactionLabel(tx.type), tx.description, tx.party, tx.category, tx.type === 'expense' ? -number(tx.amount) : number(tx.amount), tx.reviewStatus, tx.paymentStatus, tx.method])];
    const blob = new Blob([`\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'event-transactions-sample.csv';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Sample transaction CSV downloaded.');
  }
  function printReport() {
    renderReports();
    window.print();
  }

  function clearFilters() {
    app.search = '';
    app.transactionType = 'all';
    app.transactionStatus = 'all';
    $('#transaction-search').value = '';
    $('#transaction-type-filter').value = 'all';
    $('#transaction-status-filter').value = 'all';
    renderTransactions();
  }

  function handleClick(event) {
    const closeButton = event.target.closest('[data-close-dialog]');
    if (closeButton) {
      closeDialog(closeButton.closest('dialog'));
      return;
    }
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) { setTab(tabButton.dataset.tab); return; }
    const reportButton = event.target.closest('[data-report-tab]');
    if (reportButton) { setReportTab(reportButton.dataset.reportTab); return; }
    const goTab = event.target.closest('[data-go-tab]');
    if (goTab) {
      setTab(goTab.dataset.goTab);
      if (goTab.dataset.transactionFilter) {
        app.transactionType = goTab.dataset.transactionFilter;
        $('#transaction-type-filter').value = app.transactionType;
        renderTransactions();
      }
      return;
    }
    const externalLink = event.target.closest('[data-outside]');
    if (externalLink) {
      event.preventDefault();
      closeDialog('mobile-nav-dialog');
      notice(`${externalLink.dataset.outside} is separate`, 'This standalone prototype covers the Event Dashboard. In Carpenters Family, this opens as a separate area. Meeting Hub remains the place for meetings, attendance and office controls.');
      return;
    }
    const action = event.target.closest('[data-action]');
    if (!action) return;
    const id = action.dataset.id;
    switch (action.dataset.action) {
      case 'open-record': openRecord(action.dataset.recordType); break;
      case 'manage-tiers': openTierDialog(); break;
      case 'edit-tier': openTierDialog(id); break;
      case 'retire-tier': {
        const tier = app.data.tiers.find((item) => item.id === id);
        if (tier) openConfirm('Retire ticket type?', `${tier.name} will no longer be available for new sales. Existing sales remain in the event records.`, () => {
          tier.active = false;
          addActivity('tickets', 'Ticket type retired', tier.name);
          renderAll();
          showToast('Ticket type retired.');
        }, 'Retire type', true);
        break;
      }
      case 'budget-settings': openBudgetDialog(); break;
      case 'manage-categories': openCategoryDialog(); break;
      case 'manage-income-categories': openIncomeCategoryDialog(); break;
      case 'remove-income-category': {
        const name = app.data.incomeCategories[Number(action.dataset.index)];
        if (name && !app.data.transactions.some((tx) => tx.type === 'income' && tx.category === name)) {
          app.data.incomeCategories.splice(Number(action.dataset.index), 1);
          addActivity('budget', 'Income category removed', name);
          renderIncomeCategories();
          renderTransactions();
        }
        break;
      }
      case 'remove-category': {
        const category = app.draftCategories?.find((item) => item.id === id);
        if (category && app.data.transactions.some((tx) => tx.type === 'expense' && tx.category === category.name)) {
          showToast('This category is used by a transaction and cannot be removed.');
          break;
        }
        captureCategoryInputs();
        const index = app.draftCategories?.findIndex((item) => item.id === id) ?? -1;
        if (index >= 0) { app.draftCategories.splice(index, 1); renderCategoryDraft(); }
        break;
      }
      case 'add-category': addCategoryDraft(); break;
      case 'edit-event': openEventDialog(); $('#event-menu').hidden = true; $('#event-menu-button').setAttribute('aria-expanded', 'false'); break;
      case 'open-detail': openDetail(id); break;
      case 'approve-transaction': approveTransaction(); break;
      case 'start-detail-action': startDetailAction(action.dataset.detailAction); break;
      case 'cancel-detail-action': $('#detail-action-form').hidden = true; app.pendingDetailAction = null; break;
      case 'member-admin': notice('Member Administration', 'Event role assignments are managed from the Member Administration area in Carpenters Family. This prototype keeps the Event Dashboard team list read-only.'); break;
      case 'export-csv': exportCSV(); $('#event-menu').hidden = true; break;
      case 'print-report': printReport(); $('#event-menu').hidden = true; break;
      case 'clear-filters': clearFilters(); break;
      case 'confirm-pending': confirmPendingAction(); break;
    }
  }

  function handleKeydown(event) {
    if (!event.target.matches('[role="tab"][data-tab]')) return;
    const tabs = $$('[role="tab"][data-tab]');
    const index = tabs.indexOf(event.target);
    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== null) { event.preventDefault(); tabs[next].focus(); setTab(tabs[next].dataset.tab); }
  }

  function bindEvents() {
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);
    $('#role-preview').addEventListener('change', (event) => { app.role = event.target.value; renderAll(); showToast(`Previewing as ${roleName()}.`); });
    $('#scenario-preview').addEventListener('change', (event) => { resetScenario(event.target.value); showToast('Sample scenario changed.'); });
    $('#mobile-nav-open').addEventListener('click', () => openDialog('mobile-nav-dialog'));
    $('#event-menu-button').addEventListener('click', openEventMenu);
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.action-menu-wrap')) {
        $('#event-menu').hidden = true;
        $('#event-menu-button').setAttribute('aria-expanded', 'false');
      }
    });
    $('#record-kind').addEventListener('change', updateRecordFields);
    $('#record-form').addEventListener('submit', submitRecord);
    $('#tier-form').addEventListener('submit', submitTier);
    $('#budget-form').addEventListener('submit', submitBudget);
    $('#category-form').addEventListener('submit', saveCategoryDraft);
    $('#income-category-form').addEventListener('submit', submitIncomeCategory);
    $('#event-form').addEventListener('submit', submitEvent);
    $('#detail-action-form').addEventListener('submit', submitDetailAction);
    $('#transaction-search').addEventListener('input', (event) => { app.search = event.target.value; renderTransactions(); });
    $('#transaction-type-filter').addEventListener('change', (event) => { app.transactionType = event.target.value; renderTransactions(); });
    $('#transaction-status-filter').addEventListener('change', (event) => { app.transactionStatus = event.target.value; renderTransactions(); });
    $('#activity-filter').addEventListener('change', (event) => { app.activityFilter = event.target.value; renderActivity(); });
    $('#event-status-input').addEventListener('change', (event) => {
      const changed = event.target.value !== app.data.event.status;
      $('#event-reason-wrap').hidden = !changed;
      if (!changed) $('#event-reason-input').value = '';
    });
    $('#record-quantity').addEventListener('change', updateTicketEstimate);
    $$('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
      if (event.target === dialog && dialog.id !== 'detail-dialog') closeDialog(dialog);
    }));
  }

  function init() {
    bindEvents();
    $('#record-date').value = todayISO();
    $('#event-menu').hidden = true;
    renderAll();
  }

  init();
})();

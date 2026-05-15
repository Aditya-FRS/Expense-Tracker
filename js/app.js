'use strict';

// ═══════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════
const CATEGORIES = [
  { id: 'food',          name: 'Food',          emoji: '🍕', color: '#f97316' },
  { id: 'transport',     name: 'Transport',     emoji: '🚗', color: '#3b82f6' },
  { id: 'shopping',      name: 'Shopping',      emoji: '🛍️', color: '#ec4899' },
  { id: 'entertainment', name: 'Fun',           emoji: '🎬', color: '#8b5cf6' },
  { id: 'health',        name: 'Health',        emoji: '💊', color: '#10b981' },
  { id: 'bills',         name: 'Bills',         emoji: '🏠', color: '#64748b' },
  { id: 'education',     name: 'Education',     emoji: '📚', color: '#0891b2' },
  { id: 'travel',        name: 'Travel',        emoji: '✈️', color: '#f59e0b' },
  { id: 'groceries',     name: 'Groceries',     emoji: '🛒', color: '#22c55e' },
  { id: 'others',        name: 'Others',        emoji: '💰', color: '#6b7280' },
];

// ═══════════════════════════════════════════
// PROFILES
// ═══════════════════════════════════════════
const PROFILES = {
  vamsi:   { name: 'Vamsi',   emoji: '😎', password: '1234' },
  family:  { name: 'Family',  emoji: '👨‍👩‍👧', password: '1234' },
  savings: { name: 'Savings', emoji: '🐷', password: '1234' },
};

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
const State = {
  currentUser: null,
  selectedProfile: null,
  currentMonth: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
  activeTab: 'dashboard',
  charts: {},
};

// Storage key helper
function storageKey(profile, key) {
  return `expense_${profile}_${key}`;
}

// ── Expense CRUD ──
function getExpenses(profile) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(profile, 'expenses'))) || [];
  } catch { return []; }
}

function saveExpenses(profile, list) {
  localStorage.setItem(storageKey(profile, 'expenses'), JSON.stringify(list));
}

function getBudget(profile) {
  return parseFloat(localStorage.getItem(storageKey(profile, 'budget'))) || 20000;
}

function saveBudgetVal(profile, val) {
  localStorage.setItem(storageKey(profile, 'budget'), val);
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getCurrentMK() {
  return monthKey(State.currentMonth.year, State.currentMonth.month);
}

function getMonthExpenses() {
  const mk = getCurrentMK();
  return getExpenses(State.currentUser).filter(e => e.month_key === mk);
}

// ── Format ──
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmt(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatDate(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getCat(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

// ═══════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════
function selectProfile(el) {
  document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  State.selectedProfile = el.dataset.user;
  const profile = PROFILES[State.selectedProfile];
  document.getElementById('login-username').value = profile.name;
  document.getElementById('login-username').focus();
}

function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');

  if (!State.selectedProfile) {
    errEl.textContent = 'Please select a profile first.';
    errEl.classList.remove('hidden');
    return;
  }

  const profile = PROFILES[State.selectedProfile];
  if (!password || password !== profile.password) {
    errEl.textContent = 'Wrong password. Hint: 1234';
    errEl.classList.remove('hidden');
    return;
  }

  errEl.classList.add('hidden');
  State.currentUser = State.selectedProfile;

  // Update header
  document.getElementById('header-avatar').textContent = profile.emoji;
  document.getElementById('header-name').textContent = profile.name;

  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  renderAll();
  showToast(`Welcome back, ${profile.name}! 👋`, 'success');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (!document.getElementById('app').classList.contains('hidden')) return;
    handleLogin();
  }
});

function handleLogout() {
  document.getElementById('user-menu').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-password').value = '';
  State.currentUser = null;
  State.selectedProfile = null;
  document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('selected'));
  Object.values(State.charts).forEach(c => { try { c.destroy(); } catch (_) {} });
  State.charts = {};
}

function toggleUserMenu() {
  document.getElementById('user-menu').classList.toggle('hidden');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.header-right')) {
    document.getElementById('user-menu')?.classList.add('hidden');
  }
});

// ═══════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════
function switchTab(tab) {
  State.activeTab = tab;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${tab}`)?.classList.add('active');
  document.getElementById(`tab-${tab}`)?.classList.add('active');

  const renders = {
    dashboard: renderDashboard,
    add: renderAddTab,
    history: renderHistory,
    charts: renderCharts,
  };
  if (renders[tab]) renders[tab]();
}

// ═══════════════════════════════════════════
// MONTH
// ═══════════════════════════════════════════
function changeMonth(delta) {
  let { year, month } = State.currentMonth;
  month += delta;
  if (month > 12) { month = 1; year++; }
  if (month < 1)  { month = 12; year--; }
  State.currentMonth = { year, month };
  updateMonthLabel();
  renderAll();
}

function updateMonthLabel() {
  const { year, month } = State.currentMonth;
  document.getElementById('month-label').textContent = `${MONTHS[month - 1]} ${year}`;
}

// ═══════════════════════════════════════════
// RENDER ALL
// ═══════════════════════════════════════════
function renderAll() {
  updateMonthLabel();
  if (State.activeTab === 'dashboard') renderDashboard();
  if (State.activeTab === 'history')   renderHistory();
  if (State.activeTab === 'charts')    renderCharts();
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
function renderDashboard() {
  const expenses = getMonthExpenses();
  const total    = expenses.reduce((s, e) => s + e.amount, 0);
  const budget   = getBudget(State.currentUser);
  const left     = Math.max(0, budget - total);
  const days     = new Date(State.currentMonth.year, State.currentMonth.month, 0).getDate();
  const avg      = total / days;

  document.getElementById('dash-total').textContent = fmt(total);
  document.getElementById('dash-left').textContent  = fmt(left);
  document.getElementById('dash-count').textContent = expenses.length;
  document.getElementById('dash-avg').textContent   = fmt(avg);

  // Budget bar
  const pct = Math.min(100, budget > 0 ? (total / budget) * 100 : 0);
  const fill = document.getElementById('budget-bar-fill');
  if (fill) {
    fill.style.width = pct + '%';
    fill.style.background = pct >= 90 ? 'linear-gradient(90deg,#dc2626,#ef4444)'
      : pct >= 75 ? 'linear-gradient(90deg,#d97706,#f59e0b)'
      : 'linear-gradient(90deg,#2563eb,#3b82f6)';
  }
  document.getElementById('budget-spent-label').textContent = `${fmt(total)} spent (${Math.round(pct)}%)`;
  document.getElementById('budget-total-label').textContent = `${fmt(budget)} budget`;

  // Recent expenses
  const recentEl = document.getElementById('recent-list');
  const recent = [...expenses].sort((a, b) => b.created_at - a.created_at).slice(0, 6);
  recentEl.innerHTML = recent.length ? recent.map(expenseRow).join('') : emptyState('No expenses this month', '🧾');

  // Quick cat buttons
  renderQuickCats();

  // Top categories
  renderTopCats(expenses);
}

function renderQuickCats() {
  const container = document.getElementById('quick-cats');
  if (!container) return;
  container.innerHTML = CATEGORIES.slice(0, 6).map(cat => `
    <button class="quick-cat-btn" data-cat="${cat.id}" onclick="selectQuickCat('${cat.id}')">
      ${cat.emoji} ${cat.name}
    </button>`).join('');
}

function selectQuickCat(id) {
  document.querySelectorAll('.quick-cat-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.cat === id);
  });
}

function renderTopCats(expenses) {
  const el = document.getElementById('top-cats');
  if (!el) return;
  const totals = {};
  expenses.forEach(e => totals[e.category] = (totals[e.category] || 0) + e.amount);
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0) || 1;
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5);

  el.innerHTML = sorted.length ? sorted.map(([catId, amount]) => {
    const cat = getCat(catId);
    const pct = (amount / grandTotal) * 100;
    return `
      <div class="top-cat-row">
        <span class="top-cat-icon">${cat.emoji}</span>
        <span class="top-cat-name">${cat.name}</span>
        <div class="top-cat-bar-wrap">
          <div class="top-cat-bar-bg">
            <div class="top-cat-bar-fill" style="width:${pct}%;background:${cat.color};height:100%;border-radius:50px"></div>
          </div>
        </div>
        <span class="top-cat-amount">${fmt(amount)}</span>
      </div>`;
  }).join('') : '<p style="padding:1rem;color:#94a3b8;font-size:0.875rem">No data yet</p>';
}

// ═══════════════════════════════════════════
// ADD EXPENSE TAB
// ═══════════════════════════════════════════
function renderAddTab() {
  // Category grid
  const grid = document.getElementById('cat-grid');
  if (grid) {
    grid.innerHTML = CATEGORIES.map(cat => `
      <div class="cat-card" data-cat="${cat.id}" onclick="selectCat('${cat.id}')">
        <span class="cat-emoji">${cat.emoji}</span>
        <span class="cat-name">${cat.name}</span>
      </div>`).join('');
  }
  // Set today's date
  const dateEl = document.getElementById('add-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
}

function selectCat(id) {
  document.querySelectorAll('.cat-card').forEach(c => c.classList.remove('selected'));
  document.querySelector(`.cat-card[data-cat="${id}"]`)?.classList.add('selected');
  document.getElementById('add-category').value = id;
}

function addExpense() {
  const amount   = parseFloat(document.getElementById('add-amount').value);
  const category = document.getElementById('add-category').value;
  const date     = document.getElementById('add-date').value;
  const note     = document.getElementById('add-note').value.trim();
  const payment  = document.querySelector('input[name="pay"]:checked')?.value || 'UPI';
  const recurring = document.getElementById('add-recurring').checked;

  if (!amount || amount <= 0) { showToast('Please enter a valid amount', 'error'); return; }
  if (!category)              { showToast('Please select a category', 'error'); return; }
  if (!date)                  { showToast('Please select a date', 'error'); return; }

  const expense = {
    id: Date.now().toString(),
    amount,
    category,
    date,
    month_key: date.substring(0, 7),
    note: note || getCat(category).name,
    payment,
    recurring,
    created_at: Date.now(),
  };

  const all = getExpenses(State.currentUser);
  all.push(expense);
  saveExpenses(State.currentUser, all);

  showToast(`${getCat(category).emoji} ${fmt(amount)} added!`, 'success');
  clearAddForm();

  // Check budget
  const mk = expense.month_key;
  if (mk === getCurrentMK()) {
    const monthTotal = all.filter(e => e.month_key === mk).reduce((s, e) => s + e.amount, 0);
    const budget = getBudget(State.currentUser);
    if (monthTotal > budget) showToast('⚠️ You have exceeded your monthly budget!', 'warning');
    else if (monthTotal > budget * 0.9) showToast('🔔 You\'re at 90% of your budget', 'warning');
  }
}

function clearAddForm() {
  document.getElementById('add-amount').value = '';
  document.getElementById('add-note').value = '';
  document.getElementById('add-category').value = '';
  document.getElementById('add-recurring').checked = false;
  document.getElementById('add-date').value = new Date().toISOString().split('T')[0];
  document.querySelectorAll('.cat-card').forEach(c => c.classList.remove('selected'));
  document.querySelector('input[name="pay"][value="UPI"]').checked = true;
}

function quickAddExpense() {
  const amount  = parseFloat(document.getElementById('quick-amount').value);
  const catBtn  = document.querySelector('.quick-cat-btn.selected');
  const note    = document.getElementById('quick-note').value.trim();
  const category = catBtn ? catBtn.dataset.cat : 'others';

  if (!amount || amount <= 0) { showToast('Enter an amount first', 'error'); return; }

  const today = new Date().toISOString().split('T')[0];
  const expense = {
    id: Date.now().toString(),
    amount, category,
    date: today,
    month_key: today.substring(0, 7),
    note: note || getCat(category).name,
    payment: 'UPI',
    recurring: false,
    created_at: Date.now(),
  };

  const all = getExpenses(State.currentUser);
  all.push(expense);
  saveExpenses(State.currentUser, all);

  document.getElementById('quick-amount').value = '';
  document.getElementById('quick-note').value = '';
  document.querySelectorAll('.quick-cat-btn').forEach(b => b.classList.remove('selected'));

  showToast(`${getCat(category).emoji} Quick add: ${fmt(amount)}`, 'success');
  renderDashboard();
}

// ═══════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════
function renderHistory() {
  const { year, month } = State.currentMonth;
  document.getElementById('history-title').textContent = `Expenses — ${MONTHS[month - 1]} ${year}`;

  // Populate filter
  const filterEl = document.getElementById('history-filter');
  if (filterEl) {
    const current = filterEl.value;
    filterEl.innerHTML = '<option value="">All Categories</option>' + CATEGORIES.map(c => `<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');
    filterEl.value = current;
  }

  let expenses = getMonthExpenses();
  const filterVal = filterEl?.value;
  if (filterVal) expenses = expenses.filter(e => e.category === filterVal);

  // Stats
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const statsEl = document.getElementById('history-stats');
  if (statsEl) statsEl.innerHTML = `
    <div class="hstat"><div class="hstat-val">${fmt(total)}</div><div class="hstat-lbl">Total</div></div>
    <div class="hstat"><div class="hstat-val">${expenses.length}</div><div class="hstat-lbl">Transactions</div></div>
    <div class="hstat"><div class="hstat-val">${expenses.length ? fmt(total / expenses.length) : '₹0'}</div><div class="hstat-lbl">Average</div></div>
    <div class="hstat"><div class="hstat-val">${expenses.length ? fmt(Math.max(...expenses.map(e => e.amount))) : '₹0'}</div><div class="hstat-lbl">Highest</div></div>`;

  // Group by date
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.created_at - a.created_at);
  const byDate = {};
  sorted.forEach(e => {
    const d = e.date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(e);
  });

  const listEl = document.getElementById('history-list');
  if (!listEl) return;

  if (!sorted.length) { listEl.innerHTML = emptyState('No expenses found', '🔍'); return; }

  listEl.innerHTML = Object.entries(byDate).map(([date, exps]) => {
    const dayTotal = exps.reduce((s, e) => s + e.amount, 0);
    const dayLabel = new Date(date + 'T12:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    return `
      <div class="day-group-header" style="display:flex;justify-content:space-between">
        <span>${dayLabel}</span><span style="color:#475569">${fmt(dayTotal)}</span>
      </div>
      ${exps.map(expenseRow).join('')}`;
  }).join('');
}

// ═══════════════════════════════════════════
// EXPENSE ROW TEMPLATE
// ═══════════════════════════════════════════
function expenseRow(e) {
  const cat = getCat(e.category);
  return `
    <div class="expense-item">
      <div class="exp-cat-icon" style="background:${cat.color}18">${cat.emoji}</div>
      <div class="exp-body">
        <div class="exp-note">${e.note}</div>
        <div class="exp-meta">${formatDate(e.date)} &nbsp;·&nbsp; ${e.payment} &nbsp;·&nbsp; <span style="color:${cat.color};font-weight:700">${cat.name}</span>${e.recurring ? ' &nbsp;·&nbsp; 🔄 Recurring' : ''}</div>
      </div>
      <div class="exp-amount">−${fmt(e.amount)}</div>
      <button class="exp-del-btn" onclick="confirmDelete('${e.id}')" title="Delete">🗑</button>
    </div>`;
}

function emptyState(msg, icon = '📋') {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${msg}</p></div>`;
}

// ═══════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════
function confirmDelete(id) {
  const modal = document.getElementById('delete-modal-bg');
  modal.classList.remove('hidden');
  document.getElementById('delete-confirm-btn').onclick = () => {
    const all = getExpenses(State.currentUser).filter(e => e.id !== id);
    saveExpenses(State.currentUser, all);
    modal.classList.add('hidden');
    showToast('Expense deleted', 'info');
    renderAll();
  };
}

function closeDeleteModal() {
  document.getElementById('delete-modal-bg').classList.add('hidden');
}

// ═══════════════════════════════════════════
// BUDGET
// ═══════════════════════════════════════════
function openBudgetSetting() {
  document.getElementById('user-menu').classList.add('hidden');
  document.getElementById('budget-input').value = getBudget(State.currentUser);
  document.getElementById('budget-modal-bg').classList.remove('hidden');
}

function closeBudgetModal(event) {
  if (event && event.target !== document.getElementById('budget-modal-bg')) return;
  document.getElementById('budget-modal-bg').classList.add('hidden');
}

function saveBudget() {
  const val = parseFloat(document.getElementById('budget-input').value);
  if (!val || val <= 0) { showToast('Enter a valid budget', 'error'); return; }
  saveBudgetVal(State.currentUser, val);
  document.getElementById('budget-modal-bg').classList.add('hidden');
  showToast(`Budget set to ${fmt(val)}`, 'success');
  renderDashboard();
}

// ═══════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════
function renderCharts() {
  const expenses = getMonthExpenses();

  // Destroy old charts
  ['donut', 'trend', 'daily', 'payment'].forEach(k => {
    if (State.charts[k]) { try { State.charts[k].destroy(); } catch (_) {} }
  });

  renderDonutChart(expenses);
  renderTrendChart();
  renderDailyChart(expenses);
  renderPaymentChart(expenses);
}

function renderDonutChart(expenses) {
  const ctx = document.getElementById('chart-donut');
  if (!ctx) return;

  const totals = {};
  expenses.forEach(e => totals[e.category] = (totals[e.category] || 0) + e.amount);
  const cats = CATEGORIES.filter(c => totals[c.id]);
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);

  if (!cats.length) {
    ctx.parentElement.innerHTML = emptyState('No data this month');
    return;
  }

  State.charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: cats.map(c => c.name),
      datasets: [{
        data: cats.map(c => totals[c.id] || 0),
        backgroundColor: cats.map(c => c.color),
        borderWidth: 3,
        borderColor: '#fff',
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)} (${Math.round(ctx.raw/grandTotal*100)}%)` } }
      }
    }
  });

  const lbl = document.getElementById('donut-label');
  if (lbl) lbl.innerHTML = `<span class="donut-main">${fmt(grandTotal)}</span><span class="donut-sub">Total</span>`;

  const legend = document.getElementById('chart-legend');
  if (legend) legend.innerHTML = cats.map(c => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${c.color}"></div>
      <span class="legend-name">${c.emoji} ${c.name}</span>
      <span class="legend-amount">${fmt(totals[c.id])}</span>
      <span class="legend-pct">${Math.round((totals[c.id]/grandTotal)*100)}%</span>
    </div>`).join('');
}

function renderTrendChart() {
  const ctx = document.getElementById('chart-trend');
  if (!ctx) return;

  const labels = [];
  const data = [];
  const now = State.currentMonth;

  for (let i = 5; i >= 0; i--) {
    let m = now.month - i, y = now.year;
    if (m < 1) { m += 12; y--; }
    labels.push(MONTHS_SHORT[m - 1] + ' ' + String(y).slice(-2));
    const mk = monthKey(y, m);
    const exps = getExpenses(State.currentUser).filter(e => e.month_key === mk);
    data.push(Math.round(exps.reduce((s, e) => s + e.amount, 0)));
  }

  State.charts.trend = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Spent',
        data,
        backgroundColor: data.map((_, i) => i === 5 ? '#2563eb' : '#bfdbfe'),
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.raw) } } },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: { border: { display: false }, grid: { color: '#f1f5f9' }, ticks: { callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) } }
      }
    }
  });
}

function renderDailyChart(expenses) {
  const ctx = document.getElementById('chart-daily');
  if (!ctx) return;

  const { year, month } = State.currentMonth;
  const daysInMonth = new Date(year, month, 0).getDate();
  const daily = Array(daysInMonth).fill(0);
  expenses.forEach(e => {
    const day = parseInt(e.date.split('-')[2]) - 1;
    if (day >= 0 && day < daysInMonth) daily[day] += e.amount;
  });

  State.charts.daily = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Array.from({ length: daysInMonth }, (_, i) => i + 1),
      datasets: [{
        label: 'Daily',
        data: daily,
        backgroundColor: '#7c3aed44',
        borderColor: '#7c3aed',
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.raw) } } },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 10 } },
        y: { border: { display: false }, grid: { color: '#f1f5f9' }, ticks: { callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) } }
      }
    }
  });
}

function renderPaymentChart(expenses) {
  const ctx = document.getElementById('chart-payment');
  if (!ctx) return;

  const totals = {};
  expenses.forEach(e => totals[e.payment] = (totals[e.payment] || 0) + e.amount);
  const labels = Object.keys(totals);
  const values = Object.values(totals);
  const colors = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626'];

  if (!labels.length) { ctx.parentElement.innerHTML = emptyState('No data this month'); return; }

  State.charts.payment = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 3,
        borderColor: '#fff',
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true, cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 12, weight: '600' }, padding: 12 } },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)}` } }
      }
    }
  });
}

// ═══════════════════════════════════════════
// EXPORT CSV
// ═══════════════════════════════════════════
function exportCSV() {
  const expenses = getMonthExpenses();
  if (!expenses.length) { showToast('No expenses to export', 'warning'); return; }

  const rows = [
    ['Date', 'Category', 'Note', 'Amount', 'Payment', 'Recurring'],
    ...expenses.map(e => [e.date, getCat(e.category).name, e.note, e.amount, e.payment, e.recurring ? 'Yes' : 'No'])
  ];
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const { year, month } = State.currentMonth;
  a.href = url;
  a.download = `expenses_${MONTHS_SHORT[month - 1]}_${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported!', 'success');
}

// ═══════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = icons[type] + '  ' + message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ═══════════════════════════════════════════
// SEED DEMO DATA (first time only)
// ═══════════════════════════════════════════
function seedDemoData() {
  const key = storageKey('vamsi', 'expenses');
  if (localStorage.getItem(key)) return;

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const mk = monthKey(y, m);
  const pad = n => String(n).padStart(2, '0');

  const demos = [
    { cat: 'food',      amount: 450,  note: 'Lunch with team',   day: 3,  pay: 'UPI' },
    { cat: 'transport', amount: 180,  note: 'Ola cab to office', day: 5,  pay: 'UPI' },
    { cat: 'groceries', amount: 1200, note: 'Monthly groceries', day: 7,  pay: 'Cash' },
    { cat: 'food',      amount: 320,  note: 'Dinner Zomato',     day: 9,  pay: 'Card' },
    { cat: 'bills',     amount: 1500, note: 'Electricity bill',  day: 10, pay: 'NetBanking' },
    { cat: 'shopping',  amount: 2800, note: 'New shirt & jeans', day: 12, pay: 'Card' },
    { cat: 'health',    amount: 650,  note: 'Pharmacy',          day: 13, pay: 'Cash' },
    { cat: 'transport', amount: 240,  note: 'Metro recharge',    day: 14, pay: 'UPI' },
    { cat: 'food',      amount: 95,   note: 'Starbucks coffee',  day: 15, pay: 'Card' },
    { cat: 'education', amount: 999,  note: 'Udemy course',      day: 16, pay: 'Card' },
  ].map((d, i) => ({
    id: (1000 + i).toString(),
    amount: d.amount,
    category: d.cat,
    date: `${y}-${pad(m)}-${pad(d.day)}`,
    month_key: mk,
    note: d.note,
    payment: d.pay,
    recurring: false,
    created_at: Date.now() - i * 100000,
  }));

  localStorage.setItem(key, JSON.stringify(demos));
  localStorage.setItem(storageKey('vamsi', 'budget'), '20000');
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  seedDemoData();
  updateMonthLabel();

  // Render add tab to set today's date
  const dateEl = document.getElementById('add-date');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  // Build category grid on load so it's ready
  const grid = document.getElementById('cat-grid');
  if (grid) {
    grid.innerHTML = CATEGORIES.map(cat => `
      <div class="cat-card" data-cat="${cat.id}" onclick="selectCat('${cat.id}')">
        <span class="cat-emoji">${cat.emoji}</span>
        <span class="cat-name">${cat.name}</span>
      </div>`).join('');
  }

  console.log('%c 💰 Expense Tracker', 'font-size:18px;font-weight:900;color:#2563eb');
  console.log('%c Personal — Data stored in localStorage', 'color:#64748b');
  console.log('%c Hint: password is 1234', 'color:#059669');
});

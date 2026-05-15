'use strict';

// ── Categories ──
const CATS = [
  { id:'food',          name:'Food',          emoji:'🍕', color:'#f97316' },
  { id:'transport',     name:'Transport',     emoji:'🚗', color:'#3b82f6' },
  { id:'shopping',      name:'Shopping',      emoji:'🛍️', color:'#ec4899' },
  { id:'entertainment', name:'Fun',           emoji:'🎬', color:'#8b5cf6' },
  { id:'health',        name:'Health',        emoji:'💊', color:'#10b981' },
  { id:'bills',         name:'Bills',         emoji:'🏠', color:'#64748b' },
  { id:'education',     name:'Education',     emoji:'📚', color:'#0891b2' },
  { id:'travel',        name:'Travel',        emoji:'✈️', color:'#f59e0b' },
  { id:'groceries',     name:'Groceries',     emoji:'🛒', color:'#22c55e' },
  { id:'subscriptions', name:'Subscriptions', emoji:'📱', color:'#7c3aed' },
  { id:'dining',        name:'Dining Out',    emoji:'🍽️', color:'#dc2626' },
  { id:'others',        name:'Others',        emoji:'💰', color:'#6b7280' },
];
const CAT_MAP = Object.fromEntries(CATS.map(c => [c.id, c]));

const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_S   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const CURRENCY_SYM = { INR:'₹', USD:'$', EUR:'€', GBP:'£', AED:'د.إ', SGD:'S$' };

const INCOME_TYPES = {
  salary:'💼 Salary', freelance:'💻 Freelance', business:'🏪 Business',
  investment:'📊 Investment', rental:'🏠 Rental', gift:'🎁 Gift', other:'💰 Other',
};

// ── App State ──
const S = {
  uid: null,
  profile: { name:'', avatar:'😎', budget:20000, currency:'INR' },
  month: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
  tab: 'dashboard',
  expenses: [],
  allExpenses: [],
  incomes: [],
  allIncomes: [],
  accounts: [],
  goals: [],
  catBudgets: {},
  recurringBills: [],
  charts: {},
  notifs: [],
  pendingGoalId: null,
  pwaPrompt: null,
};

// ── Format helpers ──
const sym   = ()    => CURRENCY_SYM[S.profile.currency] || '₹';
const fmt   = n     => sym() + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtK  = n     => n >= 1000 ? sym() + (n/1000).toFixed(1)+'k' : fmt(n);
const mkKey = (y,m) => `${y}-${String(m).padStart(2,'0')}`;
const curMK = ()    => mkKey(S.month.year, S.month.month);
const today = ()    => new Date().toISOString().split('T')[0];
const cat   = id    => CAT_MAP[id] || CATS[CATS.length - 1];
const fDate = d     => new Date(d+'T12:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});

// ── DEMO MODE ──
function demoKey(k){ return 'exp_demo_' + k; }
function demoLoad(k){ try{ return JSON.parse(localStorage.getItem(demoKey(k)))||[] }catch{return []} }
function demoSave(k,v){ localStorage.setItem(demoKey(k), JSON.stringify(v)); }

/* ══════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════ */

// Auto-fill email from Render env var (APP_EMAIL)
async function loadAppEmail() {
  try {
    const res = await fetch('/api/app-email');
    const { email } = await res.json();
    const inp = document.getElementById('login-email');
    if (inp && email) {
      inp.value = email;  // pre-fill — user can still edit if needed
    }
  } catch(e) { console.warn('Could not load app email', e); }
}

function loginError(errEl, msg) {
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
  setLoading('login-btn', false, '🔐 Sign In');
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');

  if (!email) return loginError(errEl, 'Enter your email address');
  if (!pass)  return loginError(errEl, 'Enter your password');

  setLoading('login-btn', true, 'Signing in…');

  // ── Step 1: server credential check ──────────────────────────
  let checkOk = false;
  try {
    const res = await fetch('/api/verify-login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password: pass }),
    });
    checkOk = res.ok;
  } catch(e) {
    return loginError(errEl, 'Cannot reach server — check your internet connection.');
  }

  if (!checkOk) return loginError(errEl, 'Incorrect email or password. Try again.');

  // ── Step 2: local mode (Firebase not configured) ──────────────
  if (window.DEMO_MODE) {
    try {
      S.uid     = 'owner';
      S.profile = { name: email.split('@')[0] || 'Owner', avatar:'👤', budget:20000, currency:'INR', email };
      await loadAllData();
      bootApp();
    } catch(e) {
      loginError(errEl, 'Failed to load data. Try refreshing.');
    }
    return;
  }

  // ── Step 3: Firebase authentication ──────────────────────────
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    // onAuthStateChanged() takes over from here → calls bootApp()
  } catch(e) {
    const map = {
      'auth/wrong-password':        'Incorrect password. Check and try again.',
      'auth/invalid-credential':    'Incorrect email or password. Check and try again.',
      'auth/user-not-found':        'No Firebase account found for this email. Create it in Firebase Console → Authentication → Users.',
      'auth/invalid-email':         'Invalid email format.',
      'auth/user-disabled':         'This account has been disabled.',
      'auth/too-many-requests':     'Too many failed attempts — wait a few minutes and try again.',
      'auth/network-request-failed':'Network error — check your internet connection.',
    };
    loginError(errEl, map[e.code] || ('Firebase error: ' + (e.message || e.code)));
  }
}

function handleLogout() {
  closeMenus();
  if (window.DEMO_MODE) { location.reload(); return; }
  auth.signOut();
}

async function setupAuthListener() {
  if (window.DEMO_MODE) return;
  auth.onAuthStateChanged(async user => {
    if (user) {
      S.uid = user.uid;

      // Step 1 — load profile (use defaults if Firestore not ready)
      try {
        let prof = await FS.getUser(user.uid);
        if (!prof) {
          prof = { name: user.displayName || user.email.split('@')[0], avatar:'👤', budget:20000, currency:'INR', email: user.email };
          await FS.setUser(user.uid, prof).catch(()=>{});
        }
        S.profile = { ...prof, email: user.email };
      } catch(e) {
        console.warn('[Auth] Could not load profile, using defaults:', e.message);
        S.profile = { name: user.email.split('@')[0], avatar:'👤', budget:20000, currency:'INR', email: user.email };
      }

      // Step 2 — load all data (continue even if it fails)
      try {
        await loadAllData();
      } catch(e) {
        console.warn('[Auth] Could not load data:', e.message);
      }

      // Step 3 — always boot the app (must be wrapped — errors in async callbacks are silently swallowed)
      try {
        bootApp();
      } catch(e) {
        console.error('[Auth] bootApp threw:', e);
        // Fallback: force-show the app screen even if bootApp partially failed
        document.getElementById('auth-screen')?.classList.add('hidden');
        document.getElementById('app')?.classList.remove('hidden');
        try { switchTab('dashboard'); } catch(_) {}
      }

    } else {
      setLoading('login-btn', false, '🔐 Sign In');
      showAuthScreen();
    }
  });
}

function updateFirebaseStatusBadge() {
  // Auth screen indicator
  const dot  = document.getElementById('fs-dot');
  const text = document.getElementById('fs-text');
  if (dot && text) {
    if (window.fbReady) {
      dot.style.background  = '#10b981';
      text.textContent = '✓ Firebase connected — data syncs to cloud';
    } else {
      dot.style.background  = '#f59e0b';
      text.textContent = '⚠ Demo mode — data stored locally only';
    }
  }
  // Header badge
  const badge = document.getElementById('conn-badge');
  if (badge) {
    badge.title       = window.fbReady ? 'Connected to Firebase' : 'Demo mode — offline';
    badge.style.background = window.fbReady ? '#10b981' : '#f59e0b';
  }
}

function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  loadAppEmail();
}

async function loadAllData() {
  await Promise.all([
    loadMonthExpenses(),
    loadAllExpenses(),
    loadIncomes(),
    loadAllIncomes(),
    loadAccounts(),
    loadGoals(),
    loadCatBudgets(),
    loadRecurring(),
  ]);
}

async function loadAccounts() {
  if (window.DEMO_MODE) {
    S.accounts = demoLoad('accounts');
    if (!S.accounts.length) {
      // Seed two demo accounts for first run
      S.accounts = [
        { id:'acc1', name:'Savings Account', type:'savings', opening_balance:50000, created_at:Date.now() },
        { id:'acc2', name:'Salary Account',  type:'salary',  opening_balance:0,     created_at:Date.now()+1 },
      ];
      demoSave('accounts', S.accounts);
    }
    return;
  }
  S.accounts = await FS.getAccounts(S.uid);
}

/* ══════════════════════════════════════════════
   BOOT APP
══════════════════════════════════════════════ */
function bootApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  ['hdr-avatar','sf-avatar'].forEach(id => setEl(id, S.profile.avatar));
  ['hdr-name','sf-name'].forEach(id    => setEl(id, S.profile.name));
  const sEmail = document.getElementById('s-email');   if (sEmail)    sEmail.textContent   = S.profile.email || '';
  const sName  = document.getElementById('s-name');    if (sName)     sName.value          = S.profile.name  || '';
  const sBudget= document.getElementById('s-budget');  if (sBudget)   sBudget.value        = S.profile.budget || 20000;
  const sCur   = document.getElementById('s-currency');if (sCur)      sCur.value           = S.profile.currency || 'INR';
  buildCategoryGrids();
  updateMonthLabel();
  checkRecurringDue();
  switchTab('dashboard');
  loadTheme();
  // Set today as default income date
  const incDateEl = document.getElementById('income-date');
  if (incDateEl && !incDateEl.value) incDateEl.value = today();
}

function setEl(id, text) { const el=document.getElementById(id); if(el) el.textContent=text; }

/* ══════════════════════════════════════════════
   DATA LOADERS
══════════════════════════════════════════════ */
async function loadMonthExpenses() {
  if (window.DEMO_MODE) { S.expenses = demoLoad('expenses').filter(e => e.month_key === curMK()); return; }
  S.expenses = await FS.getExpensesByMonth(S.uid, curMK());
}

async function loadAllExpenses() {
  if (window.DEMO_MODE) { S.allExpenses = demoLoad('expenses'); return; }
  S.allExpenses = await FS.getAllExpenses(S.uid);
}

async function loadIncomes() {
  if (window.DEMO_MODE) { S.incomes = demoLoad('incomes').filter(i => i.month_key === curMK()); return; }
  S.incomes = await FS.getIncomesByMonth(S.uid, curMK());
}

async function loadAllIncomes() {
  if (window.DEMO_MODE) { S.allIncomes = demoLoad('incomes'); return; }
  S.allIncomes = await FS.getAllIncomes(S.uid);
}

async function loadGoals() {
  if (window.DEMO_MODE) { S.goals = demoLoad('goals'); return; }
  S.goals = await FS.getGoals(S.uid);
}

async function loadCatBudgets() {
  if (window.DEMO_MODE) { S.catBudgets = JSON.parse(localStorage.getItem(demoKey('catbudgets'))||'{}'); return; }
  S.catBudgets = await FS.getCatBudgets(S.uid);
}

async function loadRecurring() {
  if (window.DEMO_MODE) { S.recurringBills = demoLoad('recurring'); return; }
  S.recurringBills = await FS.getRecurring(S.uid);
}

/* ══════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════ */
const TAB_RENDERS = {
  dashboard: renderDashboard,
  add:       renderAddTab,
  income:    renderIncomeTab,
  accounts:  renderAccountsTab,
  history:   renderHistory,
  analytics: renderAnalytics,
  goals:     renderGoals,
  budget:    renderBudget,
  calendar:  renderCalendar,
  settings:  renderSettings,
};

function switchTab(tab) {
  closeMenus();
  S.tab = tab;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.snav-btn,.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${tab}`)?.classList.add('active');
  document.getElementById(`tabt-${tab}`)?.classList.add('active');
  document.querySelector(`.snav-btn[data-tab="${tab}"]`)?.classList.add('active');
  if (TAB_RENDERS[tab]) TAB_RENDERS[tab]();
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  const open = sb.classList.toggle('open');
  ov.classList.toggle('hidden', !open);
}

function closeMenus() {
  document.getElementById('user-menu')?.classList.add('hidden');
  document.getElementById('notif-panel')?.classList.add('hidden');
  const sb = document.getElementById('sidebar');
  if(sb) sb.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.add('hidden');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.header-right') && !e.target.closest('.sidebar')) closeMenus();
});

/* ══════════════════════════════════════════════
   MONTH NAV
══════════════════════════════════════════════ */
async function changeMonth(delta) {
  let { year, month } = S.month;
  month += delta;
  if (month > 12) { month=1; year++; }
  if (month < 1)  { month=12; year--; }
  S.month = { year, month };
  await Promise.all([loadMonthExpenses(), loadIncomes()]);
  updateMonthLabel();
  if (TAB_RENDERS[S.tab]) TAB_RENDERS[S.tab]();
}

function updateMonthLabel() {
  setEl('month-label', `${MONTHS[S.month.month-1]} ${S.month.year}`);
}

/* ══════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════ */
function renderDashboard() {
  const exps   = S.expenses;
  const total  = exps.reduce((s,e) => s+e.amount, 0);
  const budget = S.profile.budget;
  const left   = Math.max(0, budget - total);
  const pct    = budget > 0 ? Math.min(100, (total/budget)*100) : 0;
  const days   = new Date(S.month.year, S.month.month, 0).getDate();
  const isCurrentMonth = S.month.year===new Date().getFullYear() && S.month.month===new Date().getMonth()+1;
  const passed = isCurrentMonth ? new Date().getDate() : days;
  const avg    = passed > 0 ? total/passed : 0;

  // Greeting
  const hr = new Date().getHours();
  const greet = hr<12 ? 'Good morning' : hr<17 ? 'Good afternoon' : 'Good evening';
  setEl('dash-greeting', `${greet}, ${S.profile.name.split(' ')[0] || 'there'}! 👋`);
  setEl('dash-sub', `${MONTHS[S.month.month-1]} ${S.month.year} overview`);

  // Income & savings KPIs
  const incomeTotal = S.incomes.reduce((s,i) => s+i.amount, 0);
  const netSavings  = incomeTotal - total;
  const savingsRate = incomeTotal > 0 ? Math.round(netSavings/incomeTotal*100) : 0;

  // KPI values
  const lm       = getPrevMonthExpenses();
  const lmTotal  = lm.reduce((s,e) => s+e.amount, 0);
  const diff     = total - lmTotal;

  setEl('kpi-spent',        fmtK(total));
  setEl('kpi-vs-last',      lmTotal ? (diff>=0?'↑':'↓')+fmt(Math.abs(diff))+' vs last mo' : '');
  setEl('kpi-left',         fmtK(left));
  setEl('kpi-left-pct',     `${Math.round(100-pct)}% of budget remaining`);
  setEl('kpi-income',       fmtK(incomeTotal));
  setEl('kpi-income-sub',   `${S.incomes.length} income ${S.incomes.length===1?'entry':'entries'}`);
  setEl('kpi-savings',      netSavings >= 0 ? fmtK(netSavings) : '-'+fmtK(Math.abs(netSavings)));
  setEl('kpi-savings-rate', incomeTotal > 0 ? `${savingsRate}% savings rate` : 'Add income to track');
  setEl('kpi-tx',           exps.length);
  setEl('kpi-avg',          `${fmt(avg)}/day avg`);
  setEl('kpi-streak',       calcNoSpendStreak());

  // Style net savings
  const savingsEl = document.getElementById('kpi-savings');
  if (savingsEl) savingsEl.style.color = netSavings >= 0 ? 'var(--success)' : 'var(--danger)';

  // Budget bar
  const fill = document.getElementById('budget-fill');
  if (fill) {
    fill.style.width = pct+'%';
    fill.style.background = pct>=90 ? 'linear-gradient(90deg,#b91c1c,#dc2626)' : pct>=75 ? 'linear-gradient(90deg,#b45309,#d97706)' : 'linear-gradient(90deg,#1d4ed8,#3b82f6)';
  }
  setEl('budget-spent-lbl', `${fmt(total)} spent (${Math.round(pct)}%)`);
  setEl('budget-ttl-lbl',   `of ${fmt(budget)}`);

  renderReportCard(pct, exps);
  renderPrediction(total, avg, days, passed, budget);
  renderWeekWidget();
  buildQuickCats();
  renderInsights(exps, total, pct, lmTotal, incomeTotal, savingsRate);

  const recentEl = document.getElementById('recent-list');
  const recent   = [...exps].sort((a,b) => b.date.localeCompare(a.date)).slice(0,6);
  if (recentEl) recentEl.innerHTML = recent.length ? recent.map(e => expRow(e)).join('') : emptyState('No expenses this month','🧾');

  renderTopCats(exps, document.getElementById('top-cats'));
}

function getPrevMonthExpenses() {
  let m = S.month.month-1, y = S.month.year;
  if (m<1) { m=12; y--; }
  return S.allExpenses.filter(e => e.month_key === mkKey(y,m));
}

function calcNoSpendStreak() {
  const allDates = new Set(S.allExpenses.map(e => e.date));
  let streak=0, d=new Date(); d.setDate(d.getDate()-1);
  for (let i=0; i<60; i++) {
    if (allDates.has(d.toISOString().split('T')[0])) break;
    streak++;
    d.setDate(d.getDate()-1);
  }
  return streak;
}

function renderReportCard(pct, exps) {
  const circle = document.getElementById('grade-circle');
  const msg    = document.getElementById('grade-msg');
  if (!circle) return;
  let grade='A+', col='#059669', shadow='rgba(5,150,105,.3)', text='Amazing! Well under budget 🎉';
  if      (pct>=100) { grade='F';  col='#dc2626'; shadow='rgba(220,38,38,.3)';   text='Budget exceeded ⚠️'; }
  else if (pct>=90)  { grade='C';  col='#d97706'; shadow='rgba(217,119,6,.3)';   text='Careful — nearly out!'; }
  else if (pct>=75)  { grade='B';  col='#0891b2'; shadow='rgba(8,145,178,.3)';   text='Good — watch spending'; }
  else if (pct>=50)  { grade='A';  col='#7c3aed'; shadow='rgba(124,58,237,.3)';  text='Well done! Keep it up'; }
  circle.textContent = grade;
  circle.style.background = `linear-gradient(135deg,${col},${col}aa)`;
  circle.style.boxShadow  = `0 6px 20px ${shadow}`;
  if(msg) msg.textContent = text;
}

function renderPrediction(total, avg, days, passed, budget) {
  const predicted = passed > 0 ? Math.round((total/passed)*days) : 0;
  const pct = budget > 0 ? Math.min(120, (predicted/budget)*100) : 0;
  setEl('predict-val', fmt(predicted));
  setEl('predict-sub', `at ${fmt(avg)}/day → by end of ${MONTHS[S.month.month-1]}`);
  const bar = document.getElementById('predict-bar-fill');
  if (bar) {
    bar.style.width      = pct+'%';
    bar.style.background = pct>=100 ? '#dc2626' : pct>=80 ? '#d97706' : '#2563eb';
  }
}

function renderWeekWidget() {
  const now = new Date();
  const dayOfWeek  = now.getDay();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate()-dayOfWeek); startOfWeek.setHours(0,0,0,0);
  const endOfWeek   = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate()+6);

  const inRange = (e, s, end) => { const d=new Date(e.date+'T12:00'); return d>=s && d<=end; };
  const thisWeek = S.expenses.filter(e => inRange(e, startOfWeek, endOfWeek));
  const prevStart = new Date(startOfWeek); prevStart.setDate(prevStart.getDate()-7);
  const prevEnd   = new Date(endOfWeek);   prevEnd.setDate(prevEnd.getDate()-7);
  const lastWeek  = S.expenses.filter(e => inRange(e, prevStart, prevEnd));

  const thisTotal  = thisWeek.reduce((s,e) => s+e.amount, 0);
  const lastTotal  = lastWeek.reduce((s,e) => s+e.amount, 0);
  const diff       = thisTotal - lastTotal;
  const weekBudget = Math.round(S.profile.budget/4.33);
  const pct        = weekBudget > 0 ? Math.min(100, thisTotal/weekBudget*100) : 0;

  setEl('week-total',      fmtK(thisTotal));
  setEl('week-budget-lbl', fmt(weekBudget));
  const subEl = document.getElementById('week-sub');
  if (subEl) {
    if (lastTotal > 0) {
      subEl.textContent = (diff>=0 ? '↑'+fmt(diff) : '↓'+fmt(Math.abs(diff)))+' vs last week';
      subEl.style.color = diff>0 ? 'var(--danger)' : 'var(--success)';
    } else {
      subEl.textContent = thisWeek.length+' transaction'+(thisWeek.length!==1?'s':'');
      subEl.style.color = 'var(--text3)';
    }
  }
  const fill = document.getElementById('week-bar-fill');
  if (fill) { fill.style.width=pct+'%'; fill.style.background=pct>=90?'#dc2626':pct>=75?'#d97706':'#059669'; }
}

function renderInsights(exps, total, pct, lmTotal, incomeTotal, savingsRate) {
  const list = document.getElementById('insights-list');
  if (!list) return;
  if (!exps.length) { list.innerHTML='<div style="padding:.75rem;color:var(--text3);font-size:.85rem">Add expenses to see personalised insights 💡</div>'; return; }

  const insights = [];

  // Top category
  const catTotals={};
  exps.forEach(e => catTotals[e.category]=(catTotals[e.category]||0)+e.amount);
  const topCat = Object.entries(catTotals).sort((a,b)=>b[1]-a[1])[0];
  if (topCat) {
    const c=cat(topCat[0]);
    insights.push({ icon:c.emoji, title:`${c.name} is your top category`, sub:`${fmt(topCat[1])} — ${Math.round(topCat[1]/total*100)}% of spending`, tag:'tip', tagText:'Top Spend' });
  }

  // Budget alert
  if (pct>=100)      insights.push({ icon:'🚨', title:'Budget exceeded!', sub:`Spent ${fmt(exps.reduce((s,e)=>s+e.amount,0)-S.profile.budget)} over budget`, tag:'bad', tagText:'Over budget' });
  else if (pct>=90)  insights.push({ icon:'⚠️', title:'Budget almost exhausted', sub:`Only ${fmt(S.profile.budget-total)} remaining (${Math.round(100-pct)}%)`, tag:'bad', tagText:'Budget alert' });
  else if (pct>=75)  insights.push({ icon:'🔔', title:'Approaching budget limit', sub:`${Math.round(pct)}% used — slow down spending`, tag:'warn', tagText:'Heads up' });

  // Savings rate insight
  if (incomeTotal > 0) {
    if (savingsRate >= 30)      insights.push({ icon:'🏆', title:`Excellent! Saving ${savingsRate}% of income`, sub:`${fmt(incomeTotal-total)} saved this month`, tag:'good', tagText:'Great savings' });
    else if (savingsRate >= 20) insights.push({ icon:'👍', title:`Good savings rate: ${savingsRate}%`, sub:'Target 30%+ for financial freedom', tag:'good', tagText:'Good savings' });
    else if (savingsRate < 10)  insights.push({ icon:'💡', title:`Low savings rate: ${savingsRate}%`, sub:'Try to reduce spending to save more', tag:'warn', tagText:'Save more' });
  }

  // vs last month
  if (lmTotal > 0) {
    const chg = ((total-lmTotal)/lmTotal*100).toFixed(0);
    const less = chg < 0;
    insights.push({ icon:less?'📉':'📈', title:less?`Spending ${Math.abs(chg)}% less than last month`:`Spending ${chg}% more than last month`, sub:`Last month: ${fmt(lmTotal)}`, tag:less?'good':'warn', tagText:less?'Improvement':'Watch out' });
  }

  // Day of week pattern
  const daySpends={};
  exps.forEach(e => { const dow=new Date(e.date+'T12:00').getDay(); daySpends[dow]=(daySpends[dow]||0)+e.amount; });
  const topDay = Object.entries(daySpends).sort((a,b)=>b[1]-a[1])[0];
  if (topDay) insights.push({ icon:'📅', title:`You spend most on ${DAYS_S[topDay[0]]}s`, sub:'Consider planning purchases on other days', tag:'tip', tagText:'Pattern' });

  // No-spend streak
  const streak = calcNoSpendStreak();
  if (streak >= 3) insights.push({ icon:'🔥', title:`${streak}-day no-spend streak!`, sub:'Excellent discipline — keep going!', tag:'good', tagText:'Streak' });

  // High tx count
  if (exps.length > 20) insights.push({ icon:'🧾', title:`${exps.length} transactions this month`, sub:'Consider consolidating small purchases', tag:'tip', tagText:'Insight' });

  list.innerHTML = insights.slice(0,5).map(i => `
    <div class="insight-item">
      <div class="insight-icon">${i.icon}</div>
      <div class="insight-text">
        <p>${i.title}</p>
        <span>${i.sub}</span>
        <span class="insight-tag ${i.tag}">${i.tagText}</span>
      </div>
    </div>`).join('');
}

function renderTopCats(exps, container) {
  if (!container) return;
  const totals={};
  exps.forEach(e => totals[e.category]=(totals[e.category]||0)+e.amount);
  const grand  = Object.values(totals).reduce((s,v)=>s+v,0)||1;
  const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,5);
  container.innerHTML = sorted.length ? sorted.map(([id,amt])=>{
    const c=cat(id), pct=(amt/grand*100);
    return `<div class="top-cat-row"><span class="tci">${c.emoji}</span><span class="tcn">${c.name}</span><div class="tcbar"><div class="tcbar-bg"><div class="tcbar-fill" style="width:${pct}%;background:${c.color};height:100%;border-radius:50px"></div></div></div><span class="tca">${fmtK(amt)}</span></div>`;
  }).join('') : '<p style="padding:1rem;color:var(--text3);font-size:.85rem">No data yet</p>';
}

/* ══════════════════════════════════════════════
   INCOME TAB
══════════════════════════════════════════════ */
function renderIncomeTab() {
  const incomeTotal = S.incomes.reduce((s,i) => s+i.amount, 0);
  const expTotal    = S.expenses.reduce((s,e) => s+e.amount, 0);
  const netSavings  = incomeTotal - expTotal;
  const savingsRate = incomeTotal > 0 ? Math.round(netSavings/incomeTotal*100) : 0;

  setEl('inc-total',   fmt(incomeTotal));
  setEl('inc-count',   `${S.incomes.length} ${S.incomes.length===1?'entry':'entries'}`);
  setEl('inc-exp',     fmt(expTotal));
  setEl('inc-savings', netSavings>=0 ? fmt(netSavings) : '-'+fmt(Math.abs(netSavings)));
  setEl('inc-rate',    incomeTotal>0 ? `${savingsRate}% savings rate` : 'No income recorded');

  const savingsEl = document.getElementById('inc-savings');
  if (savingsEl) savingsEl.style.color = netSavings>=0 ? 'var(--success)' : 'var(--danger)';

  const pct  = Math.min(100, savingsRate > 0 ? savingsRate : 0);
  const fill = document.getElementById('savings-fill');
  if (fill) { fill.style.width=pct+'%'; fill.style.background = savingsRate>=20 ? 'linear-gradient(90deg,#059669,#10b981)' : savingsRate>=10 ? 'linear-gradient(90deg,#d97706,#f59e0b)' : 'linear-gradient(90deg,#dc2626,#ef4444)'; }
  setEl('savings-rate-lbl',    `${savingsRate}% saved`);
  setEl('savings-target-lbl',  savingsRate>=20 ? '✓ Great job!' : 'target: 20%+');

  renderIncomeList();
}

function renderIncomeList() {
  const el = document.getElementById('income-list');
  if (!el) return;
  if (!S.incomes.length) { el.innerHTML=emptyState('No income entries this month. Click + Add Income to start.','💵'); return; }
  const sorted = [...S.incomes].sort((a,b) => b.date.localeCompare(a.date));
  el.innerHTML = sorted.map(i => `
    <div class="exp-item">
      <div class="exp-cat-icon" style="background:#d1fae518">${getIncomeEmoji(i.category)}</div>
      <div class="exp-body">
        <div class="exp-note">${i.source}</div>
        <div class="exp-meta">${fDate(i.date)} · ${INCOME_TYPES[i.category]||'💰 Other'}${i.note?` · ${i.note}`:''}</div>
      </div>
      <div class="exp-amount" style="color:var(--success)">+${fmt(i.amount)}</div>
      <div class="exp-acts"><button class="exp-act-btn del" onclick="deleteIncome('${i.id}')" title="Delete">🗑</button></div>
    </div>`).join('');
}

function getIncomeEmoji(type) {
  const map={salary:'💼',freelance:'💻',business:'🏪',investment:'📊',rental:'🏠',gift:'🎁',other:'💰'};
  return map[type]||'💰';
}

function openIncomeModal() {
  closeMenus();
  const dateEl = document.getElementById('income-date');
  if (dateEl && !dateEl.value) dateEl.value = today();
  populateAccountDropdowns();
  const hint = document.getElementById('inc-closing-bal');
  if (hint) hint.textContent = '';
  document.getElementById('add-income-modal').classList.remove('hidden');
}

async function addIncome() {
  const amount = parseFloat(document.getElementById('income-amount').value);
  const source = document.getElementById('income-source').value.trim();
  const type   = document.getElementById('income-type').value;
  const date   = document.getElementById('income-date').value;
  const note   = document.getElementById('income-note').value.trim();

  if (!amount||amount<=0) { showToast('Enter a valid amount','error'); return; }
  if (!source)            { showToast('Enter income source (e.g. Salary, Freelance)','error'); return; }
  if (!date)              { showToast('Select a date','error'); return; }

  const income = { amount, source, category:type, date, month_key:date.substring(0,7), note,
    account_id: document.getElementById('income-account')?.value || null };

  try {
    if (window.DEMO_MODE) {
      income.id = Date.now().toString(); income.created_at = Date.now();
      const all = demoLoad('incomes'); all.push(income); demoSave('incomes', all);
    } else {
      income.id = await FS.addIncome(S.uid, income);
    }
    if (income.month_key === curMK()) { S.incomes.push(income); }
    S.allIncomes.push(income);
    closeModal('add-income-modal');
    document.getElementById('income-amount').value = '';
    document.getElementById('income-source').value = '';
    document.getElementById('income-note').value   = '';
    showToast(`✅ Income ${fmt(amount)} added!`, 'success');
    if (S.tab==='dashboard') renderDashboard();
    if (S.tab==='income')    renderIncomeTab();
  } catch(e) { showToast('Failed to add income: '+e.message, 'error'); }
}

async function deleteIncome(id) {
  try {
    if (window.DEMO_MODE) { const all=demoLoad('incomes').filter(i=>i.id!==id); demoSave('incomes',all); }
    else await FS.deleteIncome(S.uid, id);
    S.incomes    = S.incomes.filter(i=>i.id!==id);
    S.allIncomes = S.allIncomes.filter(i=>i.id!==id);
    showToast('Income entry removed','info');
    if (S.tab==='income')    renderIncomeTab();
    if (S.tab==='dashboard') renderDashboard();
  } catch(e) { showToast('Failed','error'); }
}

/* ══════════════════════════════════════════════
   ADD EXPENSE
══════════════════════════════════════════════ */
function renderAddTab() {
  const dateEl = document.getElementById('add-date');
  if (dateEl && !dateEl.value) dateEl.value = today();
  const editCat = document.getElementById('edit-cat');
  if (editCat && !editCat.options.length) {
    editCat.innerHTML = CATS.map(c=>`<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');
  }
  populateAccountDropdowns();
}

/* ══════════════════════════════════════════════
   ACCOUNTS
══════════════════════════════════════════════ */

const ACC_TYPES = {
  savings:    { emoji:'🏦', label:'Savings Account' },
  salary:     { emoji:'💼', label:'Salary Account'  },
  cash:       { emoji:'💵', label:'Cash / Wallet'   },
  credit:     { emoji:'💳', label:'Credit Card'     },
  investment: { emoji:'📊', label:'Investment'      },
  other:      { emoji:'🏧', label:'Other'           },
};

function accEmoji(type) { return (ACC_TYPES[type]||ACC_TYPES.other).emoji; }

// Compute current balance of an account from opening balance + all transactions
function computeAccountBalance(accId) {
  const acc = S.accounts.find(a => a.id === accId);
  if (!acc) return 0;
  const credits = S.allIncomes.filter(i  => i.account_id === accId).reduce((s,i) => s + Number(i.amount), 0);
  const debits  = S.allExpenses.filter(e => e.account_id === accId).reduce((s,e) => s + Number(e.amount), 0);
  return Number(acc.opening_balance || 0) + credits - debits;
}

// Build the sorted ledger for one or all accounts with running closing balance
function buildLedger(accId) {
  let expenses = S.allExpenses.filter(e => e.account_id && (accId ? e.account_id === accId : true));
  let incomes  = S.allIncomes.filter(i  => i.account_id && (accId ? i.account_id === accId : true));

  const rows = [
    ...expenses.map(e => ({ ...e, _kind:'debit',  _label: e.note||cat(e.category).name })),
    ...incomes.map(i  => ({ ...i, _kind:'credit', _label: i.source||'Income' })),
  ].sort((a,b) => new Date(a.date) - new Date(b.date));

  // Compute running balance per account
  const balances = {};
  S.accounts.forEach(a => { balances[a.id] = Number(a.opening_balance || 0); });

  return rows.map(r => {
    const aid = r.account_id;
    if (balances[aid] === undefined) balances[aid] = 0;
    if (r._kind === 'credit') balances[aid] += Number(r.amount);
    else                       balances[aid] -= Number(r.amount);
    return { ...r, _closing: balances[aid] };
  }).reverse(); // newest first
}

function renderAccountsTab() {
  // Net worth
  const totalNet = S.accounts.reduce((s,a) => s + computeAccountBalance(a.id), 0);
  const nwEl = document.getElementById('acc-net-worth');
  if (nwEl) nwEl.textContent = fmt(totalNet);

  // Account cards
  const grid = document.getElementById('acc-cards-grid');
  if (grid) {
    if (!S.accounts.length) {
      grid.innerHTML = `<div class="empty-state" style="padding:2rem">
        <span class="ei">💳</span>
        <p>No accounts yet. Click <b>+ Add Account</b> to get started.</p></div>`;
    } else {
      grid.innerHTML = S.accounts.map(acc => {
        const bal     = computeAccountBalance(acc.id);
        const credits = S.allIncomes.filter(i => i.account_id === acc.id).reduce((s,i) => s + Number(i.amount), 0);
        const debits  = S.allExpenses.filter(e => e.account_id === acc.id).reduce((s,e) => s + Number(e.amount), 0);
        const isPos   = bal >= 0;
        return `<div class="acc-card">
          <div class="acc-card-top">
            <div class="acc-icon">${accEmoji(acc.type)}</div>
            <div class="acc-info">
              <div class="acc-name">${acc.name}</div>
              <div class="acc-type-lbl">${(ACC_TYPES[acc.type]||ACC_TYPES.other).label}</div>
            </div>
            <button class="exp-act-btn del" onclick="deleteAccount('${acc.id}')" title="Delete account">🗑</button>
          </div>
          <div class="acc-balance ${isPos?'pos':'neg'}">${fmt(bal)}</div>
          <div class="acc-stats">
            <span class="acc-stat-item credit">↑ ${fmt(credits)} in</span>
            <span class="acc-stat-item debit">↓ ${fmt(debits)} out</span>
            <span class="acc-stat-item">Opening: ${fmt(acc.opening_balance||0)}</span>
          </div>
        </div>`;
      }).join('');
    }
  }

  // Populate ledger filter dropdown
  const filter = document.getElementById('acc-ledger-filter');
  if (filter) {
    const selected = filter.value;
    filter.innerHTML = `<option value="">All Accounts</option>` +
      S.accounts.map(a => `<option value="${a.id}" ${a.id===selected?'selected':''}>${accEmoji(a.type)} ${a.name}</option>`).join('');
  }

  // Ledger
  const ledger = document.getElementById('acc-ledger');
  if (!ledger) return;
  const rows = buildLedger(filter?.value || '');
  if (!rows.length) {
    ledger.innerHTML = `<div class="empty-state"><span class="ei">📒</span><p>No transactions linked to any account yet.<br>When you add expenses or income, select an account to see them here.</p></div>`;
    return;
  }
  ledger.innerHTML = rows.map(r => {
    const acc  = S.accounts.find(a => a.id === r.account_id);
    const isC  = r._kind === 'credit';
    return `<div class="ledger-row">
      <div class="ledger-icon">${isC ? (accEmoji(acc?.type)||'💵') : cat(r.category)?.emoji||'💰'}</div>
      <div class="ledger-body">
        <div class="ledger-label">${r._label}</div>
        <div class="ledger-meta">${fDate(r.date)} · ${acc ? accEmoji(acc.type)+' '+acc.name : 'Unknown account'}</div>
      </div>
      <div class="ledger-right">
        <div class="ledger-amount ${isC?'credit':'debit'}">${isC?'+':'-'}${fmt(r.amount)}</div>
        <div class="ledger-closing">Balance: ${fmt(r._closing)}</div>
      </div>
    </div>`;
  }).join('');
}

function openAddAccountModal() {
  document.getElementById('acc-name').value    = '';
  document.getElementById('acc-type').value    = 'savings';
  document.getElementById('acc-opening').value = '';
  document.getElementById('add-account-modal').classList.remove('hidden');
}

async function addAccount() {
  const name    = document.getElementById('acc-name').value.trim();
  const type    = document.getElementById('acc-type').value;
  const opening = parseFloat(document.getElementById('acc-opening').value) || 0;
  if (!name) { showToast('Enter an account name','error'); return; }
  const data = { name, type, opening_balance: opening };
  if (window.DEMO_MODE) {
    data.id = 'acc_' + Date.now();
    data.created_at = Date.now();
    S.accounts.push(data);
    demoSave('accounts', S.accounts);
  } else {
    data.id = await FS.addAccount(S.uid, data);
    S.accounts.push(data);
  }
  closeModal('add-account-modal');
  populateAccountDropdowns();
  renderAccountsTab();
  showToast(`${accEmoji(type)} "${name}" account created!`, 'success');
}

async function deleteAccount(id) {
  if (!confirm('Delete this account? This won\'t delete transactions, just unlinks them.')) return;
  if (window.DEMO_MODE) {
    S.accounts = S.accounts.filter(a => a.id !== id);
    demoSave('accounts', S.accounts);
  } else {
    await FS.deleteAccount(S.uid, id);
    S.accounts = S.accounts.filter(a => a.id !== id);
  }
  populateAccountDropdowns();
  renderAccountsTab();
  showToast('Account deleted','success');
}

// Fill account <select> dropdowns in add-expense and income modal
function populateAccountDropdowns() {
  const opts = `<option value="">— No account selected —</option>` +
    S.accounts.map(a => `<option value="${a.id}">${accEmoji(a.type)} ${a.name} — ${fmt(computeAccountBalance(a.id))}</option>`).join('');
  ['add-account','income-account'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

// Show closing balance hint when account or amount changes — expense
function updateExpClosingBal() {
  const accId  = document.getElementById('add-account')?.value;
  const amount = parseFloat(document.getElementById('add-amount')?.value) || 0;
  const hint   = document.getElementById('exp-closing-bal');
  if (!hint) return;
  if (!accId) { hint.textContent = '—'; hint.className='closing-bal-hint'; return; }
  const bal    = computeAccountBalance(accId);
  const after  = bal - amount;
  hint.textContent = fmt(after) + (after < 0 ? ' ⚠ Overdraft' : '');
  hint.className   = 'closing-bal-hint ' + (after < 0 ? 'neg' : 'pos');
}

// Show closing balance hint — income
function updateIncClosingBal() {
  const accId  = document.getElementById('income-account')?.value;
  const amount = parseFloat(document.getElementById('income-amount')?.value) || 0;
  const hint   = document.getElementById('inc-closing-bal');
  if (!hint) return;
  if (!accId) { hint.textContent = ''; return; }
  const bal   = computeAccountBalance(accId);
  const after = bal + amount;
  hint.textContent = `Balance after credit: ${fmt(after)}`;
  hint.className   = 'closing-bal-hint pos';
}

function buildCategoryGrids() {
  const grid = document.getElementById('add-cat-grid');
  if (grid) grid.innerHTML = CATS.map(c=>`
    <div class="cat-card" data-cat="${c.id}" onclick="selectCat('${c.id}')">
      <span class="cat-emoji">${c.emoji}</span>
      <span class="cat-label">${c.name}</span>
    </div>`).join('');

  buildQuickCats();

  const recSel = document.getElementById('rec-cat');
  if (recSel) recSel.innerHTML = CATS.map(c=>`<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');

  const histFilter = document.getElementById('hist-cat-filter');
  if (histFilter) histFilter.innerHTML = '<option value="">All Categories</option>' + CATS.map(c=>`<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');

  const editCat = document.getElementById('edit-cat');
  if (editCat) editCat.innerHTML = CATS.map(c=>`<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');
}

function buildQuickCats() {
  const el = document.getElementById('q-cats');
  if (!el) return;
  el.innerHTML = CATS.slice(0,6).map(c=>`<button class="q-cat-btn" data-cat="${c.id}" onclick="selQuickCat('${c.id}')">${c.emoji} ${c.name}</button>`).join('');
}

function selectCat(id) {
  document.querySelectorAll('.cat-card').forEach(c => c.classList.toggle('sel', c.dataset.cat===id));
  document.getElementById('add-cat').value = id;
}

function selQuickCat(id) {
  document.querySelectorAll('.q-cat-btn').forEach(b => b.classList.toggle('sel', b.dataset.cat===id));
}

function toggleRecurring() {
  document.getElementById('recurring-sub').classList.toggle('hidden', !document.getElementById('add-recurring').checked);
}

function toggleSplit() {
  document.getElementById('split-sub').classList.toggle('hidden', !document.getElementById('add-split').checked);
}

function updateCurrencySymbol() {
  S.profile.currency = document.getElementById('add-currency').value;
}

async function addExpense() {
  const amount  = parseFloat(document.getElementById('add-amount').value);
  const catId   = document.getElementById('add-cat').value;
  const date    = document.getElementById('add-date').value;
  const note    = document.getElementById('add-note').value.trim();
  const tagsRaw = document.getElementById('add-tags').value;
  const payment = document.querySelector('input[name="pay"]:checked')?.value || 'UPI';
  const recurring = document.getElementById('add-recurring').checked;
  const recFreq   = document.getElementById('add-freq')?.value || 'monthly';
  const split     = document.getElementById('add-split')?.checked;
  const splitWith = document.getElementById('add-split-with')?.value.trim();

  if (!amount||amount<=0) { showToast('Enter a valid amount','error'); return; }
  if (!catId)             { showToast('Select a category','error'); return; }
  if (!date)              { showToast('Select a date','error'); return; }

  const exp = {
    amount, currency: S.profile.currency||'INR', category:catId, date,
    month_key: date.substring(0,7), note: note||cat(catId).name,
    tags: tagsRaw.split(',').map(t=>t.trim()).filter(Boolean),
    payment, recurring, recurring_freq: recurring?recFreq:null,
    split_with: split?splitWith:null, receipt_url:null,
    account_id: document.getElementById('add-account')?.value || null,
  };

  try {
    if (window.DEMO_MODE) {
      exp.id = Date.now().toString(); exp.created_at = Date.now();
      const all = demoLoad('expenses'); all.push(exp); demoSave('expenses', all);
    } else {
      exp.id = await FS.addExpense(S.uid, exp);
    }
    if (S._receiptFile) {
      try {
        const fd = new FormData();
        fd.append('file', S._receiptFile);
        const up = await fetch('/api/upload-receipt', { method:'POST', body:fd });
        if (up.ok) {
          const { url } = await up.json();
          exp.receipt_url = url;
          if (window.DEMO_MODE) {
            const all = demoLoad('expenses');
            const idx = all.findIndex(x => x.id === exp.id);
            if (idx !== -1) { all[idx].receipt_url = url; demoSave('expenses', all); }
          } else {
            await FS.updateExpense(S.uid, exp.id, { receipt_url: url });
          }
        } else { console.warn('Receipt upload failed', await up.text()); }
      } catch(e) { console.warn('Receipt upload failed', e); }
    }
    if (exp.month_key===curMK()) S.expenses.unshift(exp);
    S.allExpenses.unshift(exp);
    showToast(`${cat(catId).emoji} ${fmt(amount)} added!`, 'success');
    clearAddForm();
    checkBudgetAlert(S.expenses.reduce((s,e)=>s+e.amount,0));
  } catch(e) { showToast('Failed: '+e.message, 'error'); }
}

async function quickAdd() {
  const amount = parseFloat(document.getElementById('q-amount').value);
  const catBtn = document.querySelector('.q-cat-btn.sel');
  const catId  = catBtn ? catBtn.dataset.cat : 'others';
  const note   = document.getElementById('q-note').value.trim();
  if (!amount||amount<=0) { showToast('Enter amount','error'); return; }

  const exp = {
    amount, currency:'INR', category:catId,
    date:today(), month_key:today().substring(0,7),
    note:note||cat(catId).name, tags:[], payment:'UPI',
    recurring:false, split_with:null, receipt_url:null,
  };
  try {
    if (window.DEMO_MODE) { exp.id=Date.now().toString(); exp.created_at=Date.now(); const all=demoLoad('expenses'); all.push(exp); demoSave('expenses',all); }
    else exp.id = await FS.addExpense(S.uid, exp);
    if (exp.month_key===curMK()) S.expenses.unshift(exp);
    S.allExpenses.unshift(exp);
    document.getElementById('q-amount').value='';
    document.getElementById('q-note').value='';
    document.querySelectorAll('.q-cat-btn').forEach(b=>b.classList.remove('sel'));
    showToast(`⚡ ${cat(catId).emoji} ${fmt(amount)} added!`,'success');
    renderDashboard();
    checkBudgetAlert(S.expenses.reduce((s,e)=>s+e.amount,0));
  } catch(e) { showToast('Failed','error'); }
}

// Duplicate an expense with today's date
async function duplicateExpense(id) {
  const orig = S.expenses.find(e=>e.id===id) || S.allExpenses.find(e=>e.id===id);
  if (!orig) return;
  const exp = { ...orig, date:today(), month_key:today().substring(0,7) };
  delete exp.id; delete exp.created_at; delete exp.updated_at; delete exp.receipt_url;
  try {
    if (window.DEMO_MODE) { exp.id=Date.now().toString(); exp.created_at=Date.now(); const all=demoLoad('expenses'); all.push(exp); demoSave('expenses',all); }
    else exp.id = await FS.addExpense(S.uid, exp);
    if (exp.month_key===curMK()) S.expenses.unshift(exp);
    S.allExpenses.unshift(exp);
    showToast(`📋 Duplicated: ${orig.note}`,'success');
    if(S.tab==='history')   renderHistory();
    if(S.tab==='dashboard') renderDashboard();
  } catch(e) { showToast('Failed','error'); }
}

function clearAddForm() {
  ['add-amount','add-note','add-tags'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('add-cat').value = '';
  document.getElementById('add-date').value = today();
  document.getElementById('add-recurring').checked = false;
  document.getElementById('add-split').checked = false;
  document.getElementById('recurring-sub').classList.add('hidden');
  document.getElementById('split-sub').classList.add('hidden');
  document.querySelectorAll('.cat-card').forEach(c=>c.classList.remove('sel'));
  const payUpi = document.querySelector('input[name="pay"][value="UPI"]');
  if (payUpi) payUpi.checked = true;
  removeReceipt();
}

function checkBudgetAlert(total) {
  if (!document.getElementById('s-alerts')?.checked && document.getElementById('s-alerts')) return;
  const pct = total/S.profile.budget*100;
  if (pct>=100)      addNotif('🚨','Budget Exceeded!',`Spent ${fmt(total)} — over your ${fmt(S.profile.budget)} budget`);
  else if (pct>=90 && pct<91) addNotif('⚠️','90% Budget Used',`Only ${fmt(S.profile.budget-total)} left`);
  else if (pct>=75 && pct<76) addNotif('🔔','75% Budget Used',`${fmt(S.profile.budget-total)} remaining`);
}

/* ══════════════════════════════════════════════
   RECEIPT UPLOAD
══════════════════════════════════════════════ */
function onDragOver(e){ e.preventDefault(); document.getElementById('receipt-zone')?.classList.add('dragover'); }
function onDrop(e){ e.preventDefault(); document.getElementById('receipt-zone')?.classList.remove('dragover'); const f=e.dataTransfer?.files[0]; if(f) processFile(f); }
function onFileSelect(e){ const f=e.target.files[0]; if(f) processFile(f); }

function processFile(file) {
  if (file.size > 10*1024*1024) { showToast('File too large — max 10MB','error'); return; }
  S._receiptFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    const preview=document.getElementById('receipt-preview');
    const img=document.getElementById('receipt-img');
    const zone=document.getElementById('receipt-zone');
    if (file.type.startsWith('image/') && img) {
      img.src=ev.target.result;
      if(preview) preview.classList.remove('hidden');
      if(zone)    zone.classList.add('hidden');
      setEl('receipt-label','Receipt attached ✓');
    }
  };
  reader.readAsDataURL(file);
  showToast('Receipt attached 📎','success');
}

function removeReceipt() {
  S._receiptFile = null;
  document.getElementById('receipt-preview')?.classList.add('hidden');
  document.getElementById('receipt-zone')?.classList.remove('hidden');
  const img=document.getElementById('receipt-img'); if(img) img.src='';
  const fi=document.getElementById('receipt-file'); if(fi)  fi.value='';
  setEl('receipt-label','Tap or drag to upload receipt');
}

/* ══════════════════════════════════════════════
   HISTORY
══════════════════════════════════════════════ */
function renderHistory() {
  const {year, month} = S.month;
  setEl('hist-title', `History — ${MONTHS[month-1]} ${year}`);

  let exps = [...S.expenses];
  const search  = document.getElementById('hist-search')?.value.toLowerCase()||'';
  const catF    = document.getElementById('hist-cat-filter')?.value||'';
  const payF    = document.getElementById('hist-pay-filter')?.value||'';
  const sortV   = document.getElementById('hist-sort')?.value||'date-desc';
  const groupV  = document.getElementById('hist-group')?.value||'date';
  const fromD   = document.getElementById('hist-from')?.value||'';
  const toD     = document.getElementById('hist-to')?.value||'';

  if (search)  exps = exps.filter(e => (e.note||'').toLowerCase().includes(search) || (e.tags||[]).some(t=>t.toLowerCase().includes(search)) || String(e.amount).includes(search));
  if (catF)    exps = exps.filter(e => e.category===catF);
  if (payF)    exps = exps.filter(e => e.payment===payF);
  if (fromD)   exps = exps.filter(e => e.date >= fromD);
  if (toD)     exps = exps.filter(e => e.date <= toD);

  const [sortKey,sortDir] = sortV.split('-');
  exps.sort((a,b) => {
    const av=sortKey==='amount'?a.amount:a.date;
    const bv=sortKey==='amount'?b.amount:b.date;
    return sortDir==='desc' ? (bv>av?1:-1) : (av>bv?1:-1);
  });

  const total = exps.reduce((s,e)=>s+e.amount,0);
  const statsEl = document.getElementById('hist-stats');
  if (statsEl) statsEl.innerHTML = [
    { v:fmt(total),                                     l:'Total' },
    { v:exps.length,                                    l:'Count' },
    { v:exps.length ? fmt(total/exps.length) : fmt(0),  l:'Average' },
    { v:exps.length ? fmt(Math.max(...exps.map(e=>e.amount))) : fmt(0), l:'Highest' },
  ].map(s=>`<div class="hstat"><div class="hstat-val">${s.v}</div><div class="hstat-lbl">${s.l}</div></div>`).join('');

  const listEl = document.getElementById('hist-list');
  if (!listEl) return;
  if (!exps.length) { listEl.innerHTML=emptyState('No expenses found for this filter','🔍'); return; }

  if (groupV==='category') {
    const byCat={};
    exps.forEach(e => { if(!byCat[e.category]) byCat[e.category]=[]; byCat[e.category].push(e); });
    listEl.innerHTML = Object.entries(byCat).map(([catId,catExps])=>{
      const c=cat(catId); const ct=catExps.reduce((s,e)=>s+e.amount,0);
      return `<div class="day-hdr"><span>${c.emoji} ${c.name}</span><span>${fmt(ct)}</span></div>`+catExps.map(e=>expRow(e,true)).join('');
    }).join('');
  } else if (groupV==='none') {
    listEl.innerHTML = exps.map(e=>expRow(e,true)).join('');
  } else {
    const byDate={};
    exps.forEach(e => { if(!byDate[e.date]) byDate[e.date]=[]; byDate[e.date].push(e); });
    listEl.innerHTML = Object.entries(byDate).map(([date,dayExps])=>{
      const dt=new Date(date+'T12:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
      const dt2=dayExps.reduce((s,e)=>s+e.amount,0);
      return `<div class="day-hdr"><span>${dt}</span><span>${fmt(dt2)}</span></div>`+dayExps.map(e=>expRow(e,true)).join('');
    }).join('');
  }
}

function clearHistFilters() {
  ['hist-search','hist-from','hist-to'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  ['hist-cat-filter','hist-pay-filter'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  const sort=document.getElementById('hist-sort'); if(sort) sort.value='date-desc';
  const grp=document.getElementById('hist-group'); if(grp) grp.value='date';
  renderHistory();
  showToast('Filters cleared','info');
}

/* ══════════════════════════════════════════════
   EXPENSE ROW
══════════════════════════════════════════════ */
function expRow(e, showActions=false) {
  const c    = cat(e.category);
  const tags = (e.tags||[]).map(t=>`<span class="tag-chip">#${t}</span>`).join('');
  const acts = showActions ? `
    <div class="exp-acts">
      <button class="exp-act-btn" onclick="openEditModal('${e.id}')" title="Edit">✏️</button>
      <button class="exp-act-btn" onclick="duplicateExpense('${e.id}')" title="Duplicate to today">📋</button>
      <button class="exp-act-btn del" onclick="confirmDeleteExp('${e.id}')" title="Delete">🗑</button>
    </div>` : `<div class="exp-acts"><button class="exp-act-btn del" onclick="confirmDeleteExp('${e.id}')" title="Delete">🗑</button></div>`;
  return `
    <div class="exp-item">
      <div class="exp-cat-icon" style="background:${c.color}18">${c.emoji}</div>
      <div class="exp-body">
        <div class="exp-note">${e.note}</div>
        <div class="exp-meta">${fDate(e.date)} · ${e.payment} · <span style="color:${c.color};font-weight:700">${c.name}</span>${e.recurring?'&nbsp;· 🔄':''}${e.split_with?` · 🤝 ${e.split_with}`:''}</div>
        ${tags ? `<div class="exp-tags">${tags}</div>` : ''}
      </div>
      <div class="exp-amount">−${fmt(e.amount)}</div>
      ${acts}
    </div>`;
}

function emptyState(msg, icon='📋') {
  return `<div class="empty-state"><span class="ei">${icon}</span><p>${msg}</p></div>`;
}

/* ══════════════════════════════════════════════
   DELETE & EDIT
══════════════════════════════════════════════ */
function confirmDeleteExp(id) {
  const modal = document.getElementById('delete-modal');
  modal.classList.remove('hidden');
  document.getElementById('delete-confirm-btn').onclick = async () => {
    try {
      if (window.DEMO_MODE) { const all=demoLoad('expenses').filter(e=>e.id!==id); demoSave('expenses',all); }
      else await FS.deleteExpense(S.uid, id);
      S.expenses    = S.expenses.filter(e=>e.id!==id);
      S.allExpenses = S.allExpenses.filter(e=>e.id!==id);
      closeModal('delete-modal');
      showToast('Expense deleted','info');
      if(S.tab==='dashboard') renderDashboard();
      if(S.tab==='history')   renderHistory();
    } catch(e) { showToast('Delete failed','error'); }
  };
}

function openEditModal(id) {
  const e = S.expenses.find(x=>x.id===id) || S.allExpenses.find(x=>x.id===id);
  if (!e) return;
  document.getElementById('edit-id').value     = id;
  document.getElementById('edit-amount').value = e.amount;
  document.getElementById('edit-note').value   = e.note;
  document.getElementById('edit-date').value   = e.date;
  const catSel = document.getElementById('edit-cat');
  if (catSel) catSel.value = e.category;
  document.getElementById('edit-modal').classList.remove('hidden');
}

async function saveEdit() {
  const id     = document.getElementById('edit-id').value;
  const amount = parseFloat(document.getElementById('edit-amount').value);
  const note   = document.getElementById('edit-note').value.trim();
  const date   = document.getElementById('edit-date').value;
  const catId  = document.getElementById('edit-cat')?.value;
  if (!amount||amount<=0) { showToast('Enter valid amount','error'); return; }

  try {
    if (window.DEMO_MODE) {
      const all = demoLoad('expenses').map(e => e.id===id ? {...e,amount,note,date,category:catId||e.category,month_key:date.substring(0,7)} : e);
      demoSave('expenses', all);
    } else {
      await FS.updateExpense(S.uid, id, { amount, note, date, category:catId, month_key:date.substring(0,7) });
    }
    const upd = exp => exp.id===id ? {...exp,amount,note,date,category:catId||exp.category} : exp;
    S.expenses    = S.expenses.map(upd);
    S.allExpenses = S.allExpenses.map(upd);
    closeModal('edit-modal');
    showToast('Expense updated ✓','success');
    if(S.tab==='dashboard') renderDashboard();
    if(S.tab==='history')   renderHistory();
  } catch(e) { showToast('Update failed','error'); }
}

/* ══════════════════════════════════════════════
   ANALYTICS
══════════════════════════════════════════════ */
function renderAnalytics() {
  destroyCharts();
  const months = parseInt(document.getElementById('ana-range')?.value)||6;
  const monthData=[], labels=[];
  const now = S.month;

  for (let i=months-1; i>=0; i--) {
    let m=now.month-i, y=now.year;
    if(m<1){m+=12;y--;}
    const mk = mkKey(y,m);
    labels.push(MONTHS_S[m-1]+"'"+ String(y).slice(-2));
    const exps = S.allExpenses.filter(e=>e.month_key===mk);
    const incs = S.allIncomes.filter(i=>i.month_key===mk);
    monthData.push({ total:exps.reduce((s,e)=>s+e.amount,0), income:incs.reduce((s,i)=>s+i.amount,0), exps });
  }

  const allInRange = monthData.flatMap(m=>m.exps);
  const totalSpend = allInRange.reduce((s,e)=>s+e.amount,0);
  const statsEl = document.getElementById('ana-stats');
  if (statsEl) {
    statsEl.innerHTML = [
      { v:fmt(totalSpend),                         l:`Total (${months}mo)` },
      { v:fmt(totalSpend/months),                  l:'Monthly Avg' },
      { v:fmt(Math.max(...monthData.map(m=>m.total),0)), l:'Peak Month' },
      { v:allInRange.length,                       l:'Transactions' },
    ].map(s=>`<div class="ana-stat"><span class="as-val">${s.v}</span><div class="as-lbl">${s.l}</div></div>`).join('');
  }

  // Trend chart: spending + income + budget
  const trendCtx = document.getElementById('ch-trend');
  if (trendCtx) {
    S.charts.trend = new Chart(trendCtx, {
      type:'bar',
      data:{ labels, datasets:[
        { label:'Expenses', data:monthData.map(m=>Math.round(m.total)), backgroundColor:'rgba(37,99,235,.75)', borderRadius:5, borderSkipped:false },
        { label:'Income',   data:monthData.map(m=>Math.round(m.income)), backgroundColor:'rgba(5,150,105,.5)', borderRadius:5, borderSkipped:false },
        { label:'Budget',   data:monthData.map(()=>S.profile.budget), type:'line', borderColor:'#dc2626', borderWidth:2, pointRadius:0, fill:false, tension:0 },
      ]},
      options:{ responsive:true, plugins:{legend:{position:'top'}, tooltip:{callbacks:{label:c=>` ${sym()}${Number(c.raw).toLocaleString('en-IN')}`}}}, scales:{x:{grid:{display:false}},y:{border:{display:false},ticks:{callback:v=>sym()+(v/1000).toFixed(0)+'k'}}} }
    });
  }

  // Category donut
  const curExps = S.expenses;
  const catTotals={};
  curExps.forEach(e=>catTotals[e.category]=(catTotals[e.category]||0)+e.amount);
  const cats  = CATS.filter(c=>catTotals[c.id]);
  const cTotal= Object.values(catTotals).reduce((s,v)=>s+v,0)||1;
  const catCtx = document.getElementById('ch-cat');
  if (catCtx && cats.length) {
    S.charts.cat = new Chart(catCtx, {
      type:'doughnut',
      data:{ labels:cats.map(c=>c.name), datasets:[{ data:cats.map(c=>catTotals[c.id]||0), backgroundColor:cats.map(c=>c.color), borderWidth:3, borderColor:'var(--surface)', hoverOffset:8 }] },
      options:{ responsive:true, cutout:'68%', plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.label}: ${fmt(c.raw)}`}}} }
    });
    const lbl=document.getElementById('donut-lbl');
    if(lbl) lbl.innerHTML=`<span class="donut-main">${fmtK(cTotal)}</span><span class="donut-sub">Total</span>`;
    const legendEl=document.getElementById('cat-legend');
    if(legendEl) legendEl.innerHTML=cats.map(c=>`<div class="legend-row"><div class="ldot" style="background:${c.color}"></div><span class="lname">${c.emoji} ${c.name}</span><span class="lamt">${fmt(catTotals[c.id])}</span><span class="lpct">${Math.round(catTotals[c.id]/cTotal*100)}%</span></div>`).join('');
  }

  // Payment methods
  const payTotals={};
  curExps.forEach(e=>payTotals[e.payment]=(payTotals[e.payment]||0)+e.amount);
  const payCtx = document.getElementById('ch-pay');
  if (payCtx && Object.keys(payTotals).length) {
    S.charts.pay = new Chart(payCtx, {
      type:'doughnut',
      data:{ labels:Object.keys(payTotals), datasets:[{ data:Object.values(payTotals), backgroundColor:['#2563eb','#059669','#d97706','#7c3aed','#dc2626'], borderWidth:3, borderColor:'var(--surface)', hoverOffset:8 }] },
      options:{ responsive:true, cutout:'60%', plugins:{legend:{position:'bottom',labels:{font:{size:11,weight:'600'},padding:10}}, tooltip:{callbacks:{label:c=>` ${c.label}: ${fmt(c.raw)}`}}} }
    });
  }

  // Daily bar
  const daysInMonth = new Date(S.month.year, S.month.month, 0).getDate();
  const daily = Array(daysInMonth).fill(0);
  curExps.forEach(e=>{ const d=parseInt(e.date.split('-')[2])-1; if(d>=0&&d<daysInMonth) daily[d]+=e.amount; });
  const dailyCtx = document.getElementById('ch-daily');
  if (dailyCtx) {
    S.charts.daily = new Chart(dailyCtx, {
      type:'bar',
      data:{ labels:Array.from({length:daysInMonth},(_,i)=>i+1), datasets:[{ label:'Daily', data:daily, backgroundColor:'rgba(124,58,237,.5)', borderColor:'#7c3aed', borderWidth:1.5, borderRadius:4, borderSkipped:false }] },
      options:{ responsive:true, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>` ${fmt(c.raw)}`}}}, scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{border:{display:false},ticks:{callback:v=>sym()+(v>=1000?(v/1000).toFixed(0)+'k':v)}}} }
    });
  }

  // Day of week bar
  const dow=Array(7).fill(0);
  S.allExpenses.forEach(e=>{const d=new Date(e.date+'T12:00').getDay();dow[d]+=e.amount;});
  const dowCtx = document.getElementById('ch-dow');
  if (dowCtx) {
    S.charts.dow = new Chart(dowCtx, {
      type:'bar',
      data:{ labels:DAYS_S, datasets:[{ data:dow, backgroundColor:dow.map(v=>v===Math.max(...dow)?'#2563eb':'rgba(37,99,235,.35)'), borderRadius:6, borderSkipped:false }] },
      options:{ responsive:true, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>` ${fmt(c.raw)}`}}}, scales:{x:{grid:{display:false}},y:{border:{display:false},ticks:{callback:v=>sym()+(v/1000).toFixed(0)+'k'}}} }
    });
  }

  // Top merchants
  const merchants={};
  curExps.forEach(e=>{ const m=e.note||'Unknown'; if(!merchants[m]) merchants[m]={total:0,count:0}; merchants[m].total+=e.amount; merchants[m].count++; });
  const top=Object.entries(merchants).sort((a,b)=>b[1].total-a[1].total).slice(0,6);
  const tmEl=document.getElementById('top-merchants');
  if(tmEl) tmEl.innerHTML=top.map(([name,d])=>`<div class="merch-row"><span class="merch-name">${name}</span><span class="merch-cnt">${d.count}×</span><span class="merch-amt">${fmt(d.total)}</span></div>`).join('')||emptyState('No data','📊');
}

function destroyCharts() {
  ['trend','cat','pay','daily','dow','budgHist'].forEach(k=>{ try{S.charts[k]?.destroy()}catch(_){} delete S.charts[k]; });
}

/* ══════════════════════════════════════════════
   GOALS
══════════════════════════════════════════════ */
function renderGoals() {
  const grid = document.getElementById('goals-grid');
  if (!grid) return;
  if (!S.goals.length) {
    grid.innerHTML=`<div class="empty-goals"><span class="eg-icon">🎯</span><p>No savings goals yet</p><p style="font-size:.8rem;margin-top:.25rem;color:var(--text3)">Set a goal and track your progress!</p></div>`;
    return;
  }
  grid.innerHTML = S.goals.map(g => {
    const pct = Math.min(100, g.target>0 ? (g.saved/g.target*100) : 0);
    const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline)-new Date())/(1000*60*60*24)) : null;
    const col = pct>=100?'#059669':pct>=75?'#7c3aed':pct>=50?'#2563eb':'#d97706';
    const pctCls = pct>=100?'good':pct>=75?'tip':pct>=50?'tip':'warn';
    const needed = daysLeft && daysLeft>0 && g.target>g.saved ? fmt((g.target-g.saved)/daysLeft)+'/day needed' : '';
    return `
      <div class="goal-card">
        <div class="goal-hdr">
          <span class="goal-emoji">${g.emoji||'🎯'}</span>
          <span class="goal-pct insight-tag ${pctCls}">${Math.round(pct)}%</span>
        </div>
        <div class="goal-name">${g.name}</div>
        <div class="goal-amounts">${fmt(g.saved||0)} saved of ${fmt(g.target)}</div>
        <div class="goal-bar-bg"><div class="goal-bar-fill" style="width:${pct}%;background:${col}"></div></div>
        ${daysLeft!==null ? `<div class="goal-deadline">${daysLeft>0?`⏳ ${daysLeft} days left${needed?` · ${needed}`:''}`:daysLeft===0?'🎉 Last day!':'⏰ Deadline passed'}</div>` : ''}
        <div class="goal-acts">
          <button class="btn-contribute" onclick="openContribute('${g.id}','${g.name}')">+ Add Savings</button>
          <button class="btn-del-goal" onclick="deleteGoal('${g.id}')">🗑</button>
        </div>
      </div>`;
  }).join('');
}

function openGoalModal() {
  buildEmojiPicker('goal-emoji-picker','goal-emoji','🏠 🚗 ✈️ 💻 📱 🎓 💍 🎸 🏖️ 📚 🏋️ 🎮'.split(' '));
  document.getElementById('goal-modal').classList.remove('hidden');
}

async function saveGoal() {
  const name    = document.getElementById('goal-name').value.trim();
  const target  = parseFloat(document.getElementById('goal-target').value);
  const deadline= document.getElementById('goal-deadline').value;
  const emoji   = document.getElementById('goal-emoji').value;
  if (!name||!target) { showToast('Enter goal name and target amount','error'); return; }
  const goal = { name, target, saved:0, deadline:deadline||null, emoji };
  try {
    if (window.DEMO_MODE) { goal.id=Date.now().toString(); const all=demoLoad('goals'); all.push(goal); demoSave('goals',all); }
    else goal.id = await FS.addGoal(S.uid, goal);
    S.goals.push(goal);
    closeModal('goal-modal');
    document.getElementById('goal-name').value='';
    document.getElementById('goal-target').value='';
    showToast(`🎯 Goal "${name}" created!`,'success');
    renderGoals();
  } catch(e) { showToast('Failed','error'); }
}

function openContribute(id, name) {
  S.pendingGoalId = id;
  setEl('contribute-title', `Add savings to "${name}"`);
  document.getElementById('contribute-amt').value='';
  document.getElementById('contribute-modal').classList.remove('hidden');
}

async function contributeToGoal() {
  const amt  = parseFloat(document.getElementById('contribute-amt').value);
  if (!amt||amt<=0) { showToast('Enter a valid amount','error'); return; }
  const goal = S.goals.find(g=>g.id===S.pendingGoalId);
  if (!goal) return;
  goal.saved = (goal.saved||0) + amt;
  try {
    if (window.DEMO_MODE) { const all=demoLoad('goals').map(g=>g.id===goal.id?goal:g); demoSave('goals',all); }
    else await FS.updateGoal(S.uid, goal.id, { saved:goal.saved });
    closeModal('contribute-modal');
    showToast(`${fmt(amt)} added to "${goal.name}" 🎉`,'success');
    if (goal.saved >= goal.target) addNotif('🎉',`Goal Complete!`,`You reached your "${goal.name}" goal!`);
    renderGoals();
  } catch(e) { showToast('Failed','error'); }
}

async function deleteGoal(id) {
  try {
    if (window.DEMO_MODE) { const all=demoLoad('goals').filter(g=>g.id!==id); demoSave('goals',all); }
    else await FS.deleteGoal(S.uid, id);
    S.goals = S.goals.filter(g=>g.id!==id);
    showToast('Goal deleted','info');
    renderGoals();
  } catch(e) { showToast('Failed','error'); }
}

/* ══════════════════════════════════════════════
   BUDGET
══════════════════════════════════════════════ */
function renderBudget() {
  const exps  = S.expenses;
  const total = exps.reduce((s,e)=>s+e.amount,0);
  const pct   = S.profile.budget>0 ? Math.min(100,total/S.profile.budget*100) : 0;
  const fill  = document.getElementById('bv-fill');
  if(fill){ fill.style.width=pct+'%'; fill.style.background=pct>=90?'#dc2626':pct>=75?'#d97706':'#2563eb'; }
  setEl('bv-spent',`${fmt(total)} spent (${Math.round(pct)}%)`);
  setEl('bv-total',`of ${fmt(S.profile.budget)}`);

  const catTotals={};
  exps.forEach(e=>catTotals[e.category]=(catTotals[e.category]||0)+e.amount);
  const listEl = document.getElementById('cat-budgets-list');
  if(listEl) {
    const rows = CATS.map(c=>{
      const spent=catTotals[c.id]||0;
      const lim  =S.catBudgets[c.id]||0;
      if (!spent && !lim) return '';
      const p = lim>0 ? Math.min(100,spent/lim*100) : 0;
      const col = p>=90?'#dc2626':p>=75?'#d97706':'#2563eb';
      const pctCls = p>=90?'insight-tag bad':p>=75?'insight-tag warn':'insight-tag good';
      return `<div class="cat-budget-row">
        <span class="cbi-icon">${c.emoji}</span>
        <span class="cbi-name">${c.name}</span>
        <div class="cbi-bar"><div class="cbi-bar-bg"><div class="cbi-bar-fill" style="width:${p}%;background:${col};height:100%;border-radius:50px"></div></div></div>
        <span class="cbi-amt">${fmt(spent)}${lim?` / ${fmt(lim)}`:''}</span>
        ${lim?`<span class="cbi-pct ${pctCls}">${Math.round(p)}%</span>`:''}
      </div>`;
    }).join('');
    listEl.innerHTML = rows || '<p style="padding:1rem;color:var(--text3);font-size:.85rem">No category budgets set. Click "Category Limits" to add.</p>';
  }

  // Budget history
  const labels=[], data=[];
  for(let i=5;i>=0;i--){
    let m=S.month.month-i, y=S.month.year;
    if(m<1){m+=12;y--;}
    labels.push(MONTHS_S[m-1]);
    data.push(Math.round(S.allExpenses.filter(e=>e.month_key===mkKey(y,m)).reduce((s,e)=>s+e.amount,0)));
  }
  const ctx=document.getElementById('ch-budget-history');
  if(ctx){
    try{S.charts.budgHist?.destroy()}catch(_){}
    S.charts.budgHist=new Chart(ctx,{
      type:'bar',
      data:{labels,datasets:[
        {label:'Spent', data, backgroundColor:data.map((_,i)=>i===5?'#2563eb':'#bfdbfe'), borderRadius:6, borderSkipped:false},
        {label:'Budget',data:data.map(()=>S.profile.budget),type:'line',borderColor:'#dc2626',borderWidth:2,pointRadius:0,fill:false,tension:0},
      ]},
      options:{responsive:true,plugins:{legend:{position:'top'},tooltip:{callbacks:{label:c=>` ${fmt(c.raw)}`}}},scales:{x:{grid:{display:false}},y:{border:{display:false},ticks:{callback:v=>sym()+(v/1000).toFixed(0)+'k'}}}}
    });
  }
}

function openBudgetModal() {
  closeMenus();
  document.getElementById('bm-amount').value = S.profile.budget;
  document.getElementById('budget-modal').classList.remove('hidden');
}

async function saveBudget() {
  const val = parseFloat(document.getElementById('bm-amount').value);
  if (!val||val<=0) { showToast('Enter a valid budget amount','error'); return; }
  S.profile.budget = val;
  if (window.DEMO_MODE) { localStorage.setItem(demoKey('budget'), val); }
  else await FS.setUser(S.uid, { budget:val });
  document.getElementById('s-budget').value = val;
  closeModal('budget-modal');
  showToast(`Budget set to ${fmt(val)}`,'success');
  if(S.tab==='dashboard') renderDashboard();
  if(S.tab==='budget')    renderBudget();
}

function openCatBudgetModal() {
  const fields = document.getElementById('catbudget-fields');
  if(fields) fields.innerHTML = CATS.map(c=>`
    <div class="form-field">
      <label>${c.emoji} ${c.name}</label>
      <input type="number" id="cb-${c.id}" class="field-inp" style="width:130px" placeholder="₹ limit (0 = no limit)" value="${S.catBudgets[c.id]||''}"/>
    </div>`).join('');
  document.getElementById('catbudget-modal').classList.remove('hidden');
}

async function saveCatBudgets() {
  for (const c of CATS) {
    const val = parseFloat(document.getElementById(`cb-${c.id}`)?.value)||0;
    if (val > 0) {
      S.catBudgets[c.id] = val;
      if (window.DEMO_MODE) { const cb=JSON.parse(localStorage.getItem(demoKey('catbudgets'))||'{}'); cb[c.id]=val; localStorage.setItem(demoKey('catbudgets'),JSON.stringify(cb)); }
      else await FS.setCatBudget(S.uid, c.id, val);
    }
  }
  closeModal('catbudget-modal');
  showToast('Category budgets saved!','success');
  if(S.tab==='budget') renderBudget();
}

/* ══════════════════════════════════════════════
   CALENDAR
══════════════════════════════════════════════ */
function renderCalendar() {
  const {year, month} = S.month;
  const firstDay   = new Date(year, month-1, 1).getDay();
  const daysInMonth= new Date(year, month, 0).getDate();
  const todayDate  = new Date().getDate();
  const isCurMonth = year===new Date().getFullYear() && month===new Date().getMonth()+1;

  const byDay={};
  S.expenses.forEach(e=>{
    const d=parseInt(e.date.split('-')[2]);
    if(!byDay[d]) byDay[d]={total:0,count:0};
    byDay[d].total+=e.amount; byDay[d].count++;
  });

  const container = document.getElementById('calendar-grid');
  if(!container) return;

  let daysHtml = Array(firstDay).fill('<div class="cal-day empty"></div>').join('');
  for(let d=1; d<=daysInMonth; d++){
    const has     = byDay[d];
    const isToday = isCurMonth && d===todayDate;
    const cls = ['cal-day', isToday?'today':'', has?'has-expense':''].filter(Boolean).join(' ');
    daysHtml += `<div class="${cls}" title="${has?`${has.count} expense(s) — ${fmt(has.total)}`:''}">
      <span class="cal-day-num">${d}</span>
      ${has ? `<span class="cal-day-dot"></span><span class="cal-day-amt">${has.count}×</span>` : ''}
    </div>`;
  }

  container.innerHTML = `
    <div class="cal-weekdays">${DAYS_S.map(d=>`<div class="cal-wday">${d}</div>`).join('')}</div>
    <div class="cal-days">${daysHtml}</div>
    <div style="display:flex;gap:1rem;padding:1rem;font-size:.8rem;color:var(--text3);flex-wrap:wrap">
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:var(--primary-lt);border:1px solid var(--border2);margin-right:4px"></span>Has expense</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid var(--primary);margin-right:4px"></span>Today</span>
    </div>`;
}

/* ══════════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════════ */
function renderSettings() {
  buildAvatarPicker('settings-avatar-row','reg-avatar-s', S.profile.avatar, '😎 🐷 🦁 🐼 🦊 🐙 🦋 🌻 🚀 💎 🎯 🔥'.split(' '));
  setEl('s-email', S.profile.email||'');
  document.getElementById('s-dark').checked = document.documentElement.getAttribute('data-theme')==='dark';
  renderRecurringList();
  renderFirebaseStatusBadge();
}

function renderFirebaseStatusBadge() {
  const el = document.getElementById('fb-status-badge');
  if (!el) return;
  if (window.fbReady) {
    el.innerHTML = '<span class="status-badge good">✅ Connected to Firebase — data syncs across all devices</span>';
  } else {
    el.innerHTML = '<span class="status-badge warn">⚠️ Demo Mode — data stored in browser only (not synced)</span>';
  }
}

function toggleGuide() {
  const guide = document.getElementById('firebase-guide');
  const icon  = document.getElementById('guide-toggle-icon');
  const open  = guide.classList.toggle('hidden');
  if (icon) icon.textContent = open ? '▼' : '▲';
}

function buildAvatarPicker(containerId, hiddenId, current, emojis) {
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = emojis.map(em=>`<button class="av-btn${em===current?' selected':''}" onclick="pickAvatar('${em}','${containerId}','${hiddenId}')">${em}</button>`).join('');
}

function pickAvatar(emoji, containerId, hiddenId) {
  document.querySelectorAll(`#${containerId} .av-btn`).forEach(b=>b.classList.toggle('selected',b.textContent===emoji));
  const h=document.getElementById(hiddenId); if(h) h.value=emoji;
}

async function saveProfile() {
  const name     = document.getElementById('s-name').value.trim();
  const budget   = parseFloat(document.getElementById('s-budget').value);
  const currency = document.getElementById('s-currency').value;
  const avatar   = document.querySelector('#settings-avatar-row .av-btn.selected')?.textContent || S.profile.avatar;
  if(!name) { showToast('Enter your name','error'); return; }
  S.profile = { ...S.profile, name, budget:budget||S.profile.budget, currency, avatar };
  ['hdr-avatar','sf-avatar'].forEach(id=>setEl(id,avatar));
  ['hdr-name','sf-name'].forEach(id=>setEl(id,name));
  if (window.DEMO_MODE) { localStorage.setItem(demoKey('profile'), JSON.stringify(S.profile)); }
  else await FS.setUser(S.uid, { name, budget:budget||S.profile.budget, currency, avatar });
  showToast('Profile saved! ✓','success');
}

function applyTheme() {
  const dark = document.getElementById('s-dark')?.checked;
  document.documentElement.setAttribute('data-theme', dark?'dark':'light');
  localStorage.setItem('theme', dark?'dark':'light');
  setEl('theme-btn', dark?'☀️':'🌙');
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  document.documentElement.setAttribute('data-theme', isDark?'light':'dark');
  localStorage.setItem('theme', isDark?'light':'dark');
  setEl('theme-btn', isDark?'🌙':'☀️');
  const cb=document.getElementById('s-dark'); if(cb) cb.checked=!isDark;
}

function loadTheme() {
  const t = localStorage.getItem('theme')||'light';
  document.documentElement.setAttribute('data-theme', t);
  setEl('theme-btn', t==='dark'?'☀️':'🌙');
}

/* ══════════════════════════════════════════════
   RECURRING BILLS
══════════════════════════════════════════════ */
function renderRecurringList() {
  const el = document.getElementById('recurring-list');
  if(!el) return;
  if(!S.recurringBills.length) { el.innerHTML='<div style="padding:1rem;color:var(--text3);font-size:.85rem;text-align:center">No recurring bills set up. Click + Add to create one.</div>'; return; }
  el.innerHTML = S.recurringBills.map(r=>{
    const c = cat(r.category||'bills');
    return `<div class="recurring-item">
      <span style="font-size:1.2rem">${c.emoji}</span>
      <span class="ri-name">${r.name}</span>
      <span class="ri-day">Every ${r.day_of_month}${ordinal(r.day_of_month)}</span>
      <span class="ri-amt">−${fmt(r.amount)}</span>
      <button class="exp-act-btn del" onclick="deleteRecurring('${r.id}')">🗑</button>
    </div>`;
  }).join('');
}

function ordinal(n) {
  const s=['th','st','nd','rd']; const v=n%100;
  return s[(v-20)%10]||s[v]||s[0];
}

function openRecurringModal() {
  ['rec-name','rec-amount','rec-day'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('recurring-modal').classList.remove('hidden');
}

async function saveRecurring() {
  const name  = document.getElementById('rec-name').value.trim();
  const amount= parseFloat(document.getElementById('rec-amount').value);
  const day   = parseInt(document.getElementById('rec-day').value);
  const catId = document.getElementById('rec-cat').value;
  if(!name||!amount||!day||day<1||day>31) { showToast('Fill all fields correctly (day must be 1–31)','error'); return; }
  const rec = { name, amount, day_of_month:day, category:catId, active:true };
  try {
    if (window.DEMO_MODE) { rec.id=Date.now().toString(); const all=demoLoad('recurring'); all.push(rec); demoSave('recurring',all); }
    else await FS.addRecurring(S.uid, rec);
    S.recurringBills.push(rec);
    closeModal('recurring-modal');
    showToast(`🔄 "${name}" added as recurring bill`,'success');
    renderRecurringList();
  } catch(e){ showToast('Failed','error'); }
}

async function deleteRecurring(id) {
  try {
    if(window.DEMO_MODE){ const all=demoLoad('recurring').filter(r=>r.id!==id); demoSave('recurring',all); }
    else await FS.deleteRecurring(S.uid, id);
    S.recurringBills=S.recurringBills.filter(r=>r.id!==id);
    showToast('Recurring bill removed','info');
    renderRecurringList();
  } catch(e){ showToast('Failed','error'); }
}

function checkRecurringDue() {
  if (!document.getElementById('s-rec-remind')?.checked && document.getElementById('s-rec-remind')) return;
  const todayDay = new Date().getDate();
  S.recurringBills.forEach(r => {
    if (Math.abs(r.day_of_month - todayDay) <= 2) {
      const alreadyAdded = S.expenses.some(e => e.note===r.name && e.recurring);
      if (!alreadyAdded) addNotif('🔄',`Bill due: ${r.name}`,`${fmt(r.amount)} due on the ${r.day_of_month}${ordinal(r.day_of_month)}`);
    }
  });
}

/* ══════════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════════ */
function addNotif(icon, title, sub) {
  S.notifs.unshift({ icon, title, sub, time:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}), unread:true });
  document.getElementById('notif-dot')?.classList.remove('hidden');
  renderNotifs();
}

function renderNotifs() {
  const list=document.getElementById('notif-list');
  if(!list) return;
  list.innerHTML = S.notifs.length
    ? S.notifs.slice(0,8).map(n=>`<div class="notif-item${n.unread?' unread':''}"><span class="notif-icon">${n.icon}</span><div class="notif-text"><p>${n.title}</p><span>${n.sub} · ${n.time}</span></div></div>`).join('')
    : '<div style="padding:1.25rem;text-align:center;color:var(--text3);font-size:.85rem">No notifications 🎉</div>';
}

function toggleNotifPanel() {
  const panel=document.getElementById('notif-panel');
  panel.classList.toggle('hidden');
  S.notifs.forEach(n=>n.unread=false);
  document.getElementById('notif-dot')?.classList.add('hidden');
  renderNotifs();
}

function clearNotifs() {
  S.notifs=[];
  renderNotifs();
  document.getElementById('notif-panel').classList.add('hidden');
}

function toggleUserMenu() {
  document.getElementById('user-menu')?.classList.toggle('hidden');
}

/* ══════════════════════════════════════════════
   EXPORT
══════════════════════════════════════════════ */
function exportMonthCSV() {
  const exps = S.expenses;
  if(!exps.length) { showToast('No expenses to export this month','warning'); return; }
  const rows=[['Date','Category','Note','Amount','Currency','Payment','Tags','Recurring','Split With'],
    ...exps.map(e=>[e.date,cat(e.category).name,e.note,e.amount,e.currency||'INR',e.payment,(e.tags||[]).join(';'),e.recurring?'Yes':'No',e.split_with||''])];
  downloadCSV(rows, `expenses_${MONTHS_S[S.month.month-1]}_${S.month.year}`);
}

async function exportAllCSV() {
  closeMenus();
  const exps = window.DEMO_MODE ? demoLoad('expenses') : await FS.getAllExpenses(S.uid);
  if(!exps.length) { showToast('No expenses to export','warning'); return; }
  const rows=[['Date','Month','Category','Note','Amount','Currency','Payment','Tags'],
    ...exps.map(e=>[e.date,e.month_key,cat(e.category).name,e.note,e.amount,e.currency||'INR',e.payment,(e.tags||[]).join(';')])];
  downloadCSV(rows, 'all_expenses');
}

function exportIncomeCSV() {
  const incomes = window.DEMO_MODE ? demoLoad('incomes') : S.allIncomes;
  if(!incomes.length) { showToast('No income entries to export','warning'); return; }
  const rows=[['Date','Month','Source','Type','Amount','Note'],
    ...incomes.map(i=>[i.date,i.month_key,i.source,INCOME_TYPES[i.category]||'Other',i.amount,i.note||''])];
  downloadCSV(rows, 'income_history');
}

function downloadCSV(rows, filename) {
  const csv  = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast('CSV downloaded ✓','success');
}

async function confirmClearData() {
  if(!confirm('⚠️ Delete ALL your expense and income data? This CANNOT be undone!')) return;
  if (window.DEMO_MODE) { ['expenses','goals','recurring','catbudgets','incomes'].forEach(k=>localStorage.removeItem(demoKey(k))); }
  else {
    const all = await FS.getAllExpenses(S.uid);
    await Promise.all(all.map(e=>FS.deleteExpense(S.uid,e.id)));
  }
  S.expenses=[]; S.allExpenses=[]; S.goals=[]; S.incomes=[]; S.allIncomes=[];
  showToast('All data cleared','info');
  renderDashboard();
}

/* ══════════════════════════════════════════════
   MODALS & KEYBOARD
══════════════════════════════════════════════ */
function closeModal(id, event) {
  if (event && event.target !== document.getElementById(id)) return;
  document.getElementById(id)?.classList.add('hidden');
}
document.addEventListener('keydown', e => {
  if (e.key==='Escape') {
    document.querySelectorAll('.modal-bg').forEach(m=>m.classList.add('hidden'));
    closeMenus();
  }
});

/* ══════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════ */
function showToast(msg, type='info') {
  const icons={success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.textContent=icons[type]+'  '+msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateX(60px)'; setTimeout(()=>el.remove(),300); }, 3500);
}

/* ══════════════════════════════════════════════
   RECENT PROFILES
══════════════════════════════════════════════ */
function saveRecentProfile() {
  if (window.DEMO_MODE) return;
  const recent = JSON.parse(localStorage.getItem('recent_profiles')||'[]');
  const entry  = { email:S.profile.email, name:S.profile.name, avatar:S.profile.avatar };
  const filtered = recent.filter(r=>r.email!==entry.email);
  filtered.unshift(entry);
  localStorage.setItem('recent_profiles', JSON.stringify(filtered.slice(0,3)));
}

function loadRecentProfiles() {
  const recent = JSON.parse(localStorage.getItem('recent_profiles')||'[]');
  const el = document.getElementById('profile-quick');
  if(!el||!recent.length) return;
  el.innerHTML = recent.map(p=>`<div class="pq-chip" onclick="fillLogin('${p.email}')">${p.avatar} ${p.name}</div>`).join('');
}

function fillLogin(email) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-pass').focus();
}

/* ══════════════════════════════════════════════
   AVATAR / EMOJI PICKERS
══════════════════════════════════════════════ */
function buildEmojiPicker(containerId, hiddenId, emojis) {
  const el=document.getElementById(containerId);
  if(!el) return;
  el.innerHTML=emojis.map(em=>`<button class="av-btn" onclick="pickAvatar2('${em}','${containerId}','${hiddenId}')">${em}</button>`).join('');
}

function pickAvatar2(emoji, containerId, hiddenId) {
  document.querySelectorAll(`#${containerId} .av-btn`).forEach(b=>b.classList.toggle('selected',b.textContent===emoji));
  const h=document.getElementById(hiddenId); if(h) h.value=emoji;
}

function initRegisterAvatarPicker() {
  const el=document.getElementById('avatar-picker');
  if(!el) return;
  const emojis=el.textContent.trim().split(/\s+/);
  el.innerHTML=emojis.map(em=>`<button class="av-btn${em==='😎'?' selected':''}" onclick="pickAvatar2('${em}','avatar-picker','reg-avatar')">${em}</button>`).join('');
}

/* ══════════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════════ */
function setLoading(btnId, loading, text) {
  const btn=document.getElementById(btnId);
  if(btn){ btn.disabled=loading; btn.textContent=text; }
}

function togglePass(inputId, btn) {
  const inp=document.getElementById(inputId);
  if(!inp) return;
  inp.type = inp.type==='password'?'text':'password';
  btn.textContent = inp.type==='password'?'👁':'🙈';
}

function copyToClipboard(text, msg) {
  navigator.clipboard?.writeText(text).then(()=>showToast(msg||'Copied!','success')).catch(()=>showToast('Copy failed — select manually','warning'));
}

/* ══════════════════════════════════════════════
   PWA
══════════════════════════════════════════════ */
window.addEventListener('appinstalled', ()=>{ showToast('App installed!','success'); });

/* ══════════════════════════════════════════════
   DEMO DATA SEED
══════════════════════════════════════════════ */
function seedDemoData() {
  // Expenses
  if (!demoLoad('expenses').length) {
    const now=new Date(), y=now.getFullYear(), m=now.getMonth()+1;
    const pad=n=>String(n).padStart(2,'0');
    const mk=mkKey(y,m);
    const seed=[
      {cat:'food',          amt:450,   note:'Team lunch',         day:3,  pay:'UPI'},
      {cat:'transport',     amt:180,   note:'Ola to office',      day:5,  pay:'UPI'},
      {cat:'groceries',     amt:1200,  note:'Monthly groceries',  day:7,  pay:'Cash'},
      {cat:'food',          amt:320,   note:'Zomato dinner',      day:9,  pay:'Card'},
      {cat:'bills',         amt:1500,  note:'Electricity bill',   day:10, pay:'NetBanking'},
      {cat:'shopping',      amt:2800,  note:'Clothes & shoes',    day:12, pay:'Card'},
      {cat:'health',        amt:650,   note:'Pharmacy',           day:13, pay:'Cash'},
      {cat:'transport',     amt:240,   note:'Metro recharge',     day:14, pay:'UPI'},
      {cat:'dining',        amt:95,    note:'Coffee meeting',     day:15, pay:'Card'},
      {cat:'education',     amt:999,   note:'Udemy course',       day:16, pay:'Card'},
      {cat:'subscriptions', amt:499,   note:'Netflix monthly',    day:1,  pay:'Card', recurring:true},
      {cat:'subscriptions', amt:199,   note:'Spotify',            day:1,  pay:'UPI',  recurring:true},
      {cat:'health',        amt:1200,  note:'Gym membership',     day:2,  pay:'UPI',  recurring:true},
      {cat:'dining',        amt:750,   note:'Birthday dinner',    day:17, pay:'Card'},
    ].map((d,i)=>({
      id:(1000+i).toString(), amount:d.amt, currency:'INR', category:d.cat,
      date:`${y}-${pad(m)}-${pad(Math.min(d.day, new Date(y,m,0).getDate()))}`,
      month_key:mk, note:d.note, tags:[], payment:d.pay,
      recurring:d.recurring||false, split_with:null, receipt_url:null, created_at:Date.now()-i*100000
    }));
    demoSave('expenses', seed);
  }

  // Income
  if (!demoLoad('incomes').length) {
    const now=new Date(), y=now.getFullYear(), m=now.getMonth()+1;
    const pad=n=>String(n).padStart(2,'0');
    const mk=mkKey(y,m);
    demoSave('incomes',[
      { id:'i1', amount:50000, source:'Monthly Salary',     category:'salary',    date:`${y}-${pad(m)}-01`, month_key:mk, note:'Company payroll', created_at:Date.now() },
      { id:'i2', amount:8000,  source:'Freelance project',  category:'freelance', date:`${y}-${pad(m)}-10`, month_key:mk, note:'Website design', created_at:Date.now() },
    ]);
  }

  // Goals
  if (!demoLoad('goals').length) {
    demoSave('goals',[
      { id:'g1', name:'New Laptop', emoji:'💻', target:60000, saved:18000, deadline:`${new Date().getFullYear()}-12-31` },
      { id:'g2', name:'Goa Trip',   emoji:'🏖️',  target:25000, saved:8500,  deadline:`${new Date().getFullYear()}-10-01` },
      { id:'g3', name:'Emergency Fund', emoji:'🛡️', target:100000, saved:35000, deadline:null },
    ]);
  }

  localStorage.setItem(demoKey('budget'), '20000');
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  await initFirebase();
  loadTheme();

  const dateEl=document.getElementById('add-date');
  if(dateEl) dateEl.value=today();
  const incomeDateEl=document.getElementById('income-date');
  if(incomeDateEl) incomeDateEl.value=today();

  showAuthScreen();
  if (!window.DEMO_MODE) setupAuthListener();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }

  console.log('%c 💰 Expense Tracker Pro', 'font-size:1.4rem;font-weight:900;color:#2563eb;background:#eff6ff;padding:4px 8px;border-radius:6px');
  console.log('%c Firebase + Render + PWA | All features enabled', 'color:#475569');
  console.log('%c Demo: click "Try Demo" on the login screen', 'color:#059669;font-weight:600');
});

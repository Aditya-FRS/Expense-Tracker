/**
 * ═══════════════════════════════════════════════════════════════════
 * ExpenseFlow Pro — Firebase / Firestore Configuration
 *
 * MARKET ANALYSIS NOTES:
 * ─────────────────────
 * HOW COMPETITORS HANDLE STORAGE:
 *
 * 1. EXPENSIFY (React Native + AWS)
 *    - DynamoDB for fast transactional reads
 *    - S3 for receipt images with OCR via Textract
 *    - Policy engine stored in JSON rules per company
 *    - Real-time sync via WebSockets
 *
 * 2. SAP CONCUR (Enterprise ERP)
 *    - Oracle DB with strict ACID compliance
 *    - Cost Centers as first-class entities
 *    - GL Account mapping per expense type
 *    - Multi-currency with daily exchange rate tables
 *    - Approval workflows with delegation chains
 *
 * 3. ZOHO EXPENSE
 *    - Cloud-native multi-tenant architecture
 *    - Per-org data isolation at DB level
 *    - Mileage calculated server-side with Google Maps API
 *    - Budgets at project, department, and category levels
 *
 * 4. QUICKBOOKS EXPENSES
 *    - Tightly coupled to Chart of Accounts
 *    - Tax lines auto-computed per jurisdiction
 *    - Bank feed reconciliation as core workflow
 *
 * OUR APPROACH (Firestore):
 *    - NoSQL document model for flexibility
 *    - Real-time listeners for live collaboration
 *    - Subcollections for isolation + scoped queries
 *    - Composite indexes for complex filtering
 *    - Security Rules at document level
 * ═══════════════════════════════════════════════════════════════════
 *
 * FIRESTORE DATA SCHEMA
 * ─────────────────────
 *
 * /organizations/{orgId}
 *   Fields:
 *     name: string
 *     domain: string
 *     plan: 'starter' | 'growth' | 'enterprise'
 *     base_currency: string (ISO 4217)
 *     fiscal_year_start: number (1-12, month)
 *     settings: {
 *       require_receipt_above: number,
 *       auto_approve_below: number,
 *       approval_chain: 'single' | 'hierarchical' | 'parallel',
 *       policy_rules: PolicyRule[]
 *     }
 *     created_at: Timestamp
 *     subscription: { status, seats, renewal_date }
 *
 * /organizations/{orgId}/users/{userId}
 *   Fields:
 *     uid: string (Firebase Auth UID)
 *     email: string
 *     name: string
 *     avatar_url: string
 *     role: 'employee' | 'manager' | 'admin' | 'cfo'
 *     department: string
 *     reports_to: string (userId of manager)
 *     budget_limit: number (per-expense approval threshold)
 *     monthly_budget: number
 *     default_currency: string
 *     active: boolean
 *     joined_at: Timestamp
 *
 * /organizations/{orgId}/expenses/{expenseId}
 *   Fields:
 *     user_id: string
 *     user_name: string
 *     amount: number
 *     base_amount: number (converted to org base_currency)
 *     currency: string
 *     exchange_rate: number
 *     category_id: string
 *     category_name: string
 *     merchant: string
 *     merchant_normalized: string (lowercase, for grouping)
 *     description: string
 *     date: string (YYYY-MM-DD)
 *     month_key: string (YYYY-MM, for efficient month queries)
 *     project_id: string | null
 *     department: string
 *     payment_method: 'corporate_card' | 'personal_card' | 'cash' | 'bank_transfer'
 *     card_last4: string | null
 *     receipt_url: string | null
 *     receipt_ocr_data: { merchant, amount, date, items } | null
 *     tags: string[]
 *     is_tax_deductible: boolean
 *     is_recurring: boolean
 *     recurring_config: {
 *       frequency: 'weekly' | 'monthly' | 'quarterly' | 'annually',
 *       end_date: string | null,
 *       parent_id: string | null,
 *       next_occurrence: string
 *     } | null
 *     status: 'draft' | 'pending' | 'approved' | 'rejected'
 *     policy_flags: string[] (violations detected)
 *     approver_id: string | null
 *     approver_name: string | null
 *     approval_notes: string | null
 *     approved_at: Timestamp | null
 *     rejected_reason: string | null
 *     report_id: string | null
 *     gl_account: string | null (ERP GL code)
 *     cost_center: string | null
 *     created_at: Timestamp
 *     updated_at: Timestamp
 *     deleted_at: Timestamp | null (soft delete)
 *
 * /organizations/{orgId}/categories/{categoryId}
 *   Fields:
 *     name: string
 *     icon: string (emoji)
 *     color: string (hex)
 *     parent_id: string | null (for subcategories)
 *     monthly_budget: number
 *     gl_account: string | null
 *     policy: {
 *       max_per_transaction: number | null,
 *       require_receipt_above: number | null,
 *       require_approval_above: number | null,
 *       allowed_payment_methods: string[]
 *     }
 *     active: boolean
 *     created_at: Timestamp
 *
 * /organizations/{orgId}/budgets/{budgetId}
 *   Fields:
 *     type: 'category' | 'department' | 'project' | 'user'
 *     entity_id: string (category_id / dept name / project_id / user_id)
 *     entity_name: string
 *     period: 'monthly' | 'quarterly' | 'annual'
 *     year: number
 *     month: number | null (for monthly)
 *     quarter: number | null
 *     amount: number
 *     currency: string
 *     spent: number (denormalized, updated by Cloud Function)
 *     alerts: {
 *       at_50: boolean,
 *       at_75: boolean,
 *       at_90: boolean,
 *       at_100: boolean,
 *       sent_50: boolean,
 *       sent_75: boolean,
 *       sent_90: boolean,
 *       sent_100: boolean
 *     }
 *     created_at: Timestamp
 *
 * /organizations/{orgId}/projects/{projectId}
 *   Fields:
 *     name: string
 *     code: string (short code, e.g. "Q2-MKT")
 *     description: string
 *     budget: number
 *     spent: number (denormalized)
 *     currency: string
 *     manager_id: string
 *     members: string[] (userIds)
 *     client: string | null
 *     start_date: string
 *     end_date: string | null
 *     active: boolean
 *     created_at: Timestamp
 *
 * /organizations/{orgId}/approvals/{approvalId}
 *   Fields:
 *     expense_id: string
 *     expense_amount: number
 *     expense_merchant: string
 *     requester_id: string
 *     requester_name: string
 *     approver_id: string
 *     approver_name: string
 *     step: number (for multi-step approvals)
 *     total_steps: number
 *     status: 'pending' | 'approved' | 'rejected' | 'delegated'
 *     comment: string | null
 *     delegated_to: string | null
 *     due_date: Timestamp | null
 *     created_at: Timestamp
 *     resolved_at: Timestamp | null
 *
 * /organizations/{orgId}/reports/{reportId}
 *   Fields:
 *     name: string
 *     user_id: string
 *     period_start: string
 *     period_end: string
 *     expense_ids: string[]
 *     total_amount: number
 *     currency: string
 *     status: 'draft' | 'submitted' | 'approved' | 'reimbursed'
 *     submitted_at: Timestamp | null
 *     approved_by: string | null
 *     approved_at: Timestamp | null
 *     reimbursed_at: Timestamp | null
 *     payment_method: string | null
 *     created_at: Timestamp
 *
 * /organizations/{orgId}/integrations/{integrationId}
 *   Fields:
 *     type: 'quickbooks' | 'xero' | 'sap' | 'netsuite' | 'slack' | 'jira'
 *     config: {} (integration-specific config)
 *     active: boolean
 *     last_sync: Timestamp | null
 *     created_at: Timestamp
 *
 * COMPOSITE INDEXES NEEDED:
 *   - expenses: (org_id, user_id, month_key, status)
 *   - expenses: (org_id, category_id, month_key)
 *   - expenses: (org_id, status, created_at DESC)
 *   - expenses: (org_id, project_id, month_key)
 *   - approvals: (org_id, approver_id, status, created_at DESC)
 *   - budgets: (org_id, type, year, month)
 *
 * CLOUD FUNCTIONS RECOMMENDED:
 *   - onExpenseCreate: update budget spent totals, check policy, send notifications
 *   - onExpenseStatusChange: notify requester, trigger next approval step
 *   - scheduledMonthlyReset: create new budget periods
 *   - recurringExpenseProcessor: create recurring expenses daily
 *   - receiptOCRProcessor: triggered on Storage upload, extracts data
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Firebase Configuration ──
// Replace with your Firebase project credentials:
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// ── Initialize Firebase (only if SDK is loaded) ──
let db = null;
let auth = null;
let storage = null;

function initFirebase() {
  if (typeof firebase !== 'undefined') {
    try {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      auth = firebase.auth();
      console.log('[Firebase] Initialized successfully');
    } catch (e) {
      console.warn('[Firebase] Init skipped — running in demo mode');
    }
  } else {
    console.info('[Firebase] SDK not loaded — running in demo mode with mock data');
  }
}
initFirebase();

// ══════════════════════════════════════════════════════════════════
// FIRESTORE SERVICE LAYER
// These functions wrap Firestore operations. In demo mode, they
// fall through to the in-memory mock data store in app.js.
// ══════════════════════════════════════════════════════════════════

const ORG_ID = 'demo_org_001';

const FirestoreService = {

  // ── Expenses ──
  async getExpenses(filters = {}) {
    if (!db) return null;
    let q = db.collection(`organizations/${ORG_ID}/expenses`).where('deleted_at', '==', null);
    if (filters.userId) q = q.where('user_id', '==', filters.userId);
    if (filters.monthKey) q = q.where('month_key', '==', filters.monthKey);
    if (filters.status) q = q.where('status', '==', filters.status);
    if (filters.categoryId) q = q.where('category_id', '==', filters.categoryId);
    q = q.orderBy('date', 'desc').limit(filters.limit || 100);
    const snap = await q.get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async addExpense(data) {
    if (!db) return null;
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const doc = {
      ...data,
      month_key: data.date.substring(0, 7),
      merchant_normalized: (data.merchant || '').toLowerCase().trim(),
      created_at: now,
      updated_at: now,
      deleted_at: null
    };
    const ref = await db.collection(`organizations/${ORG_ID}/expenses`).add(doc);
    return ref.id;
  },

  async updateExpense(id, data) {
    if (!db) return;
    await db.doc(`organizations/${ORG_ID}/expenses/${id}`).update({
      ...data,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async deleteExpense(id) {
    if (!db) return;
    await db.doc(`organizations/${ORG_ID}/expenses/${id}`).update({
      deleted_at: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  // Real-time listener for expenses
  subscribeExpenses(monthKey, callback) {
    if (!db) return () => {};
    return db.collection(`organizations/${ORG_ID}/expenses`)
      .where('month_key', '==', monthKey)
      .where('deleted_at', '==', null)
      .orderBy('date', 'desc')
      .onSnapshot(snap => {
        const expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(expenses);
      });
  },

  // ── Budgets ──
  async getBudgets(year, month) {
    if (!db) return null;
    const snap = await db.collection(`organizations/${ORG_ID}/budgets`)
      .where('year', '==', year)
      .where('month', '==', month)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async setBudget(categoryId, amount, year, month) {
    if (!db) return;
    const id = `${categoryId}_${year}_${month}`;
    await db.doc(`organizations/${ORG_ID}/budgets/${id}`).set({
      type: 'category',
      entity_id: categoryId,
      year, month, amount,
      period: 'monthly',
      currency: 'USD',
      spent: 0,
      alerts: { at_50: true, at_75: true, at_90: true, at_100: false },
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  },

  // ── Approvals ──
  async getPendingApprovals(approverId) {
    if (!db) return null;
    const snap = await db.collection(`organizations/${ORG_ID}/approvals`)
      .where('approver_id', '==', approverId)
      .where('status', '==', 'pending')
      .orderBy('created_at', 'desc')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async resolveApproval(approvalId, expenseId, status, comment) {
    if (!db) return;
    const batch = db.batch();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    batch.update(db.doc(`organizations/${ORG_ID}/approvals/${approvalId}`), {
      status, comment, resolved_at: now
    });
    batch.update(db.doc(`organizations/${ORG_ID}/expenses/${expenseId}`), {
      status, approval_notes: comment, approved_at: now, updated_at: now
    });
    await batch.commit();
  },

  // ── Categories ──
  async getCategories() {
    if (!db) return null;
    const snap = await db.collection(`organizations/${ORG_ID}/categories`)
      .where('active', '==', true).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // ── Analytics ──
  async getMonthlyTotals(months = 6) {
    if (!db) return null;
    const keys = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    const results = await Promise.all(keys.map(async mk => {
      const snap = await db.collection(`organizations/${ORG_ID}/expenses`)
        .where('month_key', '==', mk)
        .where('status', 'in', ['approved', 'pending'])
        .get();
      const total = snap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
      return { month_key: mk, total };
    }));
    return results;
  }
};

window.FirestoreService = FirestoreService;

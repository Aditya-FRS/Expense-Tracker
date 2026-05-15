/**
 * Firebase Config — loaded from server /api/firebase-config
 * so credentials never live in the frontend bundle.
 *
 * FIRESTORE SCHEMA
 * ────────────────
 * users/{uid}
 *   name, avatar, email, budget, currency, created_at
 *
 * users/{uid}/expenses/{id}
 *   amount, currency, category, date, month_key,
 *   note, tags[], payment, receipt_url,
 *   recurring, recurring_freq, split_with,
 *   created_at, updated_at
 *
 * users/{uid}/goals/{id}
 *   name, emoji, target, saved, deadline, created_at
 *
 * users/{uid}/cat_budgets/{category}
 *   limit (monthly)
 *
 * users/{uid}/recurring_bills/{id}
 *   name, amount, day_of_month, category, active
 *
 * users/{uid}/incomes/{id}
 *   amount, source, category, date, month_key, note, created_at
 *
 * FIRESTORE RULES (paste in Firebase console)
 * ─────────────────────────────────────────────
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     match /users/{uid}/{document=**} {
 *       allow read, write: if request.auth.uid == uid;
 *     }
 *   }
 * }
 */

window.fbReady = false;
window.db   = null;
window.auth = null;

async function initFirebase() {
  try {
    const res = await fetch('/api/firebase-config');
    const cfg = await res.json();

    if (!cfg.apiKey) {
      console.warn('[Firebase] No config — running offline/demo mode');
      window.DEMO_MODE = true;
      return;
    }

    if (!firebase.apps.length) firebase.initializeApp(cfg);
    window.db      = firebase.firestore();
    window.auth    = firebase.auth();
    window.fbReady = true;
    console.log('[Firebase] Connected ✓', cfg.projectId);
  } catch (e) {
    console.warn('[Firebase] Init failed — demo mode:', e.message);
    window.DEMO_MODE = true;
  }
}

// Firestore helpers
const FS = {
  userDoc: (uid)      => db.doc(`users/${uid}`),
  expCol:  (uid)      => db.collection(`users/${uid}/expenses`),
  expDoc:  (uid, id)  => db.doc(`users/${uid}/expenses/${id}`),
  goalCol: (uid)      => db.collection(`users/${uid}/goals`),
  goalDoc: (uid, id)  => db.doc(`users/${uid}/goals/${id}`),
  catBudCol: (uid)    => db.collection(`users/${uid}/cat_budgets`),
  recurCol:  (uid)    => db.collection(`users/${uid}/recurring_bills`),
  incomeCol:  (uid)    => db.collection(`users/${uid}/incomes`),
  incomeDoc:  (uid,id) => db.doc(`users/${uid}/incomes/${id}`),
  accCol:     (uid)    => db.collection(`users/${uid}/accounts`),
  accDoc:     (uid,id) => db.doc(`users/${uid}/accounts/${id}`),
  ts: () => firebase.firestore.FieldValue.serverTimestamp(),

  async getUser(uid) {
    const snap = await this.userDoc(uid).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  },

  async setUser(uid, data) {
    await this.userDoc(uid).set(data, { merge: true });
  },

  async addExpense(uid, data) {
    const ref = await this.expCol(uid).add({ ...data, created_at: this.ts(), updated_at: this.ts() });
    return ref.id;
  },

  async updateExpense(uid, id, data) {
    await this.expDoc(uid, id).update({ ...data, updated_at: this.ts() });
  },

  async deleteExpense(uid, id) {
    await this.expDoc(uid, id).delete();
  },

  async getExpensesByMonth(uid, monthKey) {
    const snap = await this.expCol(uid).where('month_key', '==', monthKey).orderBy('date', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getAllExpenses(uid) {
    const snap = await this.expCol(uid).orderBy('date', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getGoals(uid) {
    const snap = await this.goalCol(uid).orderBy('created_at', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async addGoal(uid, data) {
    const ref = await this.goalCol(uid).add({ ...data, created_at: this.ts() });
    return ref.id;
  },

  async updateGoal(uid, id, data) {
    await this.goalDoc(uid, id).update(data);
  },

  async deleteGoal(uid, id) {
    await this.goalDoc(uid, id).delete();
  },

  async getCatBudgets(uid) {
    const snap = await this.catBudCol(uid).get();
    const out = {};
    snap.docs.forEach(d => out[d.id] = d.data().limit || 0);
    return out;
  },

  async setCatBudget(uid, catId, limit) {
    await this.catBudCol(uid).doc(catId).set({ limit });
  },

  async getRecurring(uid) {
    const snap = await this.recurCol(uid).where('active', '==', true).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async addRecurring(uid, data) {
    await this.recurCol(uid).add({ ...data, active: true });
  },

  async deleteRecurring(uid, id) {
    await this.recurCol(uid).doc(id).delete();
  },

  async addIncome(uid, data) {
    const ref = await this.incomeCol(uid).add({ ...data, created_at: this.ts() });
    return ref.id;
  },

  async getIncomesByMonth(uid, monthKey) {
    const snap = await this.incomeCol(uid).where('month_key', '==', monthKey).orderBy('date', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async getAllIncomes(uid) {
    const snap = await this.incomeCol(uid).orderBy('date', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async deleteIncome(uid, id) {
    await this.incomeDoc(uid, id).delete();
  },

  async getAccounts(uid) {
    const snap = await this.accCol(uid).orderBy('created_at', 'asc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async addAccount(uid, data) {
    const ref = await this.accCol(uid).add({ ...data, created_at: this.ts() });
    return ref.id;
  },

  async updateAccount(uid, id, data) {
    await this.accDoc(uid, id).update(data);
  },

  async deleteAccount(uid, id) {
    await this.accDoc(uid, id).delete();
  },
};

window.FS = FS;

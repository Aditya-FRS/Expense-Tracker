const express = require('express');
const path    = require('path');
const multer  = require('multer');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB max
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Owner credentials (set APP_EMAIL + APP_PASSWORD in Render env vars) ──
app.get('/api/app-email', (_req, res) => {
  res.json({ email: process.env.APP_EMAIL || '' });
});

app.post('/api/verify-login', (req, res) => {
  const { email, password } = req.body || {};
  const appEmail = process.env.APP_EMAIL;
  const appPass  = process.env.APP_PASSWORD;
  // If env vars not configured, allow Firebase to handle auth (dev mode)
  if (!appEmail || !appPass) return res.json({ ok: true });
  if (email === appEmail && password === appPass) return res.json({ ok: true });
  return res.status(401).json({ ok: false, error: 'Invalid credentials' });
});

// ── Firebase config ───────────────────────────────────────────────────────
app.get('/api/firebase-config', (_req, res) => {
  res.json({
    apiKey:            process.env.FIREBASE_API_KEY            || '',
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || '',
    projectId:         process.env.FIREBASE_PROJECT_ID         || '',
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             process.env.FIREBASE_APP_ID             || '',
  });
});

// ── GitHub Receipt Upload ──────────────────────────────────────────────────
app.post('/api/upload-receipt', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH = 'main' } = process.env;
    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      return res.status(503).json({ error: 'GitHub storage not configured' });
    }

    // Safe filename: timestamp + sanitised original name
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `receipts/${Date.now()}_${safeName}`;
    const content  = req.file.buffer.toString('base64');

    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
      {
        method:  'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type':  'application/json',
          'User-Agent':    'ExpenseTrackerPro',
        },
        body: JSON.stringify({
          message: `Add receipt ${filePath}`,
          content,
          branch: GITHUB_BRANCH,
        }),
      }
    );

    if (!ghRes.ok) {
      const err = await ghRes.json().catch(() => ({}));
      console.error('[upload-receipt] GitHub error:', err);
      return res.status(500).json({ error: err.message || 'GitHub upload failed' });
    }

    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;
    res.json({ url: rawUrl });

  } catch (e) {
    console.error('[upload-receipt]', e);
    res.status(500).json({ error: e.message });
  }
});

// Health check for Render
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Expense Tracker running → http://localhost:${PORT}`);
  console.log(`   Firebase Project: ${process.env.FIREBASE_PROJECT_ID || '(set env vars)'}\n`);
});

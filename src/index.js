const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// ─── Config ───────────────────────────────────────────────────────────────────
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'daily_counts.json');

// ─── Data helpers ─────────────────────────────────────────────────────────────

function ensureDataDir() {
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadCounts() {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveCounts(counts) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(counts, null, 2));
}

function resetCounts() {
  saveCounts({});
  console.log('[Reset] Daily counts cleared');
}

// ─── Slack sender ─────────────────────────────────────────────────────────────

async function sendSlackMessage(text) {
  if (!SLACK_WEBHOOK_URL) {
    console.error('[Slack] SLACK_WEBHOOK_URL is not set');
    return;
  }
  try {
    await axios.post(SLACK_WEBHOOK_URL, { text });
    console.log('[Slack] Message sent');
  } catch (err) {
    console.error('[Slack] Failed to send:', err.message);
  }
}

// ─── EOD report ───────────────────────────────────────────────────────────────

async function sendEodReport() {
  const counts = loadCounts();
  const accounts = Object.entries(counts);

  if (accounts.length === 0) {
    await sendSlackMessage('📊 *Итоги дня — LinkedIn инвайты*\n\nСегодня инвайты не отправлялись.');
    return;
  }

  const lines = accounts.map(([label, count]) => `• *${label}*: отправлено ${count} инвайтов`);
  const total = accounts.reduce((sum, [, count]) => sum + count, 0);

  const message = [
    '📊 *Итоги дня — LinkedIn инвайты*',
    '',
    ...lines,
    '',
    `*Итого:* ${total} инвайтов со всех аккаунтов`
  ].join('\n');

  await sendSlackMessage(message);
  resetCounts();
}

// ─── Webhook endpoint ─────────────────────────────────────────────────────────

app.post('/webhook/grinfi', (req, res) => {
  const body = req.body;

  if (body.event_name !== 'sender_profile_sent_linkedin_connection_request') {
    return res.status(200).json({ status: 'ignored', event: body.event_name });
  }

  const label = body?.sender_profile?.label || body?.sender_profile?.uuid || 'Unknown Account';

  const counts = loadCounts();
  counts[label] = (counts[label] || 0) + 1;
  saveCounts(counts);

  console.log(`[Webhook] Invite counted for: ${label} (total today: ${counts[label]})`);

  res.status(200).json({ status: 'ok', account: label, count: counts[label] });
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  const counts = loadCounts();
  res.json({ status: 'ok', today: counts });
});

// ─── Manual trigger (for testing) ─────────────────────────────────────────────

app.post('/trigger-report', async (req, res) => {
  console.log('[Manual] EOD report triggered manually');
  await sendEodReport();
  res.json({ status: 'ok', message: 'Report sent' });
});

// ─── Cron: 18:00 Kyiv time (UTC+3 → 15:00 UTC) ───────────────────────────────

cron.schedule('0 15 * * *', async () => {
  console.log('[Cron] Running EOD report at 18:00 Kyiv time');
  await sendEodReport();
}, {
  timezone: 'Europe/Kyiv'
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] Webhook URL: POST /webhook/grinfi`);
  console.log(`[Server] EOD report scheduled at 18:00 Kyiv time`);
  if (!SLACK_WEBHOOK_URL) {
    console.warn('[Warning] SLACK_WEBHOOK_URL is not set!');
  }
});

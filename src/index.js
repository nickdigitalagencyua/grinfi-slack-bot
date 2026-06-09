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
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return {}; }
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
  if (!SLACK_WEBHOOK_URL) { console.error('[Slack] SLACK_WEBHOOK_URL is not set'); return; }
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

  const lines = accounts.map(([label, count]) =>
    `• *${label}*: отправлено ${count} инвайт${plural(count)}`
  );
  const total = accounts.reduce((sum, [, count]) => sum + count, 0);

  const message = [
    '📊 *Итоги дня — LinkedIn инвайты*',
    '',
    ...lines,
    '',
    `*Итого:* ${total} инвайт${plural(total)} со всех аккаунтов`
  ].join('\n');

  await sendSlackMessage(message);
  resetCounts();
}

function plural(n) {
  if (n % 10 === 1 && n % 100 !== 11) return '';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'а';
  return 'ов';
}

// ─── Reply notification ───────────────────────────────────────────────────────

async function sendReplyNotification(body) {
  const account = body?.sender_profile?.label ||
    `${body?.sender_profile?.first_name || ''} ${body?.sender_profile?.last_name || ''}`.trim() ||
    'Неизвестный аккаунт';

  const contact = body?.contact || {};
  const name = contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Неизвестный';
  const position = contact.position || '';
  const company = contact.company_name || '';
  const linkedin = contact.linkedin_url || contact.linkedin || '';

  const messageText = body?.linkedin_message?.text || '';
  const shortText = messageText.length > 200
    ? messageText.substring(0, 200) + '...'
    : messageText;

  const who = [position, company].filter(Boolean).join(' · ');

  const lines = [
    '💬 *Новый ответ — LinkedIn*',
    '',
    `*Аккаунт:* ${account}`,
    `*От:* ${name}${who ? ' · ' + who : ''}`,
  ];

  if (shortText) lines.push(`*Сообщение:* "${shortText}"`);
  if (linkedin) lines.push(`*Профиль:* ${linkedin}`);

  await sendSlackMessage(lines.join('\n'));
}

// ─── Webhook endpoint ─────────────────────────────────────────────────────────

app.post('/webhook/grinfi', async (req, res) => {
  const body = req.body;
  const event = body.event_name;

  console.log(`[Webhook] Event: ${event}`);

  if (event === 'sender_profile_sent_linkedin_connection_request') {
    const label = body?.sender_profile?.label ||
      `${body?.sender_profile?.first_name || ''} ${body?.sender_profile?.last_name || ''}`.trim() ||
      'Unknown Account';

    const counts = loadCounts();
    counts[label] = (counts[label] || 0) + 1;
    saveCounts(counts);
    console.log(`[Webhook] Invite counted for: ${label} (today: ${counts[label]})`);
    return res.status(200).json({ status: 'ok', account: label, count: counts[label] });
  }

  if (event === 'contact_replied_linkedin_message') {
    await sendReplyNotification(body);
    return res.status(200).json({ status: 'ok', event });
  }

  res.status(200).json({ status: 'ignored', event });
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', today: loadCounts() });
});

// ─── Manual triggers ──────────────────────────────────────────────────────────

app.post('/trigger-report', async (req, res) => {
  console.log('[Manual] EOD report triggered');
  res.json({ status: 'ok' });
  await sendEodReport();
});

app.post('/trigger-reply-test', async (req, res) => {
  console.log('[Manual] Reply test triggered');
  res.json({ status: 'ok' });
  await sendReplyNotification({
    sender_profile: { label: 'Victoria Koko' },
    contact: {
      name: 'John Smith',
      position: 'CEO',
      company_name: 'Acme Corp',
      linkedin_url: 'https://linkedin.com/in/johnsmith'
    },
    linkedin_message: { text: 'Интересно, давайте созвонимся на этой неделе!' }
  });
});

// ─── Cron: 18:00 Kyiv ─────────────────────────────────────────────────────────

cron.schedule('0 18 * * *', async () => {
  console.log('[Cron] EOD report at 18:00 Kyiv');
  await sendEodReport();
}, { timezone: 'Europe/Kyiv' });

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  if (!SLACK_WEBHOOK_URL) console.warn('[Warning] SLACK_WEBHOOK_URL is not set!');
});

// LINE webhook receiver for Nina | NES Inc.
// Vercel Serverless Function, no dependencies.
// Env vars (set in Vercel, never in code or chat):
//   LINE_CHANNEL_SECRET - from LINE Developers, Basic settings tab
//   LINE_CHANNEL_ACCESS_TOKEN - optional, only if you later add auto-reply
//
// Behaviour v1: verify signature, return 200 fast, log events in memory.
// It does NOT auto-reply, so it will not use message quota by itself.
// Recent events are visible at GET /api/events (for Muse / owner checks).
import crypto from 'crypto';

export const config = {
  api: { bodyParser: false },
};

const MAX_EVENTS = 100;
if (!globalThis.__lineEvents) globalThis.__lineEvents = [];

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac('SHA256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(hmac);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function summarise(event) {
  const src = event.source || {};
  return {
    receivedAt: new Date().toISOString(),
    type: event.type || null,
    timestamp: event.timestamp || null,
    mode: event.mode || null,
    sourceType: src.type || null,
    groupId: src.groupId || null,
    roomId: src.roomId || null,
    userId: src.userId || null,
    replyToken: event.replyToken || null,
    messageType: event.message ? event.message.type : null,
    messageText: event.message && event.message.text ? event.message.text : null,
    raw: event,
  };
}

function sendJson(res, status, obj) {
  if (typeof res.status === 'function') {
    res.status(status).json(obj);
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'POST only' });
    return;
  }
  const rawBody = await readRawBody(req);
  const signature = req.headers['x-line-signature'];
  const secret = process.env.LINE_CHANNEL_SECRET;

  // LINE Verify sends an empty events array. It still carries a signature,
  // so we verify it the same way. Without a secret we cannot verify.
  if (!secret) {
    console.error('LINE_CHANNEL_SECRET is not set');
    sendJson(res, 500, { ok: false, error: 'server secret is not set' });
    return;
  }
  if (!verifySignature(rawBody, signature, secret)) {
    console.error('LINE signature verification failed');
    sendJson(res, 401, { ok: false, error: 'invalid signature' });
    return;
  }

  let body = {};
  try {
    body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
  } catch (e) {
    sendJson(res, 400, { ok: false, error: 'invalid JSON' });
    return;
  }

  const events = Array.isArray(body.events) ? body.events : [];
  for (const ev of events) {
    const item = summarise(ev);
    globalThis.__lineEvents.unshift(item);
    console.log('LINE event', JSON.stringify(item));
  }
  if (globalThis.__lineEvents.length > MAX_EVENTS) {
    globalThis.__lineEvents.length = MAX_EVENTS;
  }

  // Return 200 fast. Heavy work must happen after this, not before.
  sendJson(res, 200, { ok: true, received: events.length });
}

// GET /api/events - show recent LINE events logged by /api/webhook.
// v1 is for the owner / Muse to check what arrived, e.g. a groupId.
// Do not share this URL publicly. Add auth before using it in production
// for a wider team.
export default async function handler(req, res) {
  const events = globalThis.__lineEvents || [];
  const payload = { ok: true, count: events.length, events };
  if (typeof res.status === 'function') {
    res.status(200).json(payload);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

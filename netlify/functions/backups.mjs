import { getStore } from "@netlify/blobs";

function tradeStats(trades) {
  const t = Array.isArray(trades) ? trades : [];
  return {
    count: t.length,
    withJournal: t.filter(x => x.journal || x.whyEntered || x.lesson).length,
    withCharts: t.filter(x => x.chartImage).length,
    withAnnotations: t.filter(x => x.annotations && x.annotations.length).length,
  };
}

export const handler = async (event) => {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    const store = getStore({
      name: "jo-trades",
      consistency: "strong",
      siteID: "1e22ab49-ea92-44a8-929a-bd8ce89932df",
      token: process.env.NETLIFY_AUTH_TOKEN,
    });

    // ── LIST BACKUPS ──
    if (event.httpMethod === "GET") {
      const listed = await store.list({ prefix: "backups/" });
      const keys = (listed.blobs || []).map(b => b.key).sort().reverse(); // newest first
      const backups = [];
      for (const key of keys) {
        let meta = null;
        try {
          const m = await store.getMetadata(key);
          meta = m && m.metadata ? m.metadata : null;
        } catch (e) {}
        backups.push({ key, stats: meta });
      }
      // Also report what's live right now
      let liveStats = null;
      try {
        const live = await store.get("trades", { type: "json" });
        liveStats = tradeStats(live || []);
      } catch (e) {}
      return { statusCode: 200, headers, body: JSON.stringify({ backups, live: liveStats }) };
    }

    // ── RESTORE A BACKUP ──
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const key = body.key;
      if (!key || !key.startsWith("backups/")) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Invalid backup key" }) };
      }
      const backup = await store.get(key, { type: "json" });
      if (!backup || !Array.isArray(backup)) {
        return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: "Backup not found or unreadable" }) };
      }
      // Snapshot the CURRENT live data first, so a restore is itself reversible
      const current = await store.get("trades", { type: "json" });
      if (current && Array.isArray(current) && current.length > 0) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        await store.setJSON(`backups/pre-restore-${stamp}`, current, { metadata: tradeStats(current) });
      }
      await store.setJSON("trades", backup);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, restored: key, stats: tradeStats(backup) }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};

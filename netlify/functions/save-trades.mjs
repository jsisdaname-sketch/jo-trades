import { getStore } from "@netlify/blobs";

// How many automatic backups to keep
const MAX_BACKUPS = 40;
// Don't create a new backup more often than this (unless data shrank — see below)
const MIN_BACKUP_GAP_MS = 30 * 60 * 1000; // 30 minutes

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
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  try {
    const body = JSON.parse(event.body);
    const store = getStore({
      name: "jo-trades",
      consistency: "strong",
      siteID: "1e22ab49-ea92-44a8-929a-bd8ce89932df",
      token: process.env.NETLIFY_AUTH_TOKEN,
    });

    if (body.trades !== undefined) {
      // ── SAFETY NET ──
      // Before overwriting, snapshot whatever is currently stored.
      // This makes EVERY save reversible from /backups.
      const current = await store.get("trades", { type: "json" });

      if (current && Array.isArray(current) && current.length > 0) {
        const curStats = tradeStats(current);
        const newStats = tradeStats(body.trades);

        // Is the incoming save "suspicious"? (losing trades or losing journal/chart data)
        const suspicious =
          newStats.count < curStats.count ||
          newStats.withJournal < curStats.withJournal ||
          newStats.withCharts < curStats.withCharts;

        // Find newest existing backup to rate-limit routine snapshots
        let newestBackupTime = 0;
        let backupKeys = [];
        try {
          const listed = await store.list({ prefix: "backups/" });
          backupKeys = (listed.blobs || []).map(b => b.key).sort();
          if (backupKeys.length) {
            const newest = backupKeys[backupKeys.length - 1];
            const stamp = newest.replace("backups/", "").replace("pre-restore-", "");
            const iso = stamp.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/, "$1-$2-$3T$4:$5:$6");
            const parsed = Date.parse(iso);
            if (!isNaN(parsed)) newestBackupTime = parsed;
          }
        } catch (e) {}

        const dueForRoutineBackup = Date.now() - newestBackupTime > MIN_BACKUP_GAP_MS;

        // Always back up when suspicious; otherwise at most every 30 min
        if (suspicious || dueForRoutineBackup) {
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          await store.setJSON(`backups/${stamp}`, current, { metadata: curStats });
          backupKeys.push(`backups/${stamp}`);
          backupKeys.sort();
          // Prune oldest beyond MAX_BACKUPS
          const excess = backupKeys.slice(0, Math.max(0, backupKeys.length - MAX_BACKUPS));
          for (const k of excess) {
            try { await store.delete(k); } catch (e) {}
          }
        }
      }

      await store.setJSON("trades", body.trades);
    }

    return { statusCode: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};

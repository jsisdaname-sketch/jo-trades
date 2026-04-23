import { getStore } from "@netlify/blobs";

function parseRow(row) {
  const r = [];
  let cur = "", q = false;
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '"') q = !q;
    else if (row[i] === "," && !q) { r.push(cur); cur = ""; }
    else cur += row[i];
  }
  r.push(cur);
  return r;
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const { csvText } = await req.json();
  if (!csvText) {
    return Response.json({ error: "No CSV data provided" }, { status: 400 });
  }

  const store = getStore({ name: "jo-budget", consistency: "strong" });
  const existing = (await store.get("transactions", { type: "json" })) || [];
  const existingCats = (await store.get("categories", { type: "json" })) || null;

  const lines = csvText.split("\n").filter((l) => l.trim());
  const cols = lines[0].toLowerCase().split(",").map((c) => c.replace(/"/g, "").trim());
  let di = cols.findIndex((c) => c.includes("date") || c.includes("transaction date"));
  let dsc = cols.findIndex((c) => c === "description" || c === "merchant");
  let ai = cols.findIndex((c) => c.includes("amount"));
  let ti = cols.findIndex((c) => c === "type");
  let ci = cols.findIndex((c) => c === "category");
  let ni = cols.findIndex((c) => c === "notes");
  let si = cols.findIndex((c) => c === "source");
  if (di < 0) di = 0;
  if (dsc < 0) dsc = 1;
  if (ai < 0) ai = cols.length - 1;

  const keys = new Set(existing.map((r) => r.description + "|" + r.date + "|" + r.amount));
  const newTxs = [];
  const newCats = new Set(existingCats || []);
  let imported = 0, skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    if (row.length < 3) continue;
    const rawDate = (row[di] || "").trim();
    const rawDesc = (row[dsc] || "").trim();
    const rawAmt = (row[ai] || "").replace(/[^0-9.\-]/g, "").trim();
    const rawType = ti >= 0 ? (row[ti] || "").trim().toLowerCase() : "";
    const rawCat = ci >= 0 ? (row[ci] || "").trim() : "Other";
    const rawNotes = ni >= 0 ? (row[ni] || "").trim() : "";
    const rawSource = si >= 0 ? (row[si] || "").trim() : "manual";

    if (!rawDate || !rawDesc || !rawAmt) { skipped++; continue; }
    const amt = parseFloat(rawAmt);
    if (isNaN(amt) || amt === 0) { skipped++; continue; }
    const d = new Date(rawDate);
    if (isNaN(d)) { skipped++; continue; }
    const dateStr = d.toISOString().split("T")[0];
    const absAmt = Math.abs(amt);
    const type = rawType === "income" || rawType === "expense" ? rawType : (amt > 0 ? "income" : "expense");
    const key = rawDesc + "|" + dateStr + "|" + absAmt;
    if (keys.has(key)) { skipped++; continue; }
    keys.add(key);
    if (rawCat) newCats.add(rawCat);
    newTxs.push({
      id: Date.now() + "_" + i,
      description: rawDesc,
      amount: absAmt,
      type,
      category: rawCat,
      date: dateStr,
      notes: rawNotes || null,
      image: null,
      source: rawSource,
    });
    imported++;
  }

  const all = [...existing, ...newTxs];
  await store.setJSON("transactions", all);
  if (newCats.size > 0) {
    await store.setJSON("categories", [...newCats]);
  }

  return Response.json({ imported, skipped, total: all.length, categories: [...newCats] });
};

export const config = { path: "/api/import-csv" };

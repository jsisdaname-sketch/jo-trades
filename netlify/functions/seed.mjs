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

const CSV_DATA = `Date,Description,Type,Category,Amount,Notes,Source
2026-04-01,"Home Depot",expense,Shopping,16.44,"",manual
2026-04-03,"chick fil a",expense,Food,13.82,"",manual
2026-04-03,"home depot",expense,Shopping,9.35,"",manual
2026-04-05,"Pollo Tropical",expense,Food,31.92,"Me and Vanessa",manual
2026-04-06,"Chipotle",expense,Food,18.9,"",manual
2026-04-06,"Raising Canes",expense,Food,11.76,"",manual
2026-04-09,"starbucks",expense,Food,4.23,"for vanessa dad did not pay",manual
2026-04-09,"VOVO 200 Company Logistics",income,Business,200,"VOVO gave me 200 for SPN (Sylvester Palm Nursery)",manual
2026-04-10,"KJM",expense,Tithes,70,"",manual
2026-04-10,"Motek Payroll",income,Motek (Job),488.38,"",manual
2026-04-11,"Chiptole",expense,Food,17.63,"Protein double chicken Poppi post gym,",manual
2026-04-12,"Khols PILLOW",expense,Food,21.29,"APPLE CARD 2 PERCENT",manual
2026-04-12,"GUACA GO",expense,Food,17.08,"APPLE CARD 2",manual
2026-04-12,"flowers",expense,Gifts,24.59,"vanessa flowers and moochies",manual
2026-04-12,"khols first pillow",expense,Shopping,44.72,"",manual
2026-04-12,"KJM",expense,Tithes,59.62,"",manual
2026-04-12,"Motek Food",expense,Food,21.62,"",manual
2026-04-12,"Dad Money Food",income,Food Zelles,70,"",manual
2026-04-12,"Payroll Motek",income,Motek (Job),542.01,"",manual`;

export default async (req) => {
  const store = getStore({ name: "jo-budget", consistency: "strong" });
  const existing = await store.get("transactions", { type: "json" });
  if (existing && existing.length > 0) {
    return Response.json({ message: "Data already exists", count: existing.length, seeded: false });
  }

  const lines = CSV_DATA.split("\n").filter((l) => l.trim());
  const cols = lines[0].toLowerCase().split(",").map((c) => c.replace(/"/g, "").trim());
  const di = 0, dsc = 1, ti = 2, ci = 3, ai = 4, ni = 5, si = 6;
  const txs = [];
  const cats = new Set();

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    if (row.length < 5) continue;
    const dateStr = row[di].trim();
    const desc = row[dsc].trim();
    const type = row[ti].trim();
    const cat = row[ci].trim();
    const amt = parseFloat(row[ai].replace(/[^0-9.\-]/g, ""));
    const notes = (row[ni] || "").trim() || null;
    const source = (row[si] || "manual").trim();
    if (!dateStr || !desc || isNaN(amt)) continue;
    cats.add(cat);
    txs.push({ id: Date.now() + "_" + i, description: desc, amount: Math.abs(amt), type, category: cat, date: dateStr, notes, image: null, source });
  }

  await store.setJSON("transactions", txs);
  await store.setJSON("categories", [...cats]);
  return Response.json({ message: "Seeded", count: txs.length, categories: [...cats], seeded: true });
};

export const config = { path: "/api/seed" };

import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "jo-budget", consistency: "strong" });
  const transactions = await store.get("transactions", { type: "json" });
  const categories = await store.get("categories", { type: "json" });
  const budgets = await store.get("budgets", { type: "json" });
  const settings = await store.get("settings", { type: "json" });
  return Response.json({
    transactions: transactions || [],
    categories: categories || null,
    budgets: budgets || null,
    settings: settings || null,
  });
};

export const config = { path: "/api/get-data" };

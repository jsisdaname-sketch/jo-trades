import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "jo-budget", consistency: "strong" });
  const transactions = await store.get("transactions", { type: "json" });
  const categories = await store.get("categories", { type: "json" });
  return Response.json({
    transactions: transactions || [],
    categories: categories || null,
  });
};

export const config = { path: "/api/get-data" };

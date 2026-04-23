import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "jo-trades", consistency: "strong" });
  const trades = await store.get("trades", { type: "json" });
  return Response.json({
    trades: trades || [],
  });
};

export const config = { path: "/api/get-trades" };

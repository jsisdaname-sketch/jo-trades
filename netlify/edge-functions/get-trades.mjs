import { getStore } from "@netlify/blobs";
export default async (req, context) => {
  try {
    const store = getStore({ name: "jo-trades", consistency: "strong" });
    const trades = await store.get("trades", { type: "json" });
    return new Response(JSON.stringify({ trades: trades || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ trades: [], error: e.message }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
};
export const config = { path: "/api/get-trades" };

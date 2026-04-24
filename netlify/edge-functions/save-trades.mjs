import { getStore } from "@netlify/blobs";
export default async (req, context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const body = await req.json();
    const store = getStore({ name: "jo-trades", consistency: "strong" });
    if (body.trades !== undefined) await store.setJSON("trades", body.trades);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
};
export const config = { path: "/api/save-trades" };

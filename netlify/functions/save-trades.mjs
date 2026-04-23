import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const body = await req.json();
  const store = getStore({ name: "jo-trades", consistency: "strong" });

  if (body.trades !== undefined) {
    await store.setJSON("trades", body.trades);
  }
  return Response.json({ ok: true });
};

export const config = { path: "/api/save-trades" };

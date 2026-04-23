import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const body = await req.json();
  const store = getStore({ name: "jo-budget", consistency: "strong" });

  if (body.transactions !== undefined) {
    await store.setJSON("transactions", body.transactions);
  }
  if (body.categories !== undefined) {
    await store.setJSON("categories", body.categories);
  }
  return Response.json({ ok: true });
};

export const config = { path: "/api/save-data" };

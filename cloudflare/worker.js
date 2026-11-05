// Cloudflare Worker — serve a página (pasta /public) e a CAPI em /api/capi (mesmo domínio).
// Secrets/variáveis: META_PIXEL_ID, META_CAPI_TOKEN, META_TEST_EVENT_CODE (opcional)

const GRAPH_VERSION = "v21.0";
const ALLOWED_EVENTS = new Set(["PageView", "ViewContent", "Lead", "Contact"]);

async function sha256(v) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(v).trim().toLowerCase()));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

async function handleCapi(request, env) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return json({ ok: false, error: "missing_env" }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const { event_name, event_id, event_source_url, fbp, fbc, external_id, custom_data } = body || {};
  if (!ALLOWED_EVENTS.has(event_name) || !event_id) return json({ ok: false, error: "invalid_event" }, 400);

  const cf = request.cf || {};
  const user_data = {
    client_ip_address: request.headers.get("CF-Connecting-IP") || undefined,
    client_user_agent: request.headers.get("User-Agent") || undefined,
    fbp: fbp || undefined,
    fbc: fbc || undefined,
    external_id: external_id ? [await sha256(external_id)] : undefined,
    country: cf.country ? [await sha256(cf.country)] : undefined,
    st: cf.regionCode ? [await sha256(cf.regionCode)] : undefined,
    ct: cf.city ? [await sha256(cf.city.replace(/\s+/g, ""))] : undefined,
  };

  const payload = {
    data: [{
      event_name,
      event_id: String(event_id),
      event_time: Math.floor(Date.now() / 1000),
      action_source: "website",
      event_source_url: event_source_url || request.headers.get("Referer") || undefined,
      user_data,
      custom_data: custom_data && typeof custom_data === "object" ? custom_data : undefined,
    }],
    ...(env.META_TEST_EVENT_CODE ? { test_event_code: env.META_TEST_EVENT_CODE } : {}),
  };

  const r = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
  );
  const result = await r.json();
  if (!r.ok) console.error("CAPI error", JSON.stringify(result));
  return json({ ok: r.ok, meta: r.ok ? result : result?.error?.message }, r.ok ? 200 : 502);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/capi") return handleCapi(request, env);
    return env.ASSETS.fetch(request); // página estática
  },
};

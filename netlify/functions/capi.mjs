// Meta Conversions API (CAPI) — recebe eventos da página e repassa para a Meta.
// Variáveis de ambiente (Netlify > Site configuration > Environment variables):
//   META_PIXEL_ID        -> ID do Pixel/Dataset
//   META_CAPI_TOKEN      -> Token de acesso da API de Conversões (gerado no Gerenciador de Eventos)
//   META_TEST_EVENT_CODE -> (opcional) código de teste, ex: TEST12345. Remova em produção.

import { createHash } from "node:crypto";

const GRAPH_VERSION = "v21.0";
const ALLOWED_EVENTS = new Set(["PageView", "ViewContent", "Lead", "Contact"]);

const sha256 = (v) => createHash("sha256").update(String(v).trim().toLowerCase()).digest("hex");

export default async (req, context) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const pixelId = Netlify.env.get("META_PIXEL_ID");
  const token = Netlify.env.get("META_CAPI_TOKEN");
  const testCode = Netlify.env.get("META_TEST_EVENT_CODE");
  if (!pixelId || !token) return Response.json({ ok: false, error: "missing_env" }, { status: 500 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const { event_name, event_id, event_source_url, fbp, fbc, external_id, custom_data } = body || {};
  if (!ALLOWED_EVENTS.has(event_name) || !event_id) {
    return Response.json({ ok: false, error: "invalid_event" }, { status: 400 });
  }

  const user_data = {
    client_ip_address: context.ip || req.headers.get("x-nf-client-connection-ip") || undefined,
    client_user_agent: req.headers.get("user-agent") || undefined,
    fbp: fbp || undefined,
    fbc: fbc || undefined,
    external_id: external_id ? [sha256(external_id)] : undefined,
  };
  // Dados de geolocalização do Netlify (hash conforme exigido pela Meta)
  const geo = context.geo || {};
  if (geo.country?.code) user_data.country = [sha256(geo.country.code)];
  if (geo.subdivision?.code) user_data.st = [sha256(geo.subdivision.code)];
  if (geo.city) user_data.ct = [sha256(geo.city.replace(/\s+/g, ""))];

  const payload = {
    data: [
      {
        event_name,
        event_id: String(event_id),
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: event_source_url || req.headers.get("referer") || undefined,
        user_data,
        custom_data: custom_data && typeof custom_data === "object" ? custom_data : undefined,
      },
    ],
    ...(testCode ? { test_event_code: testCode } : {}),
  };

  try {
    const r = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
    const result = await r.json();
    if (!r.ok) console.error("CAPI error", JSON.stringify(result));
    return Response.json({ ok: r.ok, meta: r.ok ? result : result?.error?.message }, { status: r.ok ? 200 : 502 });
  } catch (err) {
    console.error("CAPI fetch failed", err);
    return Response.json({ ok: false, error: "fetch_failed" }, { status: 502 });
  }
};

export const config = { path: "/api/capi" };

# Abuse — página ponte para o grupo de WhatsApp

Página de intermediação (tráfego Meta Ads → grupo de WhatsApp) com **Meta Pixel + API de Conversões (CAPI)** deduplicados por `event_id`.

## Eventos
| Momento | Pixel (navegador) | CAPI (servidor) |
|---|---|---|
| Página carregou | `PageView` | `PageView` (mesmo `event_id`) |
| Clique em "Entrar no grupo" | `Lead` | `Lead` (mesmo `event_id`) |

A CAPI envia: IP, user agent, `fbp`, `fbc` (gerado a partir do `fbclid`), `external_id` (hash SHA-256) e país/estado/cidade (hash).

## Configuração (Netlify)
1. Em `public/index.html`, troque `723038699406275` (2 lugares) pelo ID do Pixel.
2. Em **Site configuration → Environment variables**, crie:
   - `META_PIXEL_ID` — mesmo ID do Pixel
   - `META_CAPI_TOKEN` — token gerado em Gerenciador de Eventos → Configurações → API de Conversões
   - `META_TEST_EVENT_CODE` — (opcional) para validar na aba "Testar eventos"; apague depois
3. Faça o deploy (publish dir `public`, functions em `netlify/functions` — já no `netlify.toml`).

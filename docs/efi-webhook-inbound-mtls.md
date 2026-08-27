# Efí Pix webhook on Vercel

The current Vercel/Next.js deployment does not terminate client-certificate mTLS inside a Function, so strict inbound mTLS is not implemented at the application route. Efí's Pix API provides an official `x-skip-mtls-checking: true` registration mode for environments that cannot configure inbound mTLS. STAR CARVALHOS uses that mode instead of requiring a VPS.

## Production topology

Efí Pix -> HTTPS `starcarvalho.vercel.app/api/webhooks/efi-pix?...` -> Vercel -> public webhook receiver -> `PaymentService.processEfiPixWebhook` -> Supabase.

The public receiver is fail-closed and requires both:

1. a long random query secret in `EFI_PIX_WEBHOOK_HMAC_SECRET`, compared timing-safely; and
2. the requester IP to match `EFI_PIX_WEBHOOK_ALLOWED_IPS` (Efí's documented webhook source IP by default).

Vercel overwrites `x-forwarded-for` for ordinary requests to prevent clients from spoofing the source IP. The HMAC is still mandatory so IP filtering is never the only authentication control.

The registered URL intentionally ends with an `ignorar=` query parameter. Efí appends `/pix` when delivering Pix notifications; with this URL shape the appended suffix becomes part of the ignored query value instead of changing the Next.js route path.

## Registration

Registration is performed server-side through `PUT /v2/webhook/:chave`, using the existing Production Efí OAuth and P12 credentials and the `x-skip-mtls-checking: true` header. A CEO owner/manager can trigger the one-time registration through `POST /api/ceo/efi-pix-webhook/register` after the Production webhook environment variables are configured.

No secret belongs in source control or browser JavaScript. The public receiver accepts the Efí registration probe without creating or settling a payment.

## Financial truth and recovery

Webhook delivery is a low-latency prompt, not the sole financial source of truth. The existing authenticated reconciliation flow (`GET /v2/cob/:txid` through the Efí client) remains active as a fallback. Database processing remains idempotent by Efí payment reference/end-to-end identifiers, so duplicate callbacks must not duplicate settlement effects.

References:
- Efí Pix webhooks: https://dev.efipay.com.br/docs/api-pix/webhooks/
- Vercel request headers: https://vercel.com/docs/headers/request-headers

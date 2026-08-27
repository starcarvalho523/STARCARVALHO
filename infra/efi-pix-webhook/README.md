# Efí Pix Production webhook on VPS

This directory contains the inbound mTLS boundary for Efí Pix Production callbacks.

## Architecture

Efí -> HTTPS/mTLS Nginx on Linux VPS -> local Node forwarder -> authenticated HTTPS -> `https://starcarvalho.vercel.app/api/internal/efi-pix-webhook`

The internal Vercel route remains private and requires `Authorization: Bearer <EFI_WEBHOOK_FORWARD_SECRET>`. Reconciliation against Efí remains the financial source of truth; webhook callbacks only accelerate confirmation.

## Required DNS

Create a dedicated hostname such as `pix-webhook.example.com` pointing with an A record to the VPS public IPv4. Do not use the main application hostname.

## Secrets

Generate two independent random secrets on the VPS. Never commit them:

- `EFI_WEBHOOK_FORWARD_SECRET`: shared only between the VPS forwarder and Vercel Production.
- `EFI_WEBHOOK_URL_TOKEN`: used as the additional URL token/HMAC-style identifier registered with Efí.

Example generation on the VPS:

```bash
openssl rand -hex 32
```

Store them in `/etc/starcarvalho/efi-pix-webhook.env` with mode `600`.

## Efí Production CA

Use the official Efí Production webhook certificate chain:

`https://certificados.efipay.com.br/webhooks/certificate-chain-prod.crt`

Place it at `/etc/nginx/efi/certificate-chain-prod.crt` and configure Nginx to require a valid client certificate only on `/webhook` and `/webhook/pix`.

## Environment file

```dotenv
PORT=8787
EFI_WEBHOOK_FORWARD_URL=https://starcarvalho.vercel.app/api/internal/efi-pix-webhook
EFI_WEBHOOK_FORWARD_SECRET=replace-with-random-secret
EFI_WEBHOOK_URL_TOKEN=replace-with-independent-random-secret
```

The same `EFI_WEBHOOK_FORWARD_SECRET` must exist in Vercel Production. Do not expose either secret to the browser.

## Registration URL

Register the Efí webhook using the dedicated HTTPS hostname and the URL token, for example:

`https://pix-webhook.example.com/webhook?token=<EFI_WEBHOOK_URL_TOKEN>`

Efí validates the registered URL and sends actual Pix callbacks to the registered URL plus `/pix`. The receiver accepts both `/webhook` for validation and `/webhook/pix` for callbacks.

## Verification checklist

1. `https://HOST/healthz` returns HTTP 200 without client mTLS.
2. `POST https://HOST/webhook?...` without an Efí client certificate is rejected during TLS/HTTP handling by Nginx.
3. Efí webhook registration succeeds in Production.
4. A new legitimate Pix payment is confirmed via webhook and reconciliation returns the same `endToEndId`.
5. Duplicate callbacks are idempotent in the application database.
6. No browser-accessible route accepts the forward secret.

## Operational fallback

If the VPS webhook is unavailable, the existing `/api/payments/efi-pix/reconcile` polling path continues to reconcile the payment directly against Efí. Do not mark a payment PAID solely because a callback arrived; the server-side payment service validates and persists the event through the existing hardened flow.

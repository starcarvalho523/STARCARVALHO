# Efí Pix webhook inbound mTLS

`VERCEL_INBOUND_MTLS_SUPPORTED=false` for the current Vercel/Next.js deployment. Vercel Functions expose an HTTP `Request`; they do not expose a supported configuration to require a client certificate, configure the Efí CA chain, or inspect the TLS peer certificate during the inbound handshake. Vercel's certificate tooling concerns certificates served for domains, not client-certificate authentication.

Do not register an Efí webhook on Vercel until an inbound mTLS boundary exists. HMAC in `EFI_WEBHOOK_HMAC_SECRET` and an IP allowlist are defense-in-depth only; neither substitutes for the client certificate. Keep the HMAC out of source control and compare it timing-safely at the receiver.

Recommended future topology: Efí -> HTTPS/mTLS endpoint on the existing Linux VPS -> Nginx or Caddy validates the public Efí client-certificate chain and rejects handshakes without it -> dedicated receiver validates HMAC and derives idempotency from `endToEndId` -> authenticated HTTPS forward to an internal STAR CARVALHOS endpoint. Reconciliation through `GET /v2/cob/:txid` remains the financial source of truth; callbacks are only a prompt.

No public webhook route, webhook registration, database write, or payment transition is included in this phase.

References: [Vercel Functions API](https://vercel.com/docs/functions/functions-api-reference), [Vercel certificates](https://vercel.com/docs/cli/certs).

# Efí Pix webhook

OAuth/mTLS is sandbox-only and disabled by default. Future Homologation secrets are `EFI_ENABLED`, `EFI_ENVIRONMENT`, `EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`, and `EFI_CERTIFICATE_BASE64`; the P12 is decoded only in memory. `EFI_PIX_KEY` is a separate future PIX-charge requirement. Production remains blocked in code.

Efí Pix uses mutual TLS. A Vercel route must not substitute a fixed token for mTLS. This foundation intentionally exposes no Efí webhook route. Before activation, validate whether the chosen ingress can terminate mTLS while preserving authenticated delivery to Star Carvalhos; otherwise use an approved mTLS-capable gateway and signed internal forwarding.

For Pix charges, Efí documents `REMOVIDA_PELO_USUARIO_RECEBEDOR` as removed/cancelled by the receiving user. It maps to the existing internal `CANCELLED` state, not `EXPIRED`. Source: https://dev.efipay.com.br/docs/api-pix/status/

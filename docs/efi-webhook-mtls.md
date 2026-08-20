# Efí Pix webhook

Efí Pix uses mutual TLS. A Vercel route must not substitute a fixed token for mTLS. This foundation intentionally exposes no Efí webhook route. Before activation, validate whether the chosen ingress can terminate mTLS while preserving authenticated delivery to Star Carvalhos; otherwise use an approved mTLS-capable gateway and signed internal forwarding.

For Pix charges, Efí documents `REMOVIDA_PELO_USUARIO_RECEBEDOR` as removed/cancelled by the receiving user. It maps to the existing internal `CANCELLED` state, not `EXPIRED`. Source: https://dev.efipay.com.br/docs/api-pix/status/

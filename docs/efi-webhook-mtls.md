# Efí Pix webhook

Efí Pix uses mutual TLS. A Vercel route must not substitute a fixed token for mTLS. This foundation intentionally exposes no Efí webhook route. Before activation, validate whether the chosen ingress can terminate mTLS while preserving authenticated delivery to Star Carvalhos; otherwise use an approved mTLS-capable gateway and signed internal forwarding.

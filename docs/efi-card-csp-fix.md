# Correção Efí: CSP e reconciliação após cancelamento PIX

- `connect-src` permite somente os endpoints browser necessários da Efí para tokenização do cartão: `https://tokenizer.sejaefi.com.br` e `https://cobrancas.api.efipay.com.br`.
- Reconciliação do PIX avulso retorna estado `CANCELLED` sem 502 quando a cobrança foi cancelada durante a troca PIX → cartão.
- Nenhuma permissão de banco, RLS, segredo ou regra financeira foi ampliada.

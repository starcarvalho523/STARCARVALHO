# Fundação de pagamentos — Asaas Sandbox

O domínio financeiro usa a cadeia `Cliente/Frentista → PaymentService → PaymentProvider → AsaasProvider`. Componentes React e regras operacionais não conhecem endpoints, eventos ou estados do Asaas.

## Limites de segurança

- A integração está bloqueada em código para `ASAAS_ENVIRONMENT=sandbox` e para a URL exata `https://api-sandbox.asaas.com/v3`. Uma URL de produção é recusada.
- A sessão precisa estar em `PAYMENT_PENDING`, com `final_amount` congelado no banco. O navegador envia somente o identificador da sessão; nunca envia o valor.
- `private.payment_provider_transactions` separa a transação externa de `payments`. QR Code, referência externa, estado do provider e expiração ficam fora do domínio público.
- `private.payment_provider_events` registra somente payload sanitizado e impõe unicidade por provider e ID do evento.
- `reserve_pix_payment` usa lock transacional por sessão e os índices existentes de `payments`. Cliente e Frentista concorrentes recebem a mesma reserva; somente o criador chama o provider.
- O webhook público `/api/webhooks/asaas` valida `asaas-access-token`, rejeita payload inválido e delega a confirmação atômica ao PostgreSQL.
- Apenas `PAYMENT_RECEIVED`, com provider payment ID e valor exatos, confirma o PIX. `PAYMENT_CONFIRMED` permanece pendente porque pode ser um estado transitório no Asaas.
- A confirmação atualiza `payments` e leva a sessão a `PAID`; nunca muda a sessão para `EXITED`. A liberação continua exclusiva do Frentista.
- Valor divergente leva a sessão a `MANUAL_REVIEW`; cobrança desconhecida é ignorada financeiramente; evento repetido não produz novo efeito.
- Dinheiro e cartão manual continuam inalterados durante a homologação.

## Crédito e débito

Crédito está preparado no provider por cobrança `CREDIT_CARD` e URL hospedada, sem captura nem armazenamento de cartão. Débito não possui processamento direto: uma etapa futura poderá usar somente a experiência hospedada suportada pelo Asaas.

## Configuração externa

Variáveis exclusivamente server-side: `ASAAS_ENVIRONMENT`, `ASAAS_BASE_URL`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` e `ASAAS_SANDBOX_CUSTOMER_ID`.

O cliente Sandbox precisa ser previamente criado com dados fictícios permitidos; nenhum CPF/CNPJ é inventado pela aplicação. O webhook deve ser configurado no Asaas com a URL `https://starcarvalho.vercel.app/api/webhooks/asaas` e o mesmo token seguro armazenado em `ASAAS_WEBHOOK_TOKEN`.

Produção financeira permanece desativada.

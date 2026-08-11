# Arquitetura de pagamentos — Star Carvalhos

## Estado atual

`payments` registra a obrigação e o resultado operacional. A sessão de estacionamento continua sendo a origem do valor oficial; o navegador envia somente identificadores e escolhas permitidas. Dinheiro e cartão legado são confirmações manuais vinculadas ao caixa. PIX usa Asaas Sandbox, cobrança idempotente, QR Code e confirmação exclusiva por webhook. Pagamento confirmado (`PAID`) e saída física (`EXITED`) permanecem etapas independentes.

`private.payment_provider_transactions` preserva a identidade e o estado da cobrança externa. `private.payment_provider_events` garante idempotência dos webhooks. As tabelas privadas não aceitam acesso direto de `anon` ou `authenticated`.

## Modelo financeiro da Fase 1

| Dimensão | Valores preparados | Ativos agora |
| --- | --- | --- |
| Método | CASH, PIX, CARD legado, DEBIT_CARD, CREDIT_CARD | CASH, PIX e CARD legado |
| Canal | MANUAL, QR, HOSTED_CHECKOUT, POINT, TAP | MANUAL e QR |
| Provider | INTERNAL, ASAAS, MERCADO_PAGO | INTERNAL e ASAAS |
| Operacional | PENDING, APPROVED, FAILED, CANCELLED, REFUNDED | Derivado do estado atual |
| Liquidação | PENDING, SETTLED, FAILED, CANCELLED, REFUNDED, UNKNOWN | Progressivo |

`amount` continua sendo a fonte compatível da receita operacional. `gross_amount` espelha esse valor. `fee_amount` e `net_amount` permanecem nulos enquanto o provider não fornecer valores comprovados. Nenhuma taxa é estimada.

Registros históricos `CARD` não são convertidos para débito ou crédito. Eles são apresentados como cartão legado e recebem liquidação `UNKNOWN`, pois não existe evidência para classificá-los.

## Disponibilidade

`payment_method_availability` controla método, canal e provider por unidade. O backend combina essa configuração com a presença da configuração server-side do provider. Nenhum segredo é enviado ao navegador. Métodos desabilitados ou não configurados não aparecem na operação e também são recusados pelo RPC financeiro.

Configuração inicial:

- Dinheiro/manual/interno: habilitado.
- PIX/QR/Asaas: habilitado, sujeito à configuração real do runtime.
- CARD/manual/interno: habilitado apenas como compatibilidade legada.
- Débito e crédito novos: desabilitados.
- Mercado Pago Point, Tap e checkout de crédito: não configurados.

## Idempotência e segurança

- O backend calcula o valor oficial.
- Uma sessão mantém no máximo um pagamento corrente `PENDING` ou `PAID`.
- A cobrança PIX mantém referência externa única e não pode ser confirmada manualmente.
- Webhooks são deduplicados por provider e ID do evento.
- Provider externo nunca altera a sessão para `EXITED`.
- Dinheiro físico esperado continua sendo saldo inicial + pagamentos `CASH` confirmados no turno.
- PIX e cartões não compõem dinheiro físico.

## Providers

`PaymentProvider` representa capacidades externas. `AsaasProvider` continua responsável pelo PIX homologado e já possui contrato para crédito hospedado futuro, ainda sem feature ativa. Mercado Pago Point está representado somente como capacidade futura; não existe token, chamada de API, ordem ou botão operacional.

## Mensalistas

Hoje `payments.parking_session_id` é obrigatório. A evolução futura não deve criar sessões fictícias. A estratégia é introduzir uma obrigação financeira genérica (`payment_context_type` + `payment_context_id`, ou uma tabela de obrigações) e migrar o vínculo de forma progressiva antes de tornar `parking_session_id` opcional.

Modelo futuro:

- `monthly_plans`
- `monthly_subscriptions`
- `subscription_vehicles`
- `subscription_invoices`, com competência no formato `YYYY-MM`
- vínculo de invoices com `payments`
- `subscription_events`

Cada fatura deverá preservar plano, assinatura, competência, vencimento, carência, pagamento, status e veículos cobertos.

## Roadmap

1. Infraestrutura financeira.
2. Crédito online Asaas.
3. Preparação Mercado Pago Point.
4. Núcleo de mensalistas.
5. CEO mensalistas.
6. Frentista + mensalistas.
7. Cobranças de mensalidade.
8. Cliente + mensalidade.
9. Point física perto da inauguração.
10. Recorrência automática + analytics.

Débito e crédito não são considerados funcionais nesta fase.

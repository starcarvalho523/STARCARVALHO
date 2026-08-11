# Arquitetura de pagamentos â€” Star Carvalhos

## Estado atual

`payments` registra a obrigaÃ§Ã£o e o resultado operacional. A sessÃ£o de estacionamento continua sendo a origem do valor oficial; o navegador envia somente identificadores e escolhas permitidas. Dinheiro e cartÃ£o legado sÃ£o confirmaÃ§Ãµes manuais vinculadas ao caixa. PIX usa Asaas Sandbox, cobranÃ§a idempotente, QR Code e confirmaÃ§Ã£o exclusiva por webhook. Pagamento confirmado (`PAID`) e saÃ­da fÃ­sica (`EXITED`) permanecem etapas independentes.

`private.payment_provider_transactions` preserva a identidade e o estado da cobranÃ§a externa. `private.payment_provider_events` garante idempotÃªncia dos webhooks. As tabelas privadas nÃ£o aceitam acesso direto de `anon` ou `authenticated`.

## Modelo financeiro da Fase 1

| DimensÃ£o | Valores preparados | Ativos agora |
| --- | --- | --- |
| MÃ©todo | CASH, PIX, CARD legado, DEBIT_CARD, CREDIT_CARD | CASH, PIX e CARD legado |
| Canal | MANUAL, QR, HOSTED_CHECKOUT, POINT, TAP | MANUAL e QR |
| Provider | INTERNAL, ASAAS, MERCADO_PAGO | INTERNAL e ASAAS |
| Operacional | PENDING, APPROVED, FAILED, CANCELLED, REFUNDED | Derivado do estado atual |
| LiquidaÃ§Ã£o | PENDING, SETTLED, FAILED, CANCELLED, REFUNDED, UNKNOWN | Progressivo |

`amount` continua sendo a fonte compatÃ­vel da receita operacional. `gross_amount` espelha esse valor. `fee_amount` e `net_amount` permanecem nulos enquanto o provider nÃ£o fornecer valores comprovados. Nenhuma taxa Ã© estimada.

Registros histÃ³ricos `CARD` nÃ£o sÃ£o convertidos para dÃ©bito ou crÃ©dito. Eles sÃ£o apresentados como cartÃ£o legado e recebem liquidaÃ§Ã£o `UNKNOWN`, pois nÃ£o existe evidÃªncia para classificÃ¡-los.

## Disponibilidade

`payment_method_availability` controla mÃ©todo, canal e provider por unidade. O backend combina essa configuraÃ§Ã£o com a presenÃ§a da configuraÃ§Ã£o server-side do provider. Nenhum segredo Ã© enviado ao navegador. MÃ©todos desabilitados ou nÃ£o configurados nÃ£o aparecem na operaÃ§Ã£o e tambÃ©m sÃ£o recusados pelo RPC financeiro.

ConfiguraÃ§Ã£o inicial:

- Dinheiro/manual/interno: habilitado.
- PIX/QR/Asaas: habilitado, sujeito Ã  configuraÃ§Ã£o real do runtime.
- CARD/manual/interno: habilitado apenas como compatibilidade legada.
- DÃ©bito e crÃ©dito novos: desabilitados.
- Mercado Pago Point, Tap e checkout de crÃ©dito: nÃ£o configurados.

## IdempotÃªncia e seguranÃ§a

- O backend calcula o valor oficial.
- Uma sessÃ£o mantÃ©m no mÃ¡ximo um pagamento corrente `PENDING` ou `PAID`.
- A cobranÃ§a PIX mantÃ©m referÃªncia externa Ãºnica e nÃ£o pode ser confirmada manualmente.
- Webhooks sÃ£o deduplicados por provider e ID do evento.
- Provider externo nunca altera a sessÃ£o para `EXITED`.
- Dinheiro fÃ­sico esperado continua sendo saldo inicial + pagamentos `CASH` confirmados no turno.
- PIX e cartÃµes nÃ£o compÃµem dinheiro fÃ­sico.

## Providers

`PaymentProvider` representa capacidades externas. `AsaasProvider` continua responsÃ¡vel pelo PIX homologado e jÃ¡ possui contrato para crÃ©dito hospedado futuro, ainda sem feature ativa. Mercado Pago Point estÃ¡ representado somente como capacidade futura; nÃ£o existe token, chamada de API, ordem ou botÃ£o operacional.

## Mensalistas

Hoje `payments.parking_session_id` Ã© obrigatÃ³rio. A evoluÃ§Ã£o futura nÃ£o deve criar sessÃµes fictÃ­cias. A estratÃ©gia Ã© introduzir uma obrigaÃ§Ã£o financeira genÃ©rica (`payment_context_type` + `payment_context_id`, ou uma tabela de obrigaÃ§Ãµes) e migrar o vÃ­nculo de forma progressiva antes de tornar `parking_session_id` opcional.

Modelo futuro:

- `monthly_plans`
- `monthly_subscriptions`
- `subscription_vehicles`
- `subscription_invoices`, com competÃªncia no formato `YYYY-MM`
- vÃ­nculo de invoices com `payments`
- `subscription_events`

Cada fatura deverÃ¡ preservar plano, assinatura, competÃªncia, vencimento, carÃªncia, pagamento, status e veÃ­culos cobertos.

## Roadmap

1. Infraestrutura financeira.
2. CrÃ©dito online Asaas.
3. PreparaÃ§Ã£o Mercado Pago Point.
4. NÃºcleo de mensalistas.
5. CEO mensalistas.
6. Frentista + mensalistas.
7. CobranÃ§as de mensalidade.
8. Cliente + mensalidade.
9. Point fÃ­sica perto da inauguraÃ§Ã£o.
10. RecorrÃªncia automÃ¡tica + analytics.

DÃ©bito e crÃ©dito nÃ£o sÃ£o considerados funcionais nesta fase.

## Mercado Pago Point â€” fundaÃ§Ã£o da Fase 3

Esta fase prepara, mas nÃ£o ativa, `DEBIT_CARD + POINT + MERCADO_PAGO` e `CREDIT_CARD + POINT + MERCADO_PAGO`. NÃ£o existe cliente HTTP, access token, Order, webhook Point ativo ou botÃ£o para o Frentista. As duas capacidades permanecem `enabled = false` e `AWAITING_TERMINAL` atÃ© homologaÃ§Ã£o explÃ­cita.

### Contratos oficiais confirmados

A referÃªncia atual do Mercado Pago Point define a hierarquia fÃ­sica Loja (`Store`) â†’ Caixa (`POS`) â†’ Terminal. O POS vincula o terminal que receberÃ¡ as cobranÃ§as. Os endpoints relevantes para a futura homologaÃ§Ã£o sÃ£o:

- lojas: `POST /users/{user_id}/stores`, `GET /users/{user_id}/stores/search`, `GET /stores/{id}`;
- caixas: `POST /pos`, `GET /pos`, `GET /pos/{id}`;
- terminais: `GET /terminals/v1/list` e `PATCH /terminals/v1/setup`; os modos externos documentados sÃ£o `STANDALONE` e `PDV`;
- Orders: `POST /v1/orders`, `GET /v1/orders/{id}`, `POST /v1/orders/{id}/cancel` e `POST /v1/orders/{id}/refund`;
- notificaÃ§Ãµes Point usam o tÃ³pico de Orders e assinatura `x-signature`; o backend deve responder `200`/`201` e consultar `GET /v1/orders/{id}` quando o evento nÃ£o trouxer dados suficientes.

Cancelamento de Order nÃ£o cancela a estadia. Refund serÃ¡ uma aÃ§Ã£o administrativa futura. Os estados externos serÃ£o armazenados sem traduÃ§Ã£o arbitrÃ¡ria em `provider_status`; somente a homologaÃ§Ã£o definirÃ¡ o mapeamento explÃ­cito para `operational_status` e `settlement_status`.

### Modelo e seguranÃ§a

`payment_terminals` registra apenas identidade operacional por unidade: provider, Store, POS, Terminal, nome/modelo, modo externo, status interno e habilitaÃ§Ã£o. NÃ£o guarda token. Leitura Ã© restrita por RLS aos perfis CEO autorizados da unidade; Frentista e Cliente nÃ£o configuram nem visualizam a tabela. Escrita permanece exclusiva de `service_role` atÃ© existir um fluxo administrativo homologado.

Estados internos de terminal: `NOT_CONFIGURED`, `AWAITING_TERMINAL`, `READY`, `DISABLED` e `ERROR`. O modo externo Ã© separado e aceita apenas `STANDALONE` ou `PDV`. Um terminal sÃ³ pode ser habilitado quando possui Store, POS e Terminal, estÃ¡ `READY` e em `PDV`. Mesmo assim, a operaÃ§Ã£o Point continua bloqueada por configuraÃ§Ã£o/feature de integraÃ§Ã£o nesta fase.

`private.payment_provider_transactions` Ã© reutilizada e recebe `provider_order_id` e `provider_terminal_id`. Uma Order externa Ã© Ãºnica por provider. A futura reserva deverÃ¡ usar lock transacional por sessÃ£o, congelar o valor oficial no banco e criar no mÃ¡ximo uma Order ativa por obrigaÃ§Ã£o, com chave de idempotÃªncia do provider. Nenhum identificador externo ou valor decisÃ³rio virÃ¡ do navegador.

### Fluxo futuro, ainda inativo

`PAYMENT_PENDING` â†’ escolha DÃ©bito/CrÃ©dito â†’ terminal `READY`/`PDV` da unidade â†’ reserva atÃ´mica â†’ valor oficial congelado â†’ criaÃ§Ã£o da Order com idempotÃªncia â†’ processamento no Point â†’ webhook assinado/reconciliaÃ§Ã£o â†’ `PAID` â†’ liberaÃ§Ã£o manual â†’ `EXITED`.

Uma aprovaÃ§Ã£o nunca produz `EXITED` automaticamente. Point nÃ£o entra no dinheiro fÃ­sico esperado, que continua sendo saldo inicial + `CASH`. Analytics futuros distinguem mÃ©todo, canal, provider e terminal. Chip, NFC ou carteira aceita pela Point nÃ£o criam regras financeiras distintas no Star Carvalhos; somente dados efetivamente informados pelo provider poderÃ£o ser registrados. O comprovante financeiro da Point e o recibo do estacionamento sÃ£o documentos diferentes. PAN e CVV nunca transitam pelo sistema.

ContingÃªncia: indisponibilidade do terminal preserva PIX, Dinheiro e CrÃ©dito Online Asaas. A futura obrigaÃ§Ã£o de mensalista reutilizarÃ¡ o provider, mas nÃ£o serÃ¡ ligada artificialmente a `parking_sessions`; isso depende do modelo genÃ©rico de obrigaÃ§Ã£o descrito acima.

Credenciais futuras, apenas quando a homologaÃ§Ã£o for autorizada: `MERCADO_PAGO_ENVIRONMENT`, `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET`. NÃ£o sÃ£o exigidas pelo build nem existem no frontend nesta fase.

### Checklist quando a Point chegar

1. Confirmar modelo compatÃ­vel e aplicaÃ§Ã£o Mercado Pago.
2. Configurar credenciais exclusivamente server-side.
3. Criar ou verificar Store e POS.
4. Localizar o Terminal e associÃ¡-lo ao POS.
5. Alterar para `PDV`, reiniciar e confirmar o modo.
6. Homologar uma Order controlada e os estados oficiais.
7. Testar dÃ©bito e crÃ©dito por chip e aproximaÃ§Ã£o.
8. Testar aprovaÃ§Ã£o, recusa, cancelamento, timeout e idempotÃªncia.
9. Configurar e validar assinatura/idempotÃªncia do webhook.
10. Validar comprovantes, caixa, histÃ³rico e CEO.
11. Confirmar que pagamento aprovado permanece aguardando saÃ­da.
12. Somente entÃ£o habilitar Point na unidade.


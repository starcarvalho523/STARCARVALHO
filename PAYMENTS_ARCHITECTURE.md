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

## Mercado Pago Point — fundação da Fase 3

Esta fase prepara, mas não ativa, `DEBIT_CARD + POINT + MERCADO_PAGO` e `CREDIT_CARD + POINT + MERCADO_PAGO`. Não existe cliente HTTP, access token, Order, webhook Point ativo ou botão para o Frentista. As duas capacidades permanecem `enabled = false` e `AWAITING_TERMINAL` até homologação explícita.

### Contratos oficiais confirmados

A referência atual do Mercado Pago Point define a hierarquia física Loja (`Store`) → Caixa (`POS`) → Terminal. O POS vincula o terminal que receberá as cobranças. Os endpoints relevantes para a futura homologação são:

- lojas: `POST /users/{user_id}/stores`, `GET /users/{user_id}/stores/search`, `GET /stores/{id}`;
- caixas: `POST /pos`, `GET /pos`, `GET /pos/{id}`;
- terminais: `GET /terminals/v1/list` e `PATCH /terminals/v1/setup`; os modos externos documentados são `STANDALONE` e `PDV`;
- Orders: `POST /v1/orders`, `GET /v1/orders/{id}`, `POST /v1/orders/{id}/cancel` e `POST /v1/orders/{id}/refund`;
- notificações Point usam o tópico de Orders e assinatura `x-signature`; o backend deve responder `200`/`201` e consultar `GET /v1/orders/{id}` quando o evento não trouxer dados suficientes.

Cancelamento de Order não cancela a estadia. Refund será uma ação administrativa futura. Os estados externos serão armazenados sem tradução arbitrária em `provider_status`; somente a homologação definirá o mapeamento explícito para `operational_status` e `settlement_status`.

### Modelo e segurança

`payment_terminals` registra apenas identidade operacional por unidade: provider, Store, POS, Terminal, nome/modelo, modo externo, status interno e habilitação. Não guarda token. Leitura é restrita por RLS aos perfis CEO autorizados da unidade; Frentista e Cliente não configuram nem visualizam a tabela. Escrita permanece exclusiva de `service_role` até existir um fluxo administrativo homologado.

Estados internos de terminal: `NOT_CONFIGURED`, `AWAITING_TERMINAL`, `READY`, `DISABLED` e `ERROR`. O modo externo é separado e aceita apenas `STANDALONE` ou `PDV`. Um terminal só pode ser habilitado quando possui Store, POS e Terminal, está `READY` e em `PDV`. Mesmo assim, a operação Point continua bloqueada por configuração/feature de integração nesta fase.

`private.payment_provider_transactions` é reutilizada e recebe `provider_order_id` e `provider_terminal_id`. Uma Order externa é única por provider. A futura reserva deverá usar lock transacional por sessão, congelar o valor oficial no banco e criar no máximo uma Order ativa por obrigação, com chave de idempotência do provider. Nenhum identificador externo ou valor decisório virá do navegador.

### Atribuição operacional por turno

O terminal pertence permanentemente à unidade/POS, nunca ao funcionário. `terminal_assignments` registra somente a associação temporária Terminal → Caixa/turno → Operador. O `cash_shift_id` representa o caixa operacional desta arquitetura. O histórico é imutável no sentido operacional: atribuições são liberadas, nunca apagadas.

- Um terminal possui no máximo uma atribuição `ACTIVE`.
- Um turno possui no máximo um terminal Point principal `ACTIVE` nesta fase.
- Terminal e turno devem pertencer à mesma unidade.
- O turno deve estar aberto; o terminal precisa estar habilitado, `READY` e em `PDV`.
- `DISABLED`, `ERROR`, `STANDALONE` ou configuração incompleta bloqueiam a atribuição.
- O fechamento do caixa libera automaticamente a atribuição e preserva o histórico.
- Owner e Manager podem atribuir ou liberar. Operator somente assume/libera o terminal do próprio turno quando `operator_self_assignment_enabled` estiver explicitamente habilitado pelo administrador. Cliente não tem acesso.
- Store ID, POS ID, Terminal ID, provider, modo e credenciais nunca são alteráveis pelo Frentista.
- Trocar o operador altera apenas a atribuição interna; não refaz pareamento no Mercado Pago.

As operações usam funções transacionais, locks consultivos por terminal/turno, índices parciais de unicidade e auditoria para criação, liberação e liberação automática. Não existe UI operacional nesta fase.

### Fluxo futuro, ainda inativo

`PAYMENT_PENDING` → escolha Débito/Crédito → terminal `READY`/`PDV` da unidade → reserva atômica → valor oficial congelado → criação da Order com idempotência → processamento no Point → webhook assinado/reconciliação → `PAID` → liberação manual → `EXITED`.

Uma aprovação nunca produz `EXITED` automaticamente. Point não entra no dinheiro físico esperado, que continua sendo saldo inicial + `CASH`. Analytics futuros distinguem método, canal, provider e terminal. Chip, NFC ou carteira aceita pela Point não criam regras financeiras distintas no Star Carvalhos; somente dados efetivamente informados pelo provider poderão ser registrados. O comprovante financeiro da Point e o recibo do estacionamento são documentos diferentes. PAN e CVV nunca transitam pelo sistema.

Contingência: indisponibilidade do terminal preserva PIX, Dinheiro e Crédito Online Asaas. A futura obrigação de mensalista reutilizará o provider, mas não será ligada artificialmente a `parking_sessions`; isso depende do modelo genérico de obrigação descrito acima.

Credenciais futuras, apenas quando a homologação for autorizada: `MERCADO_PAGO_ENVIRONMENT`, `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET`. Não são exigidas pelo build nem existem no frontend nesta fase.

### Checklist quando a Point chegar

1. Confirmar modelo compatível e aplicação Mercado Pago.
2. Configurar credenciais exclusivamente server-side.
3. Criar ou verificar Store e POS.
4. Localizar o Terminal e associá-lo ao POS.
5. Alterar para `PDV`, reiniciar e confirmar o modo.
6. Homologar uma Order controlada e os estados oficiais.
7. Testar débito e crédito por chip e aproximação.
8. Testar aprovação, recusa, cancelamento, timeout e idempotência.
9. Configurar e validar assinatura/idempotência do webhook.
10. Validar comprovantes, caixa, histórico e CEO.
11. Confirmar que pagamento aprovado permanece aguardando saída.
12. Somente então habilitar Point na unidade.


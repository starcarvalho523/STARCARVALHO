# Runbook de Produção — Mensalidades Asaas

## Escopo

Este runbook cobre a promoção do módulo de mensalidades recorrentes com Asaas para Produção. O PIX avulso Efí de estacionamento permanece fora deste rollout e não deve ser alterado.

Pix Automático permanece desativado e fora desta promoção.

## Estado homologado no QA

- Primeiro pagamento por cartão via Checkout Asaas aprovado.
- Assinatura local ficou ACTIVE.
- Binding recorrente Asaas criado e autorizado.
- Segunda cobrança recorrente foi gerada automaticamente pelo Asaas.
- `PAYMENT_CONFIRMED` da segunda cobrança foi reconciliado pelo webhook.
- Segundo ciclo ficou PAID.
- `next_billing_date` avançou em exatamente +30 dias.
- PIX mensal normal funciona com QR operacional de 5 minutos e cleanup em background.
- CI, Preview, RLS, grants e invariantes financeiros passaram na auditoria final.

## Pré-condições obrigatórias

Não iniciar a promoção se qualquer item abaixo estiver incompleto.

### GitHub

- PR #52 permanece sem merge até autorização explícita.
- HEAD da PR deve ter CI verde.
- Nenhum commit adicional não auditado após o último CI aprovado.

### Supabase Produção

- Fazer snapshot/backup operacional antes das migrations.
- Registrar a versão atual de `supabase_migrations.schema_migrations`.
- Confirmar que nenhuma migration da PR #52 já foi aplicada manualmente fora do histórico oficial.
- Não aplicar migrations temporárias de canário usadas somente no QA.

### Vercel Produção

Configurar e validar, sem expor os valores:

- `ASAAS_ENVIRONMENT=production`
- `ASAAS_LIVE_PAYMENTS_ENABLED=true`
- `ASAAS_API_KEY=<chave de produção>`
- `ASAAS_WEBHOOK_TOKEN=<token forte de webhook>`
- `ASAAS_BASE_URL` deve ficar ausente ou exatamente `https://api.asaas.com/v3`

As variáveis existentes do Supabase e da integração Efí devem permanecer inalteradas.

### Asaas Produção

- Conta de Produção aprovada e operacional.
- API key de Produção válida.
- Webhook apontando para:
  - `https://<dominio-producao>/api/webhooks/asaas`
- Header de autenticação configurado como:
  - `asaas-access-token: <mesmo valor de ASAAS_WEBHOOK_TOKEN>`
- Eventos necessários habilitados:
  - `CHECKOUT_*`
  - `PAYMENT_*`
  - `SUBSCRIPTION_*`
- Não habilitar Pix Automático neste rollout.

## Migrations que devem ir para Produção

Aplicar somente as migrations versionadas no repositório, na ordem dos arquivos, a partir do primeiro pacote ainda ausente em Produção.

Pacote principal desta PR:

- `20260828001500_monthly_recurring_provider_bindings.sql`
- `20260828002500_monthly_recurring_initial_qr.sql`
- `20260828003500_monthly_pix_automatic_initial_reconciliation.sql`
- `20260828004500_monthly_pix_automatic_recurring_charges.sql`
- `20260828005500_monthly_pix_automatic_charge_recovery.sql`
- `20260828006500_monthly_pix_automatic_dual_activation_gate.sql`
- `20260828011000_monthly_status_automation.sql`
- `20260828014500_monthly_automation_notifications_reconciliation.sql`
- `20260828015500_monthly_automation_incidents.sql`
- `20260829123000_monthly_notification_types.sql`
- `20260829174500_monthly_renewal_preferences.sql`
- `20260829181500_monthly_checkout_recovery_and_card_recurring.sql`
- `20260829184500_monthly_customer_renewal_context.sql`
- `20260829191000_clamp_monthly_card_next_billing_date.sql`
- `20260830104000_monthly_card_subscription_webhook_reconciliation.sql`
- `20260830125500_clear_cancelled_monthly_next_billing_date.sql`
- `20260830131500_harden_monthly_renewal_rpcs.sql`
- `20260830170120_harden_monthly_payment_helpers.sql`
- `20260830170510_fix_monthly_expire_public_grant.sql`
- `20260830172000_monthly_payment_attempt_switch.sql`
- `20260830181500_cap_monthly_pix_operational_expiry_five_minutes.sql`
- `20260830183500_guard_manual_payment_during_card_auto_renew.sql`
- `20260830184500_guard_auto_renew_enable_with_pending_manual_payment.sql`
- `20260831013500_normalize_cancelled_monthly_provider_status.sql`
- `20260831112500_monthly_pix_background_expiry_cleanup.sql`
- `20260831113500_reconcile_monthly_recurring_card_payments.sql`
- `20260831140500_monthly_pix_offline_cleanup.sql`
- `20260831142000_reconcile_monthly_recurring_card_payments.sql`
- `20260831154500_bind_initial_monthly_card_recurring_from_payment.sql`
- `20260831163500_monthly_fixed_thirty_day_cycles.sql`
- `20260901100500_allow_customer_payment_availability_for_monthly_subscription.sql`
- `20260901150500_fix_monthly_recurring_binding_checkout_fallback_30_days.sql`
- `20260901171500_harden_private_monthly_helper_execute_grants.sql`

Observação: o histórico do QA contém migrations/probes temporários usados durante homologação. Eles não fazem parte deste pacote e não devem ser recriados em Produção.

## Ordem de promoção

1. Congelar alterações na PR #52.
2. Confirmar CI do HEAD.
3. Fazer snapshot/backup do Supabase Produção.
4. Registrar contagens e estado atual de pagamentos/mensalidades para comparação pós-deploy.
5. Configurar variáveis Asaas de Produção na Vercel, mantendo `ASAAS_LIVE_PAYMENTS_ENABLED` controlado até a janela de ativação.
6. Configurar webhook Asaas de Produção com token correspondente.
7. Aplicar migrations versionadas no Supabase Produção, na ordem.
8. Rodar auditoria pós-migration antes de liberar cobranças.
9. Fazer merge/deploy somente após autorização explícita.
10. Confirmar deployment READY.
11. Validar `/api/webhooks/asaas` com evento legítimo de Produção ou teste permitido pelo Asaas, sem inventar pagamento local.
12. Executar um canário real de baixo risco com um único cliente/plano autorizado.
13. Confirmar primeiro pagamento, binding, cobertura de 30 dias e próxima cobrança.
14. Monitorar logs e invariantes financeiros.
15. Só então liberar o fluxo para os demais clientes.

## Auditoria pós-migration

Confirmar:

- RLS ativo nas tabelas mensais e `payments`.
- zero grants sensíveis para `anon`.
- zero bindings órfãos.
- zero competências com múltiplos pagamentos PENDING.
- zero PIX vencidos ainda PENDING.
- zero `auto_renew=true` junto com `cancel_at_period_end=true`.
- zero auto-renew ativo concorrendo com pagamento manual PENDING.
- cron/background cleanup instalado conforme previsto.
- nenhuma capability Efí alterada.
- Pix Automático continua indisponível.

## Smoke test de Produção

Usar um único cliente autorizado para o canário.

### Cartão

Esperado:

1. Cliente adere ao plano.
2. Assinatura local inicia como `PENDING_ACTIVATION`.
3. Checkout Asaas abre.
4. Pagamento confirmado via Asaas.
5. Webhook chega autenticado.
6. Competência vira `PAID`.
7. Assinatura vira `ACTIVE`.
8. Binding recorrente é criado.
9. `auto_renew=true`.
10. `next_billing_date = data do ciclo + 30 dias`.

### PIX mensal normal

Esperado:

1. QR aparece no mesmo clique.
2. Contador operacional inicia próximo de 05:00.
3. Apenas uma tentativa fica PENDING.
4. Se abandonar, cleanup encerra a tentativa.
5. Troca PIX ↔ cartão cancela a tentativa anterior.

## Monitoramento pós-deploy

Nas primeiras horas, acompanhar:

- Vercel runtime errors.
- respostas 4xx/5xx em `/api/webhooks/asaas`.
- eventos `PAYMENT_*`, `SUBSCRIPTION_*` e `CHECKOUT_*`.
- competências PENDING duplicadas.
- pagamentos sem competência.
- bindings sem assinatura local.
- divergências entre `next_billing_date` local e `nextDueDate` Asaas.

## Rollback

Rollback deve priorizar impedir novas cobranças sem destruir histórico financeiro.

Se houver problema antes do primeiro canário:

1. Manter/retornar `ASAAS_LIVE_PAYMENTS_ENABLED=false`.
2. Não criar novos Checkouts Asaas.
3. Manter webhooks recebendo eventos já emitidos, se possível, para não perder conciliação.
4. Reverter o deploy de aplicação para o último deployment estável.
5. Não apagar pagamentos, bindings ou eventos já recebidos.

Se houver problema depois de uma cobrança real:

1. Bloquear novas adesões/renovações antes de qualquer rollback destrutivo.
2. Preservar ledger, pagamentos, eventos e competências.
3. Reconciliar manualmente somente com evidência do provider.
4. Nunca marcar `PAID` manualmente sem confirmação do Asaas.
5. Avaliar cancelamento/estorno pelo fluxo oficial do provider quando necessário.

Migrations de banco devem ser tratadas como preferencialmente forward-only. Não executar `DROP` ou rollback estrutural destrutivo em Produção sem uma migration de reversão revisada.

## Critério GO / NO-GO

### GO

- CI verde.
- Preview/artefato do HEAD validado.
- Backup feito.
- migrations prontas e auditadas.
- variáveis Asaas de Produção válidas.
- webhook configurado e autenticado.
- Pix Automático desligado.
- Efí intacto.
- canário real autorizado.

### NO-GO

- qualquer segredo ausente ou ambiente Asaas divergente;
- webhook sem token;
- migration drift desconhecido;
- RLS/grants inseguros;
- erro de build/runtime;
- divergência de calendário de 30 dias;
- tentativa de habilitar Pix Automático neste rollout;
- necessidade de alterar o fluxo Efí para concluir a promoção.

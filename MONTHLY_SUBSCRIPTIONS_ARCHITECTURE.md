# Núcleo de mensalistas

Esta fase cria somente a fonte de verdade contratual e financeira. Ela não cobra mensalidades e não altera sessões, caixa ou provedores.

## Modelo

- `monthly_plans`: oferta por unidade. O plano pode ser desativado, mas não é apagado.
- `monthly_subscriptions`: contrato do cliente. Preserva nome e preço contratados como snapshot.
- `monthly_subscription_vehicles`: vínculos temporais; desvincular encerra o período e preserva histórico.
- `monthly_billing_periods`: competência civil mensal, valor congelado, vencimento e carência.

A tabela legada `monthly_subscriptions` foi evoluída no lugar. Os campos `vehicle_id`, `plan_name`, `starts_at` e `expires_at` permanecem para compatibilidade. Novos contratos usam `plan_id`, datas civis, preço contratado e a tabela de vínculos.

## Estados

Contrato: `ACTIVE`, `SUSPENDED`, `CANCELED`, `ENDED`.

- `SUSPENDED → ACTIVE` é uma reativação válida.
- `CANCELED` e `ENDED` são terminais; uma retomada exige nova assinatura.
- Cancelamento registra se deve produzir efeito no fim do período; a execução futura dessa decisão não é silenciosamente automatizada nesta fase.

Competência: `PENDING`, `PAID`, `WAIVED`, `CANCELED`, `MANUAL_REVIEW`. `OVERDUE` não é persistido: é derivado quando `PENDING` ultrapassa `due_date`. A cobertura operacional considera `grace_until` separadamente.

## Datas e snapshots

Competência, início, fim, vencimento e carência usam `date`, porque são conceitos do calendário civil. Eventos usam `timestamptz`. O vencimento 29/30/31 é limitado ao último dia real do mês. Cada competência copia `contracted_price`; alterações futuras do plano não recalculam o histórico.

## Concorrência

Índices únicos impedem duas assinaturas vivas equivalentes, dois vínculos ativos idênticos e duas competências do mesmo mês. As operações administrativas bloqueiam a assinatura antes de contar veículos ou gerar competências. A geração usa `ON CONFLICT` e devolve a competência já existente.

## Segurança e auditoria

Tabelas têm RLS. `anon` não recebe acesso. Clientes leem apenas o próprio contrato e seus dependentes. Equipe lê somente sua unidade. Escrita ocorre por wrappers `SECURITY DEFINER` que validam `auth.uid()`, papel `owner/manager` e unidade; funções privadas não são executáveis por `authenticated`. Operações registram IDs internos mínimos em `audit_logs`, sem segredos.

## Elegibilidade

`resolve_monthly_vehicle_coverage(vehicle_id, unit_id, at_time)` retorna cobertura, contrato, plano, competência, vencimento, carência e motivo humano. Nesta fase ela é apenas consulta homologável; a tarifa de `parking_sessions` não depende dela.

## Pagamentos futuros

`payments.parking_session_id` permanece obrigatório. Mensalidades não são forçadas nessa tabela. Uma fase futura deverá introduzir um sujeito financeiro explícito ou ledger compatível, sem tornar a FK atual nullable de forma improvisada.

- CASH: nenhum lançamento de caixa nesta fase.
- PIX Asaas: nenhuma alteração ou chamada.
- Crédito hospedado Asaas: nenhuma alteração ou checkout.
- Mercado Pago Point: fundação permanece desabilitada e sem chamadas.
- CARD legado: permanece intacto e não é reclassificado.


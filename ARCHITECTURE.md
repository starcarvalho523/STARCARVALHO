# Arquitetura

Monólito modular em Next.js e PostgreSQL/Supabase. A UI coleta fatos; regras financeiras, horários confiáveis e transações críticas pertencem ao backend. PostgreSQL é a fonte de verdade; Excel é somente entrada/saída validada. Entidades operacionais serão vinculadas a unit_id.

# Operação real do frentista

O ciclo operacional usa uma única fonte de verdade no PostgreSQL:

`vehicles` → `parking_sessions` → `payments` → encerramento da sessão.

- `tariff_rules` versiona valores por unidade e tipo de veículo. Cada sessão guarda um `tariff_snapshot`, portanto mudanças futuras não alteram estadias antigas.
- O owner cria novas versões por RPC transacional. A versão ativa anterior recebe `valid_until`, a nova recebe um número sequencial e o banco mantém no máximo uma tarifa ativa por unidade e tipo de veículo.
- A tarifa inicial da unidade `star-cavalos-central` é independente para carro e moto: R$ 5,00 na primeira hora, R$ 3,00 por fração iniciada de 30 minutos, 10 minutos de tolerância, teto diário de R$ 50,00 e conversão configurada em 10 horas.
- O motor atual aplica um único teto diário. Permanências acima de 24 horas ainda não possuem regra de múltiplas diárias; essa extrapolação deve ser definida pelo negócio antes de ser implementada.
- `parking_sessions` usa os estados `OPEN`, `PAYMENT_PENDING`, `PAID`, `EXITED`, `CANCELLED` e `MANUAL_REVIEW`.
- Um índice parcial impede duas sessões ativas do mesmo veículo na mesma unidade.
- `payments` aceita PIX, cartão e dinheiro. PIX não pode ser confirmado sem provider; cartão e dinheiro são registros manuais auditados.
- `cash_shifts` mantém abertura, dinheiro esperado, valor declarado e diferença no fechamento.
- `monthly_subscriptions` é uma fundação mínima e somente consultável pelo operador.

As mutações críticas são RPCs `security definer` que validam `auth.uid()`, perfil ativo e papel `operator` na unidade. O navegador nunca escolhe unidade, operador, horário, tarifa ou valor final.

Fluxo: entrada atômica → sessão `OPEN` → cálculo oficial sob demanda → início de saída e congelamento da cobrança → pagamento confirmado → sessão `PAID` → liberação idempotente → `EXITED` → vaga disponível.

Todas as tabelas públicas operacionais têm RLS. Operadores leem somente unidades vinculadas e não recebem permissões diretas de escrita; as escritas passam exclusivamente pelas RPCs autorizadas.

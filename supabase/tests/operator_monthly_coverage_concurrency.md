# Harness de concorrência — Fase 6

Executar contra PostgreSQL descartável com o schema completo e a migration da Fase 6.
Cada cenário usa duas conexões `psql` reais, transações independentes e uma barreira
(`pg_advisory_lock`) para iniciar as chamadas concorrentes.

1. Duas entradas da mesma placa: exatamente uma retorna sessão; a outra recebe
   `ACTIVE_SESSION_EXISTS`; o índice `parking_sessions_one_active_vehicle_idx` permanece único.
2. Duas solicitações: exatamente uma autorização `REQUESTED`; a outra recebe
   `MONTHLY_AUTHORIZATION_ALREADY_OPEN`.
3. Duas decisões: uma transita `REQUESTED -> APPROVED`; a outra recebe estado inválido.
4. Dois consumos: uma cria a sessão e consome; a outra não cria sessão nem reutiliza autorização.
5. Mudança de assinatura contra entrada: ambas bloqueiam a mesma assinatura; a entrada resolve
   novamente a cobertura depois do lock e nunca usa o preview anterior.

O runner não contém credenciais e não aponta para Supabase/Vercel remoto.

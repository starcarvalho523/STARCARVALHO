# Arquitetura

MonÃ³lito modular em Next.js e PostgreSQL/Supabase. A UI coleta fatos; regras financeiras, horÃ¡rios confiÃ¡veis e transaÃ§Ãµes crÃ­ticas pertencem ao backend. PostgreSQL Ã© a fonte de verdade; Excel Ã© somente entrada/saÃ­da validada. Entidades operacionais serÃ£o vinculadas a unit_id.

# OperaÃ§Ã£o real do frentista

O ciclo operacional usa uma Ãºnica fonte de verdade no PostgreSQL:

`vehicles` â†’ `parking_sessions` â†’ `payments` â†’ encerramento da sessÃ£o.

- `tariff_rules` versiona valores por unidade e tipo de veÃ­culo. Cada sessÃ£o guarda um `tariff_snapshot`, portanto mudanÃ§as futuras nÃ£o alteram estadias antigas.
- `parking_sessions` usa os estados `OPEN`, `PAYMENT_PENDING`, `PAID`, `EXITED`, `CANCELLED` e `MANUAL_REVIEW`.
- Um Ã­ndice parcial impede duas sessÃµes ativas do mesmo veÃ­culo na mesma unidade.
- `payments` aceita PIX, cartÃ£o e dinheiro. PIX nÃ£o pode ser confirmado sem provider; cartÃ£o e dinheiro sÃ£o registros manuais auditados.
- `cash_shifts` mantÃ©m abertura, dinheiro esperado, valor declarado e diferenÃ§a no fechamento.
- `monthly_subscriptions` Ã© uma fundaÃ§Ã£o mÃ­nima e somente consultÃ¡vel pelo operador.

As mutaÃ§Ãµes crÃ­ticas sÃ£o RPCs `security definer` que validam `auth.uid()`, perfil ativo e papel `operator` na unidade. O navegador nunca escolhe unidade, operador, horÃ¡rio, tarifa ou valor final.

Fluxo: entrada atÃ´mica â†’ sessÃ£o `OPEN` â†’ cÃ¡lculo oficial sob demanda â†’ inÃ­cio de saÃ­da e congelamento da cobranÃ§a â†’ pagamento confirmado â†’ sessÃ£o `PAID` â†’ liberaÃ§Ã£o idempotente â†’ `EXITED` â†’ vaga disponÃ­vel.

Todas as tabelas pÃºblicas operacionais tÃªm RLS. Operadores leem somente unidades vinculadas e nÃ£o recebem permissÃµes diretas de escrita; as escritas passam exclusivamente pelas RPCs autorizadas.

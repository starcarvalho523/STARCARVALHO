# Star Carvalhos Parking

Sistema web de gestão operacional e financeira de estacionamento, com áreas separadas para CEO, frentista e cliente.

Stack: Next.js 16, TypeScript strict, Tailwind 4, shadcn/ui e Supabase/PostgreSQL 17.

Copie `.env.example` para `.env.local`, configure URL e publishable key. Nunca exponha `service_role` no navegador.

## Validação

```bash
npm run lint
npm run typecheck
npm run build
```

O teste SQL `supabase/tests/hardening_regression.sql` valida privilégios mínimos e fechamento divergente de caixa dentro de uma transação com rollback.

## Estado das integrações

- Supabase Auth, PostgreSQL, RLS e RPCs transacionais estão ativos.
- Cartão e dinheiro são confirmações manuais auditadas.
- PIX está bloqueado até existir provedor, webhook autenticado e idempotência de confirmação.
- O slug técnico `star-cavalos-central` é preservado para compatibilidade; a marca visível é Star Carvalhos.



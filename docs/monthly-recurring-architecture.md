# Mensalistas — arquitetura de recorrência

## Decisão de roteamento

- Estadia avulsa + PIX: Efí.
- Mensalidade + Pix Automático: Asaas.
- Mensalidade + cartão recorrente: Asaas.

## Fonte de verdade

O Supabase é a fonte de verdade para cobertura operacional do mensalista. O provedor confirma eventos financeiros, mas não concede acesso diretamente.

## Estados da assinatura interna

- PENDING_ACTIVATION
- ACTIVE
- GRACE
- SUSPENDED
- CANCEL_AT_PERIOD_END
- CANCELED

## Estados mínimos da autorização Pix Automático

- PENDING
- ACTIVE
- REFUSED
- CANCELLED
- EXPIRED

## Regras de ativação

1. A adesão cria a assinatura interna em `PENDING_ACTIVATION`.
2. A autorização Asaas é criada com `paymentCreationMode=SUBSCRIPTION`.
3. A autorização só ativa a cobertura quando o webhook idempotente confirmar estado `ACTIVE` e a primeira competência aplicável estiver financeiramente válida conforme a regra do produto.
4. Falhas de cobrança levam a `GRACE`; vencido o `grace_until`, a assinatura vai para `SUSPENDED`.
5. Regularização reativa a assinatura para `ACTIVE`.
6. Cancelamento nunca apaga histórico financeiro; usa `cancel_at_period_end` ou `CANCELED`.

## Segurança

- Webhooks devem ser idempotentes pelo identificador do evento do provedor.
- Nunca confiar em valores vindos do cliente para preço ou status.
- Valor da cobrança vem de `monthly_billing_periods.amount` / `monthly_subscriptions.contracted_price`.
- Nunca armazenar dados brutos de cartão.
- Não alterar o fluxo Efí de estadias nesta entrega.

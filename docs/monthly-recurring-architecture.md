# Mensalistas — arquitetura de recorrência

## Decisão de roteamento

- Estadia avulsa + PIX: Efí.
- Mensalidade + Pix Automático: Asaas em `paymentCreationMode=MANUAL`.
- Mensalidade + cartão recorrente: Asaas.

## Fonte de verdade

O Supabase é a fonte de verdade para cobertura operacional e para cada competência mensal. O Asaas executa a autorização e a liquidação, mas não cria competências nem concede acesso diretamente.

## Por que MANUAL

O Star Carvalhos já possui `monthly_billing_periods` como ledger de competências. No modo `MANUAL`, cada cobrança futura é criada pelo backend a partir de uma competência já existente e recebe o `pixAutomaticAuthorizationId`. Isso mantém rastreabilidade 1:1, idempotência e conciliação antes de qualquer débito.

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

## Regras de ativação e cobrança

1. A adesão cria a assinatura interna em `PENDING_ACTIVATION` e a primeira competência.
2. A autorização Asaas é criada com `paymentCreationMode=MANUAL` e QR imediato.
3. O `conciliationIdentifier` retornado no QR é persistido junto da competência inicial.
4. O primeiro `PAYMENT_*` é reconciliado pelo `conciliationIdentifier`; somente pagamento de valor exato pode marcar a competência como paga.
5. A cobertura só fica `ACTIVE` quando autorização e primeira competência estiverem financeiramente válidas.
6. Com autorização `ACTIVE`, o backend cria cada cobrança futura com `pixAutomaticAuthorizationId` dentro da janela operacional aceita pelo Asaas.
7. Falhas de cobrança levam ao fluxo de tolerância/suspensão; falha de um ciclo não cancela automaticamente a autorização.
8. Cancelamento nunca apaga histórico financeiro; usa estado e data de encerramento.

## Segurança

- Webhooks são idempotentes pelo identificador do evento do provedor.
- Nunca confiar em preço, status ou IDs enviados pelo navegador.
- Valor da cobrança vem de `monthly_billing_periods.amount` / `monthly_subscriptions.contracted_price`.
- `conciliationIdentifier`, authorization ID e payment ID têm vínculo persistente e único.
- Nunca armazenar dados brutos de cartão.
- Não alterar o fluxo Efí de estadias nesta entrega.
- A feature flag `ASAAS_PIX_AUTOMATIC_ENABLED` permanece desligada até o canário QA/Sandbox e confirmação de elegibilidade da conta.

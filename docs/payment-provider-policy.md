# Política final de providers de pagamento

Esta decisão é normativa para o escopo atual do Star Carvalhos.

## PIX

- **Estadia avulsa (`PARKING_SESSION`)**: PIX QR via **Efí**.
- **Mensalidade (`MONTHLY_BILLING_PERIOD`)**: PIX QR via **Asaas**.
- A UI de estadia chama exclusivamente `/api/payments/efi-pix`.
- A UI de mensalidade chama exclusivamente `/api/payments/monthly/pix`.
- `resolvePaymentRoute` deve preservar essa separação e possui teste de regressão.

As duas capacidades PIX podem permanecer `READY` em `payment_method_availability`, porque atendem obrigações diferentes. A seleção não deve ser feita por "primeiro provider disponível"; ela deve respeitar o tipo da obrigação.

## Cartão

- Crédito hospedado e renovação recorrente de mensalidade permanecem no **Asaas**.
- Efí cartão continua fora do fluxo regular de produção enquanto não houver homologação específica.

## Expiração do PIX mensal

O PIX mensal Asaas possui janela curta de 5 minutos na experiência do cliente. A limpeza não depende da página aberta: o banco possui rotina de background em produção, executada por `pg_cron`, que identifica cobranças mensais PIX vencidas, limita retries e solicita o cancelamento no Asaas de forma auditável.

## Invariantes

1. Nenhum fluxo avulso deve voltar a criar PIX pelo Asaas.
2. Nenhum fluxo mensal deve migrar para Efí sem decisão explícita e nova homologação.
3. Um provider nunca altera uma sessão diretamente para `EXITED`; pagamento e saída física continuam etapas separadas.
4. Reenvio/retry deve ser idempotente e reconciliar estado externo antes de criar uma nova cobrança.
5. Segredos de provider permanecem somente server-side.

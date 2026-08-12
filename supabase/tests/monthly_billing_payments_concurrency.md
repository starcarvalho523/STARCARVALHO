# Phase 7 concurrency matrix

Run against the disposable local database with two independent `psql` connections.

All scenarios lock the same `MONTHLY_BILLING_PERIOD:<uuid>` advisory key and the
billing-period row. Expected results:

- CASH × CASH: one PAID payment; second returns the same paid obligation.
- CASH × PIX / CASH × Credit: one reservation wins; the other is blocked.
- PIX × PIX: one provider transaction; second reuses it.
- PIX × Credit: one method wins; the other receives `MONTHLY_PAYMENT_METHOD_CHANGE_BLOCKED`.
- webhook × CASH: exactly one transition to PAID.
- duplicate webhook: one provider event and one financial effect.
- PAID, WAIVED and CANCELED: no new payment.
- CASUAL parking-session snapshots are never updated by monthly-payment functions.

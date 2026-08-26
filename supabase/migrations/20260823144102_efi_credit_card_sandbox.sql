-- Keep the enum change in its own migration. PostgreSQL requires a newly-added enum
-- value to be committed before it can be referenced safely by subsequent DDL/functions.
alter type public.payment_channel add value if not exists 'TOKENIZED_CHECKOUT';

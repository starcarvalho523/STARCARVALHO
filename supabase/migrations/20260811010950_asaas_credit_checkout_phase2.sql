-- Phase 2: CREDIT_CARD + HOSTED_CHECKOUT + ASAAS (Sandbox only).
update public.payment_method_availability set enabled=true,configuration_state='READY',updated_at=clock_timestamp()
where payment_method='CREDIT_CARD' and payment_channel='HOSTED_CHECKOUT' and payment_provider='ASAAS';

create or replace function private.credit_checkout_json(target_session uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,private as $$
 select jsonb_build_object('paymentId',p.id,'transactionId',t.id,'state',t.state,'amount',p.amount,
  'hostedPaymentUrl',t.hosted_payment_url,'expiresAt',t.expires_at,'isCreator',false)
 from public.payments p join private.payment_provider_transactions t on t.payment_id=p.id
 where p.parking_session_id=target_session and p.method='CREDIT_CARD' and p.payment_channel='HOSTED_CHECKOUT'
 and p.status in ('PENDING','PAID') and t.state in ('CREATING','PENDING','PAID')
 order by t.created_at desc limit 1
$$;

create or replace function private.authorize_credit_checkout(target_session uuid)
returns public.parking_sessions language plpgsql stable security definer set search_path=pg_catalog,public,private as $$
declare s public.parking_sessions; begin
 select * into s from public.parking_sessions where id=target_session;
 if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
 if not private.has_unit_role(s.unit_id,array['owner','manager','operator']::public.app_role[]) then raise exception 'PAYMENT_FORBIDDEN' using errcode='42501'; end if;
 if not exists(select 1 from public.payment_method_availability a where a.unit_id=s.unit_id and a.payment_method='CREDIT_CARD' and a.payment_channel='HOSTED_CHECKOUT' and a.payment_provider='ASAAS' and a.enabled and a.configuration_state='READY') then raise exception 'PAYMENT_METHOD_NOT_AVAILABLE'; end if;
 return s;
end $$;

create or replace function private.reserve_credit_checkout(target_session uuid,request_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare s public.parking_sessions; existing jsonb; payment_id uuid:=gen_random_uuid(); transaction_id uuid:=gen_random_uuid(); begin
 s:=private.authorize_credit_checkout(target_session);perform pg_advisory_xact_lock(hashtextextended(target_session::text,0));
 select private.credit_checkout_json(target_session) into existing;if existing is not null then return existing;end if;
 select * into s from public.parking_sessions where id=target_session for update;
 if s.status<>'PAYMENT_PENDING' or s.payment_status<>'PENDING' or s.final_amount is null or s.final_amount<=0 then raise exception 'PAYMENT_NOT_READY';end if;
 insert into public.payments(id,unit_id,parking_session_id,amount,method,status,provider,payment_channel,manual_confirmation,idempotency_key)
 values(payment_id,s.unit_id,s.id,s.final_amount,'CREDIT_CARD','PENDING','ASAAS','HOSTED_CHECKOUT',false,request_key);
 insert into private.payment_provider_transactions(id,payment_id,provider,environment,state,external_reference)
 values(transaction_id,payment_id,'ASAAS','SANDBOX','CREATING','starcarvalhos:checkout:'||md5(payment_id::text));
 insert into public.audit_logs(actor_user_id,unit_id,action,metadata) values(auth.uid(),s.unit_id,'provider.credit_checkout.reserved',jsonb_build_object('payment_id',payment_id,'session_id',s.id,'environment','SANDBOX'));
 return jsonb_build_object('paymentId',payment_id,'transactionId',transaction_id,'state','CREATING','amount',s.final_amount,'isCreator',true);
exception when unique_violation then select private.credit_checkout_json(target_session) into existing;if existing is not null then return existing;end if;raise;end $$;

create or replace function public.reserve_credit_checkout(session_id uuid,request_key uuid)
returns jsonb language sql volatile security invoker set search_path=pg_catalog,private as $$select private.reserve_credit_checkout(session_id,request_key)$$;
create or replace function private.get_credit_checkout(target_session uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,private as $$begin perform private.authorize_credit_checkout(target_session);return private.credit_checkout_json(target_session);end$$;
create or replace function public.get_credit_checkout(session_id uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog,private as $$select private.get_credit_checkout(session_id)$$;

create or replace function private.mark_credit_checkout_created(target_transaction uuid,checkout_id text,checkout_status text,checkout_link text,supplied_external_reference text,checkout_amount numeric,expiration timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare t private.payment_provider_transactions;p public.payments;begin
 select * into t from private.payment_provider_transactions where id=target_transaction for update;if not found then raise exception 'PROVIDER_TRANSACTION_NOT_FOUND';end if;
 select * into p from public.payments where id=t.payment_id for update;
 if p.method<>'CREDIT_CARD' or p.payment_channel<>'HOSTED_CHECKOUT' or t.external_reference<>supplied_external_reference or p.amount<>checkout_amount then raise exception 'CHECKOUT_RECONCILIATION_MISMATCH';end if;
 update private.payment_provider_transactions set state='PENDING',provider_payment_id=checkout_id,provider_status=checkout_status,provider_amount=checkout_amount,hosted_payment_url=checkout_link,expires_at=expiration,updated_at=clock_timestamp() where id=target_transaction;
 update public.payments set provider_reference=checkout_id where id=p.id;
end$$;
create or replace function public.mark_credit_checkout_created(transaction_id uuid,checkout_id text,checkout_status text,checkout_link text,external_reference text,checkout_amount numeric,expires_at timestamptz)
returns void language sql volatile security definer set search_path=pg_catalog,private as $$select private.mark_credit_checkout_created(transaction_id,checkout_id,checkout_status,checkout_link,external_reference,checkout_amount,expires_at)$$;

create or replace function private.process_asaas_checkout_webhook(target_event_id text,target_event_type text,target_checkout_id text,target_checkout_status text,supplied_external_reference text,safe_payload jsonb)
returns text language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare t private.payment_provider_transactions;p public.payments;s public.parking_sessions;begin
 insert into private.payment_provider_events(provider,provider_event_id,event_type,provider_payment_id,provider_status,processing_status,sanitized_payload) values('ASAAS',target_event_id,target_event_type,target_checkout_id,target_checkout_status,'RECEIVED',safe_payload) on conflict(provider,provider_event_id) do nothing;
 if not found then return 'DUPLICATE';end if;
 select * into t from private.payment_provider_transactions where provider='ASAAS' and provider_payment_id=target_checkout_id for update;
 if not found or t.external_reference is distinct from supplied_external_reference then update private.payment_provider_events set processing_status='REVIEW',processed_at=clock_timestamp() where provider='ASAAS' and provider_event_id=target_event_id;return 'REVIEW';end if;
 select * into p from public.payments where id=t.payment_id for update;select * into s from public.parking_sessions where id=p.parking_session_id for update;
 if target_event_type='CHECKOUT_PAID' then
  if s.status<>'PAYMENT_PENDING' or s.payment_status<>'PENDING' then update private.payment_provider_transactions set state='RECONCILIATION_FAILED',failure_code='OBLIGATION_ALREADY_RESOLVED',updated_at=clock_timestamp() where id=t.id;update private.payment_provider_events set processing_status='REVIEW',payment_id=p.id,processed_at=clock_timestamp() where provider='ASAAS' and provider_event_id=target_event_id;return 'REVIEW';end if;
  update public.payments set status='PAID',operational_status='APPROVED',settlement_status='UNKNOWN',paid_at=clock_timestamp(),fee_amount=null,net_amount=null where id=p.id;
  update private.payment_provider_transactions set state='PAID',provider_status=target_checkout_status,confirmed_at=clock_timestamp(),updated_at=clock_timestamp() where id=t.id;
  update public.parking_sessions set status='PAID',payment_status='PAID',updated_at=clock_timestamp() where id=s.id;
 elsif target_event_type in ('CHECKOUT_EXPIRED','CHECKOUT_CANCELED') then
  update public.payments set status=case when target_event_type='CHECKOUT_EXPIRED' then 'FAILED' else 'CANCELLED' end where id=p.id and status='PENDING';
  update private.payment_provider_transactions set state=case when target_event_type='CHECKOUT_EXPIRED' then 'EXPIRED' else 'CANCELLED' end,provider_status=target_checkout_status,updated_at=clock_timestamp() where id=t.id and state<>'PAID';
 end if;
 update private.payment_provider_events set processing_status='PROCESSED',payment_id=p.id,processed_at=clock_timestamp() where provider='ASAAS' and provider_event_id=target_event_id;return 'PROCESSED';
end$$;
create or replace function public.process_asaas_checkout_webhook(event_id text,event_type text,checkout_id text,checkout_status text,external_reference text,sanitized_payload jsonb)
returns text language sql volatile security definer set search_path=pg_catalog,private as $$select private.process_asaas_checkout_webhook(event_id,event_type,checkout_id,checkout_status,external_reference,sanitized_payload)$$;

revoke all on function private.credit_checkout_json(uuid),private.authorize_credit_checkout(uuid),private.reserve_credit_checkout(uuid,uuid),private.get_credit_checkout(uuid),private.mark_credit_checkout_created(uuid,text,text,text,text,numeric,timestamptz),private.process_asaas_checkout_webhook(text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.reserve_credit_checkout(uuid,uuid),public.get_credit_checkout(uuid),public.mark_credit_checkout_created(uuid,text,text,text,text,numeric,timestamptz),public.process_asaas_checkout_webhook(text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_credit_checkout(uuid,uuid),public.get_credit_checkout(uuid) to authenticated;
grant execute on function public.mark_credit_checkout_created(uuid,text,text,text,text,numeric,timestamptz),public.process_asaas_checkout_webhook(text,text,text,text,text,jsonb) to service_role;

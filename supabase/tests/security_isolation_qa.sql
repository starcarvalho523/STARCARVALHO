-- QA ONLY. Synthetic accounts have no password or session. No payments are created.
-- All fixtures and mutations are rolled back; fixed plates fail closed on collision.
begin;
set local statement_timeout='20s';
do $test$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 ua uuid:=gen_random_uuid(); ub uuid:=gen_random_uuid();
 va uuid:=gen_random_uuid(); vb uuid:=gen_random_uuid();
 ta uuid:=gen_random_uuid(); tb uuid:=gen_random_uuid();
 sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid();
 n bigint; result jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (a,'audit-'||a||'@example.invalid','{"full_name":"Synthetic Audit A"}'),
 (b,'audit-'||b||'@example.invalid','{"full_name":"Synthetic Audit B"}');
 insert into public.customer_profiles(user_id,full_name) values(a,'Synthetic Audit A'),(b,'Synthetic Audit B');
 insert into public.parking_units(id,name,slug,capacity) values(ua,'Synthetic Audit A','audit-'||ua,5),(ub,'Synthetic Audit B','audit-'||ub,5);
 insert into public.tariff_rules(id,unit_id,name,vehicle_type,first_hour_amount,additional_amount)
 values(ta,ua,'Synthetic Audit','CAR',5,5),(tb,ub,'Synthetic Audit','CAR',5,5);
 insert into public.vehicles(id,plate,normalized_plate,vehicle_type,customer_id) values
 (va,'ZZA9Z91','ZZA9Z91','CAR',a),(vb,'ZZB9Z92','ZZB9Z92','CAR',b);
 insert into public.parking_sessions(id,unit_id,vehicle_id,plate_snapshot,vehicle_type,entry_operator_id,tariff_rule_id,tariff_snapshot)
 values(sa,ua,va,'ZZA9Z91','CAR',a,ta,'{}'),(sb,ub,vb,'ZZB9Z92','CAR',b,tb,'{}');
 perform set_config('request.jwt.claim.sub',a::text,true);
 execute 'set local role authenticated';
 select count(*) into n from public.parking_sessions where id=sa;
 if n<>1 then raise exception 'OWN_SESSION_DENIED'; end if;
 select count(*) into n from public.parking_sessions where id=sb;
 if n<>0 then raise exception 'OTHER_SESSION_LEAK'; end if;
 select count(*) into n from public.vehicles where id=vb;
 if n<>0 then raise exception 'OTHER_VEHICLE_LEAK'; end if;
 select count(*) into n from public.parking_units where id=ub;
 if n<>0 then raise exception 'OTHER_UNIT_LEAK'; end if;
 if public.get_ceo_customer_detail(b) is not null then raise exception 'CUSTOMER_CEO_DETAIL_LEAK'; end if;
 if public.get_ceo_customer_directory()<>'[]'::jsonb then raise exception 'CUSTOMER_CEO_DIRECTORY_LEAK'; end if;
 if has_table_privilege(current_user,'public.payments','UPDATE')
    or has_table_privilege(current_user,'public.user_unit_roles','INSERT') then
  raise exception 'UNEXPECTED_DIRECT_PRIVILEGE';
 end if;
 begin
  perform public.claim_customer_vehicle('ZZB9Z92','CAR');
  raise exception 'OTHER_VEHICLE_CLAIM_ALLOWED';
 exception when insufficient_privilege then null; end;
 begin
  perform public.start_parking_exit(sb);
  raise exception 'OTHER_EXIT_ALLOWED';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 insert into public.user_unit_roles(user_id,unit_id,role) values(a,ua,'manager'),(b,ub,'manager');
 execute 'set local role authenticated';
 if public.get_ceo_customer_detail(a) is null then raise exception 'OWN_UNIT_CEO_DETAIL_DENIED'; end if;
 if public.get_ceo_customer_detail(b) is not null then raise exception 'CROSS_UNIT_CEO_DETAIL_LEAK'; end if;
 if jsonb_array_length(public.get_ceo_customer_directory())<>1 then raise exception 'CROSS_UNIT_CEO_DIRECTORY_LEAK'; end if;
 execute 'reset role';
 update public.profiles set is_active=false where id=a;
 execute 'set local role authenticated';
 result:=public.get_ceo_customer_detail(a);
 if result is not null then raise exception 'DISABLED_STAFF_DETAIL_LEAK'; end if;
 if public.get_ceo_customer_directory()<>'[]'::jsonb then raise exception 'DISABLED_STAFF_DIRECTORY_LEAK'; end if;
 execute 'reset role';
 update public.profiles set is_active=true where id=a;
 update public.user_unit_roles set is_active=false where user_id=a;
 execute 'set local role authenticated';
 if public.get_ceo_customer_detail(a) is not null then raise exception 'DISABLED_MEMBERSHIP_DETAIL_LEAK'; end if;
 if public.get_ceo_customer_directory()<>'[]'::jsonb then raise exception 'DISABLED_MEMBERSHIP_DIRECTORY_LEAK'; end if;
 execute 'reset role';
end $test$;
rollback;
select 'PASS: customer ownership, cross-unit isolation and disabled employee RPC access' as result;

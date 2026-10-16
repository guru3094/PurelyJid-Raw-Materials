-- Run on existing databases after 04_upgrade_completion_stock.sql.
-- Safe to rerun. Functions remain server-only. No catalogue is changed by this setup script.
begin;
create or replace function public.store_catalogue_snapshot() returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('revision',md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text),
 'products',coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb),
 'open_orders',(select count(*) from public.orders where status not in ('COMPLETED','CANCELLED')))
 from public.products p;
$$;
revoke all on function public.store_catalogue_snapshot() from public,anon,authenticated;
grant execute on function public.store_catalogue_snapshot() to service_role;

create or replace function public.replace_store_catalogue(items jsonb,expected_revision text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare revision text;item jsonb;matched_product public.products%rowtype;key text;matched_ids bigint[]:=array[]::bigint[];archived integer;removed integer;inserted integer:=0;updated integer:=0;
begin
 if current_user<>'service_role' then raise exception 'Unauthorized';end if;
 if jsonb_typeof(items) is distinct from 'array' then raise exception 'Invalid catalogue';end if;
 if jsonb_array_length(items) not between 1 and 1000 then raise exception 'Invalid catalogue size';end if;
 -- Block order creation/completion and manual product edits while replacing the catalogue.
 lock table public.orders,public.order_items,public.products in exclusive mode;
 select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)::text) into revision from public.products p;
 if revision is distinct from expected_revision then raise exception 'Catalogue changed since preview. Preview the file again.';end if;
 if (select count(distinct lower(regexp_replace(trim(normalize(x->>'name',NFKC)),'\s+',' ','g'))) from jsonb_array_elements(items) x)<>jsonb_array_length(items) then raise exception 'Duplicate product names';end if;
 for item in select value from jsonb_array_elements(items) loop
  if coalesce(length(trim(item->>'name')),0) not between 1 and 180
  or jsonb_typeof(item->'price') is distinct from 'number' or (item->>'price')::numeric not between 0 and 1000000
  or jsonb_typeof(item->'stock') is distinct from 'number' or (item->>'stock')::numeric not between 0 and 1000000
  or (item->>'stock')::numeric<>trunc((item->>'stock')::numeric)
  or jsonb_typeof(item->'image') is distinct from 'string' or length(item->>'image')>2000
  or ((item->>'image')<>'' and (item->>'image')!~'^https://') then raise exception 'Invalid catalogue product';end if;
 end loop;
 -- Match existing identities before retiring absent products. Open orders keep valid links.
 insert into public.categories(name) values('Raw Materials') on conflict do nothing;
 for item in select value from jsonb_array_elements(items) loop
  key=lower(regexp_replace(trim(normalize(item->>'name',NFKC)),'\s+',' ','g'));
  -- Ambiguous active names cannot safely be mapped to an existing identity.
  if (select count(*) from public.products x where x.active and
   lower(regexp_replace(trim(normalize(x.name,NFKC)),'\s+',' ','g'))=key)>1 then
   raise exception 'Ambiguous product name: %. Rename duplicate products before importing.',item->>'name';
  end if;
  -- Prefer active identity; otherwise recover the most recent archived identity.
  select * into matched_product from public.products x where
   lower(regexp_replace(trim(normalize(x.name,NFKC)),'\s+',' ','g'))=key
   order by x.active desc,x.id desc limit 1 for update;
  if found then
   update public.products set name=item->>'name',price=(item->>'price')::numeric,
    stock=(item->>'stock')::integer,image=item->>'image',active=true,available=true where id=matched_product.id;
   matched_ids=array_append(matched_ids,matched_product.id);updated=updated+1;
  else
   insert into public.products(name,category,price,stock,image,unit,code,active,available)
   values(item->>'name','Raw Materials',(item->>'price')::numeric,(item->>'stock')::integer,item->>'image','item','',true,true)
   returning * into matched_product;
   matched_ids=array_append(matched_ids,matched_product.id);inserted=inserted+1;
  end if;
 end loop;
 -- Missing products are no longer available. Preserve any order foreign keys.
 update public.products p set active=false,available=false,stock=0
 where not(p.id=any(matched_ids)) and exists(select 1 from public.order_items i where i.product_id=p.id);
 get diagnostics archived=row_count;
 delete from public.products p where not(p.id=any(matched_ids))
 and not exists(select 1 from public.order_items i where i.product_id=p.id);
 get diagnostics removed=row_count;
 delete from public.categories c where not exists(select 1 from public.products p where p.category=c.name);
 return jsonb_build_object('inserted',inserted,'updated',updated,'removed',removed,'archived',archived);
end$$;
revoke all on function public.replace_store_catalogue(jsonb,text) from public,anon,authenticated;
grant execute on function public.replace_store_catalogue(jsonb,text) to service_role;
commit;

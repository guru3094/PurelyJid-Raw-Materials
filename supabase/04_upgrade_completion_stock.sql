-- EXISTING installations only. Back up first; pause checkout and admin stock edits.
-- Run the entire script in Supabase SQL Editor as the database owner.
-- Do not rerun 01_schema.sql or the catalogue seed on an existing database.
begin;
lock table public.orders,public.order_items,public.products in access exclusive mode;
alter table public.order_items add column if not exists stock_deducted boolean not null default false;
-- Refuse ambiguous restoration rather than invent a count for an untracked product.
do $$begin
 if exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id
 join public.products p on p.id=i.product_id where i.stock_reserved
 and o.status not in ('COMPLETED','CANCELLED') and p.stock is null) then
 raise exception 'Pending legacy reservations have untracked stock. Reconcile their product counts before upgrading.';
 end if;
end$$;
-- Preserve deductions for already completed legacy orders.
update public.order_items i set stock_deducted=true
from public.orders o where o.id=i.order_id and o.status='COMPLETED' and i.stock_reserved;
-- Release only outstanding legacy reservations. Cancelled orders were already restored.
update public.products p set stock=p.stock+r.quantity
from (select i.product_id,sum(i.quantity)::integer quantity from public.order_items i
 join public.orders o on o.id=i.order_id where i.stock_reserved
 and o.status not in ('COMPLETED','CANCELLED') group by i.product_id) r where p.id=r.product_id;
-- Clearing flags makes this upgrade safe to rerun without releasing twice.
update public.order_items set stock_reserved=false where stock_reserved;
create or replace function public.create_store_order(payload jsonb,fingerprint text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previous public.orders%rowtype;new_id uuid;number text;line jsonb;p public.products%rowtype;qty integer;amount numeric(12,2):=0;result jsonb;hash text;rid uuid;
begin
 if current_user<>'service_role' then raise exception 'Unauthorized';end if;
 if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items') not between 1 and 50 then raise exception 'Invalid items';end if;
 if length(payload->>'name') not between 1 and 100 or (payload->>'phone')!~'^[0-9]{10,15}$' or payload->>'fulfilment' not in('Pickup','Delivery') then raise exception 'Invalid customer';end if;
 rid=(payload->>'request_id')::uuid;hash=md5(payload::text);
 perform pg_advisory_xact_lock(hashtextextended(rid::text,0));
 select * into previous from public.orders where request_id=rid;
 if found then
  if previous.request_hash<>hash then raise exception 'request ID already used for another order';end if;
  return jsonb_build_object('order_number',previous.order_number,'subtotal',previous.subtotal,'status',previous.status);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(fingerprint,1));
 if (select count(*) from public.checkout_rate_limits r where r.fingerprint=create_store_order.fingerprint and r.created_at>now()-interval '10 minutes')>=5 then raise exception 'Checkout rate limit reached. Please try later.';end if;
 insert into public.checkout_rate_limits(fingerprint) values(fingerprint);
 delete from public.checkout_rate_limits where created_at<now()-interval '1 day';
 if (select count(distinct x->>'product_id') from jsonb_array_elements(payload->'items') x)<>jsonb_array_length(payload->'items') then raise exception 'Duplicate items';end if;
 number='PJM'||nextval('public.store_order_number_seq')::text;
 insert into public.orders(order_number,request_id,request_hash,name,phone,fulfilment,address,notes)
 values(number,rid,hash,payload->>'name',payload->>'phone',payload->>'fulfilment',coalesce(payload->>'address',''),coalesce(payload->>'notes','')) returning id into new_id;
 -- Validate current availability, but do not reserve or deduct stock at checkout.
 for line in select x from jsonb_array_elements(payload->'items') x order by (x->>'product_id')::bigint loop
  qty=(line->>'quantity')::integer;if qty not between 1 and 99 then raise exception 'Invalid quantity';end if;
  select * into p from public.products where id=(line->>'product_id')::bigint for update;
  if not found or not p.active or not p.available then raise exception 'Product unavailable. Refresh your bag.';end if;
  if p.stock is not null and p.stock<qty then raise exception 'Insufficient stock for %',p.name;end if;
  insert into public.order_items(order_id,product_id,product_name,unit,quantity,unit_price,stock_reserved) values(new_id,p.id,p.name,p.unit,qty,p.price,false);
  amount=amount+qty*p.price;
 end loop;
 update public.orders set subtotal=amount where id=new_id;
 return jsonb_build_object('order_number',number,'subtotal',amount,'status','REQUESTED');
end$$;
revoke all on function public.create_store_order(jsonb,text) from public,anon,authenticated;
grant execute on function public.create_store_order(jsonb,text) to service_role;

create or replace function public.update_store_order_status(order_uuid uuid,new_status text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype;i public.order_items%rowtype;p public.products%rowtype;
begin
 if current_user<>'service_role' then raise exception 'Unauthorized';end if;
 if new_status not in('REQUESTED','CONFIRMED','READY','DISPATCHED','COMPLETED','CANCELLED') then raise exception 'Invalid status';end if;
 select * into o from public.orders where id=order_uuid for update;
 if not found then raise exception 'Order not found';end if;
 if o.status=new_status then return jsonb_build_object('order_number',o.order_number,'status',o.status);end if;
 if o.status in('CANCELLED','COMPLETED') then raise exception 'Invalid transition from a final status';end if;
 if new_status='REQUESTED' or (o.status='DISPATCHED' and new_status not in('COMPLETED','CANCELLED')) or (o.status='READY' and new_status not in('DISPATCHED','COMPLETED','CANCELLED')) or (o.status='CONFIRMED' and new_status not in('READY','DISPATCHED','COMPLETED','CANCELLED')) then raise exception 'Invalid status transition';end if;
 -- The order lock makes repeated completion requests idempotent.
 if new_status='COMPLETED' then
  for i in select * from public.order_items where order_id=order_uuid order by product_id loop
   select * into p from public.products where id=i.product_id for update;
   if not found then raise exception 'Product unavailable for completion';end if;
   if not i.stock_deducted and p.stock is not null then
    if p.stock<i.quantity then raise exception 'Insufficient stock for %. Restock before completing this order.',p.name;end if;
    update public.products set stock=stock-i.quantity where id=p.id;
    update public.order_items set stock_deducted=true where id=i.id;
   end if;
  end loop;
 end if;
 -- Cancelling an unfulfilled order does not change inventory.
 update public.orders set status=new_status,updated_at=now() where id=order_uuid;
 return jsonb_build_object('order_number',o.order_number,'status',new_status);
end$$;
revoke all on function public.update_store_order_status(uuid,text) from public,anon,authenticated;
grant execute on function public.update_store_order_status(uuid,text) to service_role;
commit;

begin;
create table public.sheet_order_outbox(
 order_id uuid primary key references public.orders(id),payload jsonb not null,
 state text not null default 'pending' check(state in('pending','sent')),attempts integer not null default 0,
 last_attempt_at timestamptz,created_at timestamptz not null default now()
);
alter table public.sheet_order_outbox enable row level security;
revoke all on public.sheet_order_outbox from public,anon,authenticated;
grant select,insert,update on public.sheet_order_outbox to service_role;
alter function public.create_store_order(jsonb,text) rename to create_store_order_without_sheet;
revoke all on function public.create_store_order_without_sheet(jsonb,text) from public,anon,authenticated;
grant execute on function public.create_store_order_without_sheet(jsonb,text) to service_role;
-- The legacy function qualifies its fingerprint parameter with its function name.
do $$ begin
 execute replace(pg_get_functiondef('public.create_store_order_without_sheet(jsonb,text)'::regprocedure),'create_store_order.fingerprint','create_store_order_without_sheet.fingerprint');
end $$;
create function public.create_store_order(payload jsonb,fingerprint text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;o public.orders%rowtype;packet jsonb;
begin
 if current_user<>'service_role' then raise exception 'Unauthorized';end if;
 result=public.create_store_order_without_sheet(payload,fingerprint);
 select * into strict o from public.orders where order_number=result->>'order_number';
 packet=jsonb_build_object('orderRef',o.order_number,'name',o.name,'phone',o.phone,'email',coalesce(payload->>'email',''),'fulfilment',o.fulfilment,'address',o.address,'notes',o.notes,'subtotal',o.subtotal,'createdAt',o.created_at,'items',(select jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity,'unitPrice',i.unit_price) order by i.id) from public.order_items i where i.order_id=o.id));
 insert into public.sheet_order_outbox(order_id,payload) values(o.id,packet) on conflict(order_id) do nothing;
 return result;
end$$;
revoke all on function public.create_store_order(jsonb,text) from public,anon,authenticated;
grant execute on function public.create_store_order(jsonb,text) to service_role;
commit;

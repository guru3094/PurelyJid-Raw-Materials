-- Run after schema and seed. All below are read-only.
select count(*) as catalogue_products from public.products; -- expected 332
select relname,relrowsecurity from pg_class where oid in('public.products'::regclass,'public.orders'::regclass,'public.order_items'::regclass,'public.categories'::regclass,'public.checkout_rate_limits'::regclass); -- all true
select has_table_privilege('anon','public.orders','select') as anon_orders_read,
 has_table_privilege('authenticated','public.orders','select') as customer_orders_read,
 has_table_privilege('anon','public.products','update') as anon_products_write; -- all false
select has_function_privilege('anon','public.create_store_order(jsonb,text)','execute') as anon_order_rpc,
 has_function_privilege('authenticated','public.update_store_order_status(uuid,text)','execute') as customer_status_rpc; -- both false
select proname,prosecdef from pg_proc where oid in('public.create_store_order(jsonb,text)'::regprocedure,'public.update_store_order_status(uuid,text)'::regprocedure); -- false (security invoker)

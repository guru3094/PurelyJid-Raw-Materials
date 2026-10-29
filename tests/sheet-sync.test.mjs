import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {flushSheetOrders} from '../lib/sheet-sync.mjs';import {createHmac} from 'node:crypto';
test('checkout atomically queues immutable server-priced Sheet payload; replay has no duplicate and stock is unchanged',async()=>{
 const d=new PGlite();try{
 await d.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await d.exec(await readFile(new URL('../supabase/01_schema.sql',import.meta.url),'utf8'));
 await d.exec(await readFile(new URL('../supabase/migrations/20261029124744_store_sheet_outbox.sql',import.meta.url),'utf8'));
 await d.exec("insert into categories(name) values('Resin');insert into products(name,category,price,stock)values('Resin','Resin',75,10);set role service_role;");
 const payload={name:'Customer',phone:'9999999999',email:'c@example.com',fulfilment:'Delivery',address:'Pune full delivery address',notes:'Fragile',request_id:'11111111-1111-4111-8111-111111111111',items:[{product_id:1,quantity:2}]};
 for(let i=0;i<2;i++)await d.query('select create_store_order($1::jsonb,$2)',[JSON.stringify(payload),'test']);
 const rows=(await d.query('select * from sheet_order_outbox')).rows;assert.equal(rows.length,1);assert.equal(rows[0].payload.subtotal,150);assert.equal(rows[0].payload.email,payload.email);assert.equal(rows[0].payload.items[0].unitPrice,75);assert.equal(rows[0].payload.orderRef,'PJM100001');
 assert.equal((await d.query('select stock from products')).rows[0].stock,10);
 await d.exec('reset role;set role anon');await assert.rejects(d.query('select * from sheet_order_outbox'),/permission denied/);
 }finally{await d.close();}
});
test('outbox keeps failures pending and marks sent only on authenticated receiver acknowledgement',async()=>{
 const original=global.fetch;process.env.STORE_SYNC_SECRET='s'.repeat(40);const row={order_id:'11111111-1111-4111-8111-111111111111',payload:{orderRef:'PJM100001'},attempts:0};let patches=[];
 const db=async(path,opts)=>{if(opts){patches.push(opts.body);return null;}return [row];};
 try{
 global.fetch=async()=>Response.json({error:'Unavailable'},{status:503});assert.equal((await flushSheetOrders(db)).pending,true);assert.equal(patches.length,0);
 global.fetch=async(url,opts)=>{assert.equal(url,'https://www.purelyjid.in/api/integrations/pjresin');const ts=opts.headers['X-PJ-Timestamp'];assert.equal(opts.headers['X-PJ-Signature'],createHmac('sha256',process.env.STORE_SYNC_SECRET).update(ts+'.'+opts.body).digest('hex'));return Response.json({ok:true,orderRef:'PJM100001'});};
 assert.equal((await flushSheetOrders(db)).sent,1);assert.equal(patches[0].state,'sent');
 }finally{global.fetch=original;delete process.env.STORE_SYNC_SECRET;}
});

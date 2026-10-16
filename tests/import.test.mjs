import {test} from 'node:test';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {parseCatalogue,validateReplacement} from '../lib/catalogue-import.mjs';
const schema=()=>readFile(new URL('../supabase/01_schema.sql',import.meta.url),'utf8');
async function workbook(rows){const w=new ExcelJS.Workbook();const s=w.addWorksheet('Stock Summary');s.addRow(['Godown']);s.addRow([]);s.addRow(['Item Name','Sale Price','Stock Quantity','Available Quantity for Sale']);for(const r of rows)s.addRow(r);return Buffer.from(await w.xlsx.writeBuffer()).toString('base64');}
test('Excel parser: headers, zero stock, total footer, duplicates, decimals, formulas and invalid file',async()=>{const a=await parseCatalogue(await workbook([['A',10,0,0],['B',20,3,2],[null,null,3,2]]));assert.equal(a.rows.length,2);assert.equal(a.rows[0].stock,0);assert.deepEqual(a.errors,[]);const b=await parseCatalogue(await workbook([[' A ',10,1,1],['a',10,2,2],['C',10,0.5,0.5],['D',{formula:'1+1',result:2},1,1]]));assert.equal(b.errors.length,3);const c=await parseCatalogue(await workbook([['B',20,3,2]]),'Available Quantity for Sale');assert.equal(c.rows[0].stock,2);await assert.rejects(parseCatalogue('not a workbook'));assert.throws(()=>validateReplacement({confirmation:'',products:[]}),/confirm/);});
test('stock import allows pending orders, retains IDs, rejects stale data and protects missing products',async()=>{
 const d=new PGlite();try{
 await d.exec('create role anon;create role authenticated;create role service_role bypassrls;');await d.exec(await schema());
 await d.exec("insert into categories(name) values('Old');insert into products(name,category,price,stock) values('Old A','Old',10,10),('Old B','Old',20,5),('Old C','Old',20,2);insert into orders(id,order_number,request_id,request_hash,name,phone,fulfilment) values('11111111-1111-4111-8111-111111111111','PJMTEST','22222222-2222-4222-8222-222222222222','test','Test','9999999999','Pickup'),('33333333-3333-4333-8333-333333333333','PJMTEST2','44444444-4444-4444-8444-444444444444','test','Test','9999999999','Pickup');insert into order_items(order_id,product_id,product_name,unit,quantity,unit_price) values('11111111-1111-4111-8111-111111111111',1,'Old A','item',1,10),('33333333-3333-4333-8333-333333333333',2,'Old B','item',2,20);set role service_role;");
 const snap=async()=>(await d.query('select store_catalogue_snapshot() x')).rows[0].x;
 const items=[{name:'old a',price:25,stock:12,image:''},{name:'New B',price:30,stock:0,image:''}];
 const replace=(revision,rows=items)=>d.query('select replace_store_catalogue($1::jsonb,$2) x',[JSON.stringify(rows),revision]);
 const before=await snap();assert.equal(before.open_orders,2);await d.exec('update products set stock=9 where id=1');await assert.rejects(replace(before.revision),/changed since preview/);
 const ready=await snap();await assert.rejects(replace(ready.revision,[{...items[0],stock:-1}]),/Invalid/);assert.equal((await snap()).revision,ready.revision);
 const result=(await replace(ready.revision)).rows[0].x;assert.deepEqual(result,{inserted:1,updated:1,removed:1,archived:1});
 const p=(await d.query('select * from products where id=1')).rows[0];assert.equal(p.stock,12);assert.equal(p.category,'Old');assert.equal(p.active,true);
 assert.equal((await d.query('select count(*)::int n from products where active')).rows[0].n,2);assert.equal((await d.query('select stock from products where id=2')).rows[0].stock,0);assert.equal((await d.query('select product_name from order_items where product_id=1')).rows[0].product_name,'Old A');
 await d.query("select update_store_order_status('11111111-1111-4111-8111-111111111111','COMPLETED')");assert.equal((await d.query('select stock from products where id=1')).rows[0].stock,11);
 await assert.rejects(d.query("select update_store_order_status('33333333-3333-4333-8333-333333333333','COMPLETED')"),/Insufficient stock/);
 await assert.rejects(replace(ready.revision),/changed since preview/);
 // A fresh report replaces the current total; it does not add to remaining units.
 const next=await snap();await replace(next.revision,[{...items[0],stock:15},items[1]]);assert.equal((await d.query('select stock from products where id=1')).rows[0].stock,15);
 await d.exec('reset role;set role anon');await assert.rejects(snap(),/permission denied/);await assert.rejects(replace(next.revision),/permission denied/);
 }finally{await d.close();}
});

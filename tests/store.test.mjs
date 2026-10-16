import test from 'node:test';import assert from 'node:assert/strict';import {validateOrder,validateProduct} from '../lib/validation.mjs';import handler from '../lib/api.mjs';
const good={name:'Test Customer',phone:'9876543210',fulfilment:'Pickup',request_id:'89b88ad3-ea41-4f81-ac04-a1eac3f48fa2',items:[{product_id:1,quantity:2}]};
test('order validation rejects duplicates, invalid amounts and missing address',()=>{assert.equal(validateOrder(good).items[0].quantity,2);for(const bad of [{...good,items:[...good.items,...good.items]},{...good,items:[{product_id:1,quantity:-1}]},{...good,phone:'abc'},{...good,fulfilment:'Delivery',address:''}])assert.throws(()=>validateOrder(bad));assert.equal(validateOrder({...good,subtotal:1,items:[{product_id:1,quantity:2,price:0}]}).items[0].price,undefined);});
test('product validation allows untracked stock and blocks bad image URLs',()=>{const p={name:'Resin',category:'Resin',price:420,stock:null,image:'https://example.com/image.jpg',active:true,available:true};assert.equal(validateProduct(p).stock,null);assert.throws(()=>validateProduct({...p,stock:-1}));assert.throws(()=>validateProduct({...p,image:'javascript:alert(1)'}));});
function response(){return {statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.data=JSON.parse(s);}};}
test('API enforces admin authorization, server pricing input and production checkout protection',async()=>{
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test',APP_ORIGIN:'http://localhost:3000',ALLOW_UNPROTECTED_CHECKOUT:'true',NODE_ENV:'development',RATE_LIMIT_SALT:'test-salt'});
 const previous=global.fetch;const calls=[];global.fetch=async(url,options)=>{calls.push({url,options});if(url.includes('/auth/v1/user'))return new Response(JSON.stringify({id:'test',app_metadata:{store_role:'customer'}}));if(url.includes('/rpc/create_store_order'))return new Response(JSON.stringify({order_number:'PJM100001',subtotal:840,status:'REQUESTED'}));return new Response('[]');};
 try{
 let res=response();await handler({url:'/api/admin/orders',method:'GET',headers:{}},res);assert.equal(res.statusCode,401);
 res=response();await handler({url:'/api/admin/orders',method:'GET',headers:{authorization:'Bearer test'}},res);assert.equal(res.statusCode,403);
 res=response();await handler({url:'/api/orders',method:'POST',headers:{origin:'http://evil.example'},body:good},res);assert.equal(res.statusCode,403);
 res=response();await handler({url:'/api/orders',method:'POST',headers:{origin:'http://localhost:3000'},body:{...good,subtotal:1}},res);assert.equal(res.statusCode,201);assert.equal(res.data.subtotal,840);const rpc=calls.find(c=>c.url.includes('create_store_order'));assert.equal(JSON.parse(rpc.options.body).payload.subtotal,undefined);
 process.env.NODE_ENV='production';res=response();await handler({url:'/api/orders',method:'POST',headers:{origin:'http://localhost:3000'},body:good},res);assert.equal(res.statusCode,503);
 }finally{global.fetch=previous;}
});

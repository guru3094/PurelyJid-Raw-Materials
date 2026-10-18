import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import handler from '../api/handler.js';
import {sitemap,policyPage} from '../lib/seo.mjs';
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}});

test('shipping and return pages are public, canonical, branded and independent of database availability',async()=>{
 for(const [kind,path,route] of [['shipping','/policies/shipping-policy','seo-shipping-policy'],['return','/policies/return-policy','seo-return-policy']]){
  for(const req of [{url:path},{url:'/api/'+route},{url:'/api/handler',query:{route}}]){
   const r=response();await handler({...req,method:'GET',headers:{}},r);
   assert.equal(r.statusCode,200);assert.equal(r.headers['Content-Type'],'text/html; charset=utf-8');
   assert.ok(r.body.includes('href="https://www.pjresin.in'+path+'"'));
   assert.ok(r.body.includes('/slate-atelier.css'));assert.ok(r.body.includes('info@purelyjid.in'));assert.ok(r.body.includes('919518770073'));
  }
  assert.ok(sitemap([]).includes('https://www.pjresin.in'+path));
  assert.ok(policyPage(kind).includes('href="/policies/shipping-policy"'));
  assert.ok(policyPage(kind).includes('href="/policies/return-policy"'));
 }
 const shipping=policyPage('shipping');assert.ok(shipping.includes('3–4 business days after your order is confirmed'));assert.ok(shipping.includes('Monday to Friday'));
 const returns=policyPage('return');assert.ok(returns.includes('We do not accept returns'));assert.ok(returns.includes('statutory rights'));assert.ok(returns.includes('continuous, unedited (uncut) unboxing video'));assert.ok(returns.includes('If an unboxing video is not available'));assert.ok(!returns.includes('within 24 hours'));
});

test('policy URLs have API-compatible rewrites, local routes and discoverable homepage links',async()=>{
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 const home=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const local=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
 for(const [path,route] of [['/policies/shipping-policy','seo-shipping-policy'],['/policies/return-policy','seo-return-policy']]){
  assert.equal(config.rewrites.find(r=>r.source===path).destination,'/api/'+route);
  assert.ok(home.includes('href="'+path+'"'));assert.ok(local.includes("name==='"+path+"'"));
 }
 assert.equal(config.rewrites.find(r=>r.source==='/google-products.xml').destination,'/api/merchant-feed');
});

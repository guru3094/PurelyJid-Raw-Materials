import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {merchantFeed,merchantFeedResponse} from '../lib/merchant-feed.mjs';
import handler from '../api/handler.js';

const product={id:42,name:'Ocean Blue Pigment',category:'Pigments',unit:'jar',price:90,image:'https://example.com/pigment.jpg?a=1&b=2',available:true,stock:5};
const response=()=>({headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}});

test('feed uses canonical links, INR prices, correct availability and escaped XML without invented identifiers',()=>{
 const body=merchantFeed([product,{...product,id:43,stock:0},{...product,id:44,stock:null},{...product,id:45,available:false},{...product,id:46,name:'Gold & <Silver> "Flakes"\u0000'}]);
 assert.ok(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
 assert.ok(body.includes('xmlns:g="http://base.google.com/ns/1.0"'));
 assert.ok(body.includes('<g:link>https://www.pjresin.in/products/42/ocean-blue-pigment</g:link>'));
 assert.ok(body.includes('<g:price>90.00 INR</g:price>'));
 assert.equal((body.match(/<g:availability>in_stock</g)||[]).length,3);
 assert.equal((body.match(/<g:availability>out_of_stock</g)||[]).length,2);
 assert.ok(body.includes('Gold &amp; &lt;Silver&gt; &quot;Flakes&quot;'));
 assert.ok(body.includes('a=1&amp;b=2'));
 assert.ok(!body.includes('\u0000'));
 for(const attr of ['brand','gtin','mpn','identifier_exists'])assert.ok(!body.includes('<g:'+attr+'>'));
});

test('feed omits incomplete, inactive or invalid listings rather than sending placeholders',()=>{
 for(const patch of [{image:''},{image:'not-a-url'},{image:'/assets/placeholder.svg'},{image:'javascript:alert(1)'},{image:'https://example.com/a.svg'},{price:0},{price:0.001},{price:-1},{price:'invalid'},{id:0},{name:''},{active:false}]){
  assert.ok(!merchantFeed([{...product,...patch}]).includes('<item>'),JSON.stringify(patch));
 }
 assert.ok(merchantFeed([{...product,image:'/uploads/real-product.png'}]).includes('https://www.pjresin.in/uploads/real-product.png'));
});

test('feed pages through active public fields and fails safely on partial database failure',async()=>{
 const queries=[];const res=response();
 await merchantFeedResponse({method:'GET'},res,async path=>{queries.push(path);return queries.length===1?Array.from({length:1000},(_,i)=>({...product,id:i+1})):[{...product,id:1001}];});
 assert.equal(res.statusCode,200);assert.equal(queries.length,2);
 assert.ok(queries[0].includes('active=eq.true&select=id,name,price,image,category,unit,available,stock'));
 assert.ok(queries[1].endsWith('&offset=1000'));
 assert.equal((res.body.match(/<item>/g)||[]).length,1001);
 assert.equal(res.headers['Content-Type'],'application/xml; charset=utf-8');
 assert.equal(res.headers['Cache-Control'],'no-store');
 let calls=0;const failed=response();
 await merchantFeedResponse({method:'GET'},failed,async()=>{if(++calls===1)return Array(1000).fill(product);throw Error('private database details');});
 assert.equal(failed.statusCode,503);assert.equal(failed.headers['Retry-After'],'300');
 assert.ok(!failed.body.includes('<item>'));assert.ok(!failed.body.includes('private database details'));
 const head=response();await merchantFeedResponse({method:'HEAD'},head,async()=>[product]);assert.equal(head.statusCode,200);assert.equal(head.body,undefined);
 const post=response();await merchantFeedResponse({method:'POST'},post,()=>{throw Error('must not query');});assert.equal(post.statusCode,405);
});

test('Merchant URL and API rewrites reach the feed handler and preserve existing routes',async()=>{
 const previousFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY'];const previous=keys.map(k=>process.env[k]);
 process.env.SUPABASE_URL='https://database.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='test-public';process.env.SUPABASE_SECRET_KEY='test-secret';
 globalThis.fetch=async()=>({ok:true,text:async()=>JSON.stringify([product])});
 try{
  for(const req of [{url:'/google-products.xml'},{url:'/api/merchant-feed'},{url:'/api/handler',query:{route:'merchant-feed'}}]){
   const res=response();await handler({...req,method:'GET',headers:{}},res);assert.equal(res.statusCode,200);assert.ok(res.body.includes('<g:id>42</g:id>'));
  }
 }finally{globalThis.fetch=previousFetch;keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});}
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.rewrites.find(r=>r.source==='/google-products.xml').destination,'/api/merchant-feed');
 const server=await readFile(new URL('../server.mjs',import.meta.url),'utf8');assert.ok(server.includes("name==='/google-products.xml'"));
});

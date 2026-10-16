import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/handler.js';

test('public SEO routes work with original URLs and Vercel rewrite query helpers', async () => {
 const previousFetch=globalThis.fetch;
 const keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY'];
 const previous=keys.map(key=>process.env[key]);
 process.env.SUPABASE_URL='https://database.invalid';
 process.env.SUPABASE_PUBLISHABLE_KEY='test-public';
 process.env.SUPABASE_SECRET_KEY='test-secret';
 const product={id:42,name:'Ocean Blue Pigment',category:'Pigments',price:90,available:true,stock:5};
 globalThis.fetch=async()=>({ok:true,text:async()=>JSON.stringify([product])});
 try {
  for(const [url,query,expected] of [
   ['/materials',undefined,'Ocean Blue Pigment'],
   ['/sitemap.xml',undefined,'<urlset'],
   ['/products/42/ocean-blue-pigment',undefined,'Ocean Blue Pigment'],
   ['/api/handler',{route:'seo-catalogue'},'Ocean Blue Pigment'],
   ['/api/handler',{route:'seo-sitemap'},'<urlset'],
   ['/api/handler',{route:'seo-product',id:'42'},'Ocean Blue Pigment'],
   ['/api/handler?route=seo-catalogue',undefined,'Ocean Blue Pigment'],
   ['/api/config',undefined,'turnstile_site_key'],
   ['/api/handler',{route:'config'},'turnstile_site_key']
  ]) {
   const res={statusCode:200,setHeader(){},end(body){this.body=body;}};
   await handler({url,query,method:'GET',headers:{}},res);
   assert.equal(res.statusCode,200,url+' '+JSON.stringify(query));
   assert.ok(res.body.includes(expected),url);
  }
 } finally {
  globalThis.fetch=previousFetch;
  keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});
 }
});

test('public rewrites survive the API catch-all without losing route or product ID', async()=>{
 const {readFile}=await import('node:fs/promises');
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 const expected=[['/materials','seo-catalogue'],['/sitemap.xml','seo-sitemap'],['/products/:id/:slug','seo-product']];
 for(const [source,route] of expected){
  const rule=config.rewrites.find(r=>r.source===source);
  const destination=new URL(rule.destination.replace(':id','42'),'https://example.com');
  // Vercel's /api/:path* catch-all replaces route with the destination path.
  const captured=destination.pathname.replace(/^\/api\//,'');
  assert.equal(captured,route,source+' must retain its route after the API rewrite');
  if(route==='seo-product')assert.equal(destination.searchParams.get('id'),'42');
 }
});

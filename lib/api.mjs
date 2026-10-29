import {flushSheetOrders} from './sheet-sync.mjs';
import {timingSafeEqual} from 'node:crypto';
import {merchantFeedResponse} from './merchant-feed.mjs';
import {seoResponse} from './seo.mjs';
import {createHash} from 'node:crypto';
import {validateOrder,validateProduct} from './validation.mjs';
import {parseCatalogue,normalizeName,validateReplacement} from './catalogue-import.mjs';
const json=(res,status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
function config(){const {SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:publicKey,SUPABASE_SECRET_KEY:secret}=process.env;if(!url||!publicKey||!secret)throw Error('Database configuration is missing');return{url:url.replace(/\/$/,''),publicKey,secret};}
async function db(path,{method='GET',body,headers={}}={}){const c=config();const h={apikey:c.secret,'Content-Type':'application/json',...headers};if(c.secret.startsWith('eyJ'))h.Authorization='Bearer '+c.secret;const r=await fetch(c.url+'/rest/v1/'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const text=await r.text();let data;try{data=text?JSON.parse(text):null;}catch{throw Error('Database returned an invalid response');}if(!r.ok){const e=Error(data?.message||'Database request failed');e.database=true;throw e;}return data;}
async function auth(path,body,token){const c=config();const r=await fetch(c.url+'/auth/v1/'+path,{method:body?'POST':'GET',headers:{apikey:c.publicKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});const d=await r.json();if(!r.ok)throw Error('Authentication failed');return d;}
async function admin(req){const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!token)throw Error('Unauthorized');const user=await auth('user',null,token);if(user.app_metadata?.store_role!=='admin')throw Error('Forbidden');return user;}
function originCheck(req){const origin=req.headers.origin,allowed=process.env.APP_ORIGIN;if(!allowed)throw Error('APP_ORIGIN is not configured');if(origin!==new URL(allowed).origin)throw Error('Forbidden origin');}
async function readBody(req,limit=24000){if(req.body&&typeof req.body==='object'){if(Buffer.byteLength(JSON.stringify(req.body))>limit)throw Error('Request too large');return req.body;}let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>limit)throw Error('Request too large');}return JSON.parse(raw||'{}');}
export default async function handler(req,res){
 try{
 const u=new URL(req.url,'http://localhost');
 // Vercel exposes rewrite parameters through req.query while retaining the original URL.
 for(const [key,value] of Object.entries(req.query||{})){
  if(typeof value==='string')u.searchParams.set(key,value);
 }
 const productPath=u.pathname.match(/^\/products\/([1-9]\d{0,14})\/[^/]+$/);
 const publicRoute=u.pathname==='/policies/shipping-policy'?'seo-shipping-policy':u.pathname==='/policies/return-policy'?'seo-return-policy':u.pathname==='/google-products.xml'?'merchant-feed':u.pathname==='/materials'?'seo-catalogue':u.pathname==='/sitemap.xml'?'seo-sitemap':productPath?'seo-product':null;
 if(productPath)u.searchParams.set('id',productPath[1]);
 const route=publicRoute||u.searchParams.get('route')||u.pathname.replace(/^\/api\//,'');
 const b=['POST','PATCH'].includes(req.method)?await readBody(req,route==='admin/catalogue/preview'?2900000:route==='admin/catalogue/replace'?2500000:24000):null;
 if(req.method==='GET'&&route==='cron/sheet-sync'){
 const expected=process.env.CRON_SECRET;const received=(req.headers.authorization||'').replace(/^Bearer /,'');
 if(!expected||received.length!==expected.length||!timingSafeEqual(Buffer.from(received),Buffer.from(expected)))return json(res,401,{error:'Unauthorized'});
 return json(res,200,await flushSheetOrders(db));
 }
 if(route==='merchant-feed')return merchantFeedResponse(req,res,db);
 if(req.method==='GET'&&route.startsWith('seo-'))return seoResponse(req,res,route,u,db);
 if(req.method==='GET'&&route==='config')return json(res,200,{turnstile_site_key:process.env.TURNSTILE_SITE_KEY||'',checkout_enabled:!!(process.env.TURNSTILE_SECRET_KEY||(process.env.NODE_ENV!=='production'&&process.env.ALLOW_UNPROTECTED_CHECKOUT==='true'))});
 if(req.method==='GET'&&route==='products'){const p=await db('products?active=eq.true&select=id,name,price,image,category,code,unit,available,stock&order=id.asc&limit=1000');return json(res,200,p.map(p=>({...p,price:Number(p.price),available:p.available&&(p.stock===null||p.stock>0)})));}
 if(req.method==='POST'&&route==='orders'){
 originCheck(req);let order;try{order=validateOrder(b);}catch(e){e.status=400;throw e;}const secret=process.env.TURNSTILE_SECRET_KEY;
 if(secret){const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret,response:String(b.turnstile_token||'')}),signal:AbortSignal.timeout(10000)});const result=await r.json();if(!result.success||result.hostname!==new URL(process.env.APP_ORIGIN).hostname||result.action!=='checkout')return json(res,400,{error:'Please complete the security check again'});}
 else if(process.env.NODE_ENV==='production'||process.env.ALLOW_UNPROTECTED_CHECKOUT!=='true')return json(res,503,{error:'Checkout security is not configured'});
 if(!process.env.RATE_LIMIT_SALT)throw Error('Rate limiting is not configured');
 const ip=req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown';const fingerprint=createHash('sha256').update(String(ip).split(',')[0]+process.env.RATE_LIMIT_SALT).digest('hex');
 const result=await db('rpc/create_store_order',{method:'POST',body:{payload:order,fingerprint}});let sheetSync;try{sheetSync=await flushSheetOrders(db,result.order_number);}catch{sheetSync={pending:true};}return json(res,201,{...result,sheet_sync_pending:sheetSync.pending,tracking_url:'https://www.purelyjid.in/track-order'});
 }
 if(req.method==='POST'&&route==='admin/login'){originCheck(req);if(typeof b.email!=='string'||typeof b.password!=='string'||b.email.length>254||b.password.length>500)throw Error('Invalid login');const d=await auth('token?grant_type=password',{email:b.email,password:b.password});if(d.user?.app_metadata?.store_role!=='admin')return json(res,403,{error:'This account has no store admin access'});return json(res,200,{access_token:d.access_token,expires_in:d.expires_in});}
 if(route.startsWith('admin/')){if(req.method!=='GET')originCheck(req);await admin(req);
 if(req.method==='POST'&&route==='admin/sheet-sync')return json(res,200,await flushSheetOrders(db));
 if(req.method==='GET'&&route==='admin/sheet-sync')return json(res,200,await db('sheet_order_outbox?state=eq.pending&select=order_id,created_at&limit=100'));
 if(req.method==='POST'&&route==='admin/logout'){await auth('logout',{},req.headers.authorization.replace(/^Bearer /,''));return json(res,200,{ok:true});}
 if(req.method==='POST'&&route==='admin/catalogue/preview'){
  let parsed;try{parsed=await parseCatalogue(b.file,b.quantity_column);}catch(e){e.status=400;throw e;}
  const snapshot=await db('rpc/store_catalogue_snapshot',{method:'POST',body:{}});
  const images=new Map();for(const p of snapshot.products){if(!p.active)continue;const key=normalizeName(p.name);images.set(key,images.has(key)?null:p.image);}
  const rows=parsed.rows.map(p=>({...p,image:b.keep_images===true?(images.get(normalizeName(p.name))||''):''}));
  return json(res,200,{...parsed,rows,expected_revision:snapshot.revision,open_orders:snapshot.open_orders,old_count:snapshot.products.filter(p=>p.active).length});
 }
 if(req.method==='POST'&&route==='admin/catalogue/replace'){
  let items;try{items=validateReplacement(b);}catch(e){e.status=400;throw e;}
  return json(res,200,await db('rpc/replace_store_catalogue',{method:'POST',body:{items,expected_revision:b.expected_revision}}));
 }
 if(req.method==='GET'&&route==='admin/products')return json(res,200,await db('products?select=*&order=active.desc,id.desc&limit=1000'));
 if(req.method==='GET'&&route==='admin/orders')return json(res,200,await db('orders?select=*,order_items(*)&order=created_at.desc&limit=100'));
 if(req.method==='PATCH'&&/^admin\/products\/\d+$/.test(route)){const id=+route.split('/')[2];const result=await db('products?id=eq.'+id,{method:'PATCH',body:(()=>{try{return validateProduct(b);}catch(e){e.status=400;throw e;}})(),headers:{Prefer:'return=representation'}});if(!result.length)return json(res,404,{error:'Product not found'});return json(res,200,result[0]);}
 if(req.method==='POST'&&route==='admin/products'){const result=await db('products',{method:'POST',body:(()=>{try{return validateProduct(b);}catch(e){e.status=400;throw e;}})(),headers:{Prefer:'return=representation'}});return json(res,201,result[0]);}
 if(req.method==='PATCH'&&/^admin\/orders\/[a-f\d-]{36}$/i.test(route)){if(!['REQUESTED','CONFIRMED','READY','DISPATCHED','COMPLETED','CANCELLED'].includes(b.status))throw Error('Invalid order status');return json(res,200,await db('rpc/update_store_order_status',{method:'POST',body:{order_uuid:route.split('/')[2],new_status:b.status}}));}
 }
 return json(res,404,{error:'Endpoint not found'});
 }catch(e){const status=e.status|| (e.message==='Unauthorized'||e.message==='Authentication failed'?401:e.message==='Forbidden'||e.message==='Forbidden origin'?403:e.database?400:500);const safe=e.database&&/unavailable|stock|rate limit|request ID|transition/i.test(e.message)?e.message:status===500?'Service unavailable. Check configuration or try again.':e.message;return json(res,status,{error:safe});}
}

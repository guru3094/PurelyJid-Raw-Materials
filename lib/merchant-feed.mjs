import {SITE, productPath} from './seo.mjs';

// XML 1.0 cannot contain most ASCII control characters, even when escaped.
const text=value=>String(value??'').toWellFormed().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'');
const xml=value=>text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const tag=(name,value)=>`<g:${name}>${xml(value)}</g:${name}>`;
function productImage(value){
 if(typeof value!=='string'||!value.trim())return null;
 if(!/^https?:\/\//i.test(value)&&!value.startsWith('/'))return null;
 try{
  const url=new URL(value,SITE);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;
  if(url.pathname.endsWith('/assets/placeholder.svg')||/\.svg$/i.test(url.pathname))return null;
  return url.href;
 }catch{return null;}
}

export function merchantFeed(products){
 const items=[];
 for(const p of products){
  // A missing image/invalid price cannot produce a usable Merchant Center item.
  const image=productImage(p.image),price=Number(p.price),name=text(p.name).trim();
  if(p.active===false||!image||!name||name.length>150||!Number.isFinite(price)||price<0.01||!/^[1-9]\d{0,14}$/.test(String(p.id)))continue;
  const available=!!p.available&&(p.stock===null||Number(p.stock)>0);
  const description=`${name} from PurelyJid in Pimple Gurav, Pune. Category: ${text(p.category)}. Price per ${text(p.unit)||'item'}. Item availability, specifications, delivery charges and payment will be confirmed by the PurelyJid team.`;
  items.push('<item>'+[
   tag('id',p.id),tag('title',name),tag('description',description),
   tag('link',SITE+productPath(p)),tag('image_link',image),
   tag('availability',available?'in_stock':'out_of_stock'),
   tag('price',price.toFixed(2)+' INR'),tag('condition','new'),
   ...(p.category?[tag('product_type',p.category)]:[]),
   // Internal item codes are not manufacturer MPNs. Unknown brands/GTINs and
   // identifier_exists are deliberately omitted rather than guessed.
  ].join('')+'</item>');
 }
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>'+ 
  '<title>PurelyJid Resin Art &amp; Craft Supplies</title><link>'+SITE+'/</link>'+ 
  '<description>Current PurelyJid materials catalogue in Pune, India.</description>'+items.join('')+'</channel></rss>';
}

export async function merchantFeedResponse(req,res,db){
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','no-store');
 if(!['GET','HEAD'].includes(req.method)){
  res.statusCode=405;res.setHeader('Allow','GET, HEAD');res.setHeader('Content-Type','text/plain; charset=utf-8');return res.end('Method not allowed');
 }
 try{
  const products=[],pageSize=1000;
  for(let offset=0;;offset+=pageSize){
   if(offset>=100000)throw Error('Catalogue exceeds feed size limit');
   const page=await db('products?active=eq.true&select=id,name,price,image,category,unit,available,stock&order=id.asc&limit='+pageSize+'&offset='+offset);
   if(!Array.isArray(page))throw Error('Invalid catalogue response');
   products.push(...page);
   if(page.length<pageSize)break;
  }
  const body=merchantFeed(products);
  res.statusCode=200;
  res.setHeader('Content-Type','application/xml; charset=utf-8');
  return res.end(req.method==='HEAD'?undefined:body);
 }catch{
  // A failed fetch must not replace Google's last successful catalogue with
  // an empty or partial 200 response. Never expose database details.
  res.statusCode=503;res.setHeader('Retry-After','300');
  res.setHeader('Content-Type','text/plain; charset=utf-8');
  return res.end(req.method==='HEAD'?undefined:'Product feed temporarily unavailable. Please retry later.');
 }
}

import {createHmac} from 'node:crypto';
export async function flushSheetOrders(db,onlyRef){
 const secret=process.env.STORE_SYNC_SECRET;
 if(!secret||secret.length<32)return {sent:0,pending:true,configured:false};
 // Destination is fixed: never forward signed customer data to a caller-supplied URL.
 const rows=await db('sheet_order_outbox?state=eq.pending&select=order_id,payload,attempts&order=created_at.asc&limit=10'+(onlyRef?'&payload->>orderRef=eq.'+encodeURIComponent(onlyRef):''));
 let sent=0;
 for(const row of rows){
  try{
   const raw=JSON.stringify(row.payload),ts=String(Date.now());
   const response=await fetch('https://www.purelyjid.in/api/integrations/pjresin',{method:'POST',headers:{'Content-Type':'application/json','X-PJ-Timestamp':ts,'X-PJ-Signature':createHmac('sha256',secret).update(ts+'.'+raw).digest('hex')},body:raw,signal:AbortSignal.timeout(22000)});
   if(!response.ok)continue;
   const result=await response.json();if(result.ok!==true||result.orderRef!==row.payload.orderRef)continue;
   await db('sheet_order_outbox?order_id=eq.'+row.order_id,{method:'PATCH',body:{state:'sent',last_attempt_at:new Date().toISOString(),attempts:row.attempts+1}});sent++;
  }catch{/* Durable pending row remains available for the next scheduled/admin retry. */}
 }
 return {sent,pending:sent<rows.length,configured:true};
}

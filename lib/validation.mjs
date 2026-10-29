export function validateOrder(b){
 if(!b||typeof b!=='object'||Array.isArray(b))throw Error('Invalid order');
 const email=String(b.email||'').trim();if(email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw Error('Enter a valid email address');
 const name=String(b.name||'').trim(),phone=String(b.phone||'').replace(/[\s()+-]/g,''),address=String(b.address||'').trim(),notes=String(b.notes||'').trim();
 if(!name||name.length>100)throw Error('Enter a name up to 100 characters');
 if(!/^\d{10,15}$/.test(phone))throw Error('Enter a valid phone number');
 if(!['Pickup','Delivery'].includes(b.fulfilment))throw Error('Select pickup or delivery');
 if(b.fulfilment==='Delivery'&&address.length<10)throw Error('Enter a full delivery address');
 if(address.length>500||notes.length>500)throw Error('Address or notes are too long');
 if(!/^[a-f\d-]{36}$/i.test(b.request_id||''))throw Error('Missing request ID');
 if(!Array.isArray(b.items)||!b.items.length||b.items.length>50)throw Error('Select 1–50 items');
 const ids=new Set();const items=b.items.map(i=>{if(!Number.isInteger(i.product_id)||i.product_id<1||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>99||ids.has(i.product_id))throw Error('Invalid or duplicate item');ids.add(i.product_id);return{product_id:i.product_id,quantity:i.quantity};}).sort((a,b)=>a.product_id-b.product_id);
 return{name,phone,email,address,notes,fulfilment:b.fulfilment,request_id:b.request_id,items};
}
export function validateProduct(b){
 const name=String(b.name||'').trim(),category=String(b.category||'').trim(),image=String(b.image||'').trim();
 if(!name||name.length>180||!category||category.length>80)throw Error('Invalid name or category');
 if(typeof b.price!=='number'||!Number.isFinite(b.price)||b.price<0||b.price>1000000)throw Error('Invalid price');
 if(b.stock!==null&&(!Number.isInteger(b.stock)||b.stock<0||b.stock>1000000))throw Error('Invalid stock');
 if(image&&!/^https:\/\//.test(image))throw Error('Use an HTTPS image URL');
 if(image.length>2000)throw Error('Image URL is too long');
 return{name,category,price:Math.round(b.price*100)/100,image,stock:b.stock,available:!!b.available,active:!!b.active,code:String(b.code||'').slice(0,100),unit:String(b.unit||'item').slice(0,40)};
}

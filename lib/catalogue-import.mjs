import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
const MAX_BYTES=2*1024*1024;
export const normalizeName=s=>String(s??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
// Check the ZIP directory before the workbook parser expands XML into memory.
async function checkArchive(bytes){await new Promise((resolve,reject)=>yauzl.fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true},(error,zip)=>{if(error)return reject(Error('Invalid XLSX file'));let size=0,count=0,done=false;const fail=message=>{if(!done){done=true;zip.close();reject(Error(message));}};zip.on('error',()=>fail('Invalid XLSX archive'));zip.on('entry',e=>{size+=e.uncompressedSize;if(++count>1000||size>20*1024*1024||e.generalPurposeBitFlag&1)return fail('Workbook is encrypted or too large');zip.readEntry();});zip.on('end',()=>{if(!done){done=true;resolve();}});zip.readEntry();}));}
function cellValue(c){const v=c.value;if(v&&typeof v==='object'){if('formula'in v||'sharedFormula'in v)throw Error('Formula cells are not supported; export a values-only report');if(v.richText)return v.richText.map(x=>x.text).join('');if('text'in v)return v.text;throw Error('Unsupported cell value');}return v;}
export async function parseCatalogue(base64,quantityColumn='Stock Quantity'){
 if(!['Stock Quantity','Available Quantity for Sale'].includes(quantityColumn))throw Error('Choose a supported stock column');
 if(typeof base64!=='string'||base64.length>Math.ceil(MAX_BYTES/3)*4||!base64.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)||base64.length%4)throw Error('Upload an XLSX file up to 2 MB');
 const bytes=Buffer.from(base64,'base64');if(bytes.length>MAX_BYTES)throw Error('Upload an XLSX file up to 2 MB');await checkArchive(bytes);
 const workbook=new ExcelJS.Workbook();try{await workbook.xlsx.load(bytes);}catch{throw Error('Unable to read workbook. Export a fresh XLSX stock report.');}
 if(workbook.worksheets.length!==1)throw Error('Use a workbook with one stock report sheet');
 const sheet=workbook.worksheets[0];if(sheet.rowCount>2000||sheet.columnCount>30)throw Error('Workbook has too many rows or columns');
 let header,columns;
 for(let r=1;r<=Math.min(30,sheet.rowCount);r++){const values=sheet.getRow(r).values.map(x=>normalizeName(x));if(values.includes('item name')&&values.includes('sale price')&&values.includes(normalizeName(quantityColumn))){header=r;columns={name:values.indexOf('item name'),price:values.indexOf('sale price'),stock:values.indexOf(normalizeName(quantityColumn))};break;}}
 if(!header)throw Error('Required columns: Item Name, Sale Price, '+quantityColumn);
 const rows=[],seen=new Set(),errors=[];
 for(let r=header+1;r<=sheet.rowCount;r++){
  const line=sheet.getRow(r);let name,price,stock;try{name=cellValue(line.getCell(columns.name));price=cellValue(line.getCell(columns.price));stock=cellValue(line.getCell(columns.stock));}catch(e){errors.push('Row '+r+': '+e.message);continue;}
  // Vyapar has spacer rows and a footer with no Item Name; never import totals as products.
  if(name===null||name===undefined||String(name).trim()===''){if(price!==null&&price!==undefined&&price!=='')errors.push('Row '+r+': missing Item Name');continue;}
  name=String(name).trim().replace(/\s+/g,' ');const key=normalizeName(name);let issue='';
  if(name.length>180)issue='name exceeds 180 characters';else if(seen.has(key))issue='duplicate Item Name';else if(typeof price!=='number'||!Number.isFinite(price)||price<0||price>1000000)issue='Sale Price must be a number from 0 to 1000000';else if(typeof stock!=='number'||!Number.isInteger(stock)||stock<0||stock>1000000)issue='stock must be a whole number from 0 to 1000000';
  seen.add(key);if(issue)errors.push('Row '+r+' ('+name+'): '+issue);else rows.push({row:r,name,price:Math.round((price+Number.EPSILON)*100)/100,stock});
 }
 if(rows.length>1000)errors.push('Maximum 1000 products per replacement');if(!rows.length&&!errors.length)errors.push('No product rows found');
 return{rows,errors,quantityColumn};
}
export function validateReplacement(body){if(body.confirmation!=='IMPORT CURRENT STOCK')throw Error('Type IMPORT CURRENT STOCK to confirm');if(!/^[a-f0-9]{32}$/.test(body.expected_revision||''))throw Error('Preview the file again');if(!Array.isArray(body.products)||!body.products.length||body.products.length>1000)throw Error('Provide 1–1000 products');const seen=new Set();return body.products.map(p=>{if(typeof p.name!=='string'||!p.name.trim()||p.name.length>180||seen.has(normalizeName(p.name)))throw Error('Invalid or duplicate product name');seen.add(normalizeName(p.name));if(!Number.isInteger(p.stock)||p.stock<0||p.stock>1000000||typeof p.price!=='number'||!Number.isFinite(p.price)||p.price<0||p.price>1000000)throw Error('Invalid stock or price');if(typeof p.image!=='string'||p.image.length>2000||(p.image&&!p.image.startsWith('https://')))throw Error('Invalid image URL');return{name:p.name.trim(),price:Math.round(p.price*100)/100,stock:p.stock,image:p.image,category:'Raw Materials',unit:'item',code:''};});}

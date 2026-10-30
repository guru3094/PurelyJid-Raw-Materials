import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
test('checkout switches the delivery charge notice and required address with fulfilment choice',()=>{
 const handlers=new Map(),elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,required:false,addEventListener:(name,fn)=>handlers.set(id+':'+name,fn)});return elements.get(id);};const form=element('#checkout-form');let selection='Pickup';
 const context={document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:()=>null},FormData:class{constructor(value){assert.equal(value,form);}get(name){return name==='fulfilment'?selection:null;}},fetch:()=>new Promise(()=>{}),Date,URLSearchParams,window:{},setTimeout,clearTimeout};
 vm.runInNewContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context);
 const change=handlers.get('#checkout-form:change');change();assert.equal(element('#delivery-charge-note').hidden,true);assert.equal(element('#address-label textarea').required,false);
 selection='Delivery';change();assert.equal(element('#delivery-charge-note').hidden,false);assert.equal(element('#address-label').hidden,false);assert.equal(element('#address-label textarea').required,true);
 selection='Pickup';change();assert.equal(element('#delivery-charge-note').hidden,true);assert.equal(element('#address-label textarea').required,false);
});

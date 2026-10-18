import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../public/google-reviews.js', import.meta.url), 'utf8');
function setup() {
  const scripts=[], rendered=[];
  const context={window:{},document:{createElement:()=>({}),head:{append:s=>scripts.push(s)}},console:{warn(){}}};
  vm.runInNewContext(source,context);
  return {context,scripts,rendered,api:context.window.PurelyJidReviews};
}
test('review estimate counts four weekdays in India across weekends and year boundaries',()=>{
 const {api}=setup();
 assert.equal(api.deliveryDate(new Date('2026-10-16T10:00:00Z')),'2026-10-22');
 assert.equal(api.deliveryDate(new Date('2026-10-18T11:00:00Z')),'2026-10-22');
 assert.equal(api.deliveryDate(new Date('2026-10-18T19:00:00Z')),'2026-10-23');
 assert.equal(api.deliveryDate(new Date('2026-12-30T10:00:00Z')),'2027-01-05');
});
test('review opt-in uses actual order fields, loads on demand, deduplicates and tolerates Google failure',()=>{
 const {api,context,scripts,rendered}=setup();
 assert.equal(scripts.length,0);
 api.offer({orderId:'PJ123',email:''});assert.equal(scripts.length,0);
 api.offer({orderId:'PJ123',email:'customer@example.com'});
 assert.equal(scripts.length,1);assert.ok(scripts[0].src.endsWith('?onload=renderOptIn'));
 context.window.gapi={load(name,fn){assert.equal(name,'surveyoptin');fn()},surveyoptin:{render:c=>rendered.push(c)}};
 context.window.renderOptIn();
 assert.equal(rendered[0].order_id,'PJ123');assert.equal(rendered[0].email,'customer@example.com');
 assert.equal(rendered[0].merchant_id,5330628987);assert.equal(rendered[0].delivery_country,'IN');
 assert.ok(!('products' in rendered[0]));
 api.offer({orderId:'PJ123',email:'customer@example.com'});assert.equal(rendered.length,1);
 context.window.gapi.load=()=>{throw Error('blocked')};
 assert.doesNotThrow(()=>api.offer({orderId:'PJ124',email:'customer@example.com'}));
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../assets/quiz-session.js');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/index.json')));
function random(seed) { return () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }; }
for (const m of manifest) {
 const d = JSON.parse(fs.readFileSync(path.join(root,'data',m.id+'.json')));
 const canonical = JSON.stringify(d);
 const flat = d.sections.flatMap(s=>s.items);
 const lookup = Object.fromEntries(flat.map(q=>[q.id,q]));
 const layouts = new Set();
 for (let i=1;i<=12;i++) {
  const layout=S.layout(d,random(i));
  assert(S.valid(d,layout),m.id+' invalid layout');
  const out=S.prepare(d,layout);const qs=out.sections.flatMap(s=>s.items);
  assert.deepEqual(qs.map(q=>q.num),flat.map((_,i)=>i+1));
  assert.equal(new Set(qs.map(q=>q.id)).size,flat.length);
  for(const q of qs) {
   const orig=lookup[q.id];assert.equal(q.originalNum,orig.num);
   assert.deepEqual(q.stem,orig.stem);assert.deepEqual(q.opts,orig.opts);assert.equal(q.ans,orig.ans);
   if(q.opts) { assert.deepEqual([...layout.options[q.id]].sort((a,b)=>a-b),q.opts.map((_,i)=>i));
    if(q.type==='pg') assert.equal(layout.options[q.id][layout.options[q.id].indexOf(q.ans)],orig.ans);
   }
   const section=out.sections.find(s=>s.items.includes(q));
   const source=d.sections.find(s=>s.items.some(x=>x.id===q.id));
   assert.deepEqual(section.passage,source.passage);assert.deepEqual(section.blocks,source.blocks||[]);
   if(section.title)assert(!/soal nomor/.test(section.title));
  }
  const resumed=S.prepare(d,JSON.parse(JSON.stringify(layout)));
  assert.deepEqual(resumed,out,'resume changed order');
  layouts.add(JSON.stringify(layout));
 }
 assert(layouts.size>1,m.id+' did not shuffle');
 const old=S.layout(d,random(1),true);
 assert(S.valid(d,old));assert.deepEqual(S.prepare(d,old).sections.flatMap(s=>s.items).map(q=>q.id),flat.map(q=>q.id));
 assert.equal(JSON.stringify(d),canonical,'canonical dataset mutated');
}
assert.notEqual(S.scope('st','Ibrahim','p14'),S.scope('st','Teman','p14'));
assert.notEqual(S.scope('best','Ibrahim','p14'),S.scope('best','Teman','p14'));
const sample=JSON.parse(fs.readFileSync(path.join(root,'data/tka-bahasa-indonesia-p14.json')));
const broken=S.layout(sample,random(1));broken.units[0].ids[0]=broken.units[0].ids[1];assert(!S.valid(sample,broken));
const changed=JSON.parse(JSON.stringify(sample));changed.sections[0].items[0].ans=99;assert(!S.valid(changed,S.layout(sample,random(1))));
assert.equal(manifest.some(m=>'pdf' in m),false);
console.log('PASS: '+manifest.length+' packets × 12 random sessions; canonical grading, shared stimuli, resume, profile keys, legacy layout, corrupt/version rejection.');

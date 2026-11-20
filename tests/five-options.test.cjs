const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const Session=require('../assets/quiz-session.js');
const root=path.join(__dirname,'..');
for(const subject of ['matematika','bahasa-indonesia']){
 const name='tka-'+subject+'-p24',relative='data/'+name+'.json';
 const d=JSON.parse(fs.readFileSync(path.join(root,relative)));
 const previous=JSON.parse(cp.execFileSync('git',['show','a1ffef4:'+relative],{cwd:root,encoding:'utf8'}));
 const old=Object.fromEntries(previous.sections.flatMap(s=>s.items).map(q=>[q.id,q]));
 const qs=d.sections.flatMap(s=>s.items);assert.equal(qs.length,30);
 const counts=[0,0,0,0,0];
 for(const q of qs){
  assert.equal(q.type,'pg');assert.equal(q.opts.length,5);assert.equal(new Set(q.opts.map(s=>s.trim().toLowerCase())).size,5);
  assert.equal(q.opts[q.ans],old[q.id].opts[old[q.id].ans],'canonical correct answer changed '+q.id);
  assert.deepEqual(q.stem,old[q.id].stem);counts[q.ans]++;
 }
 assert.deepEqual(counts,[6,6,6,6,6]);
 const layout=Session.layout(d,()=>0.37);
 assert(Session.valid(d,layout));
 for(const q of qs){assert.equal(layout.options[q.id].length,5);assert(layout.options[q.id].includes(4));}
 assert(!Session.valid(d,Session.layout(previous,()=>0.37)),'old layouts must not be silently regraded');
}
assert(!fs.readFileSync(path.join(root,'assets/app.js'),'utf8').includes("'ABCD'.charAt"));
console.log('PASS: 60 questions have five unique options; balanced keys, unchanged correct answers, five-way shuffle and old-layout rejection.');

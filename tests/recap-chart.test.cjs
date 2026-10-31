const assert = require('node:assert/strict');
const {timestamp, groups} = require('../assets/recap-chart.js');
assert.equal(timestamp('Date(2026,9,31,13,25,0)'), new Date(2026,9,31,13,25).getTime());
assert.equal(timestamp('31/10/2026 13:25:00 WIB'), new Date(2026,9,31,13,25).getTime());
assert.equal(timestamp('tidak diketahui'), null);
const input = [
 {nama:'A',nilai:90,time:300,order:3}, {nama:'B',nilai:0,time:200,order:2},
 {nama:'A',nilai:60,time:100,order:1}, {nama:' A ',nilai:80,time:200,order:2},
 {nama:'B',nilai:NaN,order:4}, {nama:'B',nilai:101,order:5}
];
const result = groups(input);
assert.deepEqual(result.map(u=>[u.name,u.attempts.map(r=>r.nilai)]), [['A',[60,80,90]],['B',[0]]]);
assert.equal(input[0].nilai,90);
assert.deepEqual(groups([{nama:'A',nilai:1,time:null,order:2},{nama:'A',nilai:2,time:null,order:1}])[0].attempts.map(r=>r.nilai),[2,1]);
assert.deepEqual(groups([]),[]);
console.log('PASS: timestamps, chronological attempts, separate users, zero score, invalid scores, fallback order.');

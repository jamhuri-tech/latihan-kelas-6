const assert = require('node:assert/strict');
const Camera = require('../assets/quiz-camera.js');
function fixture() {
  let interval, tick=0, stopped=0, uploads=[], ready=[], gum=0;
  const track={readyState:'live',enabled:true,muted:false,stop(){stopped++;this.readyState='ended';},addEventListener(){}};
  const stream={getVideoTracks:()=>[track],getTracks:()=>[track]};
  const elements=[];
  class El {
    constructor(tag){this.tag=tag;this.children=[];this.readyState=2;this.videoWidth=640;this.videoHeight=480;elements.push(this);}
    append(...v){this.children.push(...v);} appendChild(v){this.append(v);if(v.tag==='script'){
      const u=new URL(v.src), callback=u.searchParams.get('callback');
      queueMicrotask(()=>win[callback]({ok:true,camera:true,photos:uploads.map(p=>({sequence:p.sequence}))}));
    }}
    setAttribute(){} remove(){} play(){return Promise.resolve();}
    getContext(){return {drawImage(){}};} toDataURL(){return 'data:image/jpeg;base64,/9j/2Q==';}
  }
  const doc={createElement:tag=>new El(tag),createTextNode:t=>t,head:new El('head')};
  const win={navigator:{mediaDevices:{getUserMedia:async constraints=>{gum++;assert.equal(constraints.audio,false);return stream;}}},setTimeout,clearTimeout,
    setInterval:f=>{interval=f;return 1;},clearInterval:()=>{interval=null;},
    fetch:async(url,o)=>{uploads.push(JSON.parse(o.body));return {};}};
  const state={attemptId:'test-attempt-1'};
  const controller=Camera.mount({window:win,document:doc,container:new El('div'),url:'https://example.com/exec',state,save(){},onReady:v=>ready.push(v),onPermission(){}});
  return {controller,state,track,win,get uploads(){return uploads;},get gum(){return gum;},get stopped(){return stopped;},get ready(){return ready;},tick:()=>interval?.(),
    consent:elements.find(e=>e.tag==='input'),button:elements.find(e=>e.tag==='button'),flush:()=>new Promise(r=>setImmediate(r))};
}
(async()=>{
  const f=fixture();assert.equal(f.controller.ready(),false);assert.equal(f.gum,0);
  await f.button.onclick();assert.equal(f.gum,0,'consent required');
  f.consent.checked=true;f.consent.onchange();await f.button.onclick();assert.equal(f.controller.ready(),true);
  f.tick();assert.equal(f.uploads.length,0,'no premature photo');
  f.state.camera.lastAt=Date.now()-Camera.interval-1;f.tick();await f.flush();
  assert.equal(f.uploads.length,1);assert.equal(f.uploads[0].attempt,'test-attempt-1');assert.equal(f.state.camera.saved,1);
  f.tick();assert.equal(f.uploads.length,1,'no duplicate capture');
  f.track.muted=true;f.tick();assert.equal(f.controller.ready(),false);
  f.state.camera.lastAt=0;f.tick();assert.equal(f.uploads.length,1,'no photo while muted');
  f.track.muted=false;f.tick();await f.flush();assert.equal(f.uploads.length,2);
  f.controller.stop();assert.equal(f.controller.ready(),false);f.tick();assert.equal(f.uploads.length,2);assert.equal(f.stopped,1);
  const denied=fixture();denied.win.navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(new Error(),{name:'NotAllowedError'});};
  denied.consent.checked=true;await denied.button.onclick();assert.equal(denied.controller.ready(),false);denied.controller.stop();
  const late=fixture();let resolve;late.win.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>{resolve=r;});
  late.consent.checked=true;const starting=late.button.onclick();await late.flush();late.controller.stop();
  let lateStops=0;resolve({getTracks:()=>[{stop(){lateStops++;}}]});await starting;assert.equal(lateStops,1,'stop late permission stream');
  console.log('Camera: consent, permission denial, mute/pause, 5-minute capture, receipt, session association, cleanup and late permission passed');
})();

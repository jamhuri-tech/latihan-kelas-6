const assert = require('node:assert/strict');
const Camera = require('../assets/quiz-camera.js');
function fixture(config = {}) {
  let interval, tick=0, stopped=0, uploads=[], ready=[], gum=0;
  const track={readyState:'live',enabled:true,muted:false,stop(){stopped++;this.readyState='ended';},addEventListener(){}};
  const stream={getVideoTracks:()=>[track],getTracks:()=>[track]};
  const elements=[],storageResponses=[];
  class El {
    constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.paused=!!config.paused;this.readyState=config.readyState ?? 2;this.videoWidth=640;this.videoHeight=480;elements.push(this);}
    append(...v){this.children.push(...v);} appendChild(v){this.append(v);if(v.tag==='script'){
      const u=new URL(v.src), callback=u.searchParams.get('callback');
      const respond=()=>win[callback]({ok:true,camera:config.storage !== false,photos:uploads.map(p=>({sequence:p.sequence}))});
      if(config.holdStorage && u.searchParams.get('action') === 'capabilities') storageResponses.push(respond); else queueMicrotask(respond);
    }}
    setAttribute(k,v){this.attributes[k]=v;} remove(){} play(){return config.play ? config.play(this) : Promise.resolve();}
    getContext(){return {drawImage(){}};} toDataURL(){return 'data:image/jpeg;base64,/9j/2Q==';}
  }
  const doc={createElement:tag=>new El(tag),createTextNode:t=>t,head:new El('head')};
  const win={navigator:{mediaDevices:{getUserMedia:async constraints=>{gum++;assert.equal(constraints.audio,false);return stream;}}},setTimeout,clearTimeout,
    setInterval:f=>{interval=f;return 1;},clearInterval:()=>{interval=null;},
    fetch:async(url,o)=>{uploads.push(JSON.parse(o.body));return {};}};
  const state={attemptId:'test-attempt-1'};
  const controller=Camera.mount({window:win,document:doc,container:new El('div'),url:'https://example.com/exec',state,save(){},onReady:v=>ready.push(v),onPermission(){}});
  return {controller,state,track,win,get uploads(){return uploads;},get gum(){return gum;},get stopped(){return stopped;},get ready(){return ready;},tick:()=>interval?.(),
    video:elements.find(e=>e.tag==='video'),preview:elements.find(e=>e.tag==='button' && e.textContent==='Tampilkan pratinjau kamera'),status:elements.find(e=>e.tag==='p' && e.attributes.role==='status'),releaseStorage:()=>storageResponses.splice(0).forEach(f=>f()),
    consent:elements.find(e=>e.tag==='input'),button:elements.find(e=>e.tag==='button'),flush:()=>new Promise(r=>setImmediate(r))};
}
(async()=>{
  assert.equal(Camera.interval,60000);
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
  // Mobile autoplay can reject even after getUserMedia permission succeeds.
  let allowPlay=false;
  const mobile=fixture({paused:true,play(video){if(!allowPlay)return Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}));video.paused=false;return Promise.resolve();}});
  mobile.consent.checked=true;await mobile.button.onclick();await mobile.flush();
  assert.equal(mobile.button.disabled,false,'autoplay rejection must not lock activate');
  assert.equal(mobile.controller.ready(),false);assert.equal(mobile.preview.hidden,false);
  assert.match(mobile.status.textContent,/Izin kamera sudah diterima/,'do not misreport permission as denied');
  for(const attr of ['muted','autoplay','playsinline','webkit-playsinline'])assert.equal(mobile.video.attributes[attr],'');
  allowPlay=true;mobile.preview.onclick();await mobile.flush();assert.equal(mobile.controller.ready(),true);assert.equal(mobile.gum,1,'manual preview must reuse stream');mobile.controller.stop();
  const pendingPlay=fixture({paused:true,play(){return new Promise(()=>{});}});
  pendingPlay.consent.checked=true;await pendingPlay.button.onclick();
  assert.equal(pendingPlay.button.disabled,false,'pending play must not lock retry');assert.equal(pendingPlay.preview.hidden,false);pendingPlay.controller.stop();
  const delayedMetadata=fixture({readyState:0});delayedMetadata.consent.checked=true;await delayedMetadata.button.onclick();
  assert.equal(delayedMetadata.controller.ready(),false);delayedMetadata.video.readyState=2;delayedMetadata.video.onloadedmetadata();await delayedMetadata.flush();assert.equal(delayedMetadata.controller.ready(),true);delayedMetadata.controller.stop();
  const network=fixture({holdStorage:true});network.consent.checked=true;const activation=network.button.onclick();
  assert.equal(network.gum,1,'request media within user click, before network response');await network.flush();assert.equal(network.controller.ready(),false,'storage must be ready too');network.releaseStorage();await activation;assert.equal(network.controller.ready(),true);network.controller.stop();
  const fallback=fixture();let constraints=[];fallback.win.navigator.mediaDevices.getUserMedia=async c=>{constraints.push(c);if(constraints.length===1)throw Object.assign(new Error(),{name:'OverconstrainedError'});return {getVideoTracks:()=>[fallback.track],getTracks:()=>[fallback.track]};};
  fallback.consent.checked=true;await fallback.button.onclick();assert.equal(fallback.controller.ready(),true);assert.deepEqual(constraints[1],{video:true,audio:false});fallback.controller.stop();
  const offline=fixture({storage:false});offline.consent.checked=true;await offline.button.onclick();assert.equal(offline.controller.ready(),false);assert.equal(offline.stopped,1,'failed storage must release mobile camera');offline.controller.stop();
  const failedWhileWaiting=fixture({storage:false});let finishPermission;
  failedWhileWaiting.win.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>{finishPermission=r;});
  failedWhileWaiting.consent.checked=true;await failedWhileWaiting.button.onclick();let releasedLate=0;
  finishPermission({getTracks:()=>[{stop(){releasedLate++;}}]});await failedWhileWaiting.flush();assert.equal(releasedLate,1,'release permission granted after failed backend');failedWhileWaiting.controller.stop();
  console.log('Mobile: autoplay blocked/pending, manual preview, inline attributes, late metadata, click-bound permission, constraint fallback and failed-storage cleanup passed');
  console.log('Camera: consent, permission denial, mute/pause, 1-minute capture, receipt, session association, cleanup and late permission passed');
})();

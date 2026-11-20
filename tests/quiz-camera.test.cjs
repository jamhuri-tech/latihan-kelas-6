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
    fetch:async(url,o)=>{if(o.method==='GET')throw new Error('simulate no CORS');uploads.push(JSON.parse(o.body));return {};}};
  const state={attemptId:'test-attempt-1'};
  const controller=Camera.mount({window:win,document:doc,container:new El('div'),url:'https://example.com/exec',state,save(){},onReady:v=>ready.push(v),onPermission(){}});
  return {controller,state,track,win,get uploads(){return uploads;},get gum(){return gum;},get stopped(){return stopped;},get ready(){return ready;},tick:()=>interval?.(),
    storageButton:elements.find(e=>e.tag==='button' && e.textContent==='Coba koneksi penyimpanan foto'),video:elements.find(e=>e.tag==='video'),preview:elements.find(e=>e.tag==='button' && e.textContent==='Tampilkan pratinjau kamera'),status:elements.find(e=>e.tag==='p' && e.attributes.role==='status'),releaseStorage:()=>storageResponses.splice(0).forEach(f=>f()),
    consent:elements.find(e=>e.tag==='input'),button:elements.find(e=>e.tag==='button'),flush:()=>new Promise(r=>setImmediate(r))};
}
(async()=>{
  assert.equal(Camera.interval,60000);
  const f=fixture();assert.equal(f.controller.ready(),false);assert.equal(f.gum,0);
  await f.button.onclick();await f.flush();assert.equal(f.gum,0,'consent required');
  f.consent.checked=true;f.consent.onchange();await f.button.onclick();await f.flush();assert.equal(f.controller.ready(),true);
  f.tick();assert.equal(f.uploads.length,0,'no premature photo');
  f.state.camera.lastAt=Date.now()-Camera.interval-1;f.tick();await f.flush();
  assert.equal(f.uploads.length,1);assert.equal(f.uploads[0].attempt,'test-attempt-1');assert.equal(f.state.camera.saved,1);
  f.tick();assert.equal(f.uploads.length,1,'no duplicate capture');
  f.track.muted=true;f.tick();assert.equal(f.controller.ready(),false);
  f.state.camera.lastAt=0;f.tick();assert.equal(f.uploads.length,1,'no photo while muted');
  f.track.muted=false;f.tick();await f.flush();assert.equal(f.uploads.length,2);
  f.controller.stop();assert.equal(f.controller.ready(),false);f.tick();assert.equal(f.uploads.length,2);assert.equal(f.stopped,1);
  const denied=fixture();denied.win.navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(new Error(),{name:'NotAllowedError'});};
  denied.consent.checked=true;await denied.button.onclick();await denied.flush();assert.equal(denied.controller.ready(),false);denied.controller.stop();
  const late=fixture();let resolve;late.win.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>{resolve=r;});
  late.consent.checked=true;const starting=late.button.onclick();await late.flush();late.controller.stop();
  let lateStops=0;resolve({getTracks:()=>[{stop(){lateStops++;}}]});await starting;assert.equal(lateStops,1,'stop late permission stream');
  // Mobile autoplay can reject even after getUserMedia permission succeeds.
  let allowPlay=false;
  const mobile=fixture({paused:true,play(video){if(!allowPlay)return Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}));video.paused=false;return Promise.resolve();}});
  mobile.consent.checked=true;await mobile.button.onclick();await mobile.flush();await mobile.flush();
  assert.equal(mobile.button.disabled,false,'autoplay rejection must not lock activate');
  assert.equal(mobile.controller.ready(),false);assert.equal(mobile.preview.hidden,false);
  assert.match(mobile.status.textContent,/Izin kamera sudah diterima/,'do not misreport permission as denied');
  for(const attr of ['muted','autoplay','playsinline','webkit-playsinline'])assert.equal(mobile.video.attributes[attr],'');
  allowPlay=true;mobile.preview.onclick();await mobile.flush();assert.equal(mobile.controller.ready(),true);assert.equal(mobile.gum,1,'manual preview must reuse stream');mobile.controller.stop();
  const pendingPlay=fixture({paused:true,play(){return new Promise(()=>{});}});
  pendingPlay.consent.checked=true;await pendingPlay.button.onclick();await pendingPlay.flush();
  assert.equal(pendingPlay.button.disabled,false,'pending play must not lock retry');assert.equal(pendingPlay.preview.hidden,false);pendingPlay.controller.stop();
  const delayedMetadata=fixture({readyState:0});delayedMetadata.consent.checked=true;await delayedMetadata.button.onclick();await delayedMetadata.flush();
  assert.equal(delayedMetadata.controller.ready(),false);delayedMetadata.video.readyState=2;delayedMetadata.video.onloadedmetadata();await delayedMetadata.flush();assert.equal(delayedMetadata.controller.ready(),true);delayedMetadata.controller.stop();
  const network=fixture({holdStorage:true});network.consent.checked=true;const activation=network.button.onclick();
  assert.equal(network.gum,1,'request media within user click, before network response');await network.flush();assert.equal(network.controller.ready(),false,'storage must be ready too');network.releaseStorage();await activation;await network.flush();assert.equal(network.controller.ready(),true);network.controller.stop();
  const fallback=fixture();let constraints=[];fallback.win.navigator.mediaDevices.getUserMedia=async c=>{constraints.push(c);if(constraints.length===1)throw Object.assign(new Error(),{name:'OverconstrainedError'});return {getVideoTracks:()=>[fallback.track],getTracks:()=>[fallback.track]};};
  fallback.consent.checked=true;await fallback.button.onclick();await fallback.flush();assert.equal(fallback.controller.ready(),true);assert.deepEqual(constraints[1],{video:true,audio:false});fallback.controller.stop();
  const offline=fixture({storage:false});offline.consent.checked=true;await offline.button.onclick();await offline.flush();assert.equal(offline.controller.ready(),false);assert.equal(offline.stopped,0,'failed storage must preserve camera');assert.equal(offline.track.readyState,'live');assert.equal(offline.storageButton.hidden,false);assert.match(offline.status.textContent,/Penyimpanan foto belum terhubung/);offline.tick();assert.equal(offline.uploads.length,0,'do not capture before storage is ready');offline.controller.stop();assert.equal(offline.stopped,1);
  const failedWhileWaiting=fixture({storage:false});let finishPermission;
  failedWhileWaiting.win.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>{finishPermission=r;});
  failedWhileWaiting.consent.checked=true;const waiting=failedWhileWaiting.button.onclick();await failedWhileWaiting.flush();
  finishPermission({getTracks:()=>[failedWhileWaiting.track],getVideoTracks:()=>[failedWhileWaiting.track]});await waiting;await failedWhileWaiting.flush();
  assert.equal(failedWhileWaiting.stopped,0,'storage failure before permission must not kill later approved stream');assert.equal(failedWhileWaiting.controller.ready(),false);failedWhileWaiting.controller.stop();
  const recoverConfig={storage:false};const recover=fixture(recoverConfig);recover.consent.checked=true;await recover.button.onclick();await recover.flush();
  assert.equal(recover.gum,1);assert.equal(recover.controller.ready(),false);recoverConfig.storage=true;
  await recover.storageButton.onclick();await recover.flush();assert.equal(recover.controller.ready(),true,'storage retry can unlock quiz');assert.equal(recover.gum,1,'retry storage must not reopen camera');assert.equal(recover.stopped,0);recover.controller.stop();
  const earlyFailure=fixture({storage:false,holdStorage:true});earlyFailure.consent.checked=true;await earlyFailure.button.onclick();await earlyFailure.flush();
  assert.equal(earlyFailure.track.readyState,'live');earlyFailure.releaseStorage();await earlyFailure.flush();
  assert.equal(earlyFailure.stopped,0,'regression: early storage failure must not turn camera off');assert.equal(earlyFailure.controller.ready(),false);earlyFailure.controller.stop();
  const deviceEnded=fixture();deviceEnded.consent.checked=true;await deviceEnded.button.onclick();await deviceEnded.flush();
  deviceEnded.track.readyState='ended';deviceEnded.tick();assert.equal(deviceEnded.controller.ready(),false);assert.match(deviceEnded.status.textContent,/browser atau perangkat/);deviceEnded.controller.stop();
  let fetchOptions;
  const anonymousWin={setTimeout,clearTimeout,fetch:async(url,options)=>{fetchOptions=options;assert.match(url,/action=capabilities/);return {ok:true,json:async()=>({ok:true,camera:true})};}};
  assert.equal((await Camera.request('https://example.com/exec',{action:'capabilities'},anonymousWin,{})).camera,true);assert.equal(fetchOptions.credentials,'omit');
  console.log('Mobile: autoplay blocked/pending, manual preview, inline attributes, late metadata, click-bound permission, constraint fallback and independent storage retry and camera preservation passed');
  console.log('Camera: consent, permission denial, mute/pause, 1-minute capture, receipt, session association, cleanup and late permission passed');
})();

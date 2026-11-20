const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
let props={},sheets=[],files=[],released=0;
function sheet(name){return {name,rows:[],appendRow(r){this.rows.push(r);},getDataRange(){return {getValues:()=>this.rows,getDisplayValues:()=>this.rows};},getRange(){return {setValues:r=>{this.rows[0]=r[0];return {setFontWeight(){}};}};},setFrozenRows(){}};}
sheets.push(sheet('Rekap'));
const folder={getId:()=> 'private-folder',getFilesByName:n=>{let f=files.find(f=>f.name===n);return {hasNext:()=>!!f,next:()=>f};},createFile:blob=>{const f={name:blob.name,getUrl:()=> 'https://drive.google.com/file/d/private-id/view'};files.push(f);return f;}};
const context={Number,Date,isFinite,JSON,Error,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},
 DriveApp:{createFolder:()=>folder,getFolderById:()=>folder},
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheets:()=>sheets,getSheetByName:n=>sheets.find(s=>s.name===n),insertSheet:n=>{let s=sheet(n);sheets.push(s);return s;}})},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){released++;}})},
 Utilities:{base64Decode:s=>Array.from(Buffer.from(s,'base64')),newBlob:(bytes,type,name)=>({bytes,type,name})},
 ContentService:{MimeType:{JAVASCRIPT:'js',JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})}};
vm.createContext(context);vm.runInContext(fs.readFileSync('latihan-online/backend/apps_script_rekap_nilai.gs','utf8'),context);
function post(d){return JSON.parse(context.doPost({postData:{contents:JSON.stringify(d)}}).text);}
assert.equal(JSON.parse(context.doGet({parameter:{action:'capabilities'}}).text).camera,false);
context.setupCameraStorage();assert.equal(props.CAMERA_FOLDER_ID,'private-folder');
let d={action:'photo',attempt:'attempt-1234',sequence:1,time:new Date().toISOString(),jpeg:'/9j/2Q=='};
assert.equal(post(d).ok,true);assert.equal(post(d).ok,true);assert.equal(files.length,1);assert.equal(sheets[1].rows.length,2,'idempotent retry');
assert.equal(post({...d,jpeg:'bm90IGEganBlZw==',sequence:2}).ok,false);
assert.equal(post({...d,sequence:181}).ok,false);
let p=JSON.parse(context.doGet({parameter:{action:'photos',attempt:'attempt-1234'}}).text);assert.equal(p.photos.length,1);assert.ok(p.photos[0].url.includes('/private-id/'));
assert.equal(JSON.parse(context.doGet({parameter:{action:'photos',attempt:'another-1234'}}).text).photos.length,0,'session isolation');
assert.equal(context.doGet({parameter:{callback:'alert(1)',action:'capabilities'}}).text,'{"ok":false}');
post({Nama:'Test',Nilai:'80','ID sesi':'attempt-1234','Lama mengerjakan':'10 menit · Keluar halaman: 2 kali'});
assert.equal(sheets[0].rows[1][7],'10 menit · Keluar halaman: 2 kali');assert.equal(sheets[0].rows[1][8],'attempt-1234');
assert.equal(released,5);console.log('Backend: private storage only, JPEG/size/sequence validation, idempotency, attempt association, JSONP validation, preserved scores passed');

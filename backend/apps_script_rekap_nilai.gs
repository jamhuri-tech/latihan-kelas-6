// Versi 3: nilai, foto JPEG privat, dan tanda terima unggahan.
var HEADER = ['Waktu','Nama','Pelajaran','Latihan','Nilai','Benar','Soal yang salah','Lama mengerjakan','ID sesi'];
function json(o, cb) {
  var s = JSON.stringify(o);
  return ContentService.createTextOutput(cb ? cb + '(' + s + ')' : s)
    .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
function cameraFolder() {
  var id = PropertiesService.getScriptProperties().getProperty('CAMERA_FOLDER_ID');
  if (!id) throw new Error('Penyimpanan kamera belum diaktifkan');
  return DriveApp.getFolderById(id);
}
// Jalankan sekali oleh pemilik. Folder baru tetap privat, tidak dibagikan publik.
function setupCameraStorage() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('CAMERA_FOLDER_ID')) {
    var f = DriveApp.createFolder('Foto Ujian TKA - Privat');
    p.setProperty('CAMERA_FOLDER_ID', f.getId());
  }
  cameraFolder();
}
function photoSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Foto Ujian');
  if (!sh) {
    sh = ss.insertSheet('Foto Ujian');
    sh.appendRow(['ID sesi','Nomor foto','Waktu foto','URL privat']);
  }
  return sh;
}
function doGet(e) {
  var p = e.parameter || {}, cb = p.callback;
  if (cb && !/^[a-zA-Z_$][\w$]{0,80}$/.test(cb)) return json({ok:false});
  try {
    if (p.action === 'capabilities') return json({ok:true,camera:!!PropertiesService.getScriptProperties().getProperty('CAMERA_FOLDER_ID'),version:3}, cb);
    if (p.action !== 'photos' || !/^[\w-]{8,100}$/.test(p.attempt || '')) return json({ok:false},cb);
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Foto Ujian');
    var rows = sh ? sh.getDataRange().getValues().slice(1) : [];
    return json({ok:true,photos:rows.filter(function(r){return r[0] === p.attempt;}).map(function(r){
      return {sequence:Number(r[1]),time:String(r[2]),url:String(r[3])};
    })},cb);
  } catch(err) { return json({ok:false,error:'Layanan foto belum tersedia'},cb); }
}
function doPost(e) {
  try {
    if (!e.postData || e.postData.contents.length > 210000) throw new Error('Ukuran permintaan');
    var d = JSON.parse(e.postData.contents);
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      if (d.action === 'photo') {
        if (!/^[\w-]{8,100}$/.test(d.attempt || '') || !Number.isInteger(d.sequence) || d.sequence < 1 || d.sequence > 36) throw new Error('Identitas foto');
        if (typeof d.jpeg !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(d.jpeg) || d.jpeg.length > 190000) throw new Error('JPEG tidak valid');
        var bytes = Utilities.base64Decode(d.jpeg);
        if (bytes.length < 4 || (bytes[0]&255)!==255 || (bytes[1]&255)!==216 || (bytes[bytes.length-2]&255)!==255 || (bytes[bytes.length-1]&255)!==217) throw new Error('Bukan JPEG');
        var sh = photoSheet(), rows = sh.getDataRange().getValues().slice(1);
        var previous = rows.filter(function(r){return r[0] === d.attempt && Number(r[1]) === d.sequence;})[0];
        if (previous) return json({ok:true});
        var time = new Date(d.time); if (!isFinite(time.getTime())) throw new Error('Waktu foto');
        var folder = cameraFolder(), name = d.attempt + '-' + d.sequence + '.jpg';
        // Nama deterministik juga mencegah file ganda jika penulisan baris sempat gagal.
        var files = folder.getFilesByName(name);
        var file = files.hasNext() ? files.next() : folder.createFile(Utilities.newBlob(bytes,'image/jpeg',name));
        sh.appendRow([d.attempt,d.sequence,time.toISOString(),file.getUrl()]);
        return json({ok:true});
      }
      var score = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
      if (d.action === 'list') return json({ok:true,rows:score.getDataRange().getDisplayValues().slice(1).filter(function(r){return r[1]!=='';})});
      score.getRange(1,1,1,HEADER.length).setValues([HEADER]).setFontWeight('bold'); score.setFrozenRows(1);
      score.appendRow([String(d.Waktu||''),String(d.Nama||'').slice(0,60),String(d['Mata pelajaran']||''),String(d.Latihan||''),Number(d.Nilai)||0,String(d.Benar||''),String(d['Soal yang salah']||''),String(d['Lama mengerjakan']||''),String(d['ID sesi']||'')]);
      return json({ok:true});
    } finally { lock.releaseLock(); }
  } catch(err) { return json({ok:false,error:'Permintaan tidak dapat disimpan'}); }
}

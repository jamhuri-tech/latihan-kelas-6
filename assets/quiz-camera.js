(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuizCamera = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var INTERVAL = 5 * 60 * 1000;
  function request(url, params, win, doc) {
    return new Promise(function (resolve, reject) {
      var cb = 'camera_' + Date.now() + '_' + Math.random().toString(36).slice(2), tag = doc.createElement('script');
      var timer = win.setTimeout(function () { finish(new Error('Layanan foto tidak merespons')); }, 15000);
      function finish(err, data) { win.clearTimeout(timer); tag.remove(); delete win[cb]; err ? reject(err) : resolve(data); }
      win[cb] = function (data) { finish(data && data.ok ? null : new Error('Layanan foto belum tersedia'), data); };
      tag.onerror = function () { finish(new Error('Tidak dapat menghubungi layanan foto')); };
      params.callback = cb;
      tag.src = url + '?' + Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
      doc.head.appendChild(tag);
    });
  }
  function live(stream) {
    return !!stream && stream.getVideoTracks().some(function (t) { return t.readyState === 'live' && t.enabled && !t.muted; });
  }
  function mount(options) {
    var win = options.window || window, doc = options.document || document;
    var stream, disposed = false, generation = 0, ready = false, busy = false, uploading = false, pending = null;
    var state = options.state, box = doc.createElement('section'); box.className = 'camera-panel';
    box.setAttribute('aria-label', 'Kamera ujian');
    var heading = doc.createElement('h2'); heading.textContent = 'Persetujuan kamera ujian';
    var note = doc.createElement('p');
    note.textContent = 'Dengan pendampingan dan persetujuan orang tua, kamera wajib aktif selama ujian TKA. Foto diambil setiap 5 menit, tanpa suara atau rekaman video. Foto disimpan privat di Google Drive pemilik rekap dan dapat dibuka melalui rekap setelah masuk ke akun pemilik tersebut. Peserta lain tidak mendapat akses foto.';
    var label = doc.createElement('label'), consent = doc.createElement('input'); consent.type = 'checkbox';
    label.append(consent, doc.createTextNode(' Saya dan orang tua menyetujui penggunaan kamera serta penyimpanan foto berkala.'));
    var button = doc.createElement('button'); button.type = 'button'; button.className = 'btn ghost'; button.textContent = 'Setujui dan aktifkan kamera'; button.disabled = true;
    var video = doc.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true; video.setAttribute('aria-label', 'Pratinjau kamera');
    var status = doc.createElement('p'); status.setAttribute('role','status'); status.textContent = 'Soal dijeda sampai kamera aktif dan persetujuan diberikan.';
    var upload = doc.createElement('p'); upload.className = 'hint';
    box.append(heading,note,label,button,video,status,upload); options.container.appendChild(box);
    function setReady(value) { ready = value; options.onReady(value); }
    function check() {
      var value = !disposed && consent.checked && live(stream) && video.readyState >= 2;
      setReady(value);
      status.textContent = value ? 'Kamera aktif. Foto berkala setiap 5 menit. Mikrofon tidak digunakan.' : 'Pengerjaan dijeda. Aktifkan kamera untuk melanjutkan.';
      button.disabled = busy || !consent.checked;
    }
    function stopTracks() { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; video.srcObject = null; }
    consent.onchange = function () { if (!consent.checked) { generation++; stopTracks(); } check(); };
    video.onloadeddata = check; video.onplaying = check;
    button.onclick = async function () {
      if (disposed || busy || !consent.checked) return;
      busy = true; button.disabled = true; options.onPermission(true); var token = ++generation;
      try {
        status.textContent = 'Memeriksa penyimpanan foto privat…';
        var capabilities = await request(options.url,{action:'capabilities'},win,doc);
        if (!capabilities.camera) throw new Error('Penyimpanan foto belum diaktifkan oleh pengelola.');
        if (disposed || token !== generation) return;
        if (!win.navigator.mediaDevices || !win.navigator.mediaDevices.getUserMedia) throw new Error('Kamera memerlukan HTTPS dan browser yang mendukung izin kamera.');
        var next = await win.navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
        if (disposed || token !== generation || !consent.checked) { next.getTracks().forEach(function(t){t.stop();}); return; }
        stopTracks(); stream = next; video.srcObject = stream;
        stream.getVideoTracks().forEach(function(t){ t.addEventListener('ended',check); t.addEventListener('mute',check); t.addEventListener('unmute',check); });
        await video.play();
        if (!state.camera) state.camera = {sequence:0,lastAt:Date.now()};
        options.save(); check();
      } catch(err) {
        if (!disposed && token === generation) { setReady(false); status.textContent = 'Kamera belum aktif: ' + (err.name === 'NotAllowedError' ? 'izin ditolak. Izinkan kamera di pengaturan browser, lalu coba lagi.' : err.message); }
      } finally { busy = false; options.onPermission(false); if (!disposed) button.disabled = !consent.checked; }
    };
    async function uploadPending() {
      if (!pending || uploading) return; uploading = true;
      var photo = pending;
      upload.textContent = 'Mengirim foto ke penyimpanan privat…';
      try {
        await win.fetch(options.url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(photo)});
        // Respons no-cors tidak membuktikan penyimpanan; periksa tanda terima.
        var receipt = await request(options.url,{action:'photos',attempt:state.attemptId},win,doc);
        if (!receipt.photos.some(function(p){return p.sequence === photo.sequence;})) throw new Error('Belum ada tanda terima');
        pending = null; state.camera.saved = photo.sequence; options.save();
        upload.textContent = 'Foto ke-' + photo.sequence + ' tersimpan privat. Lihat melalui rekap orang tua.';
      } catch(err) { upload.textContent = 'Foto belum terkonfirmasi tersimpan. Periksa internet; unggahan akan dicoba kembali selama ujian.'; }
      finally { uploading = false; }
    }
    var timer = win.setInterval(function () {
      if (disposed) return;
      // Jangan menimpa pesan kesalahan perizinan saat belum ada stream.
      if (stream) check();
      if (pending) { uploadPending(); return; }
      if (!ready || !state.camera || state.camera.sequence >= 36 || Date.now() - state.camera.lastAt < INTERVAL) return;
      try {
        var canvas = doc.createElement('canvas'), ratio = Math.min(1,480 / video.videoWidth);
        if (!video.videoWidth || !video.videoHeight) return;
        canvas.width = Math.round(video.videoWidth * ratio); canvas.height = Math.round(video.videoHeight * ratio);
        canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
        var jpeg = canvas.toDataURL('image/jpeg',0.65).split(',')[1];
        state.camera.sequence++; state.camera.lastAt = Date.now(); options.save();
        pending = {action:'photo',attempt:state.attemptId,sequence:state.camera.sequence,time:new Date().toISOString(),jpeg:jpeg};
        uploadPending();
      } catch(err) { upload.textContent = 'Foto gagal diambil. Periksa kamera dan coba aktifkan kembali.'; }
    },5000);
    setReady(false);
    return {ready:function(){return ready && live(stream);},stop:function(){ disposed = true; generation++; win.clearInterval(timer); stopTracks(); setReady(false); status.textContent = 'Kamera dimatikan. Tidak ada foto baru setelah ujian selesai.'; button.disabled = true; consent.disabled = true; }};
  }
  return {mount:mount,request:request,live:live,interval:INTERVAL};
});

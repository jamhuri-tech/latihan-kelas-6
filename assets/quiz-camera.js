(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuizCamera = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var INTERVAL = 60 * 1000;
  function jsonp(url, params, win, doc) {
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
  function request(url, params, win, doc) {
    // GET แบบไม่ส่งคุกกี้ช่วยหลีกเลี่ยงหน้าลงชื่อเข้าใช้ของ Google ในเบราว์เซอร์หลายบัญชี.
    // บริการที่ไม่รองรับ CORS ยังคงใช้ JSONP ได้เช่นเดิม.
    if (!win.fetch) return jsonp(url, params, win, doc);
    var query = Object.keys(params).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(params[k]);}).join('&');
    return new Promise(function(resolve,reject){
      var settled = false, controller = win.AbortController ? new win.AbortController() : null;
      var timer = win.setTimeout(fallback,5000);
      function fallback() {
        if (settled) return;
        settled = true; win.clearTimeout(timer); if (controller) controller.abort();
        jsonp(url,params,win,doc).then(resolve,reject);
      }
      Promise.resolve().then(function(){
        return win.fetch(url+'?'+query,{method:'GET',mode:'cors',credentials:'omit',signal:controller ? controller.signal : undefined});
      }).then(function(response){
        if (!response.ok) throw new Error('Layanan foto tidak merespons');
        return response.json();
      }).then(function(data){
        if (settled) return;
        if (!data || !data.ok) { fallback(); return; }
        settled = true; win.clearTimeout(timer); resolve(data);
      },fallback);
    });
  }
  function live(stream) {
    return !!stream && stream.getVideoTracks().some(function (t) { return t.readyState === 'live' && t.enabled && !t.muted; });
  }
  function mount(options) {
    var win = options.window || window, doc = options.document || document;
    var stream, disposed = false, generation = 0, ready = false, storageReady = false, storageBusy = false, storageError = false, busy = false, playbackBlocked = false, uploading = false, pending = null;
    var state = options.state, box = doc.createElement('section'); box.className = 'camera-panel';
    box.setAttribute('aria-label', 'Kamera ujian');
    var heading = doc.createElement('h2'); heading.textContent = 'Persetujuan kamera ujian';
    var note = doc.createElement('p');
    note.textContent = 'Dengan pendampingan dan persetujuan orang tua, kamera wajib aktif selama ujian TKA. Foto diambil setiap 1 menit, tanpa suara atau rekaman video. Foto disimpan privat di Google Drive pemilik rekap dan dapat dibuka melalui rekap setelah masuk ke akun pemilik tersebut. Peserta lain tidak mendapat akses foto.';
    var label = doc.createElement('label'), consent = doc.createElement('input'); consent.type = 'checkbox';
    label.append(consent, doc.createTextNode(' Saya dan orang tua menyetujui penggunaan kamera serta penyimpanan foto berkala.'));
    var button = doc.createElement('button'); button.type = 'button'; button.className = 'btn ghost'; button.textContent = 'Setujui dan aktifkan kamera'; button.disabled = true;
    var video = doc.createElement('video'); video.autoplay = true; video.muted = true; video.defaultMuted = true; video.playsInline = true;
    ['autoplay','muted','playsinline','webkit-playsinline'].forEach(function(attr){video.setAttribute(attr,'');});
    video.setAttribute('aria-label', 'Pratinjau kamera');
    var previewButton = doc.createElement('button'); previewButton.type = 'button'; previewButton.className = 'btn ghost'; previewButton.textContent = 'Tampilkan pratinjau kamera'; previewButton.hidden = true;
    var storageButton = doc.createElement('button'); storageButton.type = 'button'; storageButton.className = 'btn ghost'; storageButton.textContent = 'Coba koneksi penyimpanan foto'; storageButton.hidden = true;
    var status = doc.createElement('p'); status.setAttribute('role','status'); status.textContent = 'Soal dijeda sampai kamera aktif dan persetujuan diberikan.';
    var upload = doc.createElement('p'); upload.className = 'hint';
    box.append(heading,note,label,button,video,previewButton,storageButton,status,upload); options.container.appendChild(box);
    function setReady(value) { ready = value; options.onReady(value); }
    function check() {
      if (disposed) return;
      var value = consent.checked && storageReady && live(stream) && video.readyState >= 2 && video.videoWidth > 0 && !video.paused && !video.ended;
      setReady(value);
      previewButton.hidden = !stream || value || !consent.checked;
      if (value) {
        playbackBlocked = false;
        status.textContent = 'Kamera aktif. Foto berkala setiap 1 menit. Mikrofon tidak digunakan.';
      } else if (stream && playbackBlocked) {
        status.textContent = 'Izin kamera sudah diterima. Ketuk “Tampilkan pratinjau kamera” untuk memulai video di ponsel.';
      } else if (stream && !live(stream)) {
        var ended = stream.getVideoTracks().some(function(track){return track.readyState === 'ended';});
        status.textContent = ended ? 'Aliran kamera dihentikan oleh browser atau perangkat. Tutup aplikasi lain yang memakai kamera, lalu tekan aktifkan kamera kembali.' : 'Gambar kamera sedang dijeda oleh ponsel. Kembali ke halaman ini; jika belum pulih, aktifkan kamera kembali.';
      } else if (stream && !storageReady) {
        status.textContent = storageError ? 'Kamera tetap tersambung. Penyimpanan foto belum terhubung. Ketuk “Coba koneksi penyimpanan foto”. Soal masih dijeda.' : 'Kamera tersambung. Memeriksa penyimpanan foto privat…';
      } else if (stream) {
        status.textContent = 'Menunggu gambar kamera. Jika tetap hitam, ketuk “Tampilkan pratinjau kamera” atau aktifkan kamera kembali.';
      } else {
        status.textContent = 'Pengerjaan dijeda. Aktifkan kamera untuk melanjutkan.';
      }
      storageButton.hidden = !consent.checked || !stream || storageReady;
      storageButton.disabled = storageBusy;
      button.disabled = busy || !consent.checked;
    }
    function stopTracks() { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; video.srcObject = null; previewButton.hidden = true; storageButton.hidden = true; }
    function playPreview(token) {
      if (disposed || token !== generation || !stream || !consent.checked) return;
      playbackBlocked = false;
      // Safari/ponsel dapat menolak atau menunda play(). Jangan biarkan tombol aktivasi terkunci karenanya.
      try {
        var result = video.play();
        if (result && result.then) result.then(function(){if (!disposed && token === generation) check();},function(){
          if (!disposed && token === generation) { playbackBlocked = true; check(); }
        });
      } catch(err) { playbackBlocked = true; }
      check();
    }
    previewButton.onclick = function(){playPreview(generation);};
    consent.onchange = function () { if (!consent.checked) { generation++; storageReady = false; stopTracks(); } check(); };
    video.onloadeddata = check;
    video.onloadedmetadata = function(){playPreview(generation);};
    video.onplaying = check;
    video.onpause = video.onended = function(){if (stream) check();};
    async function connectStorage(token) {
      if (storageBusy || disposed || !consent.checked) return;
      storageBusy = true; storageError = false; storageButton.disabled = true; if (stream) check();
      try {
        var capabilities = await request(options.url,{action:'capabilities'},win,doc);
        if (!capabilities.camera) throw new Error('Penyimpanan foto belum diaktifkan');
        if (!disposed && token === generation && consent.checked) {
          storageReady = true;
          if (!state.camera) state.camera = {sequence:0,lastAt:Date.now()};
          options.save();
        }
      } catch(err) {
        if (!disposed && token === generation) { storageReady = false; storageError = true; }
      } finally {
        storageBusy = false;
        if (!disposed && token === generation) check();
        else if (!disposed && consent.checked && stream && !storageReady) connectStorage(generation);
      }
    }
    storageButton.onclick = function(){return connectStorage(generation);};
    button.onclick = async function () {
      if (disposed || busy || !consent.checked) return;
      busy = true; playbackBlocked = false; setReady(false); stopTracks();
      button.disabled = true; options.onPermission(true); var token = ++generation;
      async function acquire() {
        if (!win.navigator.mediaDevices || !win.navigator.mediaDevices.getUserMedia) throw new Error('Kamera tidak tersedia di browser ini. Buka tautan HTTPS langsung di Chrome atau Safari, bukan browser di dalam aplikasi chat.');
        var next;
        try {
          // Panggil dari klik pengguna, sebelum menunggu jaringan, agar izin kamera ponsel tetap terkait tindakan pengguna.
          next = await win.navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'user'},width:{ideal:640},height:{ideal:480}},audio:false});
        } catch(err) {
          if (disposed || token !== generation || !consent.checked) return;
          if (err.name !== 'OverconstrainedError' && err.name !== 'NotFoundError') throw err;
          next = await win.navigator.mediaDevices.getUserMedia({video:true,audio:false});
        }
        if (disposed || token !== generation || !consent.checked) { next.getTracks().forEach(function(t){t.stop();}); return; }
        stream = next; video.srcObject = stream;
        stream.getVideoTracks().forEach(function(t){ t.addEventListener('ended',check); t.addEventListener('mute',check); t.addEventListener('unmute',check); });
        playPreview(token);
      }
      try {
        status.textContent = 'Meminta izin kamera dan memeriksa penyimpanan foto privat…';
        var media = acquire();
        if (!storageReady) connectStorage(token);
        await media;
        if (disposed || token !== generation || !consent.checked) return;
        check();
      } catch(err) {
        if (!disposed && token === generation) {
          generation++; storageReady = false; stopTracks(); setReady(false);
          var message = err.message;
          if (err.name === 'NotAllowedError' || err.name === 'SecurityError') message = 'izin kamera belum tersedia. Izinkan kamera untuk situs ini dan untuk browser pada pengaturan ponsel. Jika dibuka dari aplikasi chat, buka tautan langsung di Chrome atau Safari.';
          else if (err.name === 'NotReadableError' || err.name === 'AbortError') message = 'kamera belum dapat digunakan. Tutup aplikasi lain yang memakai kamera, lalu coba lagi.';
          else if (err.name === 'NotFoundError') message = 'kamera tidak ditemukan. Coba browser utama ponsel dan periksa izin kameranya.';
          status.textContent = 'Kamera belum aktif: ' + message;
        }
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
      if (!ready || !state.camera || state.camera.sequence >= 180 || Date.now() - state.camera.lastAt < INTERVAL) return;
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

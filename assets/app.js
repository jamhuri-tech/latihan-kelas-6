(function () {
  'use strict';

  var app = document.getElementById('app');
  var NAME_KEY = 'lso:name';
  // Atas izin pemilik: nilai dikirim ke email orang tua lewat FormSubmit.co (aktivasi sekali lewat email konfirmasi).
  var NOTIFY_URL = 'https://formsubmit.co/ajax/m.jamhuri@live.com';
  // Nilai juga dicatat ke Google Sheet "Rekap Nilai Latihan Kelas 6" (Apps Script, URL /exec). Kosong = tidak dipakai.
  var SHEET_URL = 'https://script.google.com/macros/s/AKfycbyhI-46Ltlen5Cuw_QKjCMzPhdXApNTm4NdEEYoHirM94W0KlaAnTXk9awfiB6vdL_Lxg/exec';
  var manifest = null;
  var cache = {};

  var STORE = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ }
    },
    del: function (k) {
      try { localStorage.removeItem(k); } catch (e) { /* abaikan */ }
    }
  };
  var header = document.querySelector('.site-head');
  function measureHeader() { if (header) document.documentElement.style.setProperty('--header-height', header.offsetHeight + 'px'); }
  if (window.ResizeObserver && header) new ResizeObserver(measureHeader).observe(header);
  else window.addEventListener('resize', measureHeader);
  measureHeader();
  var Sessions = window.QuizSession;
  var PROFILES_KEY = 'lso:profiles:v1';
  var ACTIVE_KEY = 'lso:active-profile:v1';
  var profiles = STORE.get(PROFILES_KEY, []);
  var activeId;
  try { activeId = sessionStorage.getItem(ACTIVE_KEY) || STORE.get(ACTIVE_KEY, ''); } catch (e) { activeId = STORE.get(ACTIVE_KEY, ''); }
  function uniqueId() { return window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }
  var legacyName = (STORE.get(NAME_KEY, '') || '').trim();
  if (legacyName && !STORE.get('lso:legacy-profile', null)) {
    var legacy = { id: uniqueId(), name: legacyName };
    profiles.push(legacy); STORE.set(PROFILES_KEY, profiles); STORE.set('lso:legacy-profile', legacy.id);
    if (!activeId) activeId = legacy.id;
  }
  function activeProfile() { return profiles.find(function (p) { return p.id === activeId; }) || null; }
  function useProfile(p) { activeId = p.id; STORE.set(ACTIVE_KEY, p.id); try { sessionStorage.setItem(ACTIVE_KEY, p.id); } catch (e) {} }
  function stateKey(p, id) { return Sessions.scope('st', p.id, id); }
  function bestKey(p, id) { return Sessions.scope('best', p.id, id); }
  function bestFor(p, id) {
    if (!p) return null;
    var best = STORE.get(bestKey(p, id), null);
    return best == null && p.id === STORE.get('lso:legacy-profile', '') ? STORE.get('lso:best:' + id, null) : best;
  }
  function savedFor(p, id) {
    if (!p) return null;
    return STORE.get(stateKey(p, id), null) || (p.id === STORE.get('lso:legacy-profile', '') ? STORE.get('lso:st:' + id, null) : null);
  }
  function participantPanel(onChange) {
    var selected = activeProfile();
    var select = h('select', { 'aria-label': 'Peserta tersimpan', onchange: function () {
      var p = profiles.find(function (p) { return p.id === select.value; });
      if (p) { useProfile(p); onChange(); }
    } }, h('option', { value: '' }, 'Pilih peserta'));
    profiles.forEach(function (p) { select.append(h('option', { value: p.id }, p.name)); });
    select.value = selected ? selected.id : '';
    var input = h('input', { type: 'text', maxlength: '40', placeholder: 'Nama dan kelas / kelompok', 'aria-label': 'Nama peserta baru', autocomplete: 'off', required: true });
    var error = h('p', { class: 'hint', role: 'status' });
    var form = h('form', { class: 'participant-add', onsubmit: function (ev) {
      ev.preventDefault(); profiles = STORE.get(PROFILES_KEY, profiles);
      var name = input.value.trim().replace(/\s+/g, ' ');
      if (!name) { error.textContent = 'Tulis nama peserta dahulu.'; input.focus(); return; }
      var p = profiles.find(function (p) { return p.name.toLocaleLowerCase('id') === name.toLocaleLowerCase('id'); });
      if (!p) { p = { id: uniqueId(), name: name }; profiles.push(p); STORE.set(PROFILES_KEY, profiles); }
      useProfile(p); onChange();
    } }, input, h('button', { class: 'btn ghost', type: 'submit' }, 'Gunakan nama ini'));
    return h('section', { class: 'participant-panel', 'aria-label': 'Pilih peserta' },
      h('h2', null, selected ? 'Peserta: ' + selected.name : 'Siapa yang akan berlatih?'),
      h('p', null, 'Pilih namamu agar jawaban dan nilai terbaik tidak bercampur. Gunakan nama berbeda jika ada teman bernama sama.'),
      select, form, error,
      h('p', { class: 'hint' }, 'Profil tersimpan di browser ini, tanpa akun atau kata sandi. Di perangkat lain, masukkan nama yang sama saat mulai.'));
  }
  function launchQuiz(data) {
    document.title = data.title + ' – Ruang Latihan';
    app.className = 'wrap quiz-page s-' + subjSlug(data.subject);
    var root = h('div', { class: 'session-launch' }, h('a', { href: '#/latihan' }, '← Daftar latihan'), h('h1', null, data.title));
    root.append(participantPanel(function () { launchQuiz(data); }));
    var profile = activeProfile();
    if (profile) {
      root.append(h('p', null, 'Sesi baru otomatis mengacak urutan soal dan pilihan jawaban. Bacaan, gambar, dan tabel tetap bersama soal terkait.'),
        h('button', { class: 'btn', type: 'button', onclick: function () { Quiz(data, profile, true); } }, 'Mulai latihan baru (acak otomatis)'));
      var saved = savedFor(profile, data.id);
      if (saved && (!saved.layout || Sessions.valid(data, saved.layout))) {
        var count = Object.keys(saved.ans || {}).length;
        root.append(h('p', null, 'Sesi terakhir ' + profile.name + ': ' + (saved.checked ? 'sudah selesai.' : count + ' soal sudah dijawab.')),
          h('button', { class: 'btn ghost', type: 'button', onclick: function () { Quiz(data, profile, false); } }, saved.checked ? 'Lihat hasil sesi terakhir' : 'Lanjutkan sesi terakhir'));
      }
      var best = bestFor(profile, data.id);
      if (best != null) root.append(h('p', null, 'Nilai terbaik ' + profile.name + ': ' + best));
    }
    root.append(h('p', { class: 'hint' }, 'Memuat ulang halaman membuka pilihan sesi. Pilih Lanjutkan untuk mempertahankan jawaban dan urutan sebelumnya.'));
    app.replaceChildren(root); window.scrollTo(0, 0);
  }

  /* ---------- util ---------- */
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === false || v == null) return;
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v);
        else if (k === 'checked' || k === 'disabled') e[k] = !!v;
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }
  function append(e, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (x) { append(e, x); }); return; }
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  function fetchJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  function renderMath(el) {
    var run = function () {
      if (window.renderMathInElement) {
        try {
          window.renderMathInElement(el, {
            delimiters: [{ left: '$', right: '$', display: false }],
            throwOnError: false
          });
        } catch (e) { /* abaikan */ }
      }
    };
    if (window.renderMathInElement) run();
    else { (window.__mathQ = window.__mathQ || []).push(run); }
  }
  window.addEventListener('load', function () {
    (window.__mathQ || []).forEach(function (f) { f(); });
    window.__mathQ = [];
  });
  function norm(s) {
    return String(s).toLowerCase()
      .replace(/(\d),(\d)/g, '$1.$2')
      .replace(/[’'`´"“”]/g, '')
      .replace(/[^a-z0-9.\/]+/g, '')
      .replace(/\.+$/, '');
  }
  function matchIsian(input, accept) {
    var n = norm(input);
    if (!n) return false;
    for (var i = 0; i < accept.length; i++) {
      var nv = norm(accept[i]);
      if (!nv) continue;
      if (n === nv) return true;
      if (/^[\d.\/]+$/.test(nv)) {
        if (n.indexOf(nv) === 0 && !/[\d.\/]/.test(n.charAt(nv.length) || ' ')) return true;
      } else if (nv.length >= 5 && n.indexOf(nv) !== -1) {
        return true;
      }
    }
    return false;
  }

  /* ---------- beranda ---------- */
  var SUBJECT_ORDER = ['Matematika', 'Bahasa Indonesia', 'PAI dan Budi Pekerti', 'PPKn', 'Bahasa Inggris', 'Koding'];
  var SUBJECT_SHORT = { 'PAI dan Budi Pekerti': 'PAI' };
  function subjSlug(sname) { return sname.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''); }
  function isTka(m) { return /tka|try ?out/i.test(m.title); }

  var ICON_PATHS = {
    book: '<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z"/><path d="M12 6v14"/>',
    math: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 11h2m4 0h2m-8 4h2m4 0h2m-8 3h2m4 0h2"/>',
    moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 20"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8m-8 4h5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  function icon(name) {
    return h('span', { class: 'ui-icon', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name] || ICON_PATHS.book) + '</svg>' });
  }
  var SUBJECT_ICONS = { 'Matematika': 'math', 'Bahasa Indonesia': 'book', 'PAI dan Budi Pekerti': 'moon', 'PPKn': 'shield', 'Bahasa Inggris': 'globe', 'Koding': 'code' };
  function packetNumber(m) { var p = m.title.match(/Paket\s*(\d+)/i); return p ? Number(p[1]) : 1; }
  function shortTitle(m) {
    if (/prediksi/i.test(m.title)) return 'Prediksi TKA 2026 · Paket ' + packetNumber(m);
    if (isTka(m)) return 'Try Out TKA · Paket ' + packetNumber(m);
    return m.title;
  }
  function scrollToElement(el) {
    if (el) el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  function renderHome(mode) {
    document.title = 'Ruang Latihan · Kelas 6 SD';
    app.className = 'wrap home-page';
    app.replaceChildren(h('p', { class: 'loading' }, 'Menyiapkan ruang belajarmu…'));
    var ready = manifest ? Promise.resolve(manifest) : fetchJSON('data/index.json').then(function (m) { manifest = m; return m; });
    ready.then(function (list) {
      var flt = Object.assign({ subj: 'all', kind: 'all', status: 'all' }, STORE.get('lso:filter', {}));
      if (mode === 'tka') { flt.kind = 'tka'; flt.subj = 'all'; flt.status = 'all'; }
      if (mode === 'latihan') { flt.kind = 'all'; flt.status = 'all'; }
      var query = '', sort = 'latest';
      var subjects = SUBJECT_ORDER.filter(function (s) { return list.some(function (m) { return m.subject === s; }); });
      list.forEach(function (m) { if (subjects.indexOf(m.subject) < 0) subjects.push(m.subject); });
      if (subjects.indexOf(flt.subj) < 0) flt.subj = 'all';
      function info(m) {
        var profile = activeProfile(), best = bestFor(profile, m.id), st = savedFor(profile, m.id);
        var answeredCount = st && st.ans ? Object.keys(st.ans).length : 0;
        return { best: best, started: !!(answeredCount && !st.checked), answered: answeredCount, done: !!(st && st.checked) };
      }
      var inProgress = list.filter(function (m) { return info(m).started; });
      var doneCount = list.filter(function (m) { return info(m).best != null; }).length;
      var newest = list.filter(isTka).sort(function (a, b) { return packetNumber(b) - packetNumber(a) || subjects.indexOf(a.subject) - subjects.indexOf(b.subject); }).slice(0, 2);
      var listBox = h('div', { class: 'list' });
      var chipsSubj = h('div', { class: 'subject-options', role: 'group', 'aria-label': 'Pilih pelajaran' });
      var chipsKind = h('div', { class: 'chips kind-tabs', role: 'group', 'aria-label': 'Jenis latihan' });
      var resultsLabel = h('span', { class: 'results-label', 'aria-live': 'polite' });
      function save() { STORE.set('lso:filter', flt); }
      function matches(m) {
        var f = info(m);
        return (flt.subj === 'all' || m.subject === flt.subj) &&
          (flt.kind !== 'tka' || isTka(m)) && (flt.kind !== 'latihan' || !isTka(m)) &&
          (flt.status !== 'started' || f.started) && (flt.status !== 'done' || f.done || f.best != null) &&
          (flt.status !== 'new' || (!f.started && !f.done && f.best == null)) &&
          (!query || (m.title + ' ' + m.subject + ' ' + m.desc).toLowerCase().indexOf(query) >= 0);
      }
      function card(m) {
        var f = info(m), latest = isTka(m) && packetNumber(m) === Math.max.apply(null, list.filter(isTka).map(packetNumber));
        var percent = Math.min(100, Math.round(100 * f.answered / m.count));
        return h('article', { class: 'card s-' + subjSlug(m.subject) },
          h('div', { class: 'card-top' }, h('span', { class: 'subject-icon' }, icon(SUBJECT_ICONS[m.subject])),
            h('span', { class: 'card-kind' }, isTka(m) ? 'PERSIAPAN TKA' : 'LATIHAN MATERI'), latest && h('span', { class: 'badge latest' }, 'Terbaru')),
          h('h3', null, h('a', { class: 'card-title-link', href: '#/quiz/' + m.id }, shortTitle(m))),
          h('p', { class: 'desc' }, isTka(m) ? m.count + ' soal pilihan ganda. ' + (m.subject === 'Matematika' ? 'Bilangan, pengukuran, geometri, dan data; dengan langkah pengerjaan.' : 'Pahami bacaan, tarik simpulan, dan temukan informasi penting.') : m.desc),
          h('div', { class: 'meta' }, h('span', null, icon('file'), m.count + ' soal'),
            f.best != null ? h('span', { class: 'best-text' }, icon('star'), 'Terbaik ' + f.best) : h('span', null, icon('clock'), 'Belajar mandiri')),
          f.started && h('div', { class: 'card-progress' }, h('div', { class: 'mini-track' }, h('span', { style: 'width:' + percent + '%' })), h('small', null, f.answered + '/' + m.count + ' terjawab')),
          h('div', { class: 'actions' }, h('a', { class: 'start-link', href: '#/quiz/' + m.id }, f.started ? 'Lanjutkan' : f.best != null ? 'Latihan lagi' : 'Mulai latihan', icon('arrow'))));
      }
      function chip(label, active, fn) { return h('button', { type: 'button', class: 'chip' + (active ? ' on' : ''), 'aria-pressed': active ? 'true' : 'false', onclick: fn }, label); }
      function paint() {
        chipsSubj.replaceChildren();
        ['all'].concat(subjects).forEach(function (sj) {
          var n = sj === 'all' ? list.length : list.filter(function (m) { return m.subject === sj; }).length;
          chipsSubj.append(h('button', { type: 'button', class: 'subject-choice s-' + subjSlug(sj) + (flt.subj === sj ? ' on' : ''), 'aria-pressed': flt.subj === sj ? 'true' : 'false', onclick: function () { flt.subj = sj; save(); paint(); chipsSubj.querySelector('[aria-pressed="true"]').focus({ preventScroll: true }); } },
            icon(sj === 'all' ? 'book' : SUBJECT_ICONS[sj]), h('span', null, sj === 'all' ? 'Semua pelajaran' : SUBJECT_SHORT[sj] || sj), h('span', { class: 'n' }, n)));
        });
        chipsKind.replaceChildren();
        [['all', 'Semua latihan'], ['tka', 'Try Out TKA'], ['latihan', 'Per materi']].forEach(function (v) { chipsKind.append(chip(v[1], flt.kind === v[0], function () { flt.kind = v[0]; save(); paint(); chipsKind.querySelector('[aria-pressed="true"]').focus({ preventScroll: true }); })); });
        listBox.replaceChildren();
        var shown = 0;
        subjects.forEach(function (sj) {
          var items = list.filter(function (m) { return m.subject === sj && matches(m); });
          items.sort(function (a, b) { return sort === 'az' ? shortTitle(a).localeCompare(shortTitle(b), 'id') : Number(isTka(b)) - Number(isTka(a)) || packetNumber(b) - packetNumber(a) || a.title.localeCompare(b.title, 'id'); });
          if (!items.length) return;
          shown += items.length;
          var cards = h('div', { class: 'cards' });
          items.forEach(function (m) { cards.append(card(m)); });
          listBox.append(h('section', { class: 'subj s-' + subjSlug(sj) }, h('h3', { class: 'subject' }, h('span', null, icon(SUBJECT_ICONS[sj]), sj), h('span', { class: 'cnt' }, items.length + ' latihan')), cards));
        });
        resultsLabel.textContent = shown + ' latihan tersedia';
        if (!shown) listBox.append(h('div', { class: 'empty' }, icon('search'), h('h3', null, 'Belum menemukan latihan?'), h('p', null, 'Coba kata lain atau tampilkan semua pelajaran.'), h('button', { class: 'btn ghost', type: 'button', onclick: function () { flt = { subj: 'all', kind: 'all', status: 'all' }; query = ''; search.value = ''; statusSelect.value = 'all'; save(); paint(); } }, 'Hapus filter')));
      }
      var search = h('input', { type: 'search', class: 'search', placeholder: 'Cari materi atau paket…', 'aria-label': 'Cari latihan', autocomplete: 'off', oninput: function (e) { query = e.target.value.trim().toLowerCase(); paint(); } });
      var sortSelect = h('select', { 'aria-label': 'Urutkan latihan', onchange: function (e) { sort = e.target.value; paint(); } }, h('option', { value: 'latest' }, 'Terbaru dahulu'), h('option', { value: 'az' }, 'Judul A–Z'));
      var statusSelect = h('select', { 'aria-label': 'Status pengerjaan', onchange: function (e) { flt.status = e.target.value; save(); paint(); } },
        h('option', { value: 'all' }, 'Semua progres'), h('option', { value: 'new' }, 'Belum dikerjakan'), h('option', { value: 'started' }, 'Sedang dikerjakan'), h('option', { value: 'done' }, 'Sudah selesai'));
      statusSelect.value = flt.status;
      var library = h('section', { class: 'catalog', id: 'katalog' },
        h('div', { class: 'section-heading' }, h('div', null, h('span', { class: 'eyebrow' }, 'PILIH, KERJAKAN, PAHAMI'), h('h2', null, 'Mau belajar apa hari ini?')), resultsLabel),
        h('div', { class: 'library-layout' },
          h('aside', { class: 'subject-panel' }, h('p', { class: 'panel-title' }, 'MATA PELAJARAN', h('span', { class: 'mobile-hint' }, 'Geser untuk melihat lainnya →')), chipsSubj, h('a', { class: 'parent-note', href: 'rekap.html' }, icon('star'), h('span', null, h('strong', null, 'Untuk orang tua'), h('small', null, 'Lihat rekap nilai anak')), icon('arrow'))),
          h('div', { class: 'library-main' }, h('div', { class: 'toolbar' }, h('label', { class: 'search-wrap' }, icon('search'), search),
            h('div', { class: 'filter-row' }, chipsKind, h('div', { class: 'selects' }, statusSelect, sortSelect))), listBox)));
      var heroLinks = h('div', { class: 'hero-packets' });
      newest.forEach(function (m) { heroLinks.append(h('a', { href: '#/quiz/' + m.id }, icon(SUBJECT_ICONS[m.subject]), h('span', null, h('strong', null, m.subject), h('small', null, 'Paket ' + packetNumber(m) + ' · ' + m.count + ' soal')), icon('arrow'))); });
      var root = h('div', null,
        h('section', { class: 'hero' }, h('div', { class: 'hero-copy' }, h('span', { class: 'hero-kicker' }, h('span', { class: 'live-dot' }), 'RUANG BELAJAR KELAS 6'),
          h('h1', null, 'Sedikit latihan,', h('br'), h('span', null, 'banyak kemajuan.')),
          h('p', null, 'Belajar sesuai ritmemu. Pilih pelajaran, coba soalnya, dan pahami langkahnya satu per satu.'),
          h('div', { class: 'hero-actions' }, h('button', { class: 'btn lime', type: 'button', onclick: function () { scrollToElement(library); } }, 'Mulai belajar', icon('arrow')), h('a', { class: 'hero-secondary', href: '#/tka' }, 'Jelajahi Try Out TKA', icon('arrow')))),
          h('aside', { class: 'hero-feature' }, h('span', { class: 'feature-label' }, icon('star'), 'PAKET TERBARU'), h('div', { class: 'feature-art', 'aria-hidden': 'true' }, h('span', { class: 'art-symbol one' }, '÷'), h('span', { class: 'art-book' }, icon('book')), h('span', { class: 'art-symbol two' }, 'Aa'), h('span', { class: 'art-spark' }, '✦')),
            h('h2', null, 'Siap melangkah lebih jauh?'), h('p', null, 'Coba prediksi TKA terbaru untuk mengasah kemampuanmu.'), heroLinks)),
        h('div', { class: 'home-metrics' },
          h('div', null, icon('book'), h('span', null, h('strong', null, list.length), h('small', null, 'pilihan latihan'))),
          h('div', null, icon('globe'), h('span', null, h('strong', null, subjects.length), h('small', null, 'mata pelajaran'))),
          h('div', null, icon('check'), h('span', null, h('strong', null, doneCount), h('small', null, 'latihan selesai di perangkat ini'))),
          h('div', null, icon('clock'), h('span', null, h('strong', null, 'Kapan saja'), h('small', null, 'belajar dengan ritmemu')))));
      if (inProgress.length) {
        var resumeCards = h('div', { class: 'cards' });
        inProgress.slice(0, 3).forEach(function (m) { resumeCards.append(h('a', { class: 'resume s-' + subjSlug(m.subject), href: '#/quiz/' + m.id }, icon(SUBJECT_ICONS[m.subject]), h('span', null, h('small', null, m.subject), h('strong', null, shortTitle(m))), icon('arrow'))); });
        root.append(h('section', { class: 'continue' }, h('h2', null, 'Lanjutkan langkahmu'), resumeCards));
      }
      root.prepend(participantPanel(function () { renderHome(mode); }));
      root.append(library);
      app.replaceChildren(root); paint();
      if (mode) scrollToElement(library); else window.scrollTo(0, 0);
    }).catch(function () { app.replaceChildren(h('div', { class: 'empty' }, h('h1', null, 'Latihan belum bisa dimuat'), h('p', null, 'Periksa koneksi internet, lalu coba lagi.'), h('button', { class: 'btn', onclick: function () { renderHome(mode); } }, 'Coba lagi'))); });
  }

  /* ---------- kuis ---------- */
  function openQuiz(id) {
    app.replaceChildren(h('p', { class: 'loading' }, 'Memuat soal…'));
    var p = cache[id] ? Promise.resolve(cache[id]) : fetchJSON('data/' + id + '.json').then(function (d) { cache[id] = d; return d; });
    p.then(function (data) { launchQuiz(data); }).catch(function () {
      app.replaceChildren(h('p', null, 'Latihan tidak ditemukan. ', h('a', { href: '#/' }, '← Kembali')));
    });
  }

  function Quiz(sourceData, profile, fresh) {
    var pointerKey = stateKey(profile, sourceData.id);
    var st = fresh ? {} : (savedFor(profile, sourceData.id) || {});
    ['ans', 'marks', 'order'].forEach(function (k) { if (!st[k]) st[k] = {}; });
    if (!st.layout) {
      // Old answers keep their original question numbers and option order during migration.
      var legacyShuffle = STORE.get('lso:set', {}).shuffle;
      st.layout = Sessions.layout(sourceData, Math.random, !fresh, legacyShuffle ? st.order : null);
    }
    if (!Sessions.valid(sourceData, st.layout)) { launchQuiz(sourceData); return; }
    if (!st.attemptId) st.attemptId = uniqueId();
    st.participantId = profile.id; st.participantName = profile.name;
    var key = Sessions.scope('attempt', profile.id, sourceData.id) + ':' + st.attemptId;
    var data = Sessions.prepare(sourceData, st.layout);
    var items = [], secOf = {};
    data.sections.forEach(function (s) { s.items.forEach(function (q) { items.push(q); secOf[q.id] = s; }); });
    var gradable = items.filter(function (q) { return q.type !== 'uraian'; });
    var cards = {}, navButtons = {};
    var stage, resultBox, barFill, barText, nextButton, navEndButton;

    function save() {
      if (!st.started && Object.keys(st.ans).length) st.started = Date.now();
      STORE.set(key, st);
      STORE.set(pointerKey, st);
    }
    function A(q) { return st.ans[q.id]; }

    function answered(q) {
      var a = A(q);
      switch (q.type) {
        case 'pg': return a !== undefined;
        case 'bs': return Array.isArray(a) && a.length === q.stmts.length && a.every(function (v) { return v === true || v === false; });
        case 'ms': return Array.isArray(a) && a.length > 0;
        default: return typeof a === 'string' && a.trim() !== '';
      }
    }
    function isCorrect(q) {
      var a = A(q);
      switch (q.type) {
        case 'pg': return a === q.ans;
        case 'bs': return Array.isArray(a) && a.length === q.answers.length && a.every(function (v, i) { return v === q.answers[i]; });
        case 'ms':
          var x = (a || []).slice().sort(function (p, r) { return p - r; }).join(',');
          var y = q.answers.slice().sort(function (p, r) { return p - r; }).join(',');
          return x === y;
        case 'isian': return matchIsian(a || '', q.accept);
        case 'self': return st.marks[q.id] === true;
        default: return null;
      }
    }
    // Pilihan ganda: benar/salah langsung tampil dan terkunci. Jenis lain: baru tampil setelah dikirim.
    function revealed(q, review) {
      if (review) return true;
      return q.type === 'pg' && A(q) !== undefined;
    }
    function orderOf(q) { return st.layout.options[q.id]; }
    function onAnswerChanged() {
      updateProgress();
    }

    /* ----- bagian soal ----- */
    function stemEl(q) {
      var box = h('div', { class: 'stem' });
      q.stem.forEach(function (b) {
        if (b.t === 'p') box.append(h('p', { html: b.html }));
        else if (b.t === 'fig') {
          var f = data.figures[String(b.n)];
          if (f) box.append(h('figure', { class: 'fig' },
            h('img', { src: f.src, alt: 'Gambar ' + b.n }),
            h('figcaption', { html: 'Gambar ' + b.n + '. ' + f.caption })));
        }
      });
      return box;
    }

    function pgControls(q, show) {
      var order = orderOf(q);
      var ul = h('ul', { class: 'opts' + (show ? ' locked' : '') });
      order.forEach(function (oi, pos) {
        var chosen = A(q) === oi;
        var cls = 'opt' + (chosen ? ' sel' : '');
        if (show) { if (oi === q.ans) cls += ' right'; else if (chosen) cls += ' wrongsel'; }
        var input = h('input', {
          type: 'radio', name: q.id, checked: chosen, disabled: show,
          onchange: function () {
            if (A(q) !== undefined) return;
            st.ans[q.id] = oi; save(); refresh(q);
          }
        });
        ul.append(h('li', null, h('label', { class: cls },
          input, h('span', { class: 'let' }, 'ABCD'.charAt(pos) + '.'), h('span', { html: q.opts[oi] }))));
      });
      return ul;
    }

    function bsControls(q, show) {
      var a = Array.isArray(A(q)) ? A(q).slice() : q.stmts.map(function () { return null; });
      var tb = h('table', { class: 'bs' });
      tb.append(h('thead', null, h('tr', null, h('th', null, 'Pernyataan'), h('th', { class: 'c' }, 'Benar'), h('th', { class: 'c' }, 'Salah'))));
      var body = h('tbody');
      q.stmts.forEach(function (s, i) {
        var rowCls = show ? (a[i] === q.answers[i] ? 'right' : 'wrongrow') : '';
        function radio(val) {
          return h('input', {
            type: 'radio', name: q.id + '-' + i, checked: a[i] === val, disabled: show,
            onchange: function () { a[i] = val; st.ans[q.id] = a; save(); onAnswerChanged(q); }
          });
        }
        body.append(h('tr', { class: rowCls },
          h('td', { html: String.fromCharCode(97 + i) + '. ' + s }),
          h('td', { class: 'c' }, radio(true)),
          h('td', { class: 'c' }, radio(false))));
      });
      tb.append(body);
      return tb;
    }

    function msControls(q, show) {
      var a = Array.isArray(A(q)) ? A(q).slice() : [];
      var ul = h('ul', { class: 'opts' + (show ? ' locked' : '') });
      q.opts.forEach(function (o, i) {
        var chosen = a.indexOf(i) !== -1;
        var isRight = q.answers.indexOf(i) !== -1;
        var cls = 'opt' + (chosen ? ' sel' : '');
        if (show) { if (isRight) cls += ' right'; else if (chosen) cls += ' wrongsel'; }
        ul.append(h('li', null, h('label', { class: cls },
          h('input', {
            type: 'checkbox', checked: chosen, disabled: show,
            onchange: function (ev) {
              var cur = Array.isArray(A(q)) ? A(q).slice() : [];
              var at = cur.indexOf(i);
              if (ev.target.checked && at === -1) cur.push(i);
              if (!ev.target.checked && at !== -1) cur.splice(at, 1);
              st.ans[q.id] = cur; save(); onAnswerChanged(q);
              ev.target.closest('label').classList.toggle('sel', ev.target.checked);
            }
          }),
          h('span', { class: 'let' }, String.fromCharCode(97 + i) + '.'), h('span', { html: o }))));
      });
      return ul;
    }

    function textControls(q, show) {
      var multi = q.type !== 'isian';
      var field = h(multi ? 'textarea' : 'input', {
        class: 'txt', type: multi ? false : 'text', rows: multi ? 3 : false,
        placeholder: multi ? 'Tulis jawabanmu di sini' : 'Ketik jawabanmu',
        autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', disabled: show,
        oninput: function (ev) { st.ans[q.id] = ev.target.value; save(); onAnswerChanged(q); }
      });
      field.value = A(q) || '';
      return h('div', null, field);
    }

    function feedback(q) {
      var ok = isCorrect(q);
      if (q.type === 'pg') {
        if (ok) return h('div', { class: 'fb ok' }, h('strong', null, 'Benar!'));
        var pos = orderOf(q).indexOf(q.ans);
        return h('div', { class: 'fb no' },
          A(q) === undefined ? h('strong', null, 'Belum dijawab. ') : h('strong', null, 'Belum tepat. '),
          'Jawaban yang benar: ' + 'ABCD'.charAt(pos) + '. ', h('span', { html: q.opts[q.ans] }));
      }
      if (q.type === 'bs' || q.type === 'ms') {
        return h('div', { class: 'fb ' + (ok ? 'ok' : 'no') },
          h('strong', null, ok ? 'Benar semua!' : 'Masih ada yang belum tepat. '),
          ok ? '' : 'Bagian yang benar ditandai hijau.');
      }
      if (q.type === 'isian') {
        return h('div', { class: 'fb ' + (ok ? 'ok' : 'no') },
          h('strong', null, ok ? 'Benar! ' : 'Belum tepat. '), 'Jawaban: ', h('span', { html: q.answer }));
      }
      if (q.type === 'self') {
        var m = st.marks[q.id];
        var fb = h('div', { class: 'fb info' }, h('strong', null, 'Contoh jawaban: '), h('span', { html: q.answer }));
        fb.append(h('div', { class: 'row-act' },
          h('span', null, 'Apakah jawabanmu sudah sesuai?'),
          h('button', { class: 'btn small' + (m === true ? '' : ' ghost'), type: 'button', onclick: function () { st.marks[q.id] = true; save(); refresh(q); showResult(false); } }, 'Sudah sesuai'),
          h('button', { class: 'btn small' + (m === false ? '' : ' ghost'), type: 'button', onclick: function () { st.marks[q.id] = false; save(); refresh(q); showResult(false); } }, 'Belum sesuai')));
        return fb;
      }
      return h('div', { class: 'fb info' }, h('strong', null, 'Panduan penilaian: '), h('span', { html: q.answer }));
    }

    function build(q, review) {
      var show = revealed(q, review);
      var graded = q.type !== 'uraian' && (q.type !== 'self' || st.marks[q.id] !== undefined);
      var cls = 'q' + (show && graded ? (isCorrect(q) ? ' ok' : ' no') : '');
      var body = h('div', { class: 'body' }, stemEl(q));
      if (q.type === 'pg') body.append(pgControls(q, show));
      else if (q.type === 'bs') body.append(bsControls(q, review));
      else if (q.type === 'ms') body.append(msControls(q, review));
      else body.append(textControls(q, review));
      if (show) {
        body.append(feedback(q));
        if (data.subject === 'Matematika' && Array.isArray(q.explanation) && q.explanation.length) {
          var steps = h('ol', null);
          q.explanation.forEach(function (step) { steps.append(h('li', { html: step })); });
          body.append(h('section', { class: 'math-explanation', 'aria-label': 'Cara pengerjaan' },
            h('h3', null, 'Cara pengerjaan'), steps));
        }
      }
      var card = h('div', { class: cls, id: 'c-' + q.id, tabindex: '-1' }, h('div', { class: 'qrow' }, h('div', { class: 'num' }, q.num), body));
      renderMath(card);
      return card;
    }
    function refresh(q) {
      var old = cards[q.id];
      var fresh = build(q, !!st.checked);
      if (old && old.parentNode) old.replaceWith(fresh);
      cards[q.id] = fresh;
      if (!st.checked) onAnswerChanged(q);
    }
    function passageEl(p) {
      var ps = h('div', { class: 'passage' }, h('h3', { html: p.title }));
      p.paras.forEach(function (t) { ps.append(h('p', { html: t })); });
      renderMath(ps);
      return ps;
    }

    function blocksEl(sec) {
      var box = h('div', { class: 'blocks' });
      (sec.blocks || []).forEach(function (b) {
        if (b.t === 'fig') {
          var f = data.figures[String(b.n)];
          if (f) box.append(h('figure', { class: 'fig' },
            h('img', { src: f.src, alt: 'Gambar ' + b.n }),
            h('figcaption', { html: 'Gambar ' + b.n + '. ' + f.caption })));
        } else if (b.t === 'table') {
          var tb = h('table', { class: 'datatab' });
          var tr = h('tr');
          b.head.forEach(function (c) { tr.append(h('th', { html: c })); });
          tb.append(tr);
          b.rows.forEach(function (r) {
            var row = h('tr');
            r.forEach(function (c, i) { row.append(h(i === 0 ? 'th' : 'td', { html: c })); });
            tb.append(row);
          });
          box.append(h('figure', { class: 'fig' }, tb, h('figcaption', { html: b.caption })));
        }
      });
      renderMath(box);
      return box;
    }

    /* ----- progres ----- */
    function updateProgress() {
      items.forEach(function (q) {
        var button = navButtons[q.id];
        if (!button) return;
        button.classList.toggle('is-answered', answered(q));
        button.setAttribute('aria-label', (q.type === 'isian' ? 'Isian ' : 'Soal ') + q.num + (answered(q) ? ', sudah dijawab' : ', belum dijawab'));
      });
      if (nextButton) nextButton.textContent = st.checked ? 'Lihat hasil latihan ↓' : 'Ke soal belum dijawab ↓';
      if (navEndButton) navEndButton.textContent = st.checked ? 'Lihat hasil latihan' : 'Ke bagian kirim jawaban ↓';
      if (barFill.parentNode) barFill.parentNode.setAttribute('aria-valuenow', String(st.checked ? gradable.length : gradable.filter(answered).length));
      if (st.checked) {
        barFill.style.width = '100%';
        barText.textContent = 'Selesai';
      } else {
        var n = gradable.filter(answered).length;
        barFill.style.width = (100 * n / gradable.length) + '%';
        barText.textContent = 'Terjawab ' + n + ' dari ' + gradable.length;
      }
    }

    /* ----- pengiriman nilai ----- */
    var sendInfo = { text: '', cls: '' };
    function paintSend() {
      var el = resultBox && resultBox.querySelector('.sendstatus');
      if (!el) return;
      el.className = 'sendstatus ' + sendInfo.cls;
      el.textContent = sendInfo.text;
      if (sendInfo.cls === 'bad') {
        el.append(' ', h('button', { class: 'btn small ghost', type: 'button', onclick: function () { st.sent = null; save(); showResult(false); } }, 'Kirim ulang'));
      }
    }
    function sendScore(score, good, wrong) {
      var name = profile.name;
      var mins = st.started ? Math.max(1, Math.round((Date.now() - st.started) / 60000)) : null;
      var wrongList = wrong.map(function (q) { return (q.type === 'isian' ? 'Isian ' : '') + q.num + ' (asal ' + q.originalNum + ')'; }).join(', ') || '-';
      var payload = {
        _subject: 'Nilai ' + (name || 'anak') + ': ' + data.subject + ' - ' + data.title + ' = ' + score,
        _template: 'table',
        _captcha: 'false',
        Nama: name,
        'ID sesi': st.attemptId,
        'ID peserta': profile.id,
        'Mata pelajaran': data.subject,
        Latihan: data.title,
        Nilai: String(score),
        Benar: good + ' dari ' + gradable.length + ' soal',
        'Soal yang salah': wrongList,
        'Lama mengerjakan': mins ? mins + ' menit' : '-',
        Waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'
      };
      sendInfo = { text: 'Mencatat nilai…', cls: '' };
      paintSend();
      // Google Sheet: no-cors (balasan tidak bisa dibaca), dianggap berhasil bila permintaan sampai.
      var toSheet = SHEET_URL ? fetch(SHEET_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }) : Promise.reject(new Error('tanpa sheet'));
      var toMail = fetch(NOTIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!(res.ok && (res.j.success === true || res.j.success === 'true'))) throw new Error('gagal');
        });
      var settled = 0, done = false;
      function fail() {
        if (++settled < 2 || done) return;
        sendInfo = { text: 'Nilai belum terkirim. Coba “Kirim ulang”, atau beri tahu orang tua.', cls: 'bad' };
        paintSend();
      }
      function ok() {
        if (done) return;
        done = true;
        st.sent = score; save();
        sendInfo = { text: 'Nilai sudah tercatat ✓', cls: 'good' };
        paintSend();
      }
      toSheet.then(ok, fail);
      toMail.then(ok, fail);
    }
    function showResult(scroll) {
      var good = 0, wrong = [];
      gradable.forEach(function (q) { if (isCorrect(q)) good++; else wrong.push(q); });
      var score = Math.round(100 * good / gradable.length);
      var pending = gradable.some(function (q) { return q.type === 'self' && st.marks[q.id] === undefined; });
      if (!pending) { st.score = score; if (!st.completedAt) st.completedAt = Date.now(); save(); }
      var best = bestFor(profile, data.id);
      if (!pending && (best == null || score > best)) { STORE.set(bestKey(profile, data.id), score); best = score; }
      var msg = score >= 90 ? 'Luar biasa! Pertahankan ya.' : score >= 75 ? 'Bagus sekali! Sedikit lagi sempurna.' :
        score >= 60 ? 'Lumayan. Pelajari lagi soal yang salah, lalu coba ulang.' : 'Jangan menyerah. Baca lagi materinya, lalu coba lagi.';
      var box = h('div', { class: 'result' },
        h('h2', null, pending ? 'Nilai sementara' : 'Hasil latihan'),
        h('div', { class: 'big' }, score),
        h('p', null, good + ' dari ' + gradable.length + ' soal benar. ' + msg + (best != null ? ' (Nilai terbaikmu: ' + best + ')' : '')));
      if (pending) box.append(h('p', { class: 'hint' }, 'Beberapa soal isian bebas belum kamu nilai. Cocokkan jawabanmu dengan contoh jawaban, lalu tekan "Sudah sesuai" atau "Belum sesuai" agar nilai akhirnya lengkap.'));
      if (wrong.length) {
        var line = h('p', null, 'Soal yang perlu dicek lagi: ');
        wrong.forEach(function (q) {
          line.append(h('a', {
            href: '#', class: 'jump', onclick: function (ev) {
              ev.preventDefault();
              var el = document.getElementById('c-' + q.id);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, q.num));
        });
        box.append(line);
      }
      box.append(h('p', { class: 'sendstatus' }));
      resultBox.replaceChildren(box);
      paintSend();
      if (!pending && st.checked && st.sent !== score) sendScore(score, good, wrong);
      if (scroll) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* ----- alur: satu soal per layar -> kirim -> tinjauan ----- */
    var nameInput = h('input', {
      type: 'text', class: 'name', value: profile.name, readonly: true, 'aria-label': 'Nama peserta sesi ini'
    });

    function sendAll() {
      if (!profile.name) {
        window.alert('Tulis namamu dulu di kolom Nama, ya. Nilai baru muncul setelah nama diisi dan tombol Kirim ditekan.');
        nameInput.focus();
        return;
      }
      var left = gradable.length - gradable.filter(answered).length;
      if (left > 0 && !window.confirm('Masih ada ' + left + ' soal yang belum dijawab. Tetap kirim sekarang?')) return;
      st.checked = true; save();
      renderStage();
      window.scrollTo(0, 0);
    }
    function reset() {
      if (!st.checked && Object.keys(st.ans).length && !window.confirm('Mulai sesi baru dengan urutan baru? Sesi terakhir akan diganti. Nilai terbaik tetap disimpan.')) return;
      Quiz(sourceData, profile, true);
    }

    function renderWork() {
      resultBox = null;
      data.sections.forEach(function (sec) {
        if (sec.title) stage.append(h('h2', { class: 'sec-title', html: sec.title }));
        if (sec.passage) stage.append(passageEl(sec.passage));
        if (sec.blocks && sec.blocks.length) stage.append(blocksEl(sec));
        sec.items.forEach(function (q) {
          var c = build(q, false);
          cards[q.id] = c;
          stage.append(c);
        });
      });
      stage.append(h('div', { class: 'finish', id: 'quiz-finish' },
        h('h2', null, 'Sudah selesai mengerjakan?'),
        h('p', null, 'Peserta sesi ini sudah ditetapkan. Tekan Kirim Jawaban untuk mencatat hasil atas nama peserta ini.'),
        h('label', { class: 'namefield' }, 'Nama:', nameInput),
        h('div', { class: 'bottom' }, h('button', { class: 'btn', type: 'button', onclick: sendAll }, 'Kirim Jawaban'))));
    }
    function renderReview() {
      resultBox = h('div', { id: 'quiz-result' });
      stage.append(resultBox);
      data.sections.forEach(function (s) {
        if (s.title) stage.append(h('h2', { class: 'sec-title', html: s.title }));
        if (s.passage) stage.append(passageEl(s.passage));
        if (s.blocks && s.blocks.length) stage.append(blocksEl(s));
        s.items.forEach(function (q) {
          var c = build(q, true);
          cards[q.id] = c;
          stage.append(c);
        });
      });
      stage.append(h('div', { class: 'bottom' },
        h('button', { class: 'btn ghost', type: 'button', onclick: reset }, 'Ulangi dari Awal'),
        h('a', { class: 'btn ghost', href: '#/' }, 'Semua latihan')));
      showResult(true);
    }
    function renderStage() {
      stage.replaceChildren();
      if (st.checked) renderReview();
      else renderWork();
      updateProgress();
    }

    /* ----- susun halaman dan navigasi nomor soal ----- */
    document.title = data.title + ' – Ruang Latihan';
    app.className = 'wrap quiz-page s-' + subjSlug(data.subject);
    var root = h('div');
    root.append(h('div', { class: 'q-head' },
      h('a', { class: 'back', href: '#/latihan' }, '← Kembali ke daftar latihan'),
      h('span', { class: 'eyebrow' }, data.subject.toUpperCase() + ' · KELAS 6 SD'),
      h('h1', null, data.title), h('p', null, data.desc)));
    root.append(h('div', { class: 'controls session-controls' },
      h('strong', null, 'Peserta: ' + profile.name),
      h('span', { class: 'hint' }, 'Soal dan opsi diacak otomatis pada sesi baru. Jawaban yang dipilih langsung diperiksa dan terkunci.'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: function () { launchQuiz(sourceData); } }, 'Ganti peserta / pilih sesi'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: reset }, 'Mulai ulang dengan acakan baru')));
    function jumpTo(q) {
      var card = cards[q.id];
      if (card) { card.focus({ preventScroll: true }); scrollToElement(card); }
    }
    barFill = h('div', { class: 'fill' });
    barText = h('span');
    nextButton = h('button', { class: 'progress-jump', type: 'button', onclick: function () {
      if (st.checked) { scrollToElement(document.getElementById('quiz-result')); return; }
      var next = items.find(function (q) { return !answered(q); });
      if (next) jumpTo(next); else scrollToElement(document.getElementById('quiz-finish'));
    } }, 'Ke soal belum dijawab ↓');
    root.append(h('div', { class: 'progress' },
      h('div', { class: 'row' }, barText, nextButton),
      h('div', { class: 'track', role: 'progressbar', 'aria-label': 'Progres pengerjaan', 'aria-valuemin': '0', 'aria-valuemax': String(gradable.length) }, barFill)));
    var grid = h('div', { class: 'number-grid' });
    items.forEach(function (q) {
      var label = q.type === 'isian' ? 'I' + q.num : String(q.num);
      var button = h('button', { type: 'button', onclick: function () { jumpTo(q); } }, label);
      navButtons[q.id] = button; grid.append(button);
    });
    navEndButton = h('button', { class: 'btn ghost', type: 'button', onclick: function () { scrollToElement(document.getElementById(st.checked ? 'quiz-result' : 'quiz-finish')); } }, 'Ke bagian kirim jawaban ↓');
    var navigator = h('details', { class: 'question-nav', open: !window.matchMedia('(max-width: 760px)').matches },
      h('summary', null, 'Navigasi soal', h('span', { class: 'cnt' }, items.length)), grid,
      h('p', { class: 'nav-legend' }, h('span'), 'Warna terisi: sudah dijawab'),
      navEndButton,
      h('p', { class: 'hint' }, 'Jawaban tersimpan otomatis di perangkat ini.'));
    stage = h('div', { class: 'stage' });
    root.append(h('div', { class: 'quiz-layout' }, stage, h('aside', { class: 'quiz-side', 'aria-label': 'Navigasi pengerjaan' }, navigator)));

    save();
    app.replaceChildren(root);
    renderStage();
    window.scrollTo(0, 0);
  }

  /* ---------- router ---------- */
  function route() {
    var hash = location.hash || '#/';
    var m = hash.match(/^#\/quiz\/([\w-]+)$/);
    document.querySelectorAll('.main-nav a').forEach(function (link) {
      var selected = link.getAttribute('href') === hash || (m && link.getAttribute('href') === '#/latihan');
      if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (m) openQuiz(m[1]); else renderHome(hash === '#/tka' ? 'tka' : hash === '#/latihan' ? 'latihan' : null);
  }
  document.querySelectorAll('.main-nav a, .brand').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var target = link.getAttribute('href');
      if (target !== (location.hash || '#/')) return;
      if (target === '#/tka' || target === '#/latihan') { e.preventDefault(); scrollToElement(document.getElementById('katalog')); }
      else if (target === '#/') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'auto' }); }
    });
  });
  var skip = document.querySelector('.skip-link');
  if (skip) skip.addEventListener('click', function (e) { e.preventDefault(); app.focus(); scrollToElement(app); });
  window.addEventListener('hashchange', route);
  route();
})();

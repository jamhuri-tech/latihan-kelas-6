(function () {
  'use strict';

  var app = document.getElementById('app');
  var SETTINGS_KEY = 'lso:set';
  var NAME_KEY = 'lso:name';
  // Atas izin pemilik: nilai dikirim ke email orang tua lewat FormSubmit.co (aktivasi sekali lewat email konfirmasi).
  var NOTIFY_URL = 'https://formsubmit.co/ajax/m.jamhuri@live.com';
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
  var settings = Object.assign({ shuffle: false }, STORE.get(SETTINGS_KEY, {}));

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
  function shuffled(n) {
    var a = [], i, j, t;
    for (i = 0; i < n; i++) a.push(i);
    for (i = n - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
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
  function isTka(m) { return /try ?out/i.test(m.title); }

  function renderHome() {
    document.title = 'Latihan Soal Kelas 6';
    app.replaceChildren(h('p', { class: 'loading' }, 'Memuat soal…'));
    var ready = manifest ? Promise.resolve(manifest) : fetchJSON('data/index.json').then(function (m) { manifest = m; return m; });
    ready.then(function (list) {
      var flt = Object.assign({ subj: 'all', kind: 'all' }, STORE.get('lso:filter', {}));
      var query = '';
      var subjects = SUBJECT_ORDER.filter(function (x) { return list.some(function (m) { return m.subject === x; }); });
      list.forEach(function (m) { if (subjects.indexOf(m.subject) === -1) subjects.push(m.subject); });
      if (flt.subj !== 'all' && subjects.indexOf(flt.subj) === -1) flt.subj = 'all';

      function info(m) {
        var best = STORE.get('lso:best:' + m.id, null);
        var st = STORE.get('lso:st:' + m.id, null);
        var started = !!(st && st.ans && Object.keys(st.ans).length > 0 && !st.checked);
        return { best: best, started: started };
      }
      var inProgress = list.filter(function (m) { return info(m).started; });
      var doneCount = list.filter(function (m) { return info(m).best != null; }).length;

      var listBox = h('div', { class: 'list' });
      var chipsSubj = h('div', { class: 'chips', role: 'group', 'aria-label': 'Pilih pelajaran' });
      var chipsKind = h('div', { class: 'chips', role: 'group', 'aria-label': 'Pilih jenis latihan' });

      function save() { STORE.set('lso:filter', flt); }
      function chip(label, count, on, fn) {
        return h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: fn },
          label, count != null && h('span', { class: 'n' }, count));
      }
      function matches(m) {
        if (flt.subj !== 'all' && m.subject !== flt.subj) return false;
        if (flt.kind === 'tka' && !isTka(m)) return false;
        if (flt.kind === 'latihan' && isTka(m)) return false;
        if (query) {
          var hay = (m.title + ' ' + m.subject + ' ' + m.desc).toLowerCase();
          if (hay.indexOf(query) === -1) return false;
        }
        return true;
      }
      function card(m) {
        var f = info(m);
        return h('div', { class: 'card s-' + subjSlug(m.subject) },
          h('h3', null, m.title),
          h('div', { class: 'meta' },
            h('span', { class: 'badge' }, m.count + ' soal'),
            isTka(m) && h('span', { class: 'badge tka' }, 'Try Out TKA'),
            f.best != null && h('span', { class: 'badge best' }, 'Nilai terbaik: ' + f.best),
            f.started && h('span', { class: 'badge prog' }, 'Sedang dikerjakan')),
          h('p', { class: 'desc' }, m.desc),
          h('div', { class: 'actions' },
            h('a', { class: 'btn small', href: '#/quiz/' + m.id }, f.started ? 'Lanjutkan' : (f.best != null ? 'Ulangi' : 'Kerjakan')),
            m.pdf && h('a', { class: 'btn small ghost', href: m.pdf, target: '_blank', rel: 'noopener' }, 'PDF')));
      }
      function paintChips() {
        chipsSubj.replaceChildren(chip('Semua', list.length, flt.subj === 'all', function () { flt.subj = 'all'; save(); paint(); }));
        subjects.forEach(function (sj) {
          var n = list.filter(function (m) { return m.subject === sj; }).length;
          chipsSubj.append(chip(SUBJECT_SHORT[sj] || sj, n, flt.subj === sj, function () { flt.subj = sj; save(); paint(); }));
        });
        chipsKind.replaceChildren(
          chip('Semua jenis', null, flt.kind === 'all', function () { flt.kind = 'all'; save(); paint(); }),
          chip('Latihan per materi', null, flt.kind === 'latihan', function () { flt.kind = 'latihan'; save(); paint(); }),
          chip('Try Out TKA', null, flt.kind === 'tka', function () { flt.kind = 'tka'; save(); paint(); }));
      }
      function paint() {
        paintChips();
        listBox.replaceChildren();
        var shown = 0;
        subjects.forEach(function (sj) {
          var items = list.filter(function (m) { return m.subject === sj && matches(m); });
          if (!items.length) return;
          shown += items.length;
          var sec = h('section', { class: 'subj s-' + subjSlug(sj) },
            h('h2', { class: 'subject' }, sj, h('span', { class: 'cnt' }, items.length + ' latihan')));
          var groups = [['Latihan per materi', items.filter(function (m) { return !isTka(m); })],
                        ['Try Out TKA', items.filter(isTka)]];
          groups.forEach(function (g) {
            if (!g[1].length) return;
            var showLabel = groups[0][1].length && groups[1][1].length;
            if (showLabel) sec.append(h('h3', { class: 'kind' }, g[0]));
            var cards = h('div', { class: 'cards' });
            g[1].forEach(function (m) { cards.append(card(m)); });
            sec.append(cards);
          });
          listBox.append(sec);
        });
        if (!shown) listBox.append(h('p', { class: 'empty' }, 'Tidak ada latihan yang cocok. Coba pilih pelajaran lain atau hapus kata pencarian.'));
      }

      var search = h('input', {
        type: 'search', class: 'search', placeholder: 'Cari latihan, misalnya majas atau waktu', 'aria-label': 'Cari latihan', autocomplete: 'off',
        oninput: function (ev) { query = ev.target.value.trim().toLowerCase(); paint(); }
      });

      var root = h('div', null,
        h('p', { class: 'intro' }, 'Pilih pelajaran, lalu kerjakan latihannya. Pada pilihan ganda, begitu kamu memilih, hasilnya langsung terlihat dan jawabannya tidak bisa diubah. Nilai muncul setelah kamu menulis nama dan menekan Kirim di bagian bawah.'),
        h('div', { class: 'stats' },
          h('span', null, h('strong', null, list.length), ' latihan'),
          h('span', null, h('strong', null, doneCount), ' sudah dinilai'),
          inProgress.length > 0 && h('span', null, h('strong', null, inProgress.length), ' sedang dikerjakan')));
      if (inProgress.length) {
        var cont = h('div', { class: 'continue' }, h('h2', { class: 'kind' }, 'Lanjutkan mengerjakan'));
        var row = h('div', { class: 'cards' });
        inProgress.slice(0, 3).forEach(function (m) {
          row.append(h('a', { class: 'resume s-' + subjSlug(m.subject), href: '#/quiz/' + m.id },
            h('span', { class: 'rs' }, m.subject), h('span', { class: 'rt' }, m.title)));
        });
        cont.append(row);
        root.append(cont);
      }
      root.append(h('div', { class: 'toolbar' }, search, chipsSubj, chipsKind), listBox);
      app.replaceChildren(root);
      paint();
      window.scrollTo(0, 0);
    }).catch(function () {
      app.replaceChildren(h('p', null, 'Daftar latihan tidak bisa dimuat. Coba muat ulang halaman.'));
    });
  }

  /* ---------- kuis ---------- */
  function openQuiz(id) {
    app.replaceChildren(h('p', { class: 'loading' }, 'Memuat soal…'));
    var p = cache[id] ? Promise.resolve(cache[id]) : fetchJSON('data/' + id + '.json').then(function (d) { cache[id] = d; return d; });
    p.then(function (data) { Quiz(data); }).catch(function () {
      app.replaceChildren(h('p', null, 'Latihan tidak ditemukan. ', h('a', { href: '#/' }, '← Kembali')));
    });
  }

  function Quiz(data) {
    var key = 'lso:st:' + data.id;
    var st = STORE.get(key, null) || {};
    ['ans', 'marks', 'order'].forEach(function (k) { if (!st[k]) st[k] = {}; });
    var items = [], secOf = {};
    data.sections.forEach(function (s) { s.items.forEach(function (q) { items.push(q); secOf[q.id] = s; }); });
    var gradable = items.filter(function (q) { return q.type !== 'uraian'; });
    var cards = {};
    var stage, resultBox, barFill, barText;

    function save() {
      if (!st.started && Object.keys(st.ans).length) st.started = Date.now();
      STORE.set(key, st);
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
    function orderOf(q) {
      var n = q.opts.length, i, id = [];
      if (!settings.shuffle) { for (i = 0; i < n; i++) id.push(i); return id; }
      if (!st.order[q.id]) { st.order[q.id] = shuffled(n); save(); }
      return st.order[q.id];
    }
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
      if (show) body.append(feedback(q));
      var card = h('div', { class: cls, id: 'c-' + q.id }, h('div', { class: 'qrow' }, h('div', { class: 'num' }, q.num), body));
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
      var name = (STORE.get(NAME_KEY, '') || '').trim();
      var mins = st.started ? Math.max(1, Math.round((Date.now() - st.started) / 60000)) : null;
      var wrongList = wrong.map(function (q) { return (q.type === 'isian' ? 'Isian ' : '') + q.num; }).join(', ') || '-';
      var payload = {
        _subject: 'Nilai ' + (name || 'anak') + ': ' + data.subject + ' - ' + data.title + ' = ' + score,
        _template: 'table',
        _captcha: 'false',
        Nama: name || '(tanpa nama)',
        'Mata pelajaran': data.subject,
        Latihan: data.title,
        Nilai: String(score),
        Benar: good + ' dari ' + gradable.length + ' soal',
        'Soal yang salah': wrongList,
        'Lama mengerjakan': mins ? mins + ' menit' : '-',
        Waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'
      };
      sendInfo = { text: 'Mengirim nilai ke orang tua…', cls: '' };
      paintSend();
      fetch(NOTIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && (res.j.success === true || res.j.success === 'true')) {
            st.sent = score; save();
            sendInfo = { text: 'Nilai sudah terkirim ke orang tua ✓', cls: 'good' };
          } else { throw new Error('gagal'); }
          paintSend();
        }).catch(function () {
          sendInfo = { text: 'Nilai belum terkirim. Coba “Kirim ulang”, atau beri tahu orang tua.', cls: 'bad' };
          paintSend();
        });
    }
    function showResult(scroll) {
      var good = 0, wrong = [];
      gradable.forEach(function (q) { if (isCorrect(q)) good++; else wrong.push(q); });
      var score = Math.round(100 * good / gradable.length);
      var pending = gradable.some(function (q) { return q.type === 'self' && st.marks[q.id] === undefined; });
      var best = STORE.get('lso:best:' + data.id, null);
      if (!pending && (best == null || score > best)) { STORE.set('lso:best:' + data.id, score); best = score; }
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
      type: 'text', class: 'name', placeholder: 'Tulis namamu', maxlength: '40',
      autocomplete: 'off', value: STORE.get(NAME_KEY, ''),
      oninput: function (ev) { STORE.set(NAME_KEY, ev.target.value); }
    });

    function sendAll() {
      if (!(STORE.get(NAME_KEY, '') || '').trim()) {
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
      if (!window.confirm('Hapus semua jawaban dan mulai dari awal?')) return;
      STORE.del(key);
      Quiz(data);
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
      stage.append(h('div', { class: 'finish' },
        h('h2', null, 'Sudah selesai mengerjakan?'),
        h('p', null, 'Tulis namamu, lalu tekan Kirim Jawaban. Nilai baru muncul setelah nama diisi dan tombol Kirim ditekan.'),
        h('label', { class: 'namefield' }, 'Nama:', nameInput),
        h('div', { class: 'bottom' }, h('button', { class: 'btn', type: 'button', onclick: sendAll }, 'Kirim Jawaban'))));
    }
    function renderReview() {
      resultBox = h('div');
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

    /* ----- susun halaman ----- */
    document.title = data.title + ' – Latihan Soal Kelas 6';
    var root = h('div');
    root.append(h('div', { class: 'q-head' },
      h('a', { class: 'back', href: '#/' }, '← Semua latihan'),
      h('h1', null, data.subject + ': ' + data.title),
      h('p', null, data.desc)));

    var cbShuffle = h('input', {
      type: 'checkbox', checked: settings.shuffle, disabled: !!st.checked,
      onchange: function (ev) {
        settings.shuffle = ev.target.checked; STORE.set(SETTINGS_KEY, settings);
        st.order = {}; save(); renderStage();
      }
    });
    root.append(h('div', { class: 'controls' },
      h('label', null, cbShuffle, 'Acak urutan pilihan jawaban'),
      h('span', { class: 'hint' }, 'Semua soal ada di halaman ini. Pada pilihan ganda, begitu kamu memilih, kamu langsung tahu benar atau salah dan jawabannya tidak bisa diubah. Nilai muncul setelah kamu menulis nama dan menekan Kirim di bagian bawah.')));

    barFill = h('div', { class: 'fill' });
    barText = h('span');
    root.append(h('div', { class: 'progress' },
      h('div', { class: 'row' }, barText),
      h('div', { class: 'track' }, barFill)));

    stage = h('div', { class: 'stage' });
    root.append(stage);

    app.replaceChildren(root);
    renderStage();
    window.scrollTo(0, 0);
  }

  /* ---------- router ---------- */
  function route() {
    var hash = location.hash || '#/';
    var m = hash.match(/^#\/quiz\/([\w-]+)$/);
    if (m) openQuiz(m[1]); else renderHome();
  }
  window.addEventListener('hashchange', route);
  route();
})();

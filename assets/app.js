(function () {
  'use strict';

  var app = document.getElementById('app');
  var SETTINGS_KEY = 'lso:set';
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
  function renderHome() {
    document.title = 'Latihan Soal Kelas 6';
    app.replaceChildren(h('p', { class: 'loading' }, 'Memuat soal…'));
    var ready = manifest ? Promise.resolve(manifest) : fetchJSON('data/index.json').then(function (m) { manifest = m; return m; });
    ready.then(function (list) {
      var bySubject = {};
      var order = [];
      list.forEach(function (m) {
        if (!bySubject[m.subject]) { bySubject[m.subject] = []; order.push(m.subject); }
        bySubject[m.subject].push(m);
      });
      var root = h('div', null,
        h('p', { class: 'intro' }, 'Pilih satu latihan dan kerjakan sampai selesai. Nilai dan pembahasan baru muncul setelah kamu menekan tombol Selesai.'));
      order.forEach(function (subj) {
        root.append(h('h2', { class: 'subject' }, subj));
        var cards = h('div', { class: 'cards' });
        bySubject[subj].forEach(function (m) {
          var best = STORE.get('lso:best:' + m.id, null);
          var st = STORE.get('lso:st:' + m.id, null);
          var started = st && st.ans && Object.keys(st.ans).length > 0 && !st.checked;
          cards.append(h('div', { class: 'card' },
            h('h3', null, m.title),
            h('p', null, m.desc),
            h('div', { class: 'meta' },
              h('span', { class: 'badge' }, m.count + ' soal'),
              best != null && h('span', { class: 'badge best' }, 'Nilai terbaik: ' + best),
              started && h('span', { class: 'badge' }, 'Sedang dikerjakan')),
            h('div', { class: 'actions' },
              h('a', { class: 'btn small', href: '#/quiz/' + m.id }, started ? 'Lanjutkan' : 'Kerjakan'),
              m.pdf && h('a', { class: 'btn small ghost', href: m.pdf, target: '_blank', rel: 'noopener' }, 'PDF'))));
        });
        root.append(cards);
      });
      app.replaceChildren(root);
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
    ['ans', 'marks', 'shown', 'order'].forEach(function (k) { if (!st[k]) st[k] = {}; });
    var items = [];
    data.sections.forEach(function (s) { s.items.forEach(function (q) { items.push(q); }); });
    var gradable = items.filter(function (q) { return q.type !== 'uraian'; });
    var cards = {};

    function save() { STORE.set(key, st); }
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
    function revealed() {
      return !!st.checked;
    }
    function orderOf(q) {
      var n = q.opts.length, i, id = [];
      if (!settings.shuffle) { for (i = 0; i < n; i++) id.push(i); return id; }
      if (!st.order[q.id]) { st.order[q.id] = shuffled(n); save(); }
      return st.order[q.id];
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
          onchange: function () { st.ans[q.id] = oi; save(); refresh(q); updateProgress(); }
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
            onchange: function () { a[i] = val; st.ans[q.id] = a; save(); refresh(q); updateProgress(); }
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
              st.ans[q.id] = cur; save(); updateProgress();
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
        oninput: function (ev) { st.ans[q.id] = ev.target.value; save(); updateProgress(); }
      });
      field.value = A(q) || '';
      return h('div', null, field);
    }

    function feedback(q) {
      var ok = isCorrect(q);
      var box;
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
        box = h('div', { class: 'fb ' + (ok ? 'ok' : 'no') },
          h('strong', null, ok ? 'Benar! ' : 'Belum tepat. '), 'Jawaban: ', h('span', { html: q.answer }));
        return box;
      }
      if (q.type === 'self') {
        var m = st.marks[q.id];
        var fb = h('div', { class: 'fb info' }, h('strong', null, 'Contoh jawaban: '), h('span', { html: q.answer }));
        var sel = h('div', { class: 'row-act' },
          h('span', null, 'Apakah jawabanmu sudah sesuai?'),
          h('button', { class: 'btn small' + (m === true ? '' : ' ghost'), type: 'button', onclick: function () { st.marks[q.id] = true; save(); refresh(q); showResult(false); } }, 'Sudah sesuai'),
          h('button', { class: 'btn small' + (m === false ? '' : ' ghost'), type: 'button', onclick: function () { st.marks[q.id] = false; save(); refresh(q); showResult(false); } }, 'Belum sesuai'));
        fb.append(sel);
        return fb;
      }
      return h('div', { class: 'fb info' }, h('strong', null, 'Panduan penilaian: '), h('span', { html: q.answer }));
    }

    function build(q) {
      var show = revealed(q);
      var graded = q.type !== 'uraian' && (q.type !== 'self' || st.marks[q.id] !== undefined);
      var cls = 'q' + (show && graded ? (isCorrect(q) ? ' ok' : ' no') : '');
      var body = h('div', { class: 'body' }, stemEl(q));
      if (q.type === 'pg') body.append(pgControls(q, show));
      else if (q.type === 'bs') body.append(bsControls(q, show));
      else if (q.type === 'ms') body.append(msControls(q, show));
      else body.append(textControls(q, show));
      if (show) body.append(feedback(q));
      var card = h('div', { class: cls, id: 'c-' + q.id }, h('div', { class: 'qrow' }, h('div', { class: 'num' }, q.num), body));
      renderMath(card);
      return card;
    }
    function refresh(q) {
      var old = cards[q.id];
      var fresh = build(q);
      if (old && old.parentNode) old.replaceWith(fresh);
      cards[q.id] = fresh;
    }

    /* ----- progres & hasil ----- */
    var barFill, barText, resultBox, checkBtn;
    function updateProgress() {
      var n = gradable.filter(answered).length;
      if (barFill) barFill.style.width = (100 * n / gradable.length) + '%';
      if (barText) barText.textContent = 'Terjawab ' + n + ' dari ' + gradable.length;
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
      resultBox.replaceChildren(box);
      if (scroll) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function checkAll() {
      var left = gradable.length - gradable.filter(answered).length;
      if (left > 0 && !window.confirm('Masih ada ' + left + ' soal yang belum dijawab. Tetap selesai sekarang?')) return;
      st.checked = true; save();
      items.forEach(refresh);
      checkBtn.disabled = true;
      showResult(true);
    }
    function reset() {
      if (!window.confirm('Hapus semua jawaban dan mulai dari awal?')) return;
      STORE.del(key);
      Quiz(data);
    }

    /* ----- susun halaman ----- */
    document.title = data.title + ' – Latihan Soal Kelas 6';
    var root = h('div');
    root.append(h('div', { class: 'q-head' },
      h('a', { class: 'back', href: '#/' }, '← Semua latihan'),
      h('h1', null, data.subject + ': ' + data.title),
      h('p', null, data.desc)));

    var cbShuffle = h('input', {
      type: 'checkbox', checked: settings.shuffle,
      onchange: function (ev) {
        settings.shuffle = ev.target.checked; STORE.set(SETTINGS_KEY, settings);
        st.order = {}; save(); items.forEach(refresh);
      }
    });
    root.append(h('div', { class: 'controls' },
      h('label', null, cbShuffle, 'Acak urutan pilihan jawaban'),
      h('span', { class: 'hint' }, 'Nilai dan pembahasan baru muncul setelah kamu menekan Selesai.')));

    barFill = h('div', { class: 'fill' });
    barText = h('span');
    root.append(h('div', { class: 'progress' },
      h('div', { class: 'row' }, barText),
      h('div', { class: 'track' }, barFill)));

    resultBox = h('div');
    root.append(resultBox);

    data.sections.forEach(function (s) {
      if (s.title) root.append(h('h2', { class: 'sec-title', html: s.title }));
      if (s.passage) {
        var ps = h('div', { class: 'passage' }, h('h3', { html: s.passage.title }));
        s.passage.paras.forEach(function (p) { ps.append(h('p', { html: p })); });
        renderMath(ps);
        root.append(ps);
      }
      s.items.forEach(function (q) {
        var c = build(q);
        cards[q.id] = c;
        root.append(c);
      });
    });

    checkBtn = h('button', { class: 'btn', type: 'button', onclick: checkAll, disabled: st.checked }, 'Selesai dan Lihat Nilai');
    root.append(h('div', { class: 'bottom' },
      checkBtn,
      h('button', { class: 'btn ghost', type: 'button', onclick: reset }, 'Ulangi dari Awal'),
      h('a', { class: 'btn ghost', href: '#/' }, 'Semua latihan')));

    app.replaceChildren(root);
    window.scrollTo(0, 0);
    updateProgress();
    if (st.checked) showResult(false);
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

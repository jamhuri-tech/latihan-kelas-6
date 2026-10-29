(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuizSession = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function permutation(n, random) {
    var a = Array.from({ length: n }, function (_, i) { return i; });
    for (var i = n - 1; i > 0; i--) { var j = Math.floor(random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function signature(data) {
    var text = JSON.stringify(data), hash = 2166136261;
    for (var i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16);
  }
  function identity(n) { return Array.from({ length: n }, function (_, i) { return i; }); }
  function layout(data, random, original, previousOptions) {
    random = random || Math.random;
    var units = [], options = {};
    data.sections.forEach(function (s, si) {
      // Keep shared reading, figures and tables with their questions. Plain questions can move independently.
      if (original || s.passage || (s.blocks && s.blocks.length)) units.push({ section: si, ids: s.items.map(function (q) { return q.id; }) });
      else s.items.forEach(function (q) { units.push({ section: si, ids: [q.id] }); });
      s.items.forEach(function (q) {
        if (q.opts) options[q.id] = original ? ((previousOptions && previousOptions[q.id]) || identity(q.opts.length)) : permutation(q.opts.length, random);
      });
    });
    var order = original ? identity(units.length) : permutation(units.length, random);
    return { version: 1, signature: signature(data), units: order.map(function (i) {
      var u = units[i], indexes = original ? identity(u.ids.length) : permutation(u.ids.length, random);
      return { section: u.section, ids: indexes.map(function (j) { return u.ids[j]; }) };
    }), options: options, original: !!original };
  }
  function valid(data, value) {
    if (!value || value.version !== 1 || value.signature !== signature(data) || !Array.isArray(value.units) || !value.options) return false;
    var seen = {}, expected = {};
    data.sections.forEach(function (s) { s.items.forEach(function (q) { expected[q.id] = q; }); });
    for (var u of value.units) {
      var section = data.sections[u.section];
      if (!section || !Array.isArray(u.ids) || !u.ids.length) return false;
      for (var id of u.ids) {
        var q = expected[id];
        if (!q || seen[id] || !section.items.some(function (x) { return x.id === id; })) return false;
        seen[id] = true;
        if (q.opts) {
          var o = value.options[id];
          if (!Array.isArray(o) || o.length !== q.opts.length || new Set(o).size !== o.length || o.some(function (i) { return !Number.isInteger(i) || i < 0 || i >= q.opts.length; })) return false;
        }
      }
    }
    // A stimulus section must never be split across distant units.
    for (var si = 0; si < data.sections.length; si++) {
      var s = data.sections[si];
      if ((s.passage || (s.blocks && s.blocks.length)) && s.items.length && value.units.filter(function (u) { return u.section === si; }).length !== 1) return false;
    }
    return Object.keys(seen).length === Object.keys(expected).length;
  }
  function prepare(data, value) {
    if (!valid(data, value)) throw new Error('Sesi tidak cocok dengan versi soal.');
    var copy = JSON.parse(JSON.stringify(data)), number = 0;
    var sections = value.units.map(function (u) {
      var s = copy.sections[u.section], items = u.ids.map(function (id) {
        var q = s.items.find(function (x) { return x.id === id; });
        q.originalNum = q.num; q.num = ++number; return q;
      });
      var title = '';
      if (s.passage) title = 'Bacaan untuk soal ' + items[0].num + (items.length > 1 ? '–' + items[items.length - 1].num : '');
      else if (s.blocks && s.blocks.length) title = 'Gambar dan tabel pendamping soal ' + items[0].num + (items.length > 1 ? '–' + items[items.length - 1].num : '');
      return { title: value.original ? s.title : title, passage: s.passage, blocks: s.blocks || [], items: items };
    });
    copy.sections = sections; return copy;
  }
  function scope(kind, profileId, quizId) { return 'lso:' + kind + ':p:' + encodeURIComponent(profileId) + ':' + encodeURIComponent(quizId); }
  return { permutation: permutation, signature: signature, layout: layout, valid: valid, prepare: prepare, scope: scope };
}));

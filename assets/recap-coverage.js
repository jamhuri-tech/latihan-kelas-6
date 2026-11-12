(function (root) {
  'use strict';

  function normalize(value) {
    return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ')
      .replace(/[‐‑‒–—−]/g, '-').toLowerCase();
  }

  function key(subject, title) {
    return JSON.stringify([normalize(subject), normalize(title)]);
  }

  function summarize(catalog, rows, username) {
    var entries = new Map();
    catalog.forEach(function (item) {
      var id = key(item.subject, item.title);
      if (!entries.has(id)) entries.set(id, {
        subject: item.subject, title: item.title, id: item.id, attempts: 0
      });
    });
    var historical = new Map();
    rows.forEach(function (row) {
      if (row.nama !== username || !normalize(row.lat) ||
          !Number.isFinite(row.nilai) || row.nilai < 0 || row.nilai > 100) return;
      var id = key(row.subj, row.lat);
      var item = entries.get(id);
      if (!item) {
        if (!historical.has(id)) historical.set(id, {
          subject: row.subj, title: row.lat, attempts: 0
        });
        item = historical.get(id);
      }
      item.attempts++;
    });
    return { packages: Array.from(entries.values()), historical: Array.from(historical.values()) };
  }

  var api = { summarize: summarize };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RecapCoverage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* Data dan grafik rekap tanpa pustaka atau layanan tambahan. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RecapChart = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function timestamp(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    var m = /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+)(?:,(\d+))?)?\)$/.exec(String(value || ''));
    if (m) return new Date(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
    // Format tampilan Indonesia; jangan menebak mm/dd untuk tanggal ambigu.
    m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ ,]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?/.exec(String(value || ''));
    return m ? new Date(+m[3], +m[2]-1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime() : null;
  }
  function groups(rows) {
    var users = new Map();
    rows.forEach(function (r) {
      if (!Number.isFinite(r.nilai) || r.nilai < 0 || r.nilai > 100) return;
      var name = r.nama.trim();
      if (!name) return;
      if (!users.has(name)) users.set(name, []);
      users.get(name).push(r);
    });
    return Array.from(users, function (entry) {
      var dated = entry[1].every(function(r) { return r.time != null; });
      var attempts = entry[1].slice().sort(function (a, b) {
        // Urutan baris Sheet menjadi fallback untuk waktu yang tak terbaca/sama.
        return dated && a.time !== b.time ? a.time-b.time : a.order-b.order;
      });
      return { name: entry[0], attempts: attempts };
    }).sort(function (a,b) { return a.name.localeCompare(b.name, 'id'); });
  }
  var palette = ['#1765ab', '#a23a9b', '#087f65', '#b35b00', '#5445b5', '#ad3647'];
  function render(container, rows) {
    container.replaceChildren();
    var users = groups(rows);
    if (!users.length) { var empty = document.createElement('p'); empty.textContent = 'Belum ada nilai untuk ditampilkan.'; container.append(empty); return; }
    var subjects = Array.from(new Set(rows.map(function(r) { return r.subj; }))).sort();
    function color(s) { return palette[subjects.indexOf(s) % palette.length]; }
    function svgEl(tag, attrs, text) {
      var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.keys(attrs || {}).forEach(function(k) { el.setAttribute(k, attrs[k]); });
      if (text != null) el.textContent = text;
      return el;
    }
    users.forEach(function(user) {
      var card = document.createElement('article'); card.className = 'rk-card rk-user-chart';
      var heading = document.createElement('h3'); heading.textContent = user.name; card.append(heading);
      var data = user.attempts, best = Math.max.apply(null, data.map(function(r){ return r.nilai; }));
      var meta = document.createElement('p'); meta.className = 'rk-sub'; meta.textContent = data.length + ' latihan · Nilai tertinggi ' + best + ' · Terakhir ' + data[data.length-1].nilai; card.append(meta);
      var scroll = document.createElement('div'); scroll.className = 'rk-chart-scroll';
      var width = Math.max(600, Math.min(12000, data.length * 38 + 80)), height = 260;
      var svg = svgEl('svg', {viewBox:'0 0 '+width+' '+height, role:'img', 'aria-label':'Perkembangan nilai '+user.name+', '+data.length+' latihan, skala 0 sampai 100', style:'width:100%;min-width:'+width+'px;height:260px'});
      svg.append(svgEl('title', {}, 'Nilai '+user.name+'; urutan pengerjaan dari lama ke baru. Rincian ada pada tabel di bawah.'));
      function x(i) { return data.length===1 ? width/2 : 48+i*(width-72)/(data.length-1); }
      function y(n) { return 218-n*1.9; }
      [0,20,40,60,80,100].forEach(function(n){
        svg.append(svgEl('line',{x1:48,y1:y(n),x2:width-24,y2:y(n),stroke:'#e0e6ee'}));
        svg.append(svgEl('text',{x:36,y:y(n)+4,'text-anchor':'end',fill:'#536477','font-size':12},n));
      });
      var legend = document.createElement('ul'); legend.className = 'rk-legend';
      subjects.filter(function(s){ return data.some(function(r){return r.subj===s;}); }).forEach(function(s){
        var points = data.map(function(r,i){ return r.subj===s ? x(i)+','+y(r.nilai) : null; }).filter(Boolean);
        svg.append(svgEl('polyline',{points:points.join(' '),fill:'none',stroke:color(s),'stroke-width':2.5}));
        var item = document.createElement('li'), dot = document.createElement('span'); dot.style.backgroundColor = color(s); dot.className='rk-legend-dot'; item.append(dot,document.createTextNode(s)); legend.append(item);
      });
      data.forEach(function(r,i){
        var point = svgEl('circle',{cx:x(i),cy:y(r.nilai),r:5,fill:color(r.subj),stroke:'#fff','stroke-width':1.5,tabindex:0});
        point.append(svgEl('title',{},(i+1)+'. '+r.lat+' · '+r.subj+' · Nilai '+r.nilai+' · '+r.waktu)); svg.append(point);
        if (data.length<=16 || i===0 || i===data.length-1 || i%Math.ceil(data.length/12)===0) svg.append(svgEl('text',{x:x(i),y:240,'text-anchor':'middle',fill:'#536477','font-size':12},i+1));
      });
      scroll.append(svg); card.append(scroll,legend); container.append(card);
    });
  }
  return { timestamp: timestamp, groups: groups, render: render };
});

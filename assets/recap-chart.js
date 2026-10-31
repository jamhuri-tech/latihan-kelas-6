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
    if (container._chartObservers) container._chartObservers.forEach(function(o) { o.disconnect(); });
    container._chartObservers = [];
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
      var controls = document.createElement('div'); controls.className = 'rk-chart-controls';
      var prev = document.createElement('button'), next = document.createElement('button'), range = document.createElement('span');
      prev.type = next.type = 'button'; prev.className = next.className = 'btn small ghost';
      prev.textContent = '← Sebelumnya'; next.textContent = 'Berikutnya →';
      prev.setAttribute('aria-label', 'Latihan lebih lama untuk '+user.name); next.setAttribute('aria-label', 'Latihan lebih baru untuk '+user.name);
      range.className = 'rk-sub'; range.setAttribute('aria-live','polite'); controls.append(prev,range,next);
      var scroll = document.createElement('div'); scroll.className = 'rk-chart-scroll';
      var detail = document.createElement('p'); detail.className = 'rk-chart-detail'; detail.setAttribute('aria-live','polite');
      var legend = document.createElement('ul'); legend.className = 'rk-legend';
      subjects.filter(function(s){ return data.some(function(r){return r.subj===s;}); }).forEach(function(s){
        var item = document.createElement('li'), dot = document.createElement('span'); dot.style.backgroundColor = color(s); dot.className='rk-legend-dot'; item.append(dot,document.createTextNode(s)); legend.append(item);
      });
      card.append(controls,scroll,legend,detail); container.append(card);
      var pageSize = 8, start = Math.max(0,data.length-pageSize);
      function draw() {
        var width = Math.max(240, Math.round(scroll.clientWidth)), height = 260;
        var end = Math.min(data.length,start+pageSize), visible = data.slice(start,end);
        scroll.replaceChildren();
        range.textContent = (start+1)+'–'+end+' dari '+data.length;
        prev.disabled = start===0; next.disabled = end===data.length;
        var svg = svgEl('svg', {viewBox:'0 0 '+width+' '+height, role:'group', 'aria-label':'Perkembangan nilai '+user.name+', latihan '+(start+1)+' sampai '+end, style:'display:block;width:100%;height:260px'});
        svg.append(svgEl('title', {}, 'Skala nilai 0 sampai 100. Ketuk titik untuk rincian.'));
        function x(i) { return visible.length===1 ? width/2 : 36+i*(width-54)/(visible.length-1); }
        function y(n) { return 218-n*1.9; }
        [0,20,40,60,80,100].forEach(function(n){
          svg.append(svgEl('line',{x1:36,y1:y(n),x2:width-18,y2:y(n),stroke:'#e0e6ee'}));
          svg.append(svgEl('text',{x:28,y:y(n)+4,'text-anchor':'end',fill:'#536477','font-size':12},n));
        });
        subjects.forEach(function(s){
          var points = visible.map(function(r,i){ return r.subj===s ? x(i)+','+y(r.nilai) : null; }).filter(Boolean);
          if (points.length) svg.append(svgEl('polyline',{points:points.join(' '),fill:'none',stroke:color(s),'stroke-width':2.5}));
        });
        function describe(r,i) { return 'Latihan '+(start+i+1)+' · '+r.lat+' · '+r.subj+' · Nilai '+r.nilai+' · '+r.waktu; }
        var marks = [];
        function select(i) {
          detail.textContent = describe(visible[i],i);
          marks.forEach(function(m,j){ m.setAttribute('r',i===j ? 7 : 5); m.setAttribute('stroke',i===j ? '#102c4b' : '#fff'); });
        }
        visible.forEach(function(r,i){
          var label = describe(r,i);
          var group = svgEl('g',{role:'button',tabindex:0,'aria-label':label,style:'cursor:pointer'});
          // Vùng chạm rộng 44px, điểm vẽ nhỏ để đường cong vẫn dễ đọc.
          group.append(svgEl('circle',{cx:x(i),cy:y(r.nilai),r:22,fill:'transparent'}));
          var point = svgEl('circle',{cx:x(i),cy:y(r.nilai),r:5,fill:color(r.subj),stroke:'#fff','stroke-width':1.5}); marks.push(point);
          group.append(point,svgEl('title',{},label));
          group.addEventListener('click',function(){select(i);});
          group.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();select(i);}});
          svg.append(group);
          svg.append(svgEl('text',{x:x(i),y:242,'text-anchor':'middle',fill:'#536477','font-size':12},start+i+1));
        });
        scroll.append(svg); select(visible.length-1);
      }
      prev.addEventListener('click',function(){start=Math.max(0,start-pageSize);draw();});
      next.addEventListener('click',function(){start=Math.min(Math.max(0,data.length-pageSize),start+pageSize);draw();});
      draw();
      if (typeof ResizeObserver !== 'undefined') {
        var observer = new ResizeObserver(function(){draw();}); observer.observe(scroll); container._chartObservers.push(observer);
      }
    });
  }
  return { timestamp: timestamp, groups: groups, render: render };
});

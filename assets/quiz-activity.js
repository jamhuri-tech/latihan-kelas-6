(function (root) {
  'use strict';

  function validCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function watch(win, doc, options) {
    var count = validCount(options.initial) ? options.initial : 0;
    var away = doc.hidden || !doc.hasFocus();

    function update() {
      var nextAway = doc.hidden || !doc.hasFocus();
      if (nextAway && !away && options.isActive()) {
        count++;
        options.onChange(count);
      }
      away = nextAway;
    }

    win.addEventListener('blur', update);
    win.addEventListener('focus', update);
    doc.addEventListener('visibilitychange', update);
    return function () {
      win.removeEventListener('blur', update);
      win.removeEventListener('focus', update);
      doc.removeEventListener('visibilitychange', update);
    };
  }

  // Rekap yang sudah berjalan menyimpan delapan kolom. Sufiks ini ikut
  // tersimpan di kolom durasi dan dipisahkan lagi saat rekap ditampilkan.
  function formatDuration(duration, activity) {
    if (!activity || !validCount(activity.departures)) return duration;
    return duration + ' · Keluar halaman: ' + activity.departures + ' kali';
  }

  function parseDuration(value) {
    var text = String(value || '-');
    var match = text.match(/^(.*?)\s*· Keluar halaman: (\d+) kali$/);
    var count = match ? Number(match[2]) : null;
    if (!validCount(count)) return { duration: text, departures: null };
    return { duration: match[1], departures: count };
  }

  var api = { watch: watch, formatDuration: formatDuration, parseDuration: parseDuration };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuizActivity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

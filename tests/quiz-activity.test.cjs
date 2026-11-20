const assert = require('node:assert/strict');
const Activity = require('../assets/quiz-activity.js');

function environment(focused = true, hidden = false) {
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.hidden = hidden;
  doc.hasFocus = () => focused;
  return {
    win, doc,
    focus(value) {
      focused = value;
      win.dispatchEvent(new Event(value ? 'focus' : 'blur'));
    },
    visibility(value) {
      doc.hidden = value;
      doc.dispatchEvent(new Event('visibilitychange'));
    }
  };
}

const page = environment();
let active = true;
const counts = [];
const stop = Activity.watch(page.win, page.doc, {
  initial: 0,
  isActive: () => active,
  onChange: count => counts.push(count)
});
page.focus(false);
page.visibility(true);
page.visibility(true);
assert.deepEqual(counts, [1], 'blur plus hidden must count once');
page.focus(true);
assert.deepEqual(counts, [1], 'focus while hidden must not reset the episode');
page.visibility(false);
page.focus(false);
assert.deepEqual(counts, [1, 2], 'a second departure must count');
page.focus(true);
active = false;
page.focus(false);
page.visibility(true);
page.focus(true);
page.visibility(false);
assert.deepEqual(counts, [1, 2], 'completed or paused sessions must not count');
active = true;
page.visibility(true);
assert.deepEqual(counts, [1, 2, 3]);
stop();
page.visibility(false);
page.focus(false);
assert.deepEqual(counts, [1, 2, 3], 'stopped routes must detach listeners');

const background = environment(false, true);
const resumed = [];
const stopResumed = Activity.watch(background.win, background.doc, {
  initial: 7,
  isActive: () => true,
  onChange: count => resumed.push(count)
});
background.visibility(true);
assert.deepEqual(resumed, [], 'opening a session in background is not a departure');
background.visibility(false);
background.focus(true);
background.focus(false);
assert.deepEqual(resumed, [8], 'resume must preserve the existing count');
stopResumed();

assert.deepEqual(Activity.parseDuration('18 menit'), { duration: '18 menit', departures: null });
assert.equal(Activity.formatDuration('18 menit', null), '18 menit');
for (const departures of [0, 1, 25]) {
  const encoded = Activity.formatDuration('18 menit', { departures });
  assert.deepEqual(Activity.parseDuration(encoded), { duration: '18 menit', departures });
}
assert.deepEqual(Activity.parseDuration('-'), { duration: '-', departures: null });
assert.equal(Activity.formatDuration('-', { departures: -1 }), '-');
assert.equal(Activity.parseDuration('5 menit · Keluar halaman: 999999999999999999999 kali').departures, null);
console.log('PASS: departure deduplication, hidden/focus order, pause, completion, cleanup, resume, legacy and zero-count transport.');

(function () {
  'use strict';
  var header = document.querySelector('.site-head');
  var nav = header && header.querySelector('.main-nav');
  if (!nav) return;
  var mobile = window.matchMedia('(max-width: 760px)');
  var button = document.createElement('button');
  nav.id = nav.id || 'site-navigation';
  button.type = 'button';
  button.className = 'menu-toggle';
  button.setAttribute('aria-controls', nav.id);
  function close() {
    header.classList.remove('menu-open');
    button.setAttribute('aria-expanded', 'false');
    button.textContent = 'Menu ☰';
  }
  button.onclick = function () {
    var open = !header.classList.contains('menu-open');
    header.classList.toggle('menu-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? 'Tutup ×' : 'Menu ☰';
  };
  nav.before(button);
  header.classList.add('collapsible-header');
  close();
  nav.addEventListener('click', function (event) {
    if (mobile.matches && event.target.closest('a')) close();
  });
  header.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && header.classList.contains('menu-open')) {
      close(); button.focus();
    }
  });
  function onResize() { if (!mobile.matches) close(); }
  if (mobile.addEventListener) mobile.addEventListener('change', onResize);
  else mobile.addListener(onResize);
})();

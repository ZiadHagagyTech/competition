// ملف: js/nav.js
// إدارة زر الهامبرجر (فتح/إغلاق) بسلوك جيد: إغلاق عند الضغط على رابط، الضغط خارج القائمة، أو Esc.
// يضيف/يزيل class على body لمنع التمرير الخلفي عند فتح القائمة.

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('mainNav');
  const toggle = document.getElementById('navToggle');

  if (!nav || !toggle) return;

  const NAV_OPEN_ATTR = 'data-open';
  const BODY_OPEN_CLASS = 'nav-open';

  function isOpen() {
    return nav.getAttribute(NAV_OPEN_ATTR) === 'true';
  }
  function openNav() {
    nav.setAttribute(NAV_OPEN_ATTR, 'true');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add(BODY_OPEN_CLASS);
    // focus first link for accessibility
    const firstLink = nav.querySelector('a');
    if (firstLink) firstLink.focus();
    // listen for outside clicks
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
  }
  function closeNav() {
    nav.setAttribute(NAV_OPEN_ATTR, 'false');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove(BODY_OPEN_CLASS);
    toggle.focus();
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKeyDown);
  }

  function onToggleClick(e) {
    e.stopPropagation();
    if (isOpen()) closeNav(); else openNav();
  }

  function onDocClick(e) {
    // إذا الضغط داخل الـ nav أو على زر toggle تجاهل
    if (nav.contains(e.target) || toggle.contains(e.target)) return;
    // خلاف ذلك أغلق القائمة
    closeNav();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (isOpen()) {
        closeNav();
      }
    }
    // تعامل مع Tab: عند التاب إذا انتقل التركيز خارج القائمة أغلِقها (اختياري)
    if (e.key === 'Tab' && isOpen()) {
      // تحقق إن التركيز ما زال داخل nav أو toggle
      const active = document.activeElement;
      if (!nav.contains(active) && active !== toggle) {
        closeNav();
      }
    }
  }

  // إغلاق عند الضغط على أي رابط داخل القائمة (يجعل التنقل أسرع على الهواتف)
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    // اترك الرابط ليقوم بتنفيذ تنقله، لكن أغلق القائمة فورًا
    setTimeout(() => closeNav(), 40);
  });

  toggle.addEventListener('click', onToggleClick);
});
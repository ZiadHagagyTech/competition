// ملف: js/session.js
// إدارة جلسة الشيخ في المتصفح (localStorage).
// واجهة بسيطة: SheikhSession.set(obj), .get(), .clear(), .isAuthenticated()

window.SheikhSession = (function(){
  const KEY = 'sheikhSession';
  function set(profile) {
    try { localStorage.setItem(KEY, JSON.stringify(profile)); return true; } catch(e) { console.warn(e); return false; }
  }
  function get() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e){ return null; }
  }
  function clear() {
    try { localStorage.removeItem(KEY); } catch(e){}
  }
  function isAuthenticated() {
    const s = get();
    return s && s.username;
  }
  return { set, get, clear, isAuthenticated };
})();
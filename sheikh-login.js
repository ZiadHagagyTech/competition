// ملف: js/sheikh-login.js
// بعد نجاح الدخول: نحفظ الجلسة ثم نعيد التوجيه إلى index.html
// لا نمسح الجلسة عند تحميل الصفحة؛ الجلسة تبقى عبر التنقّل بين الصفحات

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('sheikhLoginForm');
  const msgEl = document.getElementById('sheikhLoginMsg');
  const toggleLoginPassword = document.getElementById('toggleLoginPassword');
  const profileBox = document.getElementById('sheikhProfile');
  const logoutBtn = document.getElementById('sheikhLogoutBtn');
  const addCompetitorsBtn = document.getElementById('addCompetitorsBtn');
  const welcomeEl = document.getElementById('welcomeSheikh');

  function showMessage(text, color) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.style.color = color || '';
  }
  function showErrorFor(id, message) {
    const el = document.getElementById(id);
    if (el) el.textContent = message || '';
  }

  function validateUsernameRaw(u){
    if(!u) return 'اسم المستخدم مطلوب';
    const s = String(u).trim();
    if(s.length < 3) return 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل';
    if(s.length > 30) return 'اسم المستخدم طويل جداً';
    if(!/^[a-zA-Z0-9_]+$/.test(s)) return 'اسم المستخدم يقبل حروف لاتينية وأرقام و_ فقط';
    return null;
  }
  function validatePasswordRaw(pw){
    if(!pw) return 'كلمة السر مطلوبة';
    if(pw.length < 6) return 'كلمة السر يجب ألا تقل عن 6 أحرف';
    return null;
  }

  async function hashPassword(password){
    const enc = new TextEncoder();
    const data = enc.encode(password);
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuf));
    return hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function checkFirebaseReady() {
    if (!window.firebase || !firebase.database) {
      showMessage('خطأ: Firebase غير مهيأ.', '#d9534f');
      return false;
    }
    return true;
  }

  if (toggleLoginPassword) {
    toggleLoginPassword.addEventListener('click', () => {
      const pw = document.getElementById('sheikhLoginPassword');
      if (!pw) return;
      if (pw.type === 'password') { pw.type = 'text'; toggleLoginPassword.textContent = 'إخفاء'; }
      else { pw.type = 'password'; toggleLoginPassword.textContent = 'عرض'; }
    });
  }

  function setSession(profile) {
    if (window.SheikhSession && typeof SheikhSession.set === 'function') {
      SheikhSession.set(profile);
    } else {
      try { localStorage.setItem('sheikhSession', JSON.stringify(profile)); } catch(e){}
    }
  }

  function renderProfile(profile) {
    if (!profile) return;
    const shortName = profile.name ? profile.name.split(/\s+/).slice(0,2).join(' ') : profile.username;
    if (welcomeEl) welcomeEl.textContent = `مرحبًا يا شيخ ${shortName}`;
    document.getElementById('profileName').textContent = `الاسم: ${profile.name || ''}`;
    document.getElementById('profilePhone').textContent = `الهات��: ${profile.phone || ''}`;
    document.getElementById('profileOffice').textContent = `المكتب: ${profile.office || ''}`;
    document.getElementById('profileCity').textContent = `المدينة: ${profile.city || ''}`;
    document.getElementById('profileUsername').textContent = `اسم المستخدم: ${profile.username || ''}`;
    profileBox.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
    if (addCompetitorsBtn) addCompetitorsBtn.style.display = 'inline-block';
  }

  // إذا وجدت جلسة موجودة بالفعل، اعرض البروفايل (يتيح عدم إعادة تسجيل الدخول عند التنقل)
  (function initFromSession(){
    try {
      const session = (window.SheikhSession && SheikhSession.get) ? SheikhSession.get() : JSON.parse(localStorage.getItem('sheikhSession') || 'null');
      if (session && session.username) {
        renderProfile(session);
        showMessage('مستمِر بتسجيل الدخول (جلسة محلية)', '#0b6cf6');
      }
    } catch(e){}
  })();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    showMessage('');
    ['sheikhLoginUsernameError','sheikhLoginPasswordError'].forEach(id=>showErrorFor(id,''));

    if (!checkFirebaseReady()) return;

    const usernameRaw = document.getElementById('sheikhLoginUsername').value.trim();
    const password = document.getElementById('sheikhLoginPassword').value;
    const username = String(usernameRaw).trim().toLowerCase();

    const uErr = validateUsernameRaw(username);
    if (uErr) { showMessage(uErr, '#d9534f'); showErrorFor('sheikhLoginUsernameError', uErr); return; }
    const pErr = validatePasswordRaw(password);
    if (pErr) { showMessage(pErr, '#d9534f'); showErrorFor('sheikhLoginPasswordError', pErr); return; }

    try {
      showMessage('جاري التحقق...', '#0b6cf6');
      const snap = await firebase.database().ref(`sheikhs/${username}`).once('value');
      if (!snap.exists()) {
        showMessage('اسم المستخدم غير موجود.', '#d9534f');
        return;
      }
      const profile = snap.val();
      const inputHash = await hashPassword(password);
      if (inputHash !== profile.passwordHash) {
        showMessage('كلمة السر غير صحيحة.', '#d9534f');
        return;
      }

      // ناجح — خزن الجلسة ثم إعادة توجيه إلى الصفحة الرئيسية
      const sessionProfile = {
        username: profile.username,
        name: profile.name,
        phone: profile.phone,
        office: profile.office,
        city: profile.city
      };
      setSession(sessionProfile);
      showMessage('تم تسجيل الدخول بنجاح. سيتم التوجيه إلى صفحة حساب الشيخ  ...', 'green');
      setTimeout(() => { window.location.href = 'sheikh-login.html'; }, 700);

    } catch (err) {
      console.error('Login error', err);
      showMessage('فشل تسجيل الدخول: ' + (err && err.message ? err.message : String(err)), '#d9534f');
    }
  });

  if (addCompetitorsBtn) {
    addCompetitorsBtn.addEventListener('click', () => {
      window.location.href = 'add-competitors.html';
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (window.SheikhSession && SheikhSession.clear) SheikhSession.clear();
      try { localStorage.removeItem('sheikhSession'); } catch(e){}
      profileBox.style.display = 'none';
      addCompetitorsBtn.style.display = 'none';
      logoutBtn.style.display = 'none';
      showMessage('تم تسجيل الخروج', '#0b6cf6');
      setTimeout(() => { window.location.href = 'index.html'; }, 600);
    });
  }
});
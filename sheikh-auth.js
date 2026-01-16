// ملف: js/sheikh-auth-db.js
// تسجيل وتسجيل دخول "شيخ مفوض" باستخدام Firebase Realtime Database فقط.
// ضع هذا الملف في مجلد "js" ثم اربطه في HTML بعد تحميل firebase وتهيئته.

document.addEventListener('DOMContentLoaded', () => {

  // عناصر DOM
  const registerForm = document.getElementById('sheikhRegisterForm');
  const loginForm = document.getElementById('sheikhLoginForm');
  const logoutBtn = document.getElementById('sheikhLogoutBtn');

  const regMsg = document.getElementById('sheikhRegisterMsg');
  const regBtn = document.getElementById('sheikhRegisterBtn');

  const loginMsg = document.getElementById('sheikhLoginMsg');
  const loginBtn = document.getElementById('sheikhLoginBtn');

  const profileBox = document.getElementById('sheikhProfile');

  if (!registerForm) {
    console.error('لا يوجد عنصر form id="sheikhRegisterForm" في الصفحة.');
    return;
  }

  // مساعدة عرض رسائل
  function showMessage(el, text, color){
    if(!el) return;
    el.textContent = text || '';
    el.style.color = color || '';
  }
  function showErrorFor(id, message){
    const el = document.getElementById(id);
    if(el) el.textContent = message || '';
  }

  // تحقق أساسي على الحقول
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
  function validateRegisterFields(data){
    if(!data.name || String(data.name).trim().split(/\s+/).length < 3) return 'الاسم الثلاثي مطلوب';
    if(!data.phone || String(data.phone).trim().length < 6) return 'رقم الهاتف مطلوب';
    if(!data.city || String(data.city).trim().length === 0) return 'القرية/المدينة مطلوبة';
    const uErr = validateUsernameRaw(data.username); if(uErr) return uErr;
    const pErr = validatePasswordRaw(data.password); if(pErr) return pErr;
    return null;
  }

  // هاش SHA-256 لكلمة السر (hex)
  async function hashPassword(password){
    const enc = new TextEncoder();
    const data = enc.encode(password);
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuf));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
    return hashHex;
  }

  // firebase helpers
  function checkFirebaseReady() {
    if (!window.firebase) {
      showMessage(regMsg, 'خطأ: لم يتم تحميل Firebase SDK. تأكد من تحميل firebase-app و firebase-database قبل هذا السكربت.', '#d9534f');
      console.error('Firebase SDK not found.');
      return false;
    }
    if (!firebase.database) {
      showMessage(regMsg, 'خطأ: Firebase Realtime Database غير متوفر. تأكد من تحميل firebase-database-compat.js', '#d9534f');
      console.error('firebase.database not available.');
      return false;
    }
    if (!firebase.app || !firebase.app().options) {
      showMessage(regMsg, 'خطأ: firebase.initializeApp(firebaseConfig) لم يُنفّذ أو إعدادات ناقصة.', '#d9534f');
      console.error('firebase not initialized.');
      return false;
    }
    return true;
  }

  async function isUsernameAvailable(username){
    const clean = String(username).trim().toLowerCase();
    const snap = await firebase.database().ref(`sheikhs/${clean}`).once('value');
    return !snap.exists();
  }

  async function saveSheikhProfile(username, profile){
    const path = `sheikhs/${username}`;
    return firebase.database().ref(path).set(profile);
  }

  async function getSheikhProfile(username){
    const snap = await firebase.database().ref(`sheikhs/${username}`).once('value');
    return snap.exists() ? snap.val() : null;
  }

  // جلسة محلية
  function setSession(profile){
    try { localStorage.setItem('sheikhSession', JSON.stringify(profile)); }
    catch(e){ console.warn('Unable to set session in localStorage', e); }
  }
  function clearSession(){
    try { localStorage.removeItem('sheikhSession'); } catch(e){}
  }
  function getSession(){
    try { return JSON.parse(localStorage.getItem('sheikhSession') || 'null'); } catch(e){ return null; }
  }

  function renderProfile(profile){
    if(!profile) return;
    document.getElementById('profileName').textContent = `الاسم: ${profile.name || ''}`;
    document.getElementById('profilePhone').textContent = `الهاتف: ${profile.phone || ''}`;
    document.getElementById('profileOffice').textContent = `المكتب: ${profile.office || ''}`;
    document.getElementById('profileCity').textContent = `المدينة: ${profile.city || ''}`;
    document.getElementById('profileUsername').textContent = `اسم المستخدم: ${profile.username || ''}`;
    profileBox.style.display = 'block';
    if(logoutBtn) logoutBtn.style.display = 'inline-block';
  }

  (function initFromSession(){
    const session = getSession();
    if(session && session.username){
      renderProfile(session);
      showMessage(loginMsg, 'مستمر بتسجيل الدخول (جلسة محلية)', '#0b6cf6');
    }
  })();

  // ===== تسجيل (submit) =====
  registerForm.addEventListener('submit', async function(e){
    e.preventDefault();
    e.stopPropagation();

    showMessage(regMsg, '');
    ['sheikhNameError','sheikhPhoneError','sheikhOfficeError','sheikhCityError','sheikhUsernameError','sheikhPasswordError'].forEach(id=>showErrorFor(id,''));

    if (!checkFirebaseReady()) return;

    const name = document.getElementById('sheikhName').value.trim();
    const phone = document.getElementById('sheikhPhone').value.trim();
    const office = document.getElementById('sheikhOffice').value.trim();
    const city = document.getElementById('sheikhCity').value.trim();
    const usernameRaw = document.getElementById('sheikhUsername').value.trim();
    const password = document.getElementById('sheikhPassword').value;

    const username = String(usernameRaw).trim().toLowerCase();
    const data = { name, phone, office, city, username, password };

    const vErr = validateRegisterFields(data);
    if (vErr) { showMessage(regMsg, vErr, '#d9534f'); return; }

    try {
      showMessage(regMsg, 'التحقق من توفر اسم المستخدم...', '#0b6cf6');
      const available = await isUsernameAvailable(username);
      if (!available) {
        showMessage(regMsg, 'اسم المستخدم غير متاح. اختر اسمًا آخر.', '#d9534f');
        showErrorFor('sheikhUsernameError', 'اسم المستخدم محجوز');
        return;
      }

      showMessage(regMsg, 'تحضير كلمة السر...', '#0b6cf6');
      const passwordHash = await hashPassword(password);

      const profile = {
        name,
        phone,
        office: office || '',
        city,
        username,
        passwordHash,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };

      showMessage(regMsg, 'جاري حفظ الحساب في قاعدة البيانات...', '#0b6cf6');
      await saveSheikhProfile(username, profile);

      showMessage(regMsg, 'تم إنشاء الحساب بنجاح. يمكنك الآن تسجيل الدخول.', 'green');
      registerForm.reset();

    } catch (err) {
      console.error('Register error:', err);
      const msg = (err && err.message) ? err.message : String(err);
      showMessage(regMsg, 'فشل إنشاء الحساب: ' + msg, '#d9534f');
    }
  });

  // ===== تسجيل الدخول =====
  if (loginForm) {
    loginForm.addEventListener('submit', async function(e){
      e.preventDefault();
      e.stopPropagation();

      showMessage(loginMsg, '');
      ['sheikhLoginUsernameError','sheikhLoginPasswordError'].forEach(id=>showErrorFor(id,''));

      const usernameRaw = document.getElementById('sheikhLoginUsername').value.trim();
      const password = document.getElementById('sheikhLoginPassword').value;
      const username = String(usernameRaw).trim().toLowerCase();

      const uErr = validateUsernameRaw(username);
      if (uErr) { showMessage(loginMsg, uErr, '#d9534f'); showErrorFor('sheikhLoginUsernameError', uErr); return; }
      const pErr = validatePasswordRaw(password);
      if (pErr) { showMessage(loginMsg, pErr, '#d9534f'); showErrorFor('sheikhLoginPasswordError', pErr); return; }

      if (!checkFirebaseReady()) return;

      try {
        showMessage(loginMsg, 'التحقق من بيانات الدخول...', '#0b6cf6');
        const profile = await getSheikhProfile(username);
        if (!profile) {
          showMessage(loginMsg, 'اسم المستخدم غير موجود.', '#d9534f');
          return;
        }
        const inputHash = await hashPassword(password);
        if (inputHash !== profile.passwordHash) {
          showMessage(loginMsg, 'كلمة السر غير صحيحة.', '#d9534f');
          return;
        }
        const sessionProfile = {
          username: profile.username,
          name: profile.name,
          phone: profile.phone,
          office: profile.office,
          city: profile.city
        };
        setSession(sessionProfile);
        renderProfile(sessionProfile);
        showMessage(loginMsg, 'تم تسجيل الدخول بنجاح', 'green');

      } catch (err) {
        console.error('Login error:', err);
        showMessage(loginMsg, 'فشل تسجيل الدخول: ' + ((err && err.message) ? err.message : String(err)), '#d9534f');
      }
    });
  }

  // تسجيل الخروج
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearSession();
      profileBox.style.display = 'none';
      logoutBtn.style.display = 'none';
      showMessage(loginMsg, 'تم تسجيل الخروج', '#0b6cf6');
    });
  }

}); // DOMContentLoaded
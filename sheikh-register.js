// ملف: js/sheikh-register.js
// تسجيل شيخ مفوض م�� ضمان أن لكل شيخ تسجيل واحد فقط (لا تكرار باسم المستخدم أو رقم الهاتف).
// - يحجز رقم الهاتف أولاً في /sheikhPhones/{normalizedPhone} باستخدام transaction.
// - ثم يحجز اسم المستخدم في /sheikhs/{username} باستخدام transaction.
// - في حال فشل أحدهما يتم تنظيف الحجوزات لضمان الاتساق.
// - يحفظ الجلسة محليًا عند النجاح ثم يُعيد التوجيه.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('sheikhRegisterForm');
  const msgEl = document.getElementById('sheikhRegisterMsg');
  const togglePassword = document.getElementById('togglePassword');
  const registerBtn = document.getElementById('sheikhRegisterBtn');

  function showMessage(text, color) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.style.color = color || '';
  }
  function showErrorFor(id, message) {
    const el = document.getElementById(id);
    if (el) el.textContent = message || '';
  }

  function normalizePhone(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D+/g, '');
    // يمكنك تعديل القاعدة هنا لإضافة رمز البلد أو تنسيقات أخرى
    return digits;
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
  function validateRegisterFields(data){
    if(!data.name || String(data.name).trim().split(/\s+/).length < 3) return 'الاسم الثلاثي مطلوب';
    if(!data.phone || String(data.phone).trim().length < 6) return 'رقم الهاتف مطلوب';
    if(!data.city || String(data.city).trim().length === 0) return 'القرية/المدينة مطلوبة';
    const uErr = validateUsernameRaw(data.username); if(uErr) return uErr;
    const pErr = validatePasswordRaw(data.password); if(pErr) return pErr;
    return null;
  }

  async function hashPassword(password){
    const enc = new TextEncoder();
    const data = enc.encode(password);
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuf));
    return hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
  }

  if (togglePassword) {
    togglePassword.addEventListener('click', () => {
      const pw = document.getElementById('sheikhPassword');
      if (!pw) return;
      if (pw.type === 'password') { pw.type = 'text'; togglePassword.textContent = 'إخفاء'; }
      else { pw.type = 'password'; togglePassword.textContent = 'عرض'; }
    });
  }

  function checkFirebaseReady() {
    if (!window.firebase || !firebase.database) {
      showMessage('خطأ: Firebase غير مهيأ بشكل صحيح على الصفحة.', '#d9534f');
      return false;
    }
    return true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (registerBtn) registerBtn.disabled = true;
    showMessage('');
    ['sheikhNameError','sheikhPhoneError','sheikhOfficeError','sheikhCityError','sheikhUsernameError','sheikhPasswordError'].forEach(id=>showErrorFor(id,''));

    if (!checkFirebaseReady()) { if (registerBtn) registerBtn.disabled = false; return; }

    const name = document.getElementById('sheikhName').value.trim();
    const phoneRaw = document.getElementById('sheikhPhone').value.trim();
    const phone = normalizePhone(phoneRaw);
    const office = document.getElementById('sheikhOffice').value.trim();
    const city = document.getElementById('sheikhCity').value.trim();
    const usernameRaw = document.getElementById('sheikhUsername').value.trim();
    const username = String(usernameRaw).trim().toLowerCase();
    const password = document.getElementById('sheikhPassword').value;

    const data = { name, phone, office, city, username, password };

    const vErr = validateRegisterFields(data);
    if (vErr) { showMessage(vErr, '#d9534f'); if (registerBtn) registerBtn.disabled = false; return; }

    if (!phone || phone.length < 6) {
      showMessage('رقم الهاتف غير صالح بعد التنقيح. الرجاء إدخال رقم صحيح.', '#d9534f');
      showErrorFor('sheikhPhoneError', 'رقم الهاتف غير صالح');
      if (registerBtn) registerBtn.disabled = false;
      return;
    }

    const phoneRef = firebase.database().ref(`sheikhPhones/${phone}`);
    const userRef = firebase.database().ref(`sheikhs/${username}`);

    let phoneReserved = false;

    try {
      showMessage('جاري حجز رقم الهاتف...', '#0b6cf6');

      // 1) احجز رقم الهاتف أولاً عبر transaction
      const phoneTx = await phoneRef.transaction(current => {
        if (current === null) return username; // احجز الهاتف باسم المستخدم
        return; // abort -> already taken
      });

      if (!phoneTx || !phoneTx.committed) {
        showMessage('رقم الهاتف مستخدم بالفعل لإنشاء حساب آخر.', '#d9534f');
        showErrorFor('sheikhPhoneError', 'رقم الهاتف مسجل مسبقًا');
        if (registerBtn) registerBtn.disabled = false;
        return;
      }

      phoneReserved = true; // mark to cleanup if next step fails

      showMessage('جار التحقق من اسم المستخدم والحجز...', '#0b6cf6');

      // 2) الآن حاول حجز اسم المستخدم عبر transaction وادخال البروفايل
      const passwordHash = await hashPassword(password);
      const profile = {
        name,
        phone,
        office: office || '',
        city,
        username,
        passwordHash,
        createdAt: Date.now()
      };

      const userTx = await userRef.transaction(current => {
        if (current === null) return profile;
        return; // abort -> username taken
      });

      if (!userTx || !userTx.committed) {
        // فشل حجز اسم المستخدم => ألغِ حجز الهاتف
        try {
          await phoneRef.remove();
        } catch (remErr) {
          console.error('Failed to remove phone mapping after username collision', remErr);
        }
        showMessage('اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر.', '#d9534f');
        showErrorFor('sheikhUsernameError', 'اسم المستخدم محجوز');
        if (registerBtn) registerBtn.disabled = false;
        return;
      }

      // نجاح: تم حجز كل من الهاتف واسم المستخدم وكتابة البروفايل
      // خزن الجلسة محليًا (إن وُجد SheikhSession)
      if (window.SheikhSession && typeof SheikhSession.set === 'function') {
        SheikhSession.set({
          username: profile.username,
          name: profile.name,
          phone: profile.phone,
          office: profile.office,
          city: profile.city
        });
      } else {
        try { localStorage.setItem('sheikhSession', JSON.stringify({
          username: profile.username, name: profile.name, phone: profile.phone, office: profile.office, city: profile.city
        })); } catch (e) { /* ignore */ }
      }

      showMessage('تم إنشاء الحساب بنجاح. سيتم التوجيه الى صفحة حساب الشيخ...', 'green');
      setTimeout(() => { window.location.href = 'sheikh-login.html'; }, 800);

    } catch (err) {
      console.error('Register error:', err);
      // حالة خطأ غير متو��عة: إن كنا قد حجزنا الهاتف فحاول تنظيفه
      if (phoneReserved) {
        try { await phoneRef.remove(); } catch (remErr) { console.error('Cleanup phone mapping error', remErr); }
      }
      showMessage('فشل إنشاء الحساب: ' + (err && err.message ? err.message : String(err)), '#d9534f');
      if (registerBtn) registerBtn.disabled = false;
    }
  });
});
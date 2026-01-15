// ملف: add-competitor.js
// تحديث: إصلاح رفع Imgbb بالمهلة، تفرد الرقم القومي، وإضافة حقل "مكتب التحفيظ أو الشيخ المحفظ" إجباري مع خيار "غير ذلك"
const IMGBB_API_KEY = '4b4e76113a94e13e2fab955835a7be52'; // اتركه فارغًا إذا لا تريد Imgbb

(function () {
  document.addEventListener('DOMContentLoaded', () => {
    // عناصر DOM
    const form = document.getElementById('registrationForm');
    const msgEl = document.getElementById('addCompetitorMsg') || document.getElementById('formMessage');
    const notAuthEl = document.getElementById('notAuthMsg');

    const birthFileInput = document.getElementById('birthFile');
    const photoFileInput = document.getElementById('photoFile');
    const extraFileInput = document.getElementById('extraFile');
    const birthFileNameEl = document.getElementById('birthFileName');
    const photoFileNameEl = document.getElementById('photoFileName');
    const extraFileNameEl = document.getElementById('extraFileName');
    const birthPreviewImg = document.getElementById('birthPreviewImg');
    const photoPreviewImg = document.getElementById('photoPreviewImg');
    const extraPreviewImg = document.getElementById('extraPreviewImg');

    // عناصر نموذج
    const birthDateInput = document.getElementById('birthDate');
    const ageInput = document.getElementById('age');
    const levelSelect = document.getElementById('level');
    const nationalIdInput = document.getElementById('nationalId');
    const officeSelect = document.getElementById('office');
    const officeOtherInput = document.getElementById('officeOther');

    // رسائل helpers
    function showMessage(text, color) {
      if (!msgEl) return;
      msgEl.textContent = text || '';
      msgEl.style.color = color || '';
    }
    function showNotAuth(text) {
      if (!notAuthEl) return;
      notAuthEl.style.display = text ? 'block' : 'none';
      notAuthEl.textContent = text || '';
    }
    function setFieldError(el, message) {
      if (!el) return;
      const err = el.closest('.form-group')?.querySelector('.error') || el.closest('fieldset')?.querySelector('.error') || document.getElementById('agreeError');
      if (err) err.textContent = message || '';
    }
    function clearFieldError(el) { setFieldError(el, ''); }

    // التحقق من الجلسة (شيخ)
    const session = (window.SheikhSession && SheikhSession.get) ? SheikhSession.get() : (() => {
      try { return JSON.parse(localStorage.getItem('sheikhSession') || 'null'); } catch(e){ return null; }
    })();

    if (!session || !session.username) {
      showNotAuth('يجب تسجيل الدخول كشيخ مفوض لإضافة متسابقين. سيتم تحويلك لصفحة الدخول.');
      setTimeout(() => { window.location.href = 'sheikh-login.html'; }, 1100);
      return;
    }

    // تحقق Firebase
    function checkFirebaseReady() {
      if (!window.firebase || !firebase.database) {
        showMessage('خطأ: Firebase Realtime Database غير متاح. تأكد من تحميل SDK وتهيئة firebaseConfig.', '#d9534f');
        return false;
      }
      return true;
    }

    // ==== معاينة الملفات ====
    function setupFilePreview(inputEl, nameEl, previewImgEl) {
      if (!inputEl) return;
      inputEl.addEventListener('change', () => {
        if (inputEl.files && inputEl.files[0]) {
          const f = inputEl.files[0];
          if (nameEl) nameEl.textContent = f.name;
          if (previewImgEl && f.type && f.type.startsWith('image/')) {
            const url = URL.createObjectURL(f);
            previewImgEl.src = url;
            previewImgEl.hidden = false;
            previewImgEl.onload = () => URL.revokeObjectURL(url);
          } else if (previewImgEl) {
            previewImgEl.hidden = true;
            previewImgEl.src = '';
          }
        } else {
          if (nameEl) nameEl.textContent = 'لم يتم اختيار ملف';
          if (previewImgEl) { previewImgEl.hidden = true; previewImgEl.src = ''; }
        }
      });
    }
    setupFilePreview(birthFileInput, birthFileNameEl, birthPreviewImg);
    setupFilePreview(photoFileInput, photoFileNameEl, photoPreviewImg);
    setupFilePreview(extraFileInput, extraFileNameEl, extraPreviewImg);

    // ==== تحجيم الصورة محلياً ====
    const MAX_IMAGE_WIDTH = 1024;
    const IMAGE_OUTPUT_TYPE = 'image/jpeg';
    const IMAGE_QUALITY = 0.8;

    function resizeImageFile(file, maxWidth = MAX_IMAGE_WIDTH, outputType = IMAGE_OUTPUT_TYPE, quality = IMAGE_QUALITY) {
      return new Promise((resolve, reject) => {
        if (!file || !file.type || !file.type.startsWith('image/')) return resolve(file);
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          let width = img.width, height = img.height;
          if (width > maxWidth) {
            const ratio = img.width / img.height;
            width = maxWidth;
            height = Math.round(maxWidth / ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(blob => {
            if (!blob) return reject(new Error('فشل إنشاء الصورة بعد التحجيم'));
            const safeName = (file.name || 'image').replace(/\s+/g, '_').slice(0,160);
            const newFile = new File([blob], safeName, { type: outputType });
            resolve(newFile);
          }, outputType, quality);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('فشل تحميل الصورة'));
        };
        img.src = url;
      });
    }

    function fileToDataURL(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => { reader.abort(); reject(new Error('فشل قراءة الملف')); };
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }

    // upload smart with Imgbb timeout fallback to Firebase/DataURL
    async function uploadFileSmart(file, opts = {}) {
      const { label } = opts;
      if (!file) return null;
      if (IMGBB_API_KEY && IMGBB_API_KEY.trim() !== '') {
        try {
          showMessage(`جاري رفع ${label} إلى Imgbb...`);
          const url = await uploadToImgbb(file, p => showMessage(`رفع ${label}... ${p}%`));
          return url;
        } catch (err) {
          console.warn('Imgbb upload failed or timed out, falling back to Firebase/DataURL', err);
        }
      }
      if (window.firebase && firebase.storage) {
        try {
          showMessage(`جاري رفع ${label} إلى Firebase Storage...`);
          const safeName = (file.name || 'file').replace(/\s+/g, '_').slice(0,160);
          const storagePath = `competitors/${session.username}/${Date.now()}_${safeName}`;
          const url = await uploadToFirebaseStorage(file, storagePath, p => showMessage(`رفع ${label}... ${p}%`));
          return url;
        } catch (err) {
          console.warn('Firebase Storage upload failed', err);
        }
      }
      try {
        showMessage(`جاري تحويل ${label} إلى DataURL (fallback)...`);
        const dataUrl = await fileToDataURL(file);
        return dataUrl;
      } catch (err) {
        throw new Error('فشل رفع/تحويل الملف: ' + (err && err.message ? err.message : String(err)));
      }
    }

    // Imgbb upload via fetch with timeout
    function uploadToImgbb(file, onProgress) {
      return new Promise(async (resolve, reject) => {
        if (!IMGBB_API_KEY || IMGBB_API_KEY.trim() === '') return reject(new Error('IMGBB_API_KEY غير مُعرّف'));

        try {
          let fileToUpload = file;
          if (file.type && file.type.startsWith('image/')) {
            try { fileToUpload = await resizeImageFile(file); } catch (e) { fileToUpload = file; }
          }

          const dataUrl = await fileToDataURL(fileToUpload);
          const base64Str = dataUrl.split(',')[1] || dataUrl;

          try { if (onProgress) onProgress(5); } catch (e) {}

          const bodyStr = new URLSearchParams({
            key: IMGBB_API_KEY,
            image: base64Str,
            name: fileToUpload.name || 'image'
          }).toString();

          const TIMEOUT_MS = 30000; // 30s
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

          const res = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: bodyStr,
            signal: controller.signal
          });

          clearTimeout(timeout);
          try { if (onProgress) onProgress(70); } catch (e) {}

          if (!res.ok) {
            let text = '';
            try { text = await res.text(); } catch (e) {}
            return reject(new Error('خطأ من Imgbb: HTTP ' + res.status + ' ' + text));
          }

          const json = await res.json();
          if (json && json.success && json.data) {
            const url = json.data.display_url || json.data.url || '';
            try { if (onProgress) onProgress(100); } catch (e) {}
            return resolve(url);
          } else {
            return reject(new Error('استجابة Imgbb غير متوقعة'));
          }
        } catch (err) {
          if (err && err.name === 'AbortError') return reject(new Error('Timeout أثناء رفع الصورة إلى Imgbb'));
          return reject(err);
        }
      });
    }

    function uploadToFirebaseStorage(file, storagePath, onProgress) {
      return new Promise((resolve, reject) => {
        if (!window.firebase || !firebase.storage) return reject(new Error('Firebase Storage غير متوفر'));
        const storageRef = firebase.storage().ref().child(storagePath);
        const metadata = file.type ? { contentType: file.type } : undefined;
        const uploadTask = storageRef.put(file, metadata);
        uploadTask.on('state_changed',
          snapshot => {
            try {
              const total = (snapshot.totalBytes && snapshot.totalBytes > 0) ? snapshot.totalBytes : (file.size || 1);
              const percent = Math.round((snapshot.bytesTransferred / total) * 100);
              if (onProgress) onProgress(percent);
            } catch (e) {}
          },
          err => reject(err),
          () => uploadTask.snapshot.ref.getDownloadURL().then(url => resolve(url)).catch(reject)
        );
      });
    }

    // ===== قواعد اختيار المستوى حسب تاريخ الميلاد =====
    function dStart(y, m, d) { return new Date(y, m - 1, d, 0, 0, 0, 0); }
    function dEnd(y, m, d) { return new Date(y, m - 1, d, 23, 59, 59, 999); }

    const LEVELS = {
      AL_ASHR_AKHEER: 'العشر الأخير (3 أجزاء)',
      ROB3: 'ربع القرآن',
      NUSF: 'نصف القرآن',
      THALATHA_RUBA3: 'ثلاث أرباع القرآن',
      QURAN_KAMEL: 'القرآن كاملا',
      QURAN_KAMEL_RIWAIA: 'القرآن كاملا بإحدى الروايات (ورش - قالون)'
    };

    function getAllowedLevelsForDob(dob) {
      if (!dob) return [];
      const t = dob.getTime();

      if (t >= dStart(2016, 1, 1).getTime()) {
        return [
          LEVELS.AL_ASHR_AKHEER,
          LEVELS.ROB3,
          LEVELS.NUSF,
          LEVELS.THALATHA_RUBA3,
          LEVELS.QURAN_KAMEL,
          LEVELS.QURAN_KAMEL_RIWAIA
        ];
      }
      if (t >= dStart(2014, 1, 1).getTime() && t <= dEnd(2015, 12, 31).getTime()) {
        return [
          LEVELS.ROB3,
          LEVELS.NUSF,
          LEVELS.THALATHA_RUBA3,
          LEVELS.QURAN_KAMEL,
          LEVELS.QURAN_KAMEL_RIWAIA
        ];
      }
      if (t >= dStart(2012, 1, 1).getTime() && t <= dEnd(2013, 12, 31).getTime()) {
        return [
          LEVELS.NUSF,
          LEVELS.THALATHA_RUBA3,
          LEVELS.QURAN_KAMEL,
          LEVELS.QURAN_KAMEL_RIWAIA
        ];
      }
      if (t >= dStart(2010, 1, 1).getTime() && t <= dEnd(2011, 12, 31).getTime()) {
        return [
          LEVELS.THALATHA_RUBA3,
          LEVELS.QURAN_KAMEL,
          LEVELS.QURAN_KAMEL_RIWAIA
        ];
      }
      if (t >= dStart(2009, 1, 1).getTime() && t <= dEnd(2009, 12, 31).getTime()) {
        return [
          LEVELS.QURAN_KAMEL,
          LEVELS.QURAN_KAMEL_RIWAIA
        ];
      }
      if (t >= dStart(2008, 1, 1).getTime() && t <= dEnd(2008, 12, 31).getTime()) {
        return [
          LEVELS.QURAN_KAMEL_RIWAIA
        ];
      }
      return [];
    }

    function parseDateValue(val) {
      if (!val) return null;
      const parts = val.split('-');
      if (parts.length < 3) return null;
      const y = parseInt(parts[0], 10), m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
      if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
      return new Date(y, m - 1, d);
    }
    function calculateAge(dob) {
      if (!dob) return null;
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
      return age;
    }

    // disable level until DOB selected
    if (levelSelect) { levelSelect.disabled = true; }

    function setBirthError(msg) { setFieldError(birthDateInput, msg); }
    function clearBirthError() { clearFieldError(birthDateInput); }
    function setLevelError(msg) { setFieldError(levelSelect, msg); }
    function clearLevelError() { clearFieldError(levelSelect); }

    // Office select change: show/hide other input
    if (officeSelect) {
      officeSelect.addEventListener('change', () => {
        clearFieldError(officeSelect);
        if (officeSelect.value === 'other') {
          officeOtherInput.parentElement.style.display = 'block';
          officeOtherInput.required = true;
          officeOtherInput.focus();
        } else {
          officeOtherInput.parentElement.style.display = 'none';
          officeOtherInput.required = false;
          officeOtherInput.value = '';
          clearFieldError(officeOtherInput);
        }
      });
    }

    if (birthDateInput) {
      birthDateInput.addEventListener('change', () => {
        clearBirthError();
        clearLevelError();
        showMessage('');
        const val = birthDateInput.value;
        if (!val) {
          ageInput.value = '';
          levelSelect.innerHTML = '<option value="">اختر المستوى بعد تحديد تاريخ الميلاد</option>';
          levelSelect.disabled = true;
          setBirthError('تاريخ الميلاد مطلوب');
          return;
        }
        const dob = parseDateValue(val);
        if (!dob) {
          ageInput.value = '';
          levelSelect.innerHTML = '<option value="">اختر المستوى بعد تحديد تاريخ الميلاد</option>';
          levelSelect.disabled = true;
          setBirthError('تنسيق تاريخ غير صحيح');
          return;
        }
        const today = new Date();
        if (dob > today) {
          ageInput.value = '';
          levelSelect.innerHTML = '<option value="">اختر المستوى بعد تحديد تاريخ الميلاد</option>';
          levelSelect.disabled = true;
          setBirthError('لا يمكن أن يكون تاريخ الميلاد في المستقبل');
          return;
        }
        const age = calculateAge(dob);
        if (age === null || isNaN(age) || age < 0 || age > 200) {
          ageInput.value = '';
          levelSelect.innerHTML = '<option value="">اختر المستوى بعد تحديد تاريخ الميلاد</option>';
          levelSelect.disabled = true;
          setBirthError('تاريخ الميلاد يؤدي لسن غير صالح');
          return;
        }
        ageInput.value = age;

        const allowed = getAllowedLevelsForDob(dob);
        if (!allowed || allowed.length === 0) {
          levelSelect.innerHTML = '<option value="">لا توجد مستويات مناسبة لهذا العمر</option>';
          levelSelect.disabled = true;
          setLevelError('هذا التاريخ غير مناسب للمسابقة');
          setBirthError('هذا التاريخ غير مناسب للمسابقة');
          return;
        }
        levelSelect.innerHTML = '';
        allowed.forEach(l => {
          const opt = document.createElement('option');
          opt.value = l;
          opt.textContent = l;
          levelSelect.appendChild(opt);
        });
        levelSelect.selectedIndex = 0;
        levelSelect.disabled = false;
        clearLevelError();
        clearBirthError();
      });
    }

    form.addEventListener('reset', () => {
      setTimeout(() => {
        if (ageInput) ageInput.value = '';
        if (levelSelect) { levelSelect.innerHTML = '<option value="">اختر المستوى بعد تحديد تاريخ الميلاد</option>'; levelSelect.disabled = true; }
        if (officeOtherInput) {
          officeOtherInput.parentElement.style.display = 'none';
          officeOtherInput.required = false;
          officeOtherInput.value = '';
        }
        clearBirthError();
        clearLevelError();
        showMessage('');
        if (birthPreviewImg) { birthPreviewImg.hidden = true; birthPreviewImg.src = ''; }
        if (photoPreviewImg) { photoPreviewImg.hidden = true; photoPreviewImg.src = ''; }
        if (extraPreviewImg) { extraPreviewImg.hidden = true; extraPreviewImg.src = ''; }
        if (birthFileNameEl) birthFileNameEl.textContent = 'لم يتم اختيار ملف';
        if (photoFileNameEl) photoFileNameEl.textContent = 'لم يتم اختيار ملف';
        if (extraFileNameEl) extraFileNameEl.textContent = 'لم يتم اختيار ملف';
      }, 0);
    });

    function makeSafeKey(name) {
      if (!name) return '';
      let s = String(name).trim().toLowerCase();
      s = s.replace(/[.#$\[\]\/]/g, '');
      s = s.replace(/[\s\-—–_]+/g, '_');
      s = s.replace(/[^0-9\u0621-\u064A\u0660-\u0669a-zA-Z_]/g, '');
      if (s.length > 120) s = s.slice(0, 120);
      if (!s) s = 'competitor';
      return s;
    }

    function validateFormFields(formData) {
      if (!formData.fullName || String(formData.fullName).trim().length < 3) return 'الاسم الكامل مطلوب';
      if (!formData.nationalId || !/^\d{14}$/.test(String(formData.nationalId).trim())) return 'الرقم القومي مطلوب ويتكون من 14 رقمًا';
      if (!formData.birthDate) return 'تاريخ الميلاد مطلوب';
      if (!formData.age && formData.age !== 0) return 'السن غير صحيح';
      if (!formData.level || String(formData.level).trim() === '') return 'اختر مستوى الحفظ المناسب';
      if (!formData.office || String(formData.office).trim() === '') return 'اختر مكتب التحفيظ أو الشيخ المحفظ';
      if (formData.office === 'other' && (!formData.officeOther || String(formData.officeOther).trim().length < 2)) return 'اكتب اسم المكتب عند اختيار "غير ذلك"';
      if (!formData.region) return 'اختر المنطقة';
      if (!formData.guardianName) return 'اسم ولى الأمر مطلوب';
      if (!formData.guardianPhone) return 'رقم هاتف ولى الأمر مطلوب';
      if (!formData.residentAgree) return 'يجب الموافقة على شرط السكن';
      if (!formData.birthFile && !formData.birthFileUrl) return 'صورة شهادة الميلاد مطلوبة';
      if (!formData.photoFile && !formData.photoFileUrl) return 'الصورة الشخصية مطلوبة';
      return null;
    }

    // تحقق تفرد الرقم القومي (scan) - كما في نسخة سابقة
    async function findExistingNationalId(nationalId) {
      if (!nationalId) return null;
      try {
        const rootRef = firebase.database().ref('competitors');
        const snap = await rootRef.once('value');
        let found = null;
        snap.forEach(sheikhSnap => {
          sheikhSnap.forEach(compSnap => {
            const v = compSnap.val();
            if (v && String(v.nationalId || '').trim() === nationalId) {
              found = { sheikh: sheikhSnap.key, key: compSnap.key, value: v };
              return true;
            }
            return false;
          });
          if (found) return true;
          return false;
        });
        return found;
      } catch (err) {
        console.warn('Error checking nationalId uniqueness', err);
        return null;
      }
    }

    async function saveCompetitorWithNameKey(baseKey, competitor, maxAttempts = 20) {
      const basePath = `competitors/${session.username}`;
      for (let i = 0; i < maxAttempts; i++) {
        const key = (i === 0) ? baseKey : `${baseKey}_${i}`;
        const ref = firebase.database().ref(`${basePath}/${key}`);
        try {
          const tx = await ref.transaction(current => {
            if (current === null) return competitor;
            return; // abort
          });
          if (tx && tx.committed) {
            return { success: true, key };
          }
        } catch (err) {
          console.warn('Transaction error for key', key, err);
        }
      }
      return { success: false };
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      showMessage('');
      clearFieldError(document.getElementById('fullName'));
      clearFieldError(document.getElementById('guardianPhone'));
      clearFieldError(document.getElementById('guardianName'));
      clearFieldError(document.getElementById('agreeError'));
      clearBirthError();
      clearLevelError();
      clearFieldError(document.getElementById('nationalId'));
      clearFieldError(officeSelect);
      clearFieldError(officeOtherInput);

      if (!checkFirebaseReady()) return;

      // جمع القيم
      const fullName = document.getElementById('fullName').value.trim();
      const nationalId = document.getElementById('nationalId').value.trim();
      const birthDateVal = document.getElementById('birthDate').value;
      const dob = parseDateValue(birthDateVal);
      const age = calculateAge(dob);
      const level = document.getElementById('level').value || '';
      const office = document.getElementById('office').value || '';
      const officeOther = document.getElementById('officeOther').value.trim();
      const region = form.querySelector('input[name="region"]:checked')?.value || '';
      const guardianName = document.getElementById('guardianName').value.trim();
      const guardianPhone = document.getElementById('guardianPhone').value.trim();
      const whatsapp = document.getElementById('whatsapp').value.trim();
      const residentAgree = !!document.getElementById('residentAgree').checked;

      // الملفات ا��خام
      const birthFile = birthFileInput?.files && birthFileInput.files[0] ? birthFileInput.files[0] : null;
      const photoFile = photoFileInput?.files && photoFileInput.files[0] ? photoFileInput.files[0] : null;
      const extraFile = extraFileInput?.files && extraFileInput.files[0] ? extraFileInput.files[0] : null;

      const formData = { fullName, nationalId, birthDate: birthDateVal, age, level, office, officeOther, region, guardianName, guardianPhone, whatsapp, residentAgree, birthFile, photoFile, extraFile };
      const vErr = validateFormFields(formData);
      if (vErr) {
        showMessage(vErr, '#d9534f');
        if (/الرقم القومي/.test(vErr)) setFieldError(nationalIdInput, vErr);
        if (/مكتب|الشيخ/.test(vErr)) {
          setFieldError(officeSelect, vErr);
          setFieldError(officeOtherInput, vErr);
        }
        if (/ميلاد|سن|مستوى/.test(vErr)) {
          setBirthError(vErr);
          setLevelError(vErr);
        }
        return;
      }

      // تحقق من تفرد الرقم القومي قبل الرفع
      showMessage('التحقق من الرقم القومي...', '#0b6cf6');
      const existing = await findExistingNationalId(nationalId);
      if (existing === null) {
        console.warn('تعذر التحقق من تفرد الرقم القومي. تم المتابعة بحذر.');
      } else if (existing) {
        showMessage('هذا الرقم القومي مسجل من قبل بالفعل.', '#d9534f');
        setFieldError(nationalIdInput, 'هذا الرقم القومي مسجل من قبل');
        return;
      }

      try {
        showMessage('جار�� معالجة الملفات والرفع (إن وُجد)...', '#0b6cf6');

        const uploadPromises = [
          (async () => {
            if (!birthFile) return null;
            let f = birthFile;
            if (f.type && f.type.startsWith('image/')) {
              try { f = await resizeImageFile(f); } catch (e) {}
            }
            const url = await uploadFileSmart(f, { label: 'صورة شهادة الميلاد' });
            return url;
          })(),
          (async () => {
            if (!photoFile) return null;
            let f = photoFile;
            if (f.type && f.type.startsWith('image/')) {
              try { f = await resizeImageFile(f); } catch (e) {}
            }
            const url = await uploadFileSmart(f, { label: 'الصورة الشخصية' });
            return url;
          })(),
          (async () => {
            if (!extraFile) return null;
            let f = extraFile;
            if (f.type && f.type.startsWith('image/')) {
              try { f = await resizeImageFile(f); } catch (e) {}
            }
            const url = await uploadFileSmart(f, { label: 'المستند الإضافي' });
            return url;
          })()
        ];

        const [birthUrl, photoUrl, extraUrl] = await Promise.all(uploadPromises);

        if (!birthUrl && birthFile) throw new Error('فشل رفع صورة شهادة الميلاد. حاول مرة أخرى.');
        if (!photoUrl && photoFile) throw new Error('فشل رفع الصورة الشخصية. حاول مرة أخرى.');

        // قيمة المكتب النهائية
        const officeValue = (office === 'other') ? (officeOther || '') : office;

        const competitor = {
          fullName,
          nationalId,
          birthDate: birthDateVal,
          age: age || null,
          level,
          office: officeValue,
          region,
          guardianName,
          guardianPhone,
          whatsapp: whatsapp || '',
          residentAgree: !!residentAgree,
          files: {
            birthFileUrl: birthUrl || '',
            photoFileUrl: photoUrl || '',
            extraFileUrl: extraUrl || ''
          },
          sheikh: session.username,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        showMessage('جاري حفظ بيانات المتسابق ...', '#0b6cf6');

        const baseKey = makeSafeKey(fullName);

        // تحقق ثاني لتفرد الرقم القومي (لحالات السباق)
        const existing2 = await findExistingNationalId(nationalId);
        if (existing2 === null) {
          console.warn('فشل التحقق الثاني لتفرد الرقم القومي. المحاولة بالحفظ.');
        } else if (existing2) {
          showMessage('هذا الرقم القومي مسجل من قبل بالفعل (تم التسجيل أثناء تعبئة النموذج).', '#d9534f');
          setFieldError(nationalIdInput, 'هذا الرقم القومي مسجل من قبل');
          return;
        }

        const saveResult = await saveCompetitorWithNameKey(baseKey, competitor, 20);
        if (!saveResult.success) {
          throw new Error('تعذر إنشاء سجل باسم المتسابق (اسم مستخدم موجود). جرّب تعديل الاسم أو أضف لاحقة.');
        }

        // إنشاء فهرس للرقم القومي (مساعد للبحث مستقبلاً)
        try {
          const indexRef = firebase.database().ref(`nationalIds/${nationalId}`);
          await indexRef.set({ sheikh: session.username, key: saveResult.key, createdAt: firebase.database.ServerValue.TIMESTAMP });
        } catch (err) {
          console.warn('تعذر إنشاء فهرس nationalIds (غير حرج):', err);
        }

        showMessage(`تم حفظ المتسابق بنجاح باسم المفتاح: ${saveResult.key}`, 'green');
        form.reset();
        if (ageInput) ageInput.value = '';
        if (levelSelect) { levelSelect.innerHTML = '<option value="">اختر المستوى بعد تحديد تاريخ الميلاد</option>'; levelSelect.disabled = true; }
        if (officeOtherInput) {
          officeOtherInput.parentElement.style.display = 'none';
          officeOtherInput.required = false;
        }
        if (birthPreviewImg) { birthPreviewImg.hidden = true; birthPreviewImg.src = ''; }
        if (photoPreviewImg) { photoPreviewImg.hidden = true; photoPreviewImg.src = ''; }
        if (extraPreviewImg) { extraPreviewImg.hidden = true; extraPreviewImg.src = ''; }
        if (birthFileNameEl) birthFileNameEl.textContent = 'لم يتم اختيار ملف';
        if (photoFileNameEl) photoFileNameEl.textContent = 'لم يتم اختيار ملف';
        if (extraFileNameEl) extraFileNameEl.textContent = 'لم يتم اختيار ملف';
      } catch (err) {
        console.error('Add competitor error:', err);
        showMessage('فشل إضافة المتسابق: ' + (err && err.message ? err.message : String(err)), '#d9534f');
      }
    });

  }); // DOMContentLoaded
})();
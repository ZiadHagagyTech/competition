// ملف: js/add-competitor.js
// تحديث: حفظ المتسابق تحت مسار الشيخ باستخدام اسم المتسابق كمفتاح قابل للقراءة
// بدلاً من مفاتيح عشوائية. إذا كان نفس الاسم موجودًا نضيف لاحقة رقمية (_1, _2, ...)
// للحفاظ على عدم الكتابة فوق سجلات موجودة.
// يحتفظ بباقي السلوك: حساب العمر، قفل حقل السن والمستوى، رفع الملفات (Imgbb/Storage/fallback)، الحفظ تحت
// competitors/{sheikhUsername}/{safeCompetitorKey}
//
// ملاحظات:
// - تأكد أن قواعد Realtime DB تتيح الكتابة إلى المسار أعلاه.
// - لا تستخدم أسماء تحتوي على أحرف ممنوعة في مفاتيح Firebase: . # $ [ ] /
//   الكود سيحاول تنقية الاسم من هذه الأحرف ويستبدل الفراغات بـ '_'.
// - في حالة فشل التوليد بعد عدد محاولات سيعرض خطأ.

const IMGBB_API_KEY = '4b4e76113a94e13e2fab955835a7be52'; // يمكن تركها فارغة إذا لا تريد Imgbb

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
      const err = el.closest('.form-group')?.querySelector('.error') || el.closest('fieldset')?.querySelector('.error');
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

    // تحويل ملف إلى dataURL
    function fileToDataURL(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => { reader.abort(); reject(new Error('فشل قراءة الملف')); };
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }

    // رفع ذكي: Imgbb -> Firebase Storage -> DataURL (fallback)
    async function uploadFileSmart(file, opts = {}) {
      const { label } = opts;
      if (!file) return null;
      // Imgbb
      if (IMGBB_API_KEY && IMGBB_API_KEY.trim() !== '') {
        try {
          showMessage(`جاري رفع ${label} إلى Imgbb...`);
          const url = await uploadToImgbb(file, p => showMessage(`رفع ${label}... ${p}%`));
          return url;
        } catch (err) {
          console.warn('Imgbb upload failed', err);
        }
      }
      // Firebase Storage
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
      // fallback
      try {
        showMessage(`جاري تحويل ${label} إلى DataURL (fallback)...`);
        const dataUrl = await fileToDataURL(file);
        return dataUrl;
      } catch (err) {
        throw new Error('فشل رفع/تحويل الملف: ' + (err && err.message ? err.message : String(err)));
      }
    }

    // ==== Imgbb & Firebase storage helpers (كما سابقاً) ====
    function uploadToImgbb(file, onProgress) {
      return new Promise(async (resolve, reject) => {
        if (!IMGBB_API_KEY || IMGBB_API_KEY.trim() === '') return reject(new Error('IMGBB_API_KEY غير مُعرّف'));
        try {
          let fileToUpload = file;
          if (file.type && file.type.startsWith('image/')) {
            try { fileToUpload = await resizeImageFile(file); } catch(e) { fileToUpload = file; }
          }
          const dataUrl = await fileToDataURL(fileToUpload);
          const base64Str = dataUrl.split(',')[1] || dataUrl;
          const body = `key=${encodeURIComponent(IMGBB_API_KEY)}&image=${encodeURIComponent(base64Str)}&name=${encodeURIComponent(fileToUpload.name)}`;
          const xhr = new XMLHttpRequest();
          xhr.open('POST', 'https://api.imgbb.com/1/upload', true);
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
          xhr.upload.onprogress = function (evt) {
            if (evt.lengthComputable && onProgress) {
              const p = Math.round((evt.loaded / evt.total) * 100);
              onProgress(p);
            }
          };
          xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const res = JSON.parse(xhr.responseText);
                if (res && res.success && res.data) {
                  const url = res.data.display_url || res.data.url || '';
                  return resolve(url);
                } else return reject(new Error('استجابة Imgbb غير متوقعة'));
              } catch (err) { return reject(err); }
            } else return reject(new Error('خطأ من Imgbb: HTTP ' + xhr.status));
          };
          xhr.onerror = function () { reject(new Error('Network error أثناء رفع الصورة إلى Imgbb')); };
          xhr.send(body);
        } catch (err) { reject(err); }
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

    // ==== DOB logic: حساب العمر واقتراح المستوى تلقائياً ====
    const ranges = [
      { from: new Date(2008, 0, 1), to: new Date(2009, 11, 31, 23, 59, 59, 999), level: 'القرآن كاملاً' },
      { from: new Date(2010, 0, 1), to: new Date(2011, 11, 31, 23, 59, 59, 999), level: 'نصف القرآن' },
      { from: new Date(2012, 0, 1), to: new Date(2013, 11, 31, 23, 59, 59, 999), level: 'ربع القرآن' },
      { from: new Date(2014, 0, 1), to: new Date(2015, 11, 31, 23, 59, 59, 999), level: '5 أجزاء' },
      { from: new Date(2016, 0, 1), to: new Date(2016, 11, 31, 23, 59, 59, 999), level: 'جزء عم + تبارك + قد سمع' },
      { from: new Date(2017, 0, 1), to: new Date(2018, 11, 31, 23, 59, 59, 999), level: 'جزء عم + تبارك' },
      { from: new Date(2019, 0, 1), to: new Date(9999, 11, 31, 23, 59, 59, 999), level: 'جزء عم' }
    ];

    function parseDateValue(val) {
      if (!val) return null;
      const parts = val.split('-');
      if (parts.length < 3) return null;
      const y = parseInt(parts[0],10), m = parseInt(parts[1],10), d = parseInt(parts[2],10);
      if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
      return new Date(y, m-1, d);
    }
    function calculateAge(dob) {
      if (!dob) return null;
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
      return age;
    }
    function matchLevelByDate(dob) {
      if (!dob) return null;
      const t = dob.getTime();
      for (const r of ranges) {
        if (t >= r.from.getTime() && t <= r.to.getTime()) return r.level;
      }
      return null;
    }

    // ===== قفل خانة السن و قفل مستوى الحفظ (سيتم ملؤهما برمجياً فقط) =====
    if (ageInput) {
      ageInput.readOnly = true;
      ageInput.setAttribute('readonly', 'readonly');
    }
    if (levelSelect) {
      levelSelect.disabled = true;
    }

    // helper errors for birth/level
    function setBirthError(msg) { setFieldError(birthDateInput, msg); }
    function clearBirthError() { clearFieldError(birthDateInput); }
    function setLevelError(msg) { setFieldError(levelSelect, msg); }
    function clearLevelError() { clearFieldError(levelSelect); }

    // عندما يتغير تاريخ الميلاد: احسب العمر وقم بتحديد المستوى تلقائياً أو أعرض خطأ
    if (birthDateInput) {
      birthDateInput.addEventListener('change', () => {
        clearBirthError();
        clearLevelError();
        showMessage('');
        const val = birthDateInput.value;
        if (!val) {
          ageInput.value = '';
          levelSelect.value = '';
          setBirthError('تاريخ الميلاد مطلوب');
          return;
        }
        const dob = parseDateValue(val);
        if (!dob) {
          ageInput.value = '';
          levelSelect.value = '';
          setBirthError('تنسيق تاريخ غير صحيح');
          return;
        }
        const today = new Date();
        if (dob > today) {
          ageInput.value = '';
          levelSelect.value = '';
          setBirthError('لا يمكن أن يكون تاريخ الميلاد في المستقبل');
          return;
        }
        const age = calculateAge(dob);
        if (age === null || isNaN(age) || age < 0 || age > 200) {
          ageInput.value = '';
          levelSelect.value = '';
          setBirthError('تاريخ الميلاد يؤدي لسن غير صالح');
          return;
        }
        // ضع العمر في الحقل المقفل
        ageInput.value = age;

        // مطابق المستوى حسب النطاقات المحددة
        const matched = matchLevelByDate(dob);
        if (matched) {
          levelSelect.value = matched;
          clearLevelError();
          clearBirthError();
        } else {
          levelSelect.value = '';
          setLevelError('هذا التاريخ غير مناسب للمسابقة');
          setBirthError('هذا التاريخ غير مناسب للمسابقة');
        }
      });
    }

    // عند إعادة تعيين النموذج: امسح الأخطاء وافرغ الحقول المقفولة
    form.addEventListener('reset', () => {
      setTimeout(() => {
        if (ageInput) ageInput.value = '';
        if (levelSelect) { levelSelect.value = ''; levelSelect.disabled = true; }
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

    // ===== توليد مفتاح آمن من اسم المتسابق (للاستخدام كمفتاح في DB) =====
    function makeSafeKey(name) {
      if (!name) return '';
      // 1. trim, toLower
      let s = String(name).trim().toLowerCase();
      // 2. احذف الحروف الخاصة الغير مرغوب فيها في مفاتيح Firebase: . # $ [ ] /
      s = s.replace(/[.#$\[\]\/]/g, '');
      // 3. استبدل أي مجموعة من الفراغات أو شرطات أو شرطات سفلية بمسطرة سفلية واحدة
      s = s.replace(/[\s\-—–_]+/g, '_');
      // 4. احذف أي أحرف غير سلسلة UTF-8 مرئية (ابقِ أحرف عربية/لاتينية/أرقام/underscore)
      s = s.replace(/[^0-9\u0621-\u064A\u0660-\u0669a-zA-Z_]/g, '');
      // 5. قطع الطول إلى 120 حرفاً
      if (s.length > 120) s = s.slice(0,120);
      // 6. إن انتهى السلسلة فارغة عُدّلها إلى 'competitor'
      if (!s) s = 'competitor';
      return s;
    }

    // ==== validate form fields (يتطلب وجود level المحدد آلياً) ====
    function validateFormFields(formData) {
      if (!formData.fullName || String(formData.fullName).trim().length < 3) return 'الاسم الكامل مطلوب';
      if (!formData.birthDate) return 'تاريخ الميلاد مطلوب';
      if (!formData.age) return 'السن غير صحيح';
      if (!formData.level || String(formData.level).trim() === '') return 'لا يمكن تحديد مستوى الحفظ لهذا التاريخ';
      if (!formData.region) return 'اختر المنطقة';
      if (!formData.guardianName) return 'اسم ولى الأمر مطلوب';
      if (!formData.guardianPhone) return 'رقم هاتف ولى الأمر مطلوب';
      if (!formData.birthFile && !formData.birthFileUrl) return 'صورة شهادة الميلاد مطلوبة';
      if (!formData.photoFile && !formData.photoFileUrl) return 'الصورة الشخصية مطلوبة';
      if (!formData.residentAgree) return 'يجب الموافقة على شرط السكن';
      return null;
    }

    // ==== حفظ المتسابق: نحاول استخدام اسم المتسابق كمفتاحٍ فريد ====
    async function saveCompetitorWithNameKey(baseKey, competitor, maxAttempts = 10) {
      // نحاول حفظ under competitors/{sheikh}/{key} عبر transaction لضمان عدم الكتابة فوق
      const basePath = `competitors/${session.username}`;
      for (let i = 0; i < maxAttempts; i++) {
        const key = (i === 0) ? baseKey : `${baseKey}_${i}`;
        const ref = firebase.database().ref(`${basePath}/${key}`);
        try {
          // استخدام transaction للتأكد من عدم وجود سجل
          const tx = await ref.transaction(current => {
            if (current === null) return competitor;
            return; // abort
          });
          if (tx && tx.committed) {
            return { success: true, key };
          }
          // وإلا، جرب المفتاح التالي
        } catch (err) {
          console.warn('Transaction error for key', key, err);
          // في حالة خطأ شبكي حاول المفتاح التالي أو ارجع بالفشل بعد المحاولات
        }
      }
      return { success: false };
    }

    // ==== معالجة الإرسال ====
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

      if (!checkFirebaseReady()) return;

      // جمع القيم
      const fullName = document.getElementById('fullName').value.trim();
      const birthDateVal = document.getElementById('birthDate').value;
      const dob = parseDateValue(birthDateVal);
      const age = calculateAge(dob);
      const level = document.getElementById('level').value || '';
      const region = form.querySelector('input[name="region"]:checked')?.value || '';
      const guardianName = document.getElementById('guardianName').value.trim();
      const guardianPhone = document.getElementById('guardianPhone').value.trim();
      const whatsapp = document.getElementById('whatsapp').value.trim();
      const residentAgree = !!document.getElementById('residentAgree').checked;

      // الملفات الخام
      const birthFile = birthFileInput?.files && birthFileInput.files[0] ? birthFileInput.files[0] : null;
      const photoFile = photoFileInput?.files && photoFileInput.files[0] ? photoFileInput.files[0] : null;
      const extraFile = extraFileInput?.files && extraFileInput.files[0] ? extraFileInput.files[0] : null;

      // تحقق أولي
      const formData = { fullName, birthDate: birthDateVal, age, level, region, guardianName, guardianPhone, whatsapp, residentAgree, birthFile, photoFile, extraFile };
      const vErr = validateFormFields(formData);
      if (vErr) {
        showMessage(vErr, '#d9534f');
        if (/ميلاد|سن|مستوى/.test(vErr)) {
          setBirthError(vErr);
          setLevelError(vErr);
        }
        return;
      }

      try {
        showMessage('جاري معالجة الملفات والرفع (إن وُجد)...', '#0b6cf6');

        // رفع الملفات متوازياً
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

        // جهز كائن التسجيل
        const competitor = {
          fullName,
          birthDate: birthDateVal,
          age: age || null,
          level,
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

        // توليد مفتاح آمن من الاسم ومحاولة الحفظ
        const baseKey = makeSafeKey(fullName);
        const saveResult = await saveCompetitorWithNameKey(baseKey, competitor, 20); // نحاول حتى 20 مرّة (_1.._19)
        if (!saveResult.success) {
          throw new Error('تعذر إنشاء سجل باسم المتسابق (اسم مستخدم موجود). جرّب تعديل الاسم أو أضف لاحقة.');
        }

        showMessage(`تم حفظ المتسابق بنجاح باسم المفتاح: ${saveResult.key}`, 'green');
        form.reset();
        if (ageInput) ageInput.value = '';
        if (levelSelect) { levelSelect.value = ''; levelSelect.disabled = true; }
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

    // الانتهاء
  }); // DOMContentLoaded
})();
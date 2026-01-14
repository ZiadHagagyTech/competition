// results.js — يعرض المتسابقين في المسار competitors/{username} ويتيح حفظ الدرجات وتنزيلها كجدول.
// التصدير الآن يتضمن الأعمدة: رقم، اسم المتسابق، المنطقة، مستوى الحفظ، نتيجة الحفظ، نتيجة الأحكام، الإجمالي.
// متطلبات: main.js (تهيئة Firebase) و session.js (SheikhSession) محمّلان قبل هذا الملف.

document.addEventListener('DOMContentLoaded', async () => {
  const pageNotice = document.getElementById('pageNotice');
  const sheikhCardContainer = document.getElementById('sheikhCardContainer');
  const introText = document.getElementById('introText');

  function notice(text, color){
    if(!pageNotice) return;
    pageNotice.textContent = text || '';
    pageNotice.style.color = color || '';
  }

  if (!window.firebase || !firebase.database) {
    notice('خطأ: Firebase غير مُهيأ. تأكد من تحميل main.js و firebase-database-compat.js', '#d9534f');
    return;
  }

  // جلسة الشيخ الحالي
  let currentSession = null;
  try {
    currentSession = (window.SheikhSession && SheikhSession.get) ? SheikhSession.get() : JSON.parse(localStorage.getItem('sheikhSession') || 'null');
  } catch(e){ currentSession = null; }

  if (!currentSession || !currentSession.username) {
    introText.textContent = 'يجب تسجيل الدخول كشيخ مفوض لعرض المتسابقين الخاصين بك.';
    sheikhCardContainer.innerHTML = `
      <div class="sheikh-card">
        <div class="result-meta">أنت غير مُسجَّل. <a href="sheikh-login.html">اضغط هنا لتسجيل الدخول</a></div>
      </div>
    `;
    return;
  }

  const usernameKey = String(currentSession.username).trim().toLowerCase();
  notice('جاري جلب متسابقيك...', '#0b6cf6');

  const COMPETITORS_USER_REF = firebase.database().ref(`competitors/${usernameKey}`);
  const RESULTS_USER_REF = firebase.database().ref(`results/${usernameKey}`);

  // نسخة محلية من النتائج لتصديرها بعد الحفظ مباشرة
  let resultsData = {};

  try {
    const [compsSnap, resultsSnap, sheikhSnap] = await Promise.all([
      COMPETITORS_USER_REF.once('value'),
      RESULTS_USER_REF.once('value'),
      firebase.database().ref(`sheikhs/${usernameKey}`).once('value')
    ]);

    const sheikhProfile = sheikhSnap.exists() ? sheikhSnap.val() : null;
    resultsData = resultsSnap.exists() ? resultsSnap.val() : {};

    if (!compsSnap.exists()) {
      sheikhCardContainer.innerHTML = '';
      const shCard = document.createElement('section');
      shCard.className = 'sheikh-card';
      shCard.innerHTML = `
        <div class="sheikh-head">
          <div>
            <div class="sheikh-name">${escapeHtml(sheikhProfile && sheikhProfile.name ? sheikhProfile.name : currentSession.username)}</div>
            <div class="sheikh-meta">${escapeHtml((sheikhProfile && sheikhProfile.office) ? sheikhProfile.office : '')} ${(sheikhProfile && sheikhProfile.city) ? ' - ' + escapeHtml(sheikhProfile.city) : ''}</div>
          </div>
          <div class="row-actions">
            <div class="small-muted">المستخدم: <strong>${escapeHtml(usernameKey)}</strong></div>
            <div class="small-muted">عدد متسابقيك: <strong>0</strong></div>
          </div>
        </div>
        <div class="competitors-wrap">
          <div class="result-meta">لا يوجد متسابقين مسجّلين بواسطة حسابك حالياً. <a href="add-competitors.html">إضافة متسابقين</a></div>
        </div>
      `;
      sheikhCardContainer.appendChild(shCard);
      notice('لم يتم العثور على متسابقين تحت المسار competitors/' + usernameKey, '#d97706');
      return;
    }

    // جلب المتسابقين تحت هذا المسار
    const myCompetitors = [];
    compsSnap.forEach(child => {
      const key = child.key;
      const val = child.val();
      let fullName = '';
      if (val == null) fullName = key;
      else if (typeof val === 'string') fullName = val;
      else fullName = (val.fullName || val.name || val.fullNameAr || val.fullname || '') ;
      fullName = fullName || key;
      myCompetitors.push({ key, fullName, raw: val });
    });

    // بناء واجهة الشيخ مع زر تنزيل
    sheikhCardContainer.innerHTML = '';
    const shCard = document.createElement('section');
    shCard.className = 'sheikh-card';
    shCard.innerHTML = `
      <div class="sheikh-head">
        <div>
          <div class="sheikh-name">${escapeHtml(sheikhProfile && sheikhProfile.name ? sheikhProfile.name : currentSession.username)}</div>
          <div class="sheikh-meta">${escapeHtml((sheikhProfile && sheikhProfile.office) ? sheikhProfile.office : '')} ${(sheikhProfile && sheikhProfile.city) ? ' - ' + escapeHtml(sheikhProfile.city) : ''}</div>
        </div>
        <div class="row-actions">
          <button id="exportBtn" title="تنزيل الدرجات كجدول">تنزيل الدرجات</button>
          <div class="small-muted">المستخدم: <strong>${escapeHtml(usernameKey)}</strong></div>
          <div class="small-muted">عدد متسابقيك: <strong>${myCompetitors.length}</strong></div>
        </div>
      </div>
    `;
    sheikhCardContainer.appendChild(shCard);

    const wrap = document.createElement('div');
    wrap.className = 'competitors-wrap';
    const table = document.createElement('table');
    table.className = 'competitors-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>المتسابق</th>
          <th>المنطقة</th>
          <th>مستوى الحفظ</th>
          <th>حفظ /75</th>
          <th>أحكام /25</th>
          <th>المجموع</th>
          <th>حالة الحفظ</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    for (const c of myCompetitors) {
      const existing = resultsData && resultsData[c.key] ? resultsData[c.key] : null;
      const hifzVal = existing && existing.hifzScore != null ? existing.hifzScore : '';
      const ahkamVal = existing && existing.ahkamScore != null ? existing.ahkamScore : '';
      const totalVal = (hifzVal === '' && ahkamVal === '') ? '' : (Number(hifzVal || 0) + Number(ahkamVal || 0));

      // استخراج الحقول المنطقة والمستوى من البيانات الخام إن وُجدت
      const region = extractCompetitorField(c.raw, ['region','area','district','منطقة','regionName']) || '';
      const level = extractCompetitorField(c.raw, ['level','levelName','مستوى','حفظ']) || '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(c.fullName)}</td>
        <td>${escapeHtml(region)}</td>
        <td>${escapeHtml(level)}</td>
        <td><input type="number" min="0" max="75" step="1" class="score-input" data-kind="hifz" data-key="${escapeAttr(c.key)}" value="${escapeAttr(hifzVal)}"></td>
        <td><input type="number" min="0" max="25" step="1" class="score-input" data-kind="ahkam" data-key="${escapeAttr(c.key)}" value="${escapeAttr(ahkamVal)}"></td>
        <td class="total-cell" data-key="${escapeAttr(c.key)}">${totalVal !== '' ? escapeHtml(String(totalVal)) : ''}</td>
        <td><button class="btn-small btn-save" data-save-key="${escapeAttr(c.key)}" data-username="${escapeAttr(usernameKey)}">${existing ? 'تم الحفظ' : 'حفظ'}</button></td>
      `;
      tbody.appendChild(tr);

      // بعد الإدراج: إذا كانت نتيجة موجودة مسبقًا نجعل الزر مغلقاً وغير فعال (تم الحفظ)
      if (existing && (existing.hifzScore != null || existing.ahkamScore != null)) {
        const btn = tbody.lastElementChild.querySelector(`button[data-save-key="${cssEscape(c.key)}"]`);
        if (btn) markButtonSaved(btn);
      }
    }

    wrap.appendChild(table);
    sheikhCardContainer.appendChild(wrap);

    // event listeners
    sheikhCardContainer.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button[data-save-key]');
      if (btn) {
        const compKey = btn.dataset.saveKey;
        // إذا كان الزر مغلق "تم الحفظ" فلا نفعل شيئاً
        if (btn.disabled && btn.textContent.trim() === 'تم الحفظ') return;
        await saveCompetitorScore(usernameKey, compKey, btn);
        return;
      }
      const exp = ev.target.closest('#exportBtn');
      if (exp) {
        handleExport(usernameKey, sheikhProfile, myCompetitors);
        return;
      }
    });

    // على أي تغيير في المدخلات: تحديث المجموع، وإذا كان الزر في حالة "تم الحفظ" نعيده إلى "تعديل"
    sheikhCardContainer.addEventListener('input', (ev) => {
      const inp = ev.target.closest('input.score-input');
      if (!inp) return;
      const key = inp.dataset.key;
      updateTotalForKey(key);
      const btn = sheikhCardContainer.querySelector(`button[data-save-key="${cssEscape(key)}"]`);
      if (btn && btn.textContent.trim() === 'تم الحفظ') {
        markButtonForEdit(btn);
      }
    });

    notice('تم جلب المتسابقين.', 'green');

  } catch (err) {
    console.error(err);
    notice('فشل جلب المتسابقين: ' + (err && err.message ? err.message : String(err)), '#d9534f');
  }

  // ---------------- helper functions ----------------

  function extractCompetitorField(raw, candidates) {
    if (!raw) return '';
    if (typeof raw === 'string') return ''; // raw string can't contain other fields
    for (const k of candidates) {
      if (raw[k]) return String(raw[k]);
    }
    // sometimes nested or with different casing
    for (const k of Object.keys(raw)) {
      if (String(k).toLowerCase().includes('region') || String(k).toLowerCase().includes('منطقة') || String(k).toLowerCase().includes('area')) {
        return String(raw[k]);
      }
      if (String(k).toLowerCase().includes('level') || String(k).toLowerCase().includes('مستوى')) {
        return String(raw[k]);
      }
    }
    return '';
  }

  function updateTotalForKey(key){
    const h = sheikhCardContainer.querySelector(`input.score-input[data-kind="hifz"][data-key="${cssEscape(key)}"]`);
    const a = sheikhCardContainer.querySelector(`input.score-input[data-kind="ahkam"][data-key="${cssEscape(key)}"]`);
    const totalCell = sheikhCardContainer.querySelector(`.total-cell[data-key="${cssEscape(key)}"]`);
    const hv = h ? Number(h.value || 0) : 0;
    const av = a ? Number(a.value || 0) : 0;
    const hasAny = (h && h.value !== '') || (a && a.value !== '');
    totalCell.textContent = hasAny ? String(hv + av) : '';
  }

  async function saveCompetitorScore(username, compKey, btnEl){
    btnEl.disabled = true;
    const original = btnEl.textContent;
    btnEl.textContent = 'جاري الحفظ...';
    try {
      const hInput = sheikhCardContainer.querySelector(`input.score-input[data-kind="hifz"][data-key="${cssEscape(compKey)}"]`);
      const aInput = sheikhCardContainer.querySelector(`input.score-input[data-kind="ahkam"][data-key="${cssEscape(compKey)}"]`);
      const h = hInput && hInput.value !== '' ? Number(hInput.value) : null;
      const a = aInput && aInput.value !== '' ? Number(aInput.value) : null;

      if (h != null && (h < 0 || h > 75)) {
        alert('قيمة الحفظ يجب أن تكون بين 0 و 75');
        btnEl.textContent = original;
        btnEl.disabled = false;
        return;
      }
      if (a != null && (a < 0 || a > 25)) {
        alert('قيمة الأحكام يجب أن تكون بين 0 و 25');
        btnEl.textContent = original;
        btnEl.disabled = false;
        return;
      }

      const payload = {
        hifzScore: h,
        ahkamScore: a,
        total: ((h != null ? h : 0) + (a != null ? a : 0)),
        gradedBy: currentSession ? currentSession.username : 'unknown',
        gradedAt: firebase.database.ServerValue.TIMESTAMP
      };

      await firebase.database().ref(`results/${username}/${compKey}`).set(payload);

      // تحديث نسخة محلية
      resultsData[compKey] = payload;

      // بعد الحفظ: نغيّر الزر إلى "تم الحفظ" ونغلقه (غير فعّال)
      markButtonSaved(btnEl);

      // حدّث المجموع فورًا
      updateTotalForKey(compKey);

    } catch (err) {
      console.error(err);
      alert('فشل الحفظ: ' + (err && err.message ? err.message : String(err)));
      btnEl.textContent = original;
      btnEl.disabled = false;
    }
  }

  function markButtonSaved(btn) {
    if (!btn) return;
    btn.textContent = 'تم الحفظ';
    btn.disabled = true;
    btn.classList.add('btn-saved');
    btn.classList.add('btn-disabled');
  }

  function markButtonForEdit(btn) {
    if (!btn) return;
    btn.textContent = 'تعديل';
    btn.disabled = false;
    btn.classList.remove('btn-saved');
    btn.classList.remove('btn-disabled');
  }

  // توليد ملف جدول (HTML داخل ملف .xls متوافق مع Excel) ثم تنزيله
  // الأعمدة المطلوبة: 1- الرقم، 2- اسم المتسابق، 3- المنطقة، 4- مستوى الحفظ، 5- نتيجة الحفظ، 6- نتيجة الأحكام، 7- إجمالي الدرجات
  function handleExport(username, sheikhProfile, competitorsList) {
    if (!competitorsList || competitorsList.length === 0) {
      alert('لا يوجد متسابقين للتصدير.');
      return;
    }

    const sheikhDisplayName = sheikhProfile && sheikhProfile.name ? sheikhProfile.name : username;
    const now = new Date();

    let tableHtml = `
      <html dir="rtl"><head><meta charset="utf-8" />
      <style>
        table { border-collapse:collapse; width:100%; font-family:Tahoma, Arial, sans-serif; direction:rtl; }
        th, td { border:1px solid #ddd; padding:8px; text-align:right; }
        th { background:#f3f4f6; font-weight:800; }
        caption { font-size:1.25rem; font-weight:800; margin-bottom:8px; text-align:right; }
      </style>
      </head><body>
      <table>
        <caption>نتائج المسابقة — ${escapeHtml(sheikhDisplayName)}</caption>
        <thead>
          <tr>
            <th>م</th>
            <th>اسم المتسابق</th>
            <th>المنطقة</th>
            <th>مستوى الحفظ</th>
            <th>حفظ /75</th>
            <th>أحكام /25</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (let i = 0; i < competitorsList.length; i++) {
      const c = competitorsList[i];
      const key = c.key;
      const name = c.fullName || key;
      // region & level extraction same as displayed
      const region = extractCompetitorField(c.raw, ['region','area','district','منطقة','regionName']) || '';
      const level = extractCompetitorField(c.raw, ['level','levelName','مستوى','حفظ']) || '';
      const hInput = sheikhCardContainer.querySelector(`input.score-input[data-kind="hifz"][data-key="${cssEscape(key)}"]`);
      const aInput = sheikhCardContainer.querySelector(`input.score-input[data-kind="ahkam"][data-key="${cssEscape(key)}"]`);
      const hVal = hInput ? (hInput.value !== '' ? Number(hInput.value) : '') : (resultsData[key] && resultsData[key].hifzScore != null ? resultsData[key].hifzScore : '');
      const aVal = aInput ? (aInput.value !== '' ? Number(aInput.value) : '') : (resultsData[key] && resultsData[key].ahkamScore != null ? resultsData[key].ahkamScore : '');
      const totalVal = (hVal === '' && aVal === '') ? '' : (Number(hVal || 0) + Number(aVal || 0));
      const idx = i + 1;

      tableHtml += `
        <tr>
          <td>${escapeHtml(String(idx))}</td>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(region)}</td>
          <td>${escapeHtml(level)}</td>
          <td>${hVal !== '' ? escapeHtml(String(hVal)) : ''}</td>
          <td>${aVal !== '' ? escapeHtml(String(aVal)) : ''}</td>
          <td>${totalVal !== '' ? escapeHtml(String(totalVal)) : ''}</td>
        </tr>
      `;
    }

    tableHtml += `</tbody></table></body></html>`;

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const filename = `${sanitizeFilename(`results_${username}_${now.toISOString().slice(0,10)}`)}.xls`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function sanitizeFilename(name) {
    return name.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_');
  }

  // Helpers للحماية من XSS وللاستخدام في محددات الصفوف
  function escapeHtml(s){ if (s == null) return ''; return String(s).replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
  function cssEscape(s){ return String(s).replace(/(["\\])/g, '\\$1'); }

  // extractCompetitorField and mark functions are defined above; duplicate here for local scope use
  function extractCompetitorField(raw, candidates) {
    if (!raw) return '';
    if (typeof raw === 'string') return '';
    for (const k of candidates) {
      if (raw[k]) return String(raw[k]);
    }
    for (const k of Object.keys(raw)) {
      if (String(k).toLowerCase().includes('region') || String(k).toLowerCase().includes('منطقة') || String(k).toLowerCase().includes('area')) {
        return String(raw[k]);
      }
      if (String(k).toLowerCase().includes('level') || String(k).toLowerCase().includes('مستوى')) {
        return String(raw[k]);
      }
    }
    return '';
  }

  function markButtonSaved(btn) {
    if (!btn) return;
    btn.textContent = 'تم الحفظ';
    btn.disabled = true;
    btn.classList.add('btn-saved');
    btn.classList.add('btn-disabled');
  }
  function markButtonForEdit(btn) {
    if (!btn) return;
    btn.textContent = 'تعديل';
    btn.disabled = false;
    btn.classList.remove('btn-saved');
    btn.classList.remove('btn-disabled');
  }

});
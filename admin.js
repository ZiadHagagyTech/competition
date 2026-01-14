// admin.js — لوحة تحكم القائد (المصادقة تعتمد على اسم مستخدم وكلمة مرور ثابتين في الكود)
// ملاحظة أمان مهمة: تخزين بيانات الاعتماد داخل كود الواجهة غير آمن. استعمل Firebase Auth أو آلية آمنة في الإنتاج.

(function(){
  // ---------- بيانات الاعتماد الثابتة في الكود ----------
  const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'admin2026'
  };
  // ------------------------------------------------------------------------

  // Helpers
  function $(sel, el=document) { return el.querySelector(sel); }
  function $all(sel, el=document) { return Array.from(el.querySelectorAll(sel)); }
  function notice(text, color) {
    const el = $('#adminNotice');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = color || '';
  }
  function escapeHtml(s){ if (s == null) return ''; return String(s).replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
  function cssEscape(s){ return String(s).replace(/(["\\])/g, '\\$1'); }

  // Admin session storage (local only)
  const ADMIN_KEY = 'siteAdminSession';
  function setAdminSession(profile){ try { localStorage.setItem(ADMIN_KEY, JSON.stringify(profile)); } catch(e){} }
  function getAdminSession(){ try { return JSON.parse(localStorage.getItem(ADMIN_KEY) || 'null'); } catch(e){ return null; } }
  function clearAdminSession(){ try { localStorage.removeItem(ADMIN_KEY); } catch(e){} }

  // DOM refs
  const loginArea = $('#loginArea');
  const dashboardArea = $('#dashboardArea');
  const adminLoginForm = $('#adminLoginForm');
  const adminUsernameInput = $('#adminUsername');
  const adminPasswordInput = $('#adminPassword');
  const toggleAdminPassword = $('#toggleAdminPassword');
  const adminWelcome = $('#adminWelcome');
  const adminLogoutBtn = $('#adminLogoutBtn');
  const refreshBtn = $('#refreshBtn');
  const exportAllBtn = $('#exportAllBtn');
  const downloadSheikhsBtn = $('#downloadSheikhsBtn');
  const sheikhsTableWrap = $('#sheikhsTableWrap');

  // delegation state
  let delegationsInitialized = false;

  // Check firebase availability
  if (!window.firebase || !firebase.database) {
    notice('خطأ: Firebase غير مهيأ. تأكد من تحميل main.js و firebase-database-compat.js', '#d9534f');
  }

  // Toggle password visibility
  toggleAdminPassword && toggleAdminPassword.addEventListener('click', ()=> {
    if (!adminPasswordInput) return;
    adminPasswordInput.type = adminPasswordInput.type === 'password' ? 'text' : 'password';
    toggleAdminPassword.textContent = adminPasswordInput.type === 'password' ? 'عرض' : 'إخفاء';
  });

  // Init: if already logged in, show dashboard
  (function init(){
    const s = getAdminSession();
    if (s && s.username) {
      showDashboard(s);
    } else {
      showLogin();
    }
  })();

  function showLogin(){
    loginArea.style.display = '';
    dashboardArea.style.display = 'none';
    notice('');
  }

  function showDashboard(session){
    loginArea.style.display = 'none';
    dashboardArea.style.display = '';
    adminWelcome.textContent = `مرحبًا، ${session.username}`;
    notice('جاري تحميل بيانات الشيوخ...', '#0b6cf6');
    loadSheikhsGrid();
  }

  // Login handler (compare with constants in code)
  adminLoginForm && adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = (adminUsernameInput.value || '').trim();
    const password = (adminPasswordInput.value || '');
    if (!username) { $('#adminUsernameError').textContent = 'اسم المستخدم مطلوب'; return; } else $('#adminUsernameError').textContent = '';
    if (!password) { $('#adminPasswordError').textContent = 'كلمة المرور مطلوبة'; return; } else $('#adminPasswordError').textContent = '';

    notice('جاري التحقق...', '#0b6cf6');
    try {
      // Compare with the constants (no DB lookup)
      if (username !== ADMIN_CREDENTIALS.username || password !== ADMIN_CREDENTIALS.password) {
        notice('اسم المستخدم أو كلمة المرور غير صحيحة.', '#d9534f');
        return;
      }
      const session = { username };
      setAdminSession(session);
      showDashboard(session);
      adminUsernameInput.value = '';
      adminPasswordInput.value = '';
      notice('تم تسجيل الدخول', 'green');
    } catch (err) {
      console.error(err);
      notice('فشل التحقق: ' + (err.message || String(err)), '#d9534f');
    }
  });

  // Logout
  adminLogoutBtn && adminLogoutBtn.addEventListener('click', () => {
    clearAdminSession();
    showLogin();
    notice('تم تسجيل الخروج', '#0b6cf6');
  });

  // Refresh
  refreshBtn && refreshBtn.addEventListener('click', () => {
    loadSheikhsGrid();
  });

  // Download sheikhs as Excel (summary list)
  if (downloadSheikhsBtn) {
    downloadSheikhsBtn.addEventListener('click', async () => {
      notice('جاري تجميع بيانات الشيوخ وتجهيز ملف Excel ...', '#0b6cf6');
      try {
        await exportSheikhsListExcel();
        notice('تم تنزيل ملف الشيوخ (Excel)', 'green');
      } catch (err) {
        console.error(err);
        notice('فشل تنزيل الشيوخ: ' + (err.message || String(err)), '#d9534f');
      }
    });
  }

  // Export All (existing)
  exportAllBtn && exportAllBtn.addEventListener('click', async () => {
    const s = getAdminSession();
    if (!s || !s.username) { notice('يجب تسجيل الدخول أولا', '#d9534f'); return; }
    notice('جاري توليد ملف Excel لجميع الشيوخ ...', '#0b6cf6');
    try {
      await exportAllSheikhs();
      notice('تم تنزيل ملف Excel لجم��ع الشيوخ', 'green');
    } catch (err) {
      console.error(err);
      notice('فشل التصدير: ' + (err.message || String(err)), '#d9534f');
    }
  });

  // Load sheikhs list and counts (reads sheikhs and competitors paths)
  async function loadSheikhsGrid() {
    try {
      const sheikhsSnap = await firebase.database().ref('sheikhs').once('value');
      const sheikhsObj = sheikhsSnap.exists() ? sheikhsSnap.val() : {};
      const entries = Object.keys(sheikhsObj).map(k => ({ username: k, ...sheikhsObj[k] }));
      // For each sheikh, fetch competitor count from competitors/{username}
      const rows = await Promise.all(entries.map(async sh => {
        const compsSnap = await firebase.database().ref(`competitors/${sh.username}`).once('value');
        const count = compsSnap.exists() ? Object.keys(compsSnap.val()).length : 0;
        return { sheikh: sh, count };
      }));

      renderSheikhsTable(rows);
      notice('');
    } catch (err) {
      console.error(err);
      notice('فشل جلب الشيوخ: ' + (err.message || String(err)), '#d9534f');
    }
  }

  // Render sheikhs main table (with data-label attributes for responsive display)
  function renderSheikhsTable(rows) {
    const table = document.createElement('table');
    table.className = 'sheikhs-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>اسم الشيخ</th>
          <th>اسم المستخدم</th>
          <th>عدد المتسابقين</th>
          <th>الإجراءات</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    rows.forEach(r => {
      const tr = document.createElement('tr');
      const actionsHtml = `
        <button class="small-btn" data-action="view" data-username="${escapeAttr(r.sheikh.username)}">عرض المتسابقين</button>
        <button class="small-btn secondary" data-action="export" data-username="${escapeAttr(r.sheikh.username)}">تنزيل Excel</button>
      `;
      tr.innerHTML = `
        <td data-label="اسم الشيخ">${escapeHtml(r.sheikh.name || '')}</td>
        <td data-label="اسم المستخدم">${escapeHtml(r.sheikh.username || '')}</td>
        <td data-label="عدد المتسابقين">${r.count}</td>
        <td data-label="الإجراءات" class="sheikh-actions">${actionsHtml}</td>
      `;
      tbody.appendChild(tr);
    });

    sheikhsTableWrap.innerHTML = '';
    sheikhsTableWrap.appendChild(table);

    // attach delegation once
    if (!delegationsInitialized) {
      sheikhsTableWrap.addEventListener('click', onSheikhsWrapClick);
      delegationsInitialized = true;
    }
  }

  // Delegated click handler for actions in sheikhs table
  async function onSheikhsWrapClick(ev) {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const username = btn.dataset.username;
    if (action === 'view') {
      const row = btn.closest('tr');
      toggleCompetitorsPanel(row, username);
    } else if (action === 'export') {
      notice(`جاري تصدير ملف Excel للشيخ ${username} ...`, '#0b6cf6');
      try {
        await exportSheikh(username);
        notice('تم تنزيل الملف', 'green');
      } catch (err) {
        console.error(err);
        notice('فشل التصدير: ' + (err.message || String(err)), '#d9534f');
      }
    }
  }

  // Toggle competitors panel (fetch from competitors/{username})
  async function toggleCompetitorsPanel(rowEl, username) {
    const next = rowEl.nextElementSibling;
    if (next && next.classList.contains('sheikh-panel')) {
      next.remove();
      return;
    }

    const panel = document.createElement('tr');
    panel.className = 'sheikh-panel';
    const td = document.createElement('td');
    td.colSpan = 4;
    td.innerHTML = `<div class="sheikh-panel-inner">جارٍ جلب المتسابقين...</div>`;
    panel.appendChild(td);
    rowEl.parentNode.insertBefore(panel, rowEl.nextSibling);

    try {
      const [compsSnap, resultsSnap, sheikhSnap] = await Promise.all([
        firebase.database().ref(`competitors/${username}`).once('value'),
        firebase.database().ref(`results/${username}`).once('value'),
        firebase.database().ref(`sheikhs/${username}`).once('value')
      ]);
      const sheikhProfile = sheikhSnap.exists() ? sheikhSnap.val() : { username };
      const resultsObj = resultsSnap.exists() ? resultsSnap.val() : {};
      const comps = [];
      if (compsSnap.exists()) {
        compsSnap.forEach(child => {
          const key = child.key;
          const val = child.val();
          let fullname = '';
          if (val == null) fullname = key;
          else if (typeof val === 'string') fullname = val;
          else fullname = (val.fullName || val.name || val.fullname || '');
          fullname = fullname || key;
          const region = (val && (val.region || val.area || val['المنطقة'])) || '';
          const level = (val && (val.level || val.levelName || val['مستوى'])) || '';
          comps.push({ key, fullname, region, level, raw: val });
        });
      }

      const inner = document.createElement('div');
      inner.className = 'inner-panel';
      const html = [];
      html.push(`<div style="display:flex; justify-content:space-between; align-items:center; gap:0.6rem; margin-bottom:0.5rem; flex-wrap:wrap;">`);
      html.push(`<div><strong>الشيخ:</strong> ${escapeHtml(sheikhProfile.name || username)} &nbsp; (<small>${escapeHtml(username)}</small>)</div>`);
      html.push(`<div style="display:flex;gap:0.5rem;flex-wrap:wrap;"><button class="small-btn" id="saveAll_${escapeAttr(username)}">حفظ الكل</button><button class="small-btn secondary" id="exportSheikh_${escapeAttr(username)}">تنزيل Excel</button></div>`);
      html.push(`</div>`);
      html.push(`<table class="compact-table"><thead><tr><th>م</th><th>المتسابق</th><th>المنطقة</th><th>المستوى</th><th>حفظ /75</th><th>أحكام /25</th><th>الإجمالي</th><th>حالة</th></tr></thead><tbody>`);
      for (let i=0;i<comps.length;i++){
        const c = comps[i];
        const res = resultsObj && resultsObj[c.key] ? resultsObj[c.key] : null;
        const h = res && res.hifzScore != null ? res.hifzScore : '';
        const a = res && res.ahkamScore != null ? res.ahkamScore : '';
        const total = (h === '' && a === '') ? '' : (Number(h || 0) + Number(a || 0));
        const btnLabel = res ? 'تم الحفظ' : 'حفظ';
        html.push(`<tr data-comp-key="${escapeAttr(c.key)}">
          <td data-label="م">${i+1}</td>
          <td data-label="المتسابق">${escapeHtml(c.fullname)}</td>
          <td data-label="المنطقة">${escapeHtml(c.region || '')}</td>
          <td data-label="المستوى">${escapeHtml(c.level || '')}</td>
          <td data-label="حفظ /75"><input type="number" min="0" max="75" class="score-input" data-kind="hifz" data-key="${escapeAttr(c.key)}" value="${escapeAttr(h)}"></td>
          <td data-label="أحكام /25"><input type="number" min="0" max="25" class="score-input" data-kind="ahkam" data-key="${escapeAttr(c.key)}" value="${escapeAttr(a)}"></td>
          <td data-label="الإجمالي" class="total-cell" data-key="${escapeAttr(c.key)}">${total !== '' ? escapeHtml(String(total)) : ''}</td>
          <td data-label="حالة"><button class="small-btn ${res ? 'btn-saved' : ''}" data-save-key="${escapeAttr(c.key)}" ${res ? 'disabled' : ''}>${escapeHtml(btnLabel)}</button></td>
        </tr>`);
      }
      html.push(`</tbody></table>`);
      inner.innerHTML = html.join('');
      td.querySelector('.sheikh-panel-inner').replaceWith(inner);

      // attach internal handlers
      const saveAllBtn = inner.querySelector(`#saveAll_${cssEscape(username)}`);
      const exportBtn = inner.querySelector(`#exportSheikh_${cssEscape(username)}`);
      saveAllBtn && saveAllBtn.addEventListener('click', async () => { await saveAllForSheikh(username, inner); });
      exportBtn && exportBtn.addEventListener('click', async () => { await exportSheikh(username); });

      inner.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button[data-save-key]');
        if (!btn) return;
        const compKey = btn.dataset.saveKey;
        if (btn.disabled) return;
        await saveSingleResult(username, compKey, inner, btn);
      });

      inner.addEventListener('input', (ev) => {
        const inp = ev.target.closest('input.score-input');
        if (!inp) return;
        const key = inp.dataset.key;
        updateTotalInPanel(inner, key);
        const btn = inner.querySelector(`button[data-save-key="${cssEscape(key)}"]`);
        if (btn && btn.disabled && btn.textContent.trim() === 'تم الحفظ') {
          btn.textContent = 'تعديل';
          btn.disabled = false;
          btn.classList.remove('btn-saved');
        }
      });

    } catch (err) {
      console.error(err);
      const frag = panel.querySelector('.sheikh-panel-inner');
      if (frag) frag.textContent = 'فشل جلب المتسابقين: ' + (err.message || String(err));
    }
  }

  function updateTotalInPanel(panelEl, key) {
    const h = panelEl.querySelector(`input.score-input[data-kind="hifz"][data-key="${cssEscape(key)}"]`);
    const a = panelEl.querySelector(`input.score-input[data-kind="ahkam"][data-key="${cssEscape(key)}"]`);
    const totalCell = panelEl.querySelector(`.total-cell[data-key="${cssEscape(key)}"]`);
    const hv = h ? Number(h.value || 0) : 0;
    const av = a ? Number(a.value || 0) : 0;
    const hasAny = (h && h.value !== '') || (a && a.value !== '');
    if (totalCell) totalCell.textContent = hasAny ? String(hv + av) : '';
  }

  async function saveSingleResult(username, compKey, panelEl, btnEl) {
    btnEl.disabled = true;
    const orig = btnEl.textContent;
    btnEl.textContent = 'جاري الحفظ...';
    try {
      const hInput = panelEl.querySelector(`input.score-input[data-kind="hifz"][data-key="${cssEscape(compKey)}"]`);
      const aInput = panelEl.querySelector(`input.score-input[data-kind="ahkam"][data-key="${cssEscape(compKey)}"]`);
      const h = hInput && hInput.value !== '' ? Number(hInput.value) : null;
      const a = aInput && aInput.value !== '' ? Number(aInput.value) : null;
      if (h != null && (h < 0 || h > 75)) { alert('قيمة الحفظ يجب أن تكون بين 0 و 75'); btnEl.textContent = orig; btnEl.disabled = false; return; }
      if (a != null && (a < 0 || a > 25)) { alert('قيمة الأحكام يجب أن تكون بين 0 و 25'); btnEl.textContent = orig; btnEl.disabled = false; return; }

      const payload = {
        hifzScore: h,
        ahkamScore: a,
        total: ((h != null ? h : 0) + (a != null ? a : 0)),
        gradedBy: getAdminSession() ? getAdminSession().username : 'admin',
        gradedAt: firebase.database.ServerValue.TIMESTAMP
      };

      await firebase.database().ref(`results/${username}/${compKey}`).set(payload);

      btnEl.textContent = 'تم الحفظ';
      btnEl.disabled = true;
      btnEl.classList.add('btn-saved');
      updateTotalInPanel(panelEl, compKey);

    } catch (err) {
      console.error(err);
      alert('فشل الحفظ: ' + (err.message || String(err)));
      btnEl.textContent = orig;
      btnEl.disabled = false;
    }
  }

  async function saveAllForSheikh(username, panelEl) {
    const rows = Array.from(panelEl.querySelectorAll('tr[data-comp-key]'));
    if (rows.length === 0) return;
    const updates = {};
    for (const row of rows) {
      const compKey = row.dataset.compKey;
      const hInput = row.querySelector(`input.score-input[data-kind="hifz"]`);
      const aInput = row.querySelector(`input.score-input[data-kind="ahkam"]`);
      const h = hInput && hInput.value !== '' ? Number(hInput.value) : null;
      const a = aInput && aInput.value !== '' ? Number(aInput.value) : null;
      if (h != null && (h < 0 || h > 75)) { alert('قيمة الحفظ يجب أن تكون بين 0 و 75'); return; }
      if (a != null && (a < 0 || a > 25)) { alert('قيمة الأحكام يجب أن تكون بين 0 و 25'); return; }
      updates[`results/${username}/${compKey}`] = {
        hifzScore: h,
        ahkamScore: a,
        total: ((h != null ? h : 0) + (a != null ? a : 0)),
        gradedBy: getAdminSession() ? getAdminSession().username : 'admin',
        gradedAt: firebase.database.ServerValue.TIMESTAMP
      };
    }

    try {
      await firebase.database().ref().update(updates);
      for (const row of rows) {
        const key = row.dataset.compKey;
        const btn = row.querySelector(`button[data-save-key="${cssEscape(key)}"]`);
        if (btn) { btn.textContent = 'تم الحفظ'; btn.disabled = true; btn.classList.add('btn-saved'); }
        updateTotalInPanel(panelEl, row.dataset.compKey);
      }
      notice('تم حفظ جميع الدرجات لهذا الشيخ', 'green');
    } catch (err) {
      console.error(err);
      notice('فشل حفظ الدرجات: ' + (err.message || String(err)), '#d9534f');
    }
  }

  // Export single sheikh as Excel (columns: index, name, region, level, hifz, ahkam, total)
  async function exportSheikh(username) {
    const [compsSnap, resultsSnap, sheikhSnap] = await Promise.all([
      firebase.database().ref(`competitors/${username}`).once('value'),
      firebase.database().ref(`results/${username}`).once('value'),
      firebase.database().ref(`sheikhs/${username}`).once('value')
    ]);

    const sheikhProfile = sheikhSnap.exists() ? sheikhSnap.val() : { username };
    const resultsObj = resultsSnap.exists() ? resultsSnap.val() : {};
    const comps = [];
    if (compsSnap.exists()) {
      compsSnap.forEach(child => {
        const key = child.key;
        const val = child.val();
        let fullname = '';
        if (val == null) fullname = key;
        else if (typeof val === 'string') fullname = val;
        else fullname = (val.fullName || val.name || val.fullname || '');
        const region = (val && (val.region || val.area || val['المنطقة'])) || '';
        const level = (val && (val.level || val.levelName || val['مستوى'])) || '';
        comps.push({ key, fullname, region, level, raw: val });
      });
    }

    const now = new Date();
    let tableHtml = `
      <html dir="rtl"><head><meta charset="utf-8">
      <style>table{border-collapse:collapse;width:100%;font-family:Tahoma,Arial;direction:rtl;}th,td{border:1px solid #ddd;padding:8px;text-align:right;}th{background:#f3f4f6;font-weight:800;}</style>
      </head><body>
      <table>
        <caption style="text-align:right;font-weight:800;margin-bottom:8px">نتائج الشّيخ: ${escapeHtml(sheikhProfile.name || username)}</caption>
        <thead><tr>
          <th>م</th><th>اسم المتسابق</th><th>المنطقة</th><th>مستوى الحفظ</th><th>حفظ /75</th><th>أحكام /25</th><th>الإجمالي</th>
        </tr></thead><tbody>
    `;
    for (let i=0;i<comps.length;i++){
      const c = comps[i];
      const res = resultsObj && resultsObj[c.key] ? resultsObj[c.key] : {};
      const h = res && res.hifzScore != null ? res.hifzScore : '';
      const a = res && res.ahkamScore != null ? res.ahkamScore : '';
      const total = (h === '' && a === '') ? '' : (Number(h || 0) + Number(a || 0));
      tableHtml += `<tr>
        <td>${i+1}</td>
        <td>${escapeHtml(c.fullname)}</td>
        <td>${escapeHtml(c.region || '')}</td>
        <td>${escapeHtml(c.level || '')}</td>
        <td>${h !== '' ? escapeHtml(String(h)) : ''}</td>
        <td>${a !== '' ? escapeHtml(String(a)) : ''}</td>
        <td>${total !== '' ? escapeHtml(String(total)) : ''}</td>
      </tr>`;
    }
    tableHtml += '</tbody></table></body></html>';

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const filename = `results_${username}_${now.toISOString().slice(0,10)}.xls`;
    downloadBlob(blob, filename);
  }

  // Export ALL sheikhs in one file (grouped)
  async function exportAllSheikhs() {
    const sheikhsSnap = await firebase.database().ref('sheikhs').once('value');
    if (!sheikhsSnap.exists()) throw new Error('لا توجد شيوخ في قاعدة البيانات');
    const sheikhsObj = sheikhsSnap.val();
    const sheikhKeys = Object.keys(sheikhsObj);

    let tableHtml = `<html dir="rtl"><head><meta charset="utf-8">
      <style>table{border-collapse:collapse;width:100%;font-family:Tahoma,Arial;direction:rtl;}th,td{border:1px solid #ddd;padding:8px;text-align:right;}th{background:#f3f4f6;font-weight:800;}</style>
      </head><body>`;
    for (let idx=0; idx<sheikhKeys.length; idx++){
      const username = sheikhKeys[idx];
      const sheikh = sheikhsObj[username] || {};
      const [compsSnap, resultsSnap] = await Promise.all([
        firebase.database().ref(`competitors/${username}`).once('value'),
        firebase.database().ref(`results/${username}`).once('value')
      ]);
      const comps = [];
      if (compsSnap.exists()) {
        compsSnap.forEach(child => {
          const key = child.key;
          const val = child.val();
          let fullname = '';
          if (val == null) fullname = key;
          else if (typeof val === 'string') fullname = val;
          else fullname = (val.fullName || val.name || val.fullname || '');
          const region = (val && (val.region || val.area || val['المنطقة'])) || '';
          const level = (val && (val.level || val.levelName || val['مستوى'])) || '';
          comps.push({ key, fullname, region, level, raw: val });
        });
      }
      const resultsObj = resultsSnap.exists() ? resultsSnap.val() : {};

      tableHtml += `<h3 style="text-align:right;margin:20px 0 6px 0">الشيخ: ${escapeHtml(sheikh.name || username)} (${escapeHtml(username)})</h3>`;
      tableHtml += `<table><thead><tr><th>م</th><th>اسم المتسابق</th><th>المنطقة</th><th>مستوى الحفظ</th><th>حفظ /75</th><th>أحكام /25</th><th>الإجمالي</th></tr></thead><tbody>`;
      for (let i=0;i<comps.length;i++){
        const c = comps[i];
        const res = resultsObj && resultsObj[c.key] ? resultsObj[c.key] : {};
        const h = res && res.hifzScore != null ? res.hifzScore : '';
        const a = res && res.ahkamScore != null ? res.ahkamScore : '';
        const total = (h === '' && a === '') ? '' : (Number(h || 0) + Number(a || 0));
        tableHtml += `<tr>
          <td>${i+1}</td>
          <td>${escapeHtml(c.fullname)}</td>
          <td>${escapeHtml(c.region || '')}</td>
          <td>${escapeHtml(c.level || '')}</td>
          <td>${h !== '' ? escapeHtml(String(h)) : ''}</td>
          <td>${a !== '' ? escapeHtml(String(a)) : ''}</td>
          <td>${total !== '' ? escapeHtml(String(total)) : ''}</td>
        </tr>`;
      }
      tableHtml += `</tbody></table><div style="height:18px"></div>`;
    }
    tableHtml += '</body></html>';

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const filename = `results_all_sheikhs_${new Date().toISOString().slice(0,10)}.xls`;
    downloadBlob(blob, filename);
  }

  // Export sheikhs list (summary) as Excel
  async function exportSheikhsListExcel() {
    const sheikhsSnap = await firebase.database().ref('sheikhs').once('value');
    if (!sheikhsSnap.exists()) throw new Error('لا توجد شيوخ في قاعدة البيانات');
    const sheikhsObj = sheikhsSnap.val();
    const keys = Object.keys(sheikhsObj);

    // build rows with competitor counts
    const rows = await Promise.all(keys.map(async (username, idx) => {
      const s = sheikhsObj[username] || {};
      const compsSnap = await firebase.database().ref(`competitors/${username}`).once('value');
      const count = compsSnap.exists() ? Object.keys(compsSnap.val()).length : 0;
      return {
        idx: idx + 1,
        username,
        name: s.name || '',
        office: s.office || '',
        city: s.city || '',
        phone: s.phone || '',
        competitorsCount: count,
        raw: s
      };
    }));

    const now = new Date();
    let tableHtml = `
      <html dir="rtl"><head><meta charset="utf-8">
      <style>
        table{border-collapse:collapse;width:100%;font-family:Tahoma,Arial;direction:rtl;}
        th,td{border:1px solid #ddd;padding:8px;text-align:right;}
        th{background:#f3f4f6;font-weight:800;}
        caption{font-weight:800;margin-bottom:8px;text-align:right;}
      </style>
      </head><body>
      <table>
        <caption>قائمة الشيوخ المسجلين</caption>
        <thead>
          <tr>
            <th>م</th>
            <th>اسم الشيخ</th>
            <th>اسم المستخدم</th>
            <th>المكتب / المنصب</th>
            <th>المدينة</th>
            <th>الهاتف</th>
            <th>عدد المتسابقين</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const r of rows) {
      tableHtml += `<tr>
        <td>${escapeHtml(String(r.idx))}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.username)}</td>
        <td>${escapeHtml(r.office)}</td>
        <td>${escapeHtml(r.city)}</td>
        <td>${escapeHtml(r.phone)}</td>
        <td>${escapeHtml(String(r.competitorsCount))}</td>
      </tr>`;
    }

    tableHtml += `</tbody></table></body></html>`;

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const filename = `sheikhs_list_${now.toISOString().slice(0,10)}.xls`;
    downloadBlob(blob, filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

})();
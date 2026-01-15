// results.js — عرض متسابقين الشيوخ (competitors only)
// تعديل: عدم عرض حقول الملفات في واجهة الموقع، لكن تضمين حقول الملفات عند التصدير إلى Excel.
// يحتفظ بالتحميل عند الطلب، البحث، التصفّح، والتصدير.

document.addEventListener('DOMContentLoaded', () => {
  const pageNotice = document.getElementById('pageNotice');
  const sheikhsContainer = document.getElementById('sheikhsContainer');
  const controls = document.getElementById('controls');
  const welcomeBox = document.getElementById('welcomeBox');
  const requireLogin = document.getElementById('requireLogin');
  const gotoLoginBtn = document.getElementById('gotoLoginBtn');
  const exportAllBtn = document.getElementById('exportAllBtn');
  const refreshBtn = document.getElementById('refreshBtn');

  // panel elements
  const panelBackdrop = document.getElementById('panelBackdrop');
  const panel = document.getElementById('panel');
  const panelSheikhName = document.getElementById('panelSheikhName');
  const panelSheikhMeta = document.getElementById('panelSheikhMeta');
  const panelCloseBtn = document.getElementById('panelCloseBtn');
  const panelExportBtn = document.getElementById('panelExportBtn');
  const searchInput = document.getElementById('searchInput');
  const pageSizeSelect = document.getElementById('pageSizeSelect');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const pageIndicator = document.getElementById('pageIndicator');
  const panelCompetitorsWrap = document.getElementById('panelCompetitorsWrap');

  // helpers
  function esc(s){ if (s == null) return ''; return String(s).replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function escAttr(s){ return esc(s).replace(/"/g,'&quot;'); }
  function notice(msg, color){ if (!pageNotice) return; pageNotice.textContent = msg || ''; pageNotice.style.color = color || ''; }

  // Arabic labels mapping for common keys (extend as needed)
  const AR_LABELS = {
    name: 'الاسم',
    fullName: 'الاسم',
    fullname: 'الاسم',
    'full_name': 'الاسم',
    region: 'المنطقة',
    area: 'المنطقة',
    city: 'المدينة',
    office: 'المكتب / المنصب',
    address: 'العنوان',
    level: 'المستوى',
    levelName: 'المستوى',
    phone: 'الهاتف',
    mobile: 'الهاتف',
    phoneNumber: 'الهاتف',
    email: 'البريد الإلكتروني',
    'البريد': 'البريد الإلكتروني',
    age: 'العمر',
    birthDate: 'تاريخ الميلاد',
    birthdate: 'تاريخ الميلاد',
    createdAt: 'تاريخ الإنشاء',
    created_at: 'تاريخ الإنشاء',
    note: 'ملاحظات',
    notes: 'ملاحظات',
    school: 'المدرسة',
    class: 'الصف',
    guardian: 'ولي الأمر',
    relation: 'صلة القرابة'
  };

  // file-like key patterns
  const FILE_KEY_PATTERNS = [
    /file/i, /attachment/i, /attachments/i, /image/i, /photo/i,
    /picture/i, /\.pdf$/i, /pdf/i, /scan/i, /fileUrl/i, /files/i, /url$/i, /download/i
  ];
  function isFileKey(key){
    if (!key) return false;
    for (const re of FILE_KEY_PATTERNS){
      if (re.test(key)) return true;
    }
    return false;
  }

  // Session detection (SheikhSession.get() or localStorage fallback)
  function getSheikhSession() {
    try {
      if (window.SheikhSession && typeof SheikhSession.get === 'function') {
        const s = SheikhSession.get();
        if (s && s.username) return s;
      }
    } catch(e){}
    try {
      const s = JSON.parse(localStorage.getItem('sheikhSession') || 'null');
      if (s && s.username) return s;
    } catch(e){}
    return null;
  }

  // UI toggles
  function showRequireLogin(){ requireLogin.style.display = ''; controls.style.display = 'none'; sheikhsContainer.style.display = 'none'; }
  function showDashboardUI(session){ requireLogin.style.display = 'none'; controls.style.display = ''; sheikhsContainer.style.display = ''; welcomeBox.textContent = `مرحبًا، ${session.username} — افتح شيخًا لرؤية بيانات متسابقِيه (عرض فقط)`; }

  gotoLoginBtn && gotoLoginBtn.addEventListener('click', ()=> window.location.href='sheikh-login.html');
  exportAllBtn && exportAllBtn.addEventListener('click', () => exportAllSheikhsExcel().catch(e=>{console.error(e); notice('فشل التصدير','red');}));
  refreshBtn && refreshBtn.addEventListener('click', () => {
    const s = getSheikhSession();
    if (s && s.username) loadSheikhsSummary(s.username);
    else showRequireLogin();
  });

  // firebase check
  if (!window.firebase || !firebase.database) {
    notice('خطأ: Firebase غير مُهيأ. تأكد من تحميل main.js و firebase-database-compat.js', '#d9534f');
    showRequireLogin();
    return;
  }

  // require session
  const session = getSheikhSession();
  if (!session || !session.username) {
    showRequireLogin();
    notice('سجّل دخولك كشيخ مفوض في المتصفح لعرض متسابقيك.', '#d97706');
    return;
  }

  // load summary
  showDashboardUI(session);
  loadSheikhsSummary(session.username);

  // ---------- load sheikhs summary ----------
  async function loadSheikhsSummary(currentUsername) {
    notice('جاري جلب ملخص الشيوخ...', '#0b6cf6');
    sheikhsContainer.innerHTML = '';
    try {
      const sheikhsSnap = await firebase.database().ref('sheikhs').once('value');
      const sheikhsObj = sheikhsSnap.exists() ? sheikhsSnap.val() : {};

      let usernames = Object.keys(sheikhsObj);
      if (usernames.length === 0) {
        const compRoot = await firebase.database().ref('competitors').once('value');
        if (compRoot.exists()) usernames = Object.keys(compRoot.val());
      }
      if (!usernames || usernames.length === 0) {
        notice('لا توجد بيانات شيوخ أو متسابقين في قاعدة البيانات.', '#d97706');
        return;
      }

      const rows = await Promise.all(usernames.map(async uname => {
        const snap = await firebase.database().ref(`competitors/${uname}`).once('value');
        const count = snap.exists() ? Object.keys(snap.val()).length : 0;
        const meta = sheikhsObj[uname] || { username: uname };
        return { username: uname, count, meta };
      }));

      rows.sort((a,b)=>{
        if (a.username.toLowerCase() === currentUsername.toLowerCase()) return -1;
        if (b.username.toLowerCase() === currentUsername.toLowerCase()) return 1;
        const na = (a.meta.name || a.username), nb = (b.meta.name || b.username);
        return na.localeCompare(nb,'ar');
      });

      const frag = document.createDocumentFragment();
      for (const r of rows) {
        const card = document.createElement('div');
        card.className = 'sheikh-summary' + ((r.username.toLowerCase() === currentUsername.toLowerCase()) ? ' current' : '');
        card.innerHTML = `
          <div class="sheikh-top">
            <div>
              <div class="sheikh-name">${esc(r.meta.name || r.username)} ${r.username.toLowerCase() === currentUsername.toLowerCase() ? '<span style="color:var(--accent-2); font-weight:800; margin-left:6px;">(أنت)</span>' : ''}</div>
              <div class="sheikh-meta">${esc(r.meta.office || '')}${r.meta.city ? ' — ' + esc(r.meta.city) : ''}</div>
            </div>
            <div class="sheikh-actions">
              <div class="small-muted">المستخدم: <strong>${esc(r.username)}</strong></div>
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div class="small-muted">عدد المتسابقين: <strong>${r.count}</strong></div>
            <div style="display:flex; gap:8px;">
              <button class="btn-small open-panel" data-username="${escAttr(r.username)}">عرض المتسابقين</button>
              <button class="btn-small secondary export-summary" data-username="${escAttr(r.username)}">تنزيل Excel</button>
            </div>
          </div>
        `;
        frag.appendChild(card);
      }
      sheikhsContainer.appendChild(frag);
      notice('', '');
      sheikhsContainer.querySelectorAll('.open-panel').forEach(btn => {
        btn.addEventListener('click', () => {
          const username = btn.getAttribute('data-username');
          const meta = rows.find(x=>x.username === username)?.meta || {};
          openPanel(username, meta);
        });
      });
      sheikhsContainer.querySelectorAll('.export-summary').forEach(btn=>{
        btn.addEventListener('click', ()=> exportSheikhExcel(btn.getAttribute('data-username')));
      });

    } catch (err) {
      console.error(err);
      notice('فشل جلب الشيوخ: ' + (err.message || err), '#d9534f');
    }
  }

  // ---------- panel state & functions ----------
  let currentPanelState = { username:null, meta:null, comps:[], filtered:[], page:1, pageSize:25 };

  // format special fields
  function formatFieldValue(key, val) {
    if (val == null || val === '') return '';
    if (typeof val === 'number' && (key.toLowerCase().includes('created') || key.toLowerCase().includes('timestamp') || key.toLowerCase().includes('time'))) {
      try { return new Date(val).toLocaleString(); } catch(e){}
    }
    if (typeof val === 'string') {
      if ((key.toLowerCase().includes('date') || key.toLowerCase().includes('birth')) ) {
        const d = new Date(val);
        if (!isNaN(d)) return d.toLocaleDateString();
      }
    }
    if (typeof val === 'object') {
      try { return JSON.stringify(val); } catch(e){ return String(val); }
    }
    return String(val);
  }

  // helper to extract displayable file value (URL or filename)
  function extractFileValue(val) {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(item => extractFileValue(item)).filter(Boolean).join(' | ');
    if (typeof val === 'object') {
      // common keys that may hold url
      const candidates = ['url','downloadURL','fileUrl','link','path'];
      for (const k of candidates) {
        if (val[k]) return String(val[k]);
      }
      // if object contains name or filename
      for (const k of ['name','fileName','filename']) {
        if (val[k]) return String(val[k]);
      }
      // fallback to stringify small
      try { return JSON.stringify(val); } catch(e){ return String(val); }
    }
    return String(val);
  }

  async function openPanel(username, meta) {
    panelSheikhName.textContent = meta && (meta.name || meta.fullName) ? (meta.name || meta.fullName) : username;
    panelSheikhMeta.textContent = meta && (meta.office || meta.city) ? ((meta.office||'') + (meta.city ? ' — ' + meta.city : '')) : '';
    panelCompetitorsWrap.innerHTML = '<div class="small-muted">جاري تحميل بيانات المتسابقين من المسار competitors...</div>';
    panelBackdrop.style.display = 'flex';
    panelBackdrop.setAttribute('aria-hidden','false');

    currentPanelState = { username, meta: meta||{}, comps:[], filtered:[], page:1, pageSize: Number(pageSizeSelect.value||25) };
    panelExportBtn.onclick = () => exportSheikhExcel(username);

    try {
      const compsSnap = await firebase.database().ref(`competitors/${username}`).once('value');
      const comps = [];
      if (compsSnap.exists()) compsSnap.forEach(child=>{
        const key = child.key; const val = child.val();
        let fullname = '';
        if (val == null) fullname = key;
        else if (typeof val === 'string') fullname = val;
        else fullname = (val.fullName || val.name || val.fullname || '');
        fullname = fullname || key;
        const region = (val && (val.region || val.area || val['المنطقة'])) || '';
        const level = (val && (val.level || val.levelName || val['مستوى'])) || '';
        const raw = (typeof val === 'object' ? val : {});
        comps.push({ key, fullname, region, level, raw });
      });

      currentPanelState.comps = comps;
      currentPanelState.filtered = comps.slice();
      currentPanelState.page = 1;
      currentPanelState.pageSize = Number(pageSizeSelect.value||25);
      renderPanelList();
    } catch (err) {
      console.error(err);
      panelCompetitorsWrap.innerHTML = `<div class="small-muted">فشل تحميل المتسابقين: ${esc(err.message||err)}</div>`;
    }
  }

  panelCloseBtn && panelCloseBtn.addEventListener('click', closePanel);
  panelBackdrop && panelBackdrop.addEventListener('click', (ev) => { if (ev.target === panelBackdrop) closePanel(); });
  function closePanel(){ panelBackdrop.style.display = 'none'; panelBackdrop.setAttribute('aria-hidden','true'); panelCompetitorsWrap.innerHTML = ''; searchInput.value = ''; }

  // search & pagination handlers
  searchInput && searchInput.addEventListener('input', () => {
    const q = (searchInput.value || '').trim().toLowerCase();
    const comps = currentPanelState.comps || [];
    currentPanelState.filtered = q ? comps.filter(c => {
      if ((c.fullname || '').toLowerCase().includes(q)) return true;
      for (const v of Object.values(c.raw||{})) {
        if (v == null) continue;
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (s.toLowerCase().includes(q)) return true;
      }
      return false;
    }) : comps.slice();
    currentPanelState.page = 1;
    renderPanelList();
  });
  pageSizeSelect && pageSizeSelect.addEventListener('change', () => { currentPanelState.pageSize = Number(pageSizeSelect.value); currentPanelState.page = 1; renderPanelList(); });
  prevPageBtn && prevPageBtn.addEventListener('click', () => { if (currentPanelState.page>1) { currentPanelState.page--; renderPanelList(); } });
  nextPageBtn && nextPageBtn.addEventListener('click', () => { const totalPages = Math.max(1, Math.ceil((currentPanelState.filtered||[]).length/currentPanelState.pageSize)); if (currentPanelState.page<totalPages){ currentPanelState.page++; renderPanelList(); } });

  // compute dynamic keys for display (exclude file-like keys from UI)
  function computeExtraKeys(pageItems) {
    const exclude = new Set(['key','fullname','fullName','name','region','area','level','levelName','full','full_name']);
    const keys = new Set();
    for (const c of pageItems) {
      if (c.raw && typeof c.raw === 'object') {
        for (const k of Object.keys(c.raw)) {
          if (exclude.has(k)) continue;
          if (isFileKey(k)) continue; // SKIP file-like keys for UI
          keys.add(k);
        }
        if (c.raw.phone || c.raw.mobile || c.raw.الهاتف) keys.add('phone');
        if (c.raw.email || c.raw['البريد']) keys.add('email');
        if (c.raw.age || c.raw.Age) keys.add('age');
        if (c.raw.birthDate || c.raw.birthdate) keys.add('birthDate');
        if (c.raw.createdAt || c.raw.created_at) keys.add('createdAt');
      }
    }
    const preferred = ['phone','email','age','birthDate','createdAt'];
    const prefFound = preferred.filter(k => keys.has(k));
    const rest = Array.from(keys).filter(k => !preferred.includes(k)).sort();
    return prefFound.concat(rest).slice(0, 14);
  }

  function humanLabelForKey(k) {
    if (AR_LABELS[k]) return AR_LABELS[k];
    // detect file keys: label as "مرفق" or specific
    if (isFileKey(k)) {
      return 'مرفق';
    }
    const pretty = k.replace(/[_\-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    return pretty;
  }

  function renderPanelList(){
    const comps = currentPanelState.filtered || [];
    const pageSize = currentPanelState.pageSize || 25;
    const page = currentPanelState.page || 1;
    const total = comps.length;
    const totalPages = Math.max(1, Math.ceil(total/pageSize));
    const start = (page-1)*pageSize;
    const end = Math.min(total, start+pageSize);
    const pageItems = comps.slice(start,end);

    pageIndicator.textContent = `${page} / ${totalPages}`;
    if (total === 0) { panelCompetitorsWrap.innerHTML = `<div class="small-muted">لا يوجد متسابقين مطابقين للبحث.</div>`; return; }

    const extraKeys = computeExtraKeys(pageItems);

    // header
    const table = document.createElement('table');
    table.className = 'competitors-table';
    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');

    const headers = ['م','اسم المتسابق','المنطقة','المستوى', ...extraKeys.map(k => humanLabelForKey(k)) ];
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h;
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);

    const tbody = document.createElement('tbody');

    for (let i=0;i<pageItems.length;i++){
      const c = pageItems[i];
      const tr = document.createElement('tr');

      // fixed
      const idxTd = document.createElement('td');
      idxTd.setAttribute('data-label','م');
      idxTd.innerHTML = `<span class="cell-value">${start + i + 1}</span>`;
      tr.appendChild(idxTd);

      const nameTd = document.createElement('td');
      nameTd.setAttribute('data-label','اسم المتسابق');
      nameTd.innerHTML = `<span class="cell-value">${esc(c.fullname)}</span>`;
      tr.appendChild(nameTd);

      const regionTd = document.createElement('td');
      regionTd.setAttribute('data-label','المنطقة');
      regionTd.innerHTML = `<span class="cell-value">${esc(c.region || '')}</span>`;
      tr.appendChild(regionTd);

      const levelTd = document.createElement('td');
      levelTd.setAttribute('data-label','المستوى');
      levelTd.innerHTML = `<span class="cell-value">${esc(c.level || '')}</span>`;
      tr.appendChild(levelTd);

      // dynamic extras (excluding files)
      for (const key of extraKeys) {
        const td = document.createElement('td');
        td.setAttribute('data-label', humanLabelForKey(key));
        let val = '';
        if (key === 'phone') {
          val = (c.raw && (c.raw.phone || c.raw.mobile || c.raw.الهاتف)) || '';
        } else if (key === 'email') {
          val = (c.raw && (c.raw.email || c.raw['البريد'])) || '';
        } else {
          val = (c.raw && (c.raw[key] !== undefined ? c.raw[key] : '')) || '';
        }
        td.innerHTML = `<span class="cell-value">${esc(formatFieldValue(key, val))}</span>`;
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    panelCompetitorsWrap.innerHTML = '';
    panelCompetitorsWrap.appendChild(table);
  }

  // ---------- Export functions (include file fields in export) ----------
  async function exportSheikhExcel(username) {
    notice(`��اري تصدير بيانات المتسابقين للشيخ ${username}...`, '#0b6cf6');
    const compsSnap = await firebase.database().ref(`competitors/${username}`).once('value');
    const comps = [];
    if (compsSnap.exists()) {
      compsSnap.forEach(child=>{
        const key = child.key; const val = child.val();
        let fullname = '';
        if (val == null) fullname = key;
        else if (typeof val === 'string') fullname = val;
        else fullname = (val.fullName || val.name || val.fullname || '');
        const region = (val && (val.region || val.area || val['المنطقة'])) || '';
        const level = (val && (val.level || val.levelName || val['مستوى'])) || '';
        const raw = (typeof val === 'object' ? val : {});
        comps.push({ key, fullname: fullname||key, region, level, raw });
      });
    }

    // collect both normal extra keys and file keys (for export)
    const normalKeys = new Set();
    const fileKeys = new Set();
    for (const c of comps) {
      if (c.raw && typeof c.raw === 'object') {
        for (const k of Object.keys(c.raw)) {
          if (['fullName','name','fullname','region','area','level','levelName'].includes(k)) continue;
          if (isFileKey(k)) fileKeys.add(k);
          else normalKeys.add(k);
        }
        if (c.raw.phone || c.raw.mobile || c.raw.الهاتف) normalKeys.add('phone');
        if (c.raw.email || c.raw['البريد']) normalKeys.add('email');
        if (c.raw.age) normalKeys.add('age');
        if (c.raw.birthDate || c.raw.birthdate) normalKeys.add('birthDate');
        if (c.raw.createdAt || c.raw.created_at) normalKeys.add('createdAt');
      }
    }

    const preferred = ['phone','email','age','birthDate','createdAt'];
    const orderedNormal = preferred.filter(k=>normalKeys.has(k)).concat(Array.from(normalKeys).filter(k=>!preferred.includes(k)));
    const orderedFileKeys = Array.from(fileKeys); // no specific order required

    // build export header including file columns at the end
    const now = new Date();
    let html = `<html dir="rtl"><head><meta charset="utf-8"><style>table{border-collapse:collapse;width:100%;font-family:Tahoma,Arial;direction:rtl;}th,td{border:1px solid #ddd;padding:8px;text-align:right;}th{background:#f3f4f6;font-weight:800;}</style></head><body>`;
    html += `<table><caption style="text-align:right;font-weight:800;margin-bottom:8px">متسابقو الشيخ: ${esc(username)}</caption><thead><tr><th>م</th><th>اسم المتسابق</th><th>المنطقة</th><th>المستوى</th>`;
    for (const k of orderedNormal) html += `<th>${esc(humanLabelForKey(k))}</th>`;
    for (const fk of orderedFileKeys) html += `<th>${esc(humanLabelForKey(fk))}</th>`;
    html += `</tr></thead><tbody>`;

    for (let i=0;i<comps.length;i++){
      const c = comps[i];
      html += `<tr><td>${i+1}</td><td>${esc(c.fullname)}</td><td>${esc(c.region)}</td><td>${esc(c.level)}</td>`;
      for (const k of orderedNormal) {
        let v = '';
        if (k === 'phone') v = (c.raw && (c.raw.phone || c.raw.mobile || c.raw.الهاتف)) || '';
        else if (k === 'email') v = (c.raw && (c.raw.email || c.raw['البريد'])) || '';
        else v = (c.raw && c.raw[k] !== undefined ? c.raw[k] : '');
        html += `<td>${esc(formatFieldValue(k, v))}</td>`;
      }
      for (const fk of orderedFileKeys) {
        const val = c.raw && c.raw[fk] !== undefined ? c.raw[fk] : '';
        const fv = extractFileValue(val);
        html += `<td>${esc(fv)}</td>`;
      }
      html += `</tr>`;
    }

    html += `</tbody></table></body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const filename = `competitors_${username}_${now.toISOString().slice(0,10)}.xls`;
    downloadBlob(blob, filename);
    notice('تم التصدير', 'green');
  }

  async function exportAllSheikhsExcel() {
    notice('جاري توليد ملف Excel لجميع الشيوخ (بيانات المتسابقين فقط)...', '#0b6cf6');
    const sheikhsSnap = await firebase.database().ref('sheikhs').once('value');
    const sheikhsObj = sheikhsSnap.exists() ? sheikhsSnap.val() : {};
    let keys = Object.keys(sheikhsObj);
    if (keys.length === 0) {
      const compRoot = await firebase.database().ref('competitors').once('value');
      if (compRoot.exists()) keys = Object.keys(compRoot.val());
    }
    const now = new Date();
    let html = `<html dir="rtl"><head><meta charset="utf-8"><style>table{border-collapse:collapse;width:100%;font-family:Tahoma,Arial;direction:rtl;}th,td{border:1px solid #ddd;padding:8px;text-align:right;}th{background:#f3f4f6;font-weight:800;}</style></head><body>`;

    for (let idx=0; idx<keys.length; idx++){
      const username = keys[idx];
      const sheikh = sheikhsObj[username] || {};
      const compsSnap = await firebase.database().ref(`competitors/${username}`).once('value');
      const comps = [];
      if (compsSnap.exists()) {
        compsSnap.forEach(child=>{
          const key = child.key; const val = child.val();
          let fullname = '';
          if (val == null) fullname = key;
          else if (typeof val === 'string') fullname = val;
          else fullname = (val.fullName || val.name || val.fullname || '');
          const region = (val && (val.region || val.area || val['المنطقة'])) || '';
          const level = (val && (val.level || val.levelName || val['مستوى'])) || '';
          const raw = (typeof val === 'object' ? val : {});
          comps.push({ key, fullname, region, level, raw });
        });
      }

      // compute ordered extras incl. files for this sheikh
      const normal = new Set();
      const files = new Set();
      for (const c of comps) {
        if (c.raw && typeof c.raw === 'object') {
          for (const k of Object.keys(c.raw)) {
            if (['fullName','name','fullname','region','area','level','levelName'].includes(k)) continue;
            if (isFileKey(k)) files.add(k);
            else normal.add(k);
          }
          if (c.raw.phone || c.raw.mobile || c.raw.الهاتف) normal.add('phone');
          if (c.raw.email || c.raw['البريد']) normal.add('email');
          if (c.raw.age) normal.add('age');
          if (c.raw.birthDate || c.raw.birthdate) normal.add('birthDate');
          if (c.raw.createdAt || c.raw.created_at) normal.add('createdAt');
        }
      }
      const preferred = ['phone','email','age','birthDate','createdAt'];
      const orderedNormal = preferred.filter(k=>normal.has(k)).concat(Array.from(normal).filter(k=>!preferred.includes(k)));
      const orderedFiles = Array.from(files);

      html += `<h3 style="text-align:right;margin:18px 0 6px 0">الشيخ: ${esc(sheikh.name||username)} (${esc(username)})</h3>`;
      html += `<table><thead><tr><th>م</th><th>اسم المتسابق</th><th>المنطقة</th><th>المستوى</th>`;
      for (const k of orderedNormal) html += `<th>${esc(humanLabelForKey(k))}</th>`;
      for (const fk of orderedFiles) html += `<th>${esc(humanLabelForKey(fk))}</th>`;
      html += `</tr></thead><tbody>`;

      for (let i=0;i<comps.length;i++){
        const c = comps[i];
        html += `<tr><td>${i+1}</td><td>${esc(c.fullname)}</td><td>${esc(c.region||'')}</td><td>${esc(c.level||'')}</td>`;
        for (const k of orderedNormal) {
          let v = '';
          if (k === 'phone') v = (c.raw && (c.raw.phone || c.raw.mobile || c.raw.الهاتف)) || '';
          else if (k === 'email') v = (c.raw && (c.raw.email || c.raw['البريد'])) || '';
          else v = (c.raw && c.raw[k] !== undefined ? c.raw[k] : '');
          html += `<td>${esc(formatFieldValue(k, v))}</td>`;
        }
        for (const fk of orderedFiles) {
          const val = c.raw && c.raw[fk] !== undefined ? c.raw[fk] : '';
          const fv = extractFileValue(val);
          html += `<td>${esc(fv)}</td>`;
        }
        html += `</tr>`;
      }

      html += `</tbody></table>`;
    }

    html += '</body></html>';

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const filename = `competitors_all_sheikhs_${now.toISOString().slice(0,10)}.xls`;
    downloadBlob(blob, filename);
    notice('تم تنزيل ملف Excel لجميع الشيوخ (بيانات المتسابقين فقط)', 'green');
  }

  // helpers used in exports
  function humanLabelForKey(k) {
    if (AR_LABELS[k]) return AR_LABELS[k];
    if (isFileKey(k)) return 'مرفق';
    const pretty = k.replace(/[_\-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    return pretty;
  }

  function extractFileValue(val) {
    if (!val && val !== 0) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(item => extractFileValue(item)).filter(Boolean).join(' | ');
    if (typeof val === 'object') {
      const candidates = ['url','downloadURL','fileUrl','link','path','value'];
      for (const k of candidates) {
        if (val[k]) return String(val[k]);
      }
      for (const k of ['name','fileName','filename']) {
        if (val[k]) return String(val[k]);
      }
      try { return JSON.stringify(val); } catch(e){ return String(val); }
    }
    return String(val);
  }

  function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

});

//name=judges.js
// judges.js — صفحة التحكيم
// التعديلات المطلوبة:
// - أضف فلتر للمستويات (levelFilter) يعمل مع فلتر المناطق معاً.
// - أبقى إمكانية التعديل على الدرجات بعد الحفظ (يمكن تعديل الحفظ لاحقًا).
// - احتفظت بباقي الميزات: تسجيل الدخول للمحكم، البحث، التصفح، تمييز "مقيّم".

(function(){
  const JUDGES = [
{ username:'ziad', password:'123456' },
{ username:'admin01', password:'202601' },
{ username:'admin02', password:'202602' },
{ username:'admin03', password:'202603' },
{ username:'admin04', password:'202604' },
{ username:'admin05', password:'202605' },
{ username:'admin06', password:'202606' },
{ username:'admin07', password:'202607' },
{ username:'admin08', password:'202608' },
{ username:'admin09', password:'202609' },
{ username:'admin10', password:'202610' },
{ username:'admin11', password:'202611' },
{ username:'admin12', password:'202612' },
{ username:'admin13', password:'202613' },
{ username:'admin14', password:'202614' },
{ username:'admin15', password:'202615' },
{ username:'admin16', password:'202616' },
{ username:'admin17', password:'202617' },
{ username:'admin18', password:'202618' },
{ username:'admin19', password:'202619' },
{ username:'admin20', password:'202620' }
  ];

  // DOM
  const loginCard = document.getElementById('loginCard');
  const loginForm = document.getElementById('judgeLoginForm');
  const usernameInput = document.getElementById('judgeUsername');
  const passwordInput = document.getElementById('judgePassword');
  const loginNotice = document.getElementById('loginNotice');

  const panelCard = document.getElementById('panelCard');
  const judgeWelcome = document.getElementById('judgeWelcome');
  const logoutBtn = document.getElementById('logoutBtn');

  const searchGlobal = document.getElementById('searchGlobal');
  const regionFilter = document.getElementById('regionFilter');
  const levelFilter = document.getElementById('levelFilter');
  const competitorsWrap = document.getElementById('competitorsWrap');
  const listNotice = document.getElementById('listNotice');
  const pageSizeSelect = document.getElementById('pageSize');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const pageInfo = document.getElementById('pageInfo');

  // modal
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalClose = document.getElementById('modalClose');
  const modalCancel = document.getElementById('modalCancel');
  const competitorInfo = document.getElementById('competitorInfo');
  const hifzInput = document.getElementById('hifzInput');
  const ahkamInput = document.getElementById('ahkamInput');
  const totalScoreEl = document.getElementById('totalScore');
  const saveBtn = document.getElementById('saveBtn');
  const saveNotice = document.getElementById('saveNotice');

  // state
  const SESSION_KEY = 'judgeSession';
  let currentJudge = null;
  let allCompetitors = []; // { sheikh, key, fullname, nid, region, level, raw, evaluated }
  let filtered = [];
  let page = 1;
  let pageSize = Number(pageSizeSelect.value || 25);
  let currentSelection = null; // { sheikh, key, fullname, raw }

  // helpers
  function setSession(obj){ try { localStorage.setItem(SESSION_KEY, JSON.stringify(obj)); }catch(e){} }
  function getSession(){ try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch(e){ return null; } }
  function clearSession(){ try { localStorage.removeItem(SESSION_KEY); } catch(e){} }
  function esc(s){ if (s == null) return ''; return String(s).replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function escAttr(s){ return esc(s).replace(/"/g,'&quot;'); }
  function notice(el, msg, color){ if (!el) return; el.textContent = msg || ''; el.style.color = color || ''; }

  // ensure firebase available
  if (!window.firebase || !firebase.database) {
    notice(loginNotice, 'خطأ: Firebase غير مهيأ. تأكد من تحميل main.js و firebase-database-compat.js', 'red');
  }

  // init
  (function init(){
    const s = getSession();
    if (s && s.username) {
      currentJudge = s;
      onLoggedIn();
    } else {
      showLogin();
    }
  })();

  function showLogin(){ loginCard.style.display='block'; panelCard.style.display='none'; }
  function showPanel(){ loginCard.style.display='none'; panelCard.style.display='block'; }

  // login
  loginForm && loginForm.addEventListener('submit', (ev)=>{
    ev.preventDefault();
    notice(loginNotice,'');
    const u = (usernameInput.value||'').trim();
    const p = (passwordInput.value||'');
    if (!u || !p) { notice(loginNotice,'أدخل اسم المستخدم وكلمة المرور','red'); return; }
    const found = JUDGES.find(j => j.username === u && j.password === p);
    if (!found) { notice(loginNotice,'اسم المستخدم أو كلمة المرور غير صحيح','red'); return; }
    currentJudge = { username: found.username };
    setSession(currentJudge);
    usernameInput.value = ''; passwordInput.value = '';
    onLoggedIn();
  });

  logoutBtn && logoutBtn.addEventListener('click', ()=> {
    clearSession();
    currentJudge = null;
    allCompetitors = [];
    filtered = [];
    competitorsWrap.innerHTML = '';
    modalBackdrop.style.display = 'none';
    showLogin();
  });

  // Load all competitors (metadata) and extract region & level list
  async function onLoggedIn(){
    showPanel();
    judgeWelcome.textContent = `مسجل الدخول كمحكم: ${currentJudge.username}`;
    listNotice.textContent = 'جاري جلب قائمة المتسابقين...';
    competitorsWrap.innerHTML = '';

    try {
      const sheikhsSnap = await firebase.database().ref('sheikhs').once('value');
      const sheikhsObj = sheikhsSnap.exists() ? sheikhsSnap.val() : {};
      let sheikhUsernames = Object.keys(sheikhsObj);
      if (sheikhUsernames.length === 0) {
        const compRoot = await firebase.database().ref('competitors').once('value');
        if (compRoot.exists()) sheikhUsernames = Object.keys(compRoot.val());
      }

      const promises = sheikhUsernames.map(async s => {
        const snap = await firebase.database().ref(`competitors/${s}`).once('value');
        const list = [];
        if (snap.exists()) {
          snap.forEach(child=>{
            const key = child.key;
            const val = child.val();
            let fullname = '';
            if (val == null) fullname = key;
            else if (typeof val === 'string') fullname = val;
            else fullname = (val.fullName || val.name || val.fullname || '');
            fullname = fullname || key;
            let nid = '';
            if (val && typeof val === 'object') {
              nid = val.nationalId || val.nid || val.national_id || val['الرقم القومي'] || val.nationalNumber || '';
            }
            const region = val && (val.region || val.area || val['المنطقة']) ? (val.region || val.area || val['المنطقة']) : '';
            const level = val && (val.level || val.levelName || val['مستوى']) ? (val.level || val.levelName || val['مستوى']) : '';
            list.push({ sheikh: s, key, fullname, nid, region, level, raw: (typeof val==='object'?val:{}), evaluated: false });
          });
        }
        return list;
      });

      const nested = await Promise.all(promises);
      allCompetitors = nested.flat();
      allCompetitors.sort((a,b)=> (a.fullname||'').localeCompare(b.fullname||'', 'ar'));

      // prepare region filter options (distinct)
      const regions = Array.from(new Set(allCompetitors.map(c=> (c.region||'').trim()).filter(Boolean))).sort((a,b)=> a.localeCompare(b,'ar'));
      populateRegionFilter(regions);

      // prepare level filter options (distinct)
      const levels = Array.from(new Set(allCompetitors.map(c=> (c.level||'').trim()).filter(Boolean))).sort((a,b)=> a.localeCompare(b,'ar'));
      populateLevelFilter(levels);

      // check evaluated status for first page to show immediate badges (and optionally more)
      filtered = allCompetitors.slice();
      page = 1; pageSize = Number(pageSizeSelect.value || 25);
      await renderList(); // now async
      listNotice.textContent = '';
    } catch (err) {
      console.error(err);
      listNotice.textContent = 'فشل جلب المتسابقين — تأكد من الاتصال';
    }
  }

  function populateRegionFilter(regions){
    // clear existing except the first option
    regionFilter.innerHTML = '<option value="">كل المناطق</option>';
    regions.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      regionFilter.appendChild(opt);
    });
  }

  function populateLevelFilter(levels){
    levelFilter.innerHTML = '<option value="">كل المستويات</option>';
    levels.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l;
      opt.textContent = l;
      levelFilter.appendChild(opt);
    });
  }

  // Render list (async because we check evaluated state for visible page)
  async function renderList(){
    competitorsWrap.innerHTML = '';
    if (!filtered || filtered.length === 0) {
      competitorsWrap.innerHTML = `<div class="muted">لا توجد نتائج.</div>`;
      pageInfo.textContent = '0 / 0';
      return;
    }
    pageSize = Number(pageSizeSelect.value || 25);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    const start = (page-1)*pageSize;
    const end = Math.min(filtered.length, start + pageSize);
    const pageItems = filtered.slice(start, end);

    // ensure evaluated flags for page items by checking DB
    await checkEvaluatedForPage(pageItems);

    // build table without showing sheikh
    const table = document.createElement('table');
    table.className = 'table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>
      <th>م</th><th>اسم المتسابق</th><th>الرقم القومي</th><th>المنطقة</th><th>المستوى</th><th>إجراءات</th>
    </tr>`;
    const tbody = document.createElement('tbody');

    for (let i=0;i<pageItems.length;i++){
      const c = pageItems[i];
      const tr = document.createElement('tr');
      if (c.evaluated) tr.classList.add('evaluated');

      // create the cells; on mobile "الرقم القومي" and "المنطقة" hidden by CSS
      // Note: grade button remains enabled to allow editing even if evaluated
      tr.innerHTML = `
        <td data-label="م">${start + i + 1}</td>
        <td data-label="اسم المتسابق">${esc(c.fullname)} ${c.evaluated ? '<span class="evaluated-badge">مقيّم</span>' : ''}</td>
        <td data-label="الرقم القومي">${esc(c.nid || '')}</td>
        <td data-label="المنطقة">${esc(c.region || '')}</td>
        <td data-label="المستوى">${esc(c.level || '')}</td>
        <td data-label="إجراءات"><button class="btn-small gradeBtn" data-sheikh="${escAttr(c.sheikh)}" data-key="${escAttr(c.key)}">تقييم</button></td>
      `;
      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    competitorsWrap.appendChild(table);
    pageInfo.textContent = `${page} / ${totalPages}`;

    // attach click handlers
    competitorsWrap.querySelectorAll('.gradeBtn').forEach(b=>{
      b.addEventListener('click', () => {
        const sheikh = b.getAttribute('data-sheikh');
        const key = b.getAttribute('data-key');
        openGradingModal(sheikh, key);
      });
    });
  }

  // check evaluated status for visible page items
  async function checkEvaluatedForPage(pageItems){
    if (!pageItems || pageItems.length === 0) return;
    const checks = pageItems.map(async (item) => {
      try {
        const snap = await firebase.database().ref(`scores/${item.sheikh}/${item.key}`).once('value');
        const val = snap.exists() ? snap.val() : null;
        // treated evaluated if there is a stored score
        item.evaluated = !!(val && (typeof val.hifzScore !== 'undefined' || typeof val.ahkamScore !== 'undefined'));
        const master = allCompetitors.find(a=>a.sheikh===item.sheikh && a.key===item.key);
        if (master) master.evaluated = item.evaluated;
      } catch (err) {
        console.error('checkEvaluated error', err);
      }
    });
    await Promise.all(checks);
  }

  // search & filters handlers
  searchGlobal && searchGlobal.addEventListener('input', debounce(applyFilters, 200));
  regionFilter && regionFilter.addEventListener('change', () => { page = 1; applyFilters(); });
  levelFilter && levelFilter.addEventListener('change', () => { page = 1; applyFilters(); });

  function applyFilters(){
    const q = (searchGlobal.value || '').trim().toLowerCase();
    const region = (regionFilter.value || '').trim();
    const level = (levelFilter.value || '').trim();
    filtered = allCompetitors.filter(c => {
      if (region && (c.region || '').trim() !== region) return false;
      if (level && (c.level || '').trim() !== level) return false;
      if (!q) return true;
      if ((c.fullname||'').toLowerCase().includes(q)) return true;
      if ((c.nid||'').toLowerCase().includes(q)) return true;
      for (const v of Object.values(c.raw || {})) {
        if (v == null) continue;
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (s.toLowerCase().includes(q)) return true;
      }
      return false;
    });
    page = 1;
    renderList();
  }

  pageSizeSelect && pageSizeSelect.addEventListener('change', ()=> { page = 1; renderList(); });
  prevBtn && prevBtn.addEventListener('click', ()=> { if (page>1) { page--; renderList(); } });
  nextBtn && nextBtn.addEventListener('click', ()=> {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page < totalPages) { page++; renderList(); }
  });

  function debounce(fn, ms=200){ let t; return function(...a){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,a), ms); }; }

  // grading modal logic: open, load existing (if any), allow save (and re-save/edit) multiple times
  async function openGradingModal(sheikh, compKey){
    const comp = allCompetitors.find(x => x.sheikh === sheikh && x.key === compKey);
    if (!comp) { alert('المتسابق غير موجود'); return; }
    currentSelection = { sheikh, key: compKey, fullname: comp.fullname, raw: comp.raw };

    competitorInfo.innerHTML = `
      <div><strong>الاسم:</strong> ${esc(comp.fullname)}</div>
      <div><strong>الرقم القومي:</strong> ${esc(comp.nid || '')}</div>
      <div class="small-muted" style="margin-top:6px">أدخل درجتي الحفظ والأحكام ثم اضغط حفظ. يمكنك تعديل الدرجات لاحقًا إذا احتجت.</div>
    `;

    saveNotice.textContent = 'جاري جلب الدرجة إن وُجدت...';
    saveNotice.style.color = ''; // reset color
    try {
      const snap = await firebase.database().ref(`scores/${sheikh}/${compKey}`).once('value');
      const existing = snap.exists() ? snap.val() : null;
      const h = existing && existing.hifzScore != null ? existing.hifzScore : '';
      const a = existing && existing.ahkamScore != null ? existing.ahkamScore : '';
      hifzInput.value = (h !== '' ? h : '');
      ahkamInput.value = (a !== '' ? a : '');
      totalScoreEl.textContent = ((Number(h||0) + Number(a||0)) || 0);

      // Do NOT block editing even if previously finalized — allow corrections.
      if (existing) {
        saveNotice.textContent = `يوجد سجل سابق محفوظ بواسطة ${existing.gradedBy || '—'}. يمكنك تعديله وحفظ مرة أخرى.`;
        saveNotice.style.color = '';
      } else {
        saveNotice.textContent = 'لا توجد درجات سابقة';
        saveNotice.style.color = '';
      }

      // enable inputs and save button for editing
      hifzInput.disabled = false;
      ahkamInput.disabled = false;
      saveBtn.disabled = false;
      hifzInput.required = true;
      ahkamInput.required = true;

      modalBackdrop.style.display = 'flex';
      // focus first empty input
      if (!hifzInput.value) hifzInput.focus();
      else if (!ahkamInput.value) ahkamInput.focus();
    } catch (err) {
      console.error(err);
      saveNotice.textContent = 'فشل جلب الدرجة السابقة';
      saveNotice.style.color = 'red';
      modalBackdrop.style.display = 'flex';
      hifzInput.required = true;
      ahkamInput.required = true;
      hifzInput.disabled = false;
      ahkamInput.disabled = false;
      saveBtn.disabled = false;
    }
  }

  function closeModal(){ modalBackdrop.style.display = 'none'; saveNotice.textContent = ''; saveNotice.style.color=''; hifzInput.value=''; ahkamInput.value=''; totalScoreEl.textContent='0'; currentSelection = null; }

  modalClose && modalClose.addEventListener('click', closeModal);
  modalCancel && modalCancel.addEventListener('click', closeModal);
  modalBackdrop && modalBackdrop.addEventListener('click', (ev)=> { if (ev.target === modalBackdrop) closeModal(); });

  // live total
  function updateTotal(){ const h = Number(hifzInput.value||0); const a = Number(ahkamInput.value||0); totalScoreEl.textContent = ( (Number.isFinite(h)?h:0) + (Number.isFinite(a)?a:0) ); }
  hifzInput && hifzInput.addEventListener('input', ()=> { let v = Number(hifzInput.value||0); if (isNaN(v)) v = 0; if (v<0) v=0; if (v>75) v=75; hifzInput.value = String(Math.trunc(v)); updateTotal(); });
  ahkamInput && ahkamInput.addEventListener('input', ()=> { let v = Number(ahkamInput.value||0); if (isNaN(v)) v = 0; if (v<0) v=0; if (v>25) v=25; ahkamInput.value = String(Math.trunc(v)); updateTotal(); });

  // Save: write to scores/{sheikh}/{compKey} and allow future edits
  saveBtn && saveBtn.addEventListener('click', async ()=>{
    if (!currentSelection) return;
    // validate required fields (do not allow empty)
    if (!hifzInput.value || String(hifzInput.value).trim() === '') {
      saveNotice.textContent = 'يجب إدخال درجة الحفظ قبل الحفظ.';
      saveNotice.style.color = 'red';
      hifzInput.focus();
      return;
    }
    if (!ahkamInput.value || String(ahkamInput.value).trim() === '') {
      saveNotice.textContent = 'يجب إدخال درجة الأحكام قبل الحفظ.';
      saveNotice.style.color = 'red';
      ahkamInput.focus();
      return;
    }

    const sheikh = currentSelection.sheikh;
    const key = currentSelection.key;
    const h = Number(hifzInput.value);
    const a = Number(ahkamInput.value);

    if (!Number.isFinite(h) || h < 0 || h > 75) { saveNotice.textContent = 'قيمة الحفظ يجب أن تكون عددًا بين 0 و 75'; saveNotice.style.color='red'; hifzInput.focus(); return; }
    if (!Number.isFinite(a) || a < 0 || a > 25) { saveNotice.textContent = 'قيمة الأحكام يجب أن تكون عددًا بين 0 و 25'; saveNotice.style.color='red'; ahkamInput.focus(); return; }

    const payload = {
      hifzScore: h,
      ahkamScore: a,
      total: (h + a),
      gradedBy: currentJudge.username,
      gradedAt: firebase.database.ServerValue.TIMESTAMP
      // do not set a permanent finalized flag that blocks edits — we allow re-saving
    };

    saveNotice.textContent = 'جاري الحفظ...';
    saveNotice.style.color = '';
    try {
      await firebase.database().ref(`scores/${sheikh}/${key}`).set(payload);
      saveNotice.textContent = 'تم الحفظ. يمكنك تعديل الدرجات لاحقًا إذا لزم.';
      saveNotice.style.color = 'green';
      // keep inputs enabled to allow corrections
      hifzInput.disabled = false;
      ahkamInput.disabled = false;
      saveBtn.disabled = false;

      // update master list state: mark evaluated
      const master = allCompetitors.find(a=>a.sheikh===sheikh && a.key===key);
      if (master) { master.evaluated = true; }
      // re-render current page to show badge (and keep button enabled)
      await renderList();
    } catch (err) {
      console.error(err);
      saveNotice.textContent = 'فشل الحفظ';
      saveNotice.style.color = 'red';
    }
  });

})();
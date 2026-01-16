// competitors.js
// - تجميع المتسابقين حسب الشيخ (مجموعات قابلة للطي).
// - فتح الصورة بالنقر على الصورة (thumb) فقط.
// - نافذة معاينة بالصورة تدعم التكبير/التصغير والتمرير (pan) بالماوس واللمس (drag & pinch).

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const pageSizeSelect = document.getElementById('pageSize');
  const tableWrap = document.getElementById('tableWrap');
  const listNotice = document.getElementById('listNotice');

  // modal elements for zoom/pan
  const imgModal = document.getElementById('imgModal');
  const modalImg = document.getElementById('modalImg');
  const imgClose = document.getElementById('imgClose');
  const zoomInBtn = document.getElementById('imgZoomIn');
  const zoomOutBtn = document.getElementById('imgZoomOut');
  const zoomResetBtn = document.getElementById('imgZoomReset');
  const modalCaption = document.getElementById('modalCaption');
  const modalImageWrap = document.getElementById('modalImageWrap');

  let allCompetitors = [];
  let filtered = [];
  let zoomLevel = 1;
  let translate = { x: 0, y: 0 };
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let lastTouchDist = null;
  let initialZoom = 1;

  function esc(s){ if (s == null) return ''; return String(s).replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
  function showNotice(msg, color){ if (!listNotice) return; listNotice.textContent = msg || ''; listNotice.style.color = color || ''; }

  async function ensureAnonymousAuth(){
    if (!window.firebase || !firebase.auth) return false;
    try{
      if (firebase.auth().currentUser) return true;
      await firebase.auth().signInAnonymously();
      return true;
    }catch(e){
      console.warn('Anonymous auth failed', e);
      return false;
    }
  }

  function collectImages(val){
    const imgs = [];
    if (!val || typeof val !== 'object') return imgs;
    if (val.files && typeof val.files === 'object'){
      if (val.files.photoFileUrl) imgs.push(val.files.photoFileUrl);
      if (val.files.birthFileUrl) imgs.push(val.files.birthFileUrl);
      if (val.files.extraFileUrl) imgs.push(val.files.extraFileUrl);
    }
    ['photoUrl','photo','birthFile','image','img'].forEach(k=>{
      if (val[k]) imgs.push(val[k]);
    });
    return Array.from(new Set(imgs.filter(Boolean)));
  }

  function flattenCompetitors(snapshotObj){
    const list = [];
    if (!snapshotObj) return list;
    Object.keys(snapshotObj).forEach(sheikh => {
      const comps = snapshotObj[sheikh] || {};
      Object.keys(comps).forEach(key => {
        const val = comps[key] || {};
        const fullname = val.fullName || val.name || val.fullname || key;
        const birth = val.birthDate || val.birth || val.dob || '';
        const level = val.level || val.levelName || val['مستوى'] || '';
        const imgs = collectImages(val);
        list.push({ sheikh, key, fullname, birth, level, imgs, raw: val });
      });
    });
    return list;
  }

  async function loadSheikhsMap(){
    try{
      const snap = await firebase.database().ref('sheikhs').once('value');
      return snap.exists() ? snap.val() : {};
    }catch(e){
      console.warn('loadSheikhsMap error', e);
      return {};
    }
  }

  async function loadCompetitors(){
    showNotice('جاري تحميل المتسابقين...', '#0b6cf6');
    tableWrap.innerHTML = '';
    try{ await ensureAnonymousAuth(); } catch(e){}
    if (!window.firebase || !firebase.database){
      showNotice('خطأ: Firebase غير مهيأ.', '#d9534f'); return;
    }
    try{
      const [compSnap, sheikhsObj] = await Promise.all([
        firebase.database().ref('competitors').once('value'),
        loadSheikhsMap()
      ]);
      const compsObj = compSnap.exists() ? compSnap.val() : null;
      allCompetitors = flattenCompetitors(compsObj);
      allCompetitors.forEach(c => {
        const s = sheikhsObj && sheikhsObj[c.sheikh];
        c.sheikhName = (s && (s.name || s.title)) ? (s.name || s.title) : c.sheikh;
      });
      allCompetitors.sort((a,b)=>{
        const sa = (a.sheikhName||'').localeCompare(b.sheikhName||'', 'ar');
        if (sa !== 0) return sa;
        return (a.fullname||'').localeCompare(b.fullname||'', 'ar');
      });
      filtered = allCompetitors.slice();
      renderGroups();
      showNotice('');
    }catch(err){
      console.error(err);
      showNotice('فشل تحميل المتسابقين', '#d9534f');
    }
  }

  // Render groups collapsed by default. Toggle expands and renders that group's competitors.
  function renderGroups(){
    tableWrap.innerHTML = '';
    if (!filtered || filtered.length === 0){
      tableWrap.innerHTML = `<div class="small-muted">لا توجد نتائج.</div>`;
      return;
    }
    const limit = Number(pageSizeSelect.value || 100);
    const sliced = (limit > 0 && limit < filtered.length) ? filtered.slice(0, limit) : filtered.slice();

    const groups = {};
    for (const item of sliced){
      const key = item.sheikhName || item.sheikh || 'غير معروف';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    Object.keys(groups).forEach(sheikhName=>{
      const groupEl = document.createElement('div');
      groupEl.className = 'sheikh-group';

      const head = document.createElement('div');
      head.className = 'sheikh-head';
      head.innerHTML = `<div><div class="sheikh-title">${esc(sheikhName)}</div><div class="sheikh-meta">${groups[sheikhName].length} متسابق</div></div>`;
      const toggle = document.createElement('button');
      toggle.className = 'sheikh-toggle';
      toggle.type = 'button';
      toggle.textContent = 'عرض المتسابقين';
      head.appendChild(toggle);
      groupEl.appendChild(head);

      const content = document.createElement('div');
      content.className = 'sheikh-content';
      content.style.display = 'none';
      groupEl.appendChild(content);

      // attach toggle handler: render if empty, then toggle visibility
      toggle.addEventListener('click', () => {
        const isHidden = content.style.display === 'none';
        if (isHidden && content.childElementCount === 0) {
          // render group's items into content
          const frag = document.createDocumentFragment();
          groups[sheikhName].forEach(c => {
            const row = document.createElement('div');
            row.className = 'card-row';

            const left = document.createElement('div');
            left.className = 'card-left';
            left.innerHTML = `
              <div class="name">${esc(c.fullname)}</div>
              <div class="meta">تاريخ الميلاد: <strong>${esc(c.birth || '—')}</strong></div>
              <div class="meta">المستوى: <strong>${esc(c.level || '—')}</strong></div>
              <div class="meta">مفتاح السجل: <strong>${esc(c.key)}</strong></div>
            `;

            const imagesWrap = document.createElement('div');
            imagesWrap.className = 'images-row';
            if (c.imgs && c.imgs.length) {
              c.imgs.forEach((url, i) => {
                const t = document.createElement('div');
                t.className = 'thumb';
                const img = document.createElement('img');
                img.src = url;
                img.loading = 'lazy';
                img.alt = `${c.fullname} - صورة ${i+1}`;
                // Open modal on click
                img.addEventListener('click', ()=> openImageModal(url, c.fullname));
                t.appendChild(img);
                imagesWrap.appendChild(t);
              });
            } else {
              const t = document.createElement('div');
              t.className = 'thumb';
              t.innerHTML = `<svg width="36" height="36" viewBox="0 0 24 24" fill="#e6eefc" aria-hidden="true"><path d="M21 19V5a2 2 0 0 0-2-2H5c-1.1 0-2 .9-2 2v14h18zM8 11l2.5 3 2.5-3L16 15H8z"/></svg>`;
              imagesWrap.appendChild(t);
            }

            left.appendChild(imagesWrap);

            const right = document.createElement('div');
            right.className = 'card-right';
            right.innerHTML = `<div class="small-muted">الشيخ: ${esc(c.sheikh)}</div>`;

            row.appendChild(left);
            row.appendChild(right);
            frag.appendChild(row);
          });
          content.appendChild(frag);
        }
        content.style.display = isHidden ? 'block' : 'none';
        toggle.textContent = isHidden ? 'إخفاء المتسابقين' : 'عرض المتسابقين';
      });

      tableWrap.appendChild(groupEl);
    });
  }

  // Modal logic: pan & zoom
  function openImageModal(url, caption){
    modalImg.src = url;
    modalCaption.textContent = caption || '';
    resetTransform();
    imgModal.style.display = 'flex';
    // prevent background scroll
    document.body.style.overflow = 'hidden';
  }
  function closeImageModal(){
    imgModal.style.display = 'none';
    modalImg.src = '';
    modalCaption.textContent = '';
    document.body.style.overflow = '';
  }

  function setTransform(){
    modalImg.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${zoomLevel})`;
  }
  function resetTransform(){
    zoomLevel = 1;
    translate = { x:0, y:0 };
    setTransform();
  }
  function zoomIn(){
    zoomLevel = Math.min(4, +(zoomLevel + 0.25).toFixed(2));
    setTransform();
  }
  function zoomOut(){
    zoomLevel = Math.max(0.25, +(zoomLevel - 0.25).toFixed(2));
    setTransform();
  }

  // Mouse / pointer pan
  modalImageWrap.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'touch' || e.pointerType === 'pen') {
      isPanning = true;
      panStart = { x: e.clientX - translate.x, y: e.clientY - translate.y };
      modalImageWrap.setPointerCapture(e.pointerId);
    }
  });
  modalImageWrap.addEventListener('pointermove', (e) => {
    if (!isPanning) return;
    // only pan when zoomed in (>1) or allow move even at 1 for UX
    translate.x = e.clientX - panStart.x;
    translate.y = e.clientY - panStart.y;
    setTransform();
  });
  modalImageWrap.addEventListener('pointerup', (e) => {
    isPanning = false;
    try { modalImageWrap.releasePointerCapture(e.pointerId); } catch(_) {}
  });
  modalImageWrap.addEventListener('pointercancel', ()=> { isPanning = false; });

  // Touch pinch-to-zoom
  modalImageWrap.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length === 2) {
      lastTouchDist = getTouchDist(e.touches);
      initialZoom = zoomLevel;
    }
  }, { passive: false });

  modalImageWrap.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length === 2) {
      e.preventDefault();
      const d = getTouchDist(e.touches);
      if (lastTouchDist && d) {
        const factor = d / lastTouchDist;
        zoomLevel = Math.max(0.25, Math.min(4, +(initialZoom * factor).toFixed(2)));
        setTransform();
      }
    } else if (e.touches && e.touches.length === 1 && isPanning) {
      // handled by pointer events (if supported)
    }
  }, { passive: false });

  function getTouchDist(touches){
    const t1 = touches[0], t2 = touches[1];
    const dx = t2.clientX - t1.clientX, dy = t2.clientY - t1.clientY;
    return Math.hypot(dx, dy);
  }

  // wheel zoom (desktop)
  modalImageWrap.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) {
      // use wheel with ctrl (or with +/-) to zoom; otherwise do nothing to allow page scroll
    }
    const delta = -e.deltaY;
    if (Math.abs(delta) < 1) return;
    e.preventDefault();
    if (delta > 0) zoomIn(); else zoomOut();
  }, { passive: false });

  // attach modal controls
  zoomInBtn && zoomInBtn.addEventListener('click', zoomIn);
  zoomOutBtn && zoomOutBtn.addEventListener('click', zoomOut);
  zoomResetBtn && zoomResetBtn.addEventListener('click', resetTransform);
  imgClose.addEventListener('click', closeImageModal);
  imgModal.addEventListener('click', (ev)=> { if (ev.target === imgModal) closeImageModal(); });
  document.addEventListener('keydown', (e) => {
    if (imgModal.style.display === 'flex') {
      if (e.key === 'Escape') closeImageModal();
      if (e.key === '+') zoomIn();
      if (e.key === '-') zoomOut();
      if (e.key === '0') resetTransform();
    }
  });

  // search filter
  function applySearch(){
    const q = (searchInput.value || '').trim().toLowerCase();
    if (!q) filtered = allCompetitors.slice();
    else {
      filtered = allCompetitors.filter(c=>{
        if ((c.fullname||'').toLowerCase().includes(q)) return true;
        if ((c.key||'').toLowerCase().includes(q)) return true;
        const nid = c.raw && (c.raw.nationalId || c.raw.nid || c.raw['الرقم القومي']) || '';
        if (String(nid).toLowerCase().includes(q)) return true;
        return false;
      });
    }
    renderGroups();
  }
  const debounce = (fn, ms=250)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn.apply(this,a), ms); } };
  searchInput.addEventListener('input', debounce(applySearch, 300));
  pageSizeSelect.addEventListener('change', renderGroups);

  // initial load
  async function init(){
    await loadCompetitors();
  }
  init();
});
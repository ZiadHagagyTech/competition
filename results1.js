// results.js — صفحة البحث عن الدرجات (بحث بالرقم القومي فقط)
// الآن يدعم زيارة الصفحة بدون تسجيل دخول عبر محاولة المصادقة المجهولة (Anonymous Auth).
// ملاحظة: لتعمل المصادقة المجهولة، فعِّل Anonymous Sign-in في Firebase Console.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('lookupForm');
  const nidInput = document.getElementById('queryNid');
  const clearBtn = document.getElementById('clearBtn');
  const resultsWrap = document.getElementById('resultsWrap');
  const lookupMsg = document.getElementById('lookupMsg');
  const winnersListEl = document.getElementById('winnersList');

  function showMsg(msg, color = '#0b6cf6') {
    lookupMsg.textContent = msg;
    lookupMsg.style.color = color;
  }
  function clearMsg() { lookupMsg.textContent = ''; }
  function escapeHtml(s){ if (s == null) return ''; return String(s).replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }

  // Try to sign in anonymously so reads that require auth succeed for visitors
  async function ensureAnonymousAuth() {
    if (!window.firebase || !firebase.auth) return false;
    try {
      const current = firebase.auth().currentUser;
      if (current) return true;
      // try signInAnonymously
      await firebase.auth().signInAnonymously();
      return true;
    } catch (err) {
      console.warn('Anonymous auth failed or disabled:', err);
      return false;
    }
  }

  function checkFirebaseAvailable() {
    if (!window.firebase || !firebase.database) {
      showMsg('مشكلة في الاتصال: لم يتم تهيئة Firebase.', '#d9534f');
      return false;
    }
    return true;
  }

  // use index nationalIds/{nid} if available, otherwise scan all competitors
  async function lookupByNationalId(nid) {
    if (!checkFirebaseAvailable()) return [];
    try {
      const idxRef = firebase.database().ref(`nationalIds/${nid}`);
      const idxSnap = await idxRef.once('value');
      if (idxSnap.exists()) {
        const idx = idxSnap.val();
        if (idx && idx.sheikh && idx.key) {
          const compSnap = await firebase.database().ref(`competitors/${idx.sheikh}/${idx.key}`).once('value');
          const comp = compSnap.exists() ? compSnap.val() : null;
          const scoresSnap = await firebase.database().ref(`scores/${idx.sheikh}/${idx.key}`).once('value');
          const scores = scoresSnap.exists() ? scoresSnap.val() : null;
          if (comp) { comp._key = idx.key; return [{ data: comp, scores }]; }
        }
      }

      // fallback scanning all competitors (may be slow if DB large)
      const root = await firebase.database().ref('competitors').once('value');
      const found = [];
      root.forEach(sheikhSnap => {
        sheikhSnap.forEach(compSnap => {
          const v = compSnap.val();
          if (v && String(v.nationalId || '').trim() === nid) {
            found.push({ sheikh: sheikhSnap.key, key: compSnap.key, data: v });
          }
        });
      });
      if (found.length === 0) return [];
      const results = [];
      for (const f of found) {
        const sc = await firebase.database().ref(`scores/${f.sheikh}/${f.key}`).once('value');
        const scores = sc.exists() ? sc.val() : null;
        f.data._key = f.key;
        results.push({ data: f.data, scores });
      }
      return results;
    } catch (err) {
      console.error('lookupByNationalId error', err);
      throw err;
    }
  }

  // render helpers
  function renderCompetitorCard(data, scores) {
    const total = (scores && typeof scores.total !== 'undefined') ? scores.total : '';
    const h = (scores && typeof scores.hifzScore !== 'undefined') ? scores.hifzScore : '';
    const a = (scores && typeof scores.ahkamScore !== 'undefined') ? scores.ahkamScore : '';

    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="result-left">
        <div class="name-row">
          <h3>${escapeHtml(data.fullName || data.name || '—')}</h3>
          <div class="meta small-chip">المفتاح: <strong>${escapeHtml(data._key || '')}</strong></div>
        </div>
        <div class="meta">الرقم القومي: ${escapeHtml(data.nationalId || '')} · المستوى: ${escapeHtml(data.level || '')} · المنطقة: ${escapeHtml(data.region || '')}</div>
        <div class="score-breakdown">
          <div class="small-chip">حفظ: ${h !== '' ? escapeHtml(String(h)) : '—'}</div>
          <div class="small-chip">أحكام: ${a !== '' ? escapeHtml(String(a)) : '—'}</div>
          <div class="small-chip">الإجمالي: ${total !== '' ? escapeHtml(String(total)) : '—'}</div>
        </div>
      </div>
      <div>
        <div class="score-badge">${total !== '' ? escapeHtml(String(total)) : 'بدون درجات'}</div>
      </div>
    `;
    return card;
  }

  // load winners (append only if data exists) — do not inject placeholders when none
  async function loadWinners() {
    if (!checkFirebaseAvailable()) { winnersListEl.innerHTML = ''; return; }
    try {
      const snap = await firebase.database().ref('winners').once('value');
      if (!snap.exists()) { winnersListEl.innerHTML = ''; return; }
      const obj = snap.val();
      const items = Array.isArray(obj) ? obj.filter(Boolean) : Object.values(obj);
      if (!items || items.length === 0) { winnersListEl.innerHTML = ''; return; }

      const container = document.createElement('div');
      container.className = 'winners-list panel-sub';
      const header = document.createElement('h4');
      header.textContent = 'أسماء الفائزين';
      header.style.margin = '0 0 8px 0';
      header.style.color = 'var(--accent)';
      container.appendChild(header);

      const ol = document.createElement('ol');
      ol.style.margin = '6px 0';
      ol.style.padding = '0 0 0 18px';
      items.slice(0,8).forEach(it => {
        const li = document.createElement('li');
        li.style.margin = '6px 0';
        li.style.fontWeight = '800';
        li.textContent = (it && it.name) ? `${it.name}${it.note ? ' — ' + it.note : ''}` : String(it);
        ol.appendChild(li);
      });
      container.appendChild(ol);

      const more = document.createElement('div');
      more.style.marginTop = '10px';
      more.innerHTML = `<a class="btn ghost" href="winners.html" target="_blank" rel="noopener">عرض كامل إعلان الفائزين</a>`;
      container.appendChild(more);

      winnersListEl.innerHTML = '';
      winnersListEl.appendChild(container);
    } catch (err) {
      console.error('loadWinners error', err);
      winnersListEl.innerHTML = '';
    }
  }

  // INIT: try anonymous auth then load winners
  (async function init() {
    // if firebase present, attempt anonymous sign-in (harmless if already signed in)
    if (window.firebase && firebase.auth) {
      try {
        await ensureAnonymousAuth();
      } catch (e) {
        console.warn('anonymous auth init failed', e);
      }
    }
    // load winners if allowed
    await loadWinners();
  })();

  // handlers
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    resultsWrap.innerHTML = '';
    clearMsg();

    const nid = (nidInput.value || '').trim();
    if (!nid) { showMsg('أدخل الرقم القومي للبحث', '#d9534f'); return; }

    showMsg('جاري البحث ...');

    try {
      const results = await lookupByNationalId(nid);
      clearMsg();
      if (!results || results.length === 0) {
        resultsWrap.innerHTML = `<div class="empty-state">لم يتم العثور على متسابق مطابق.</div>`;
        return;
      }
      resultsWrap.innerHTML = '';
      results.forEach(r => {
        const card = renderCompetitorCard(r.data, r.scores || {});
        resultsWrap.appendChild(card);
      });
    } catch (err) {
      console.error(err);
      showMsg('حدث خطأ أثناء البحث. حاول مجدداً.', '#d9534f');
    }
  });

  clearBtn.addEventListener('click', () => {
    form.reset(); resultsWrap.innerHTML = ''; clearMsg();
  });

  // digits-only enforce
  nidInput.addEventListener('input', () => {
    const cleaned = (nidInput.value || '').replace(/\D+/g, '').slice(0,14);
    if (cleaned !== nidInput.value) nidInput.value = cleaned;
  });

});
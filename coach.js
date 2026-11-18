'use strict';

let allClients = [];
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calData  = [];

(async function init() {
  try {
    const res  = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.authenticated || data.user.role !== 'coach') {
      window.location.href = 'login.html'; return;
    }
    const u = data.user;
    const initials = (u.first_name[0] + u.last_name[0]).toUpperCase();
    setText('userAvatar',  initials);
    setText('topbarAvatar',initials);
    setText('sidebarName', u.first_name + ' ' + u.last_name);
    setText('topbarName',  u.first_name);
    loadClients();
  } catch { window.location.href = 'login.html'; }
})();

/* ── Navigation ── */
const sectionTitles = { clients: 'Mes clients', checkins: 'Journal check-ins', 'client-calendar': 'Calendrier', sessions: 'Séances', measurements: 'Mesures corporelles' };
const _loaded = {};

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => { e.preventDefault(); switchSection(item.dataset.section); closeSidebar(); });
});

function switchSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById('sec-' + name);
  if (sec) sec.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-section="${name}"]`);
  if (nav) nav.classList.add('active');
  setText('topbarTitle', sectionTitles[name] || name);
  if (name === 'checkins'     && !_loaded.checkins)     { _loaded.checkins     = true; loadCoachCheckins(); }
  if (name === 'sessions'     && !_loaded.sessions)     { _loaded.sessions     = true; loadSessions(); }
  if (name === 'measurements' && !_loaded.measClients)  { _loaded.measClients  = true; loadMeasClientsSelect(); }
}

/* ── Clients ── */
async function loadClients() {
  try {
    allClients = await fetch('/api/coach/all-clients').then(r => r.json());
    renderClients(allClients);
  } catch { document.getElementById('clientsTable').innerHTML = '<div class="empty-state"><p>Erreur chargement.</p></div>'; }
}

function filterClients() {
  const q = document.getElementById('clientSearch').value.toLowerCase();
  renderClients(q ? allClients.filter(c => `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q)) : allClients);
}

function renderClients(clients) {
  const el = document.getElementById('clientsTable');
  if (!clients.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>Aucun client.</p></div>'; return; }
  el.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Nom</th><th>Email</th><th>Abonnement</th><th>Entrées</th><th>Calendrier</th></tr></thead>
      <tbody>${clients.map(c => `
        <tr>
          <td><strong>${c.first_name} ${c.last_name}</strong></td>
          <td>${c.email}</td>
          <td>${c.plan_name || '<span style="color:var(--grey)">—</span>'}</td>
          <td>${c.total_checkins}</td>
          <td><button class="btn btn-outline btn-sm" onclick="openClientCalendar(${c.id}, '${c.first_name} ${c.last_name}')">Voir</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

/* ── Client Calendar ── */
async function openClientCalendar(clientId, name) {
  setText('calClientName', name);
  calYear  = new Date().getFullYear();
  calMonth = new Date().getMonth();
  switchSection('client-calendar');
  document.querySelector('.nav-item[data-section="client-calendar"]')?.classList.add('active');

  try {
    calData = await fetch(`/api/attendance/user/${clientId}`).then(r => r.json());
    renderCalendar(calYear, calMonth);
  } catch {
    document.getElementById('calendarContainer').innerHTML = '<div class="empty-state"><p>Erreur.</p></div>';
  }
}

function renderCalendar(year, month) {
  const container = document.getElementById('calendarContainer');
  if (!container) return;

  const byDay = {};
  for (const ci of calData) {
    const day = (ci.check_in_at || '').substring(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(ci);
  }

  const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const dayNames   = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const firstDay   = new Date(year, month, 1);
  const lastDay    = new Date(year, month + 1, 0);
  let startOffset  = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  let cells = '';
  for (let i = 0; i < startOffset; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const key      = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const sessions = byDay[key] || [];
    const visited  = sessions.length > 0;
    const tip      = visited ? sessions.map(s => {
      const inT  = fmtTime(s.check_in_at);
      const outT = s.check_out_at ? fmtTime(s.check_out_at) : '—';
      return `${inT} → ${outT}${s.duration_min != null ? ' ('+s.duration_min+' min)' : ''}`;
    }).join('\n') : '';
    cells += `<div class="cal-cell${visited ? ' visited' : ''}" ${visited ? `data-tip="${tip}"` : ''}>${d}</div>`;
  }

  container.innerHTML = `
    <div class="calendar-card">
      <div class="cal-nav">
        <button class="cal-btn" id="calPrev">&#8249;</button>
        <div class="cal-title">${monthNames[month]} ${year}</div>
        <button class="cal-btn" id="calNext">&#8250;</button>
      </div>
      <div class="cal-grid">
        ${dayNames.map(d => `<div class="cal-head">${d}</div>`).join('')}
        ${cells}
      </div>
      <div class="cal-legend"><span class="cal-dot visited"></span> Jour d'entraînement</div>
    </div>
    <div class="cal-tooltip" id="calTooltip" style="display:none;"></div>`;

  document.getElementById('calPrev').addEventListener('click', () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(calYear, calMonth);
  });
  document.getElementById('calNext').addEventListener('click', () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(calYear, calMonth);
  });

  const tip = document.getElementById('calTooltip');
  container.querySelectorAll('.cal-cell.visited').forEach(cell => {
    cell.addEventListener('mouseenter', e => {
      tip.textContent = cell.dataset.tip; tip.style.display = 'block';
      const r = cell.getBoundingClientRect(); const cr = container.getBoundingClientRect();
      tip.style.left = (r.left - cr.left) + 'px'; tip.style.top = (r.bottom - cr.top + 6) + 'px';
    });
    cell.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });
}

/* ── Sessions ── */
async function loadSessions() {
  try {
    const sessions = await fetch('/api/coach/sessions').then(r => r.json());
    const el = document.getElementById('sessionsTable');
    if (!sessions.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🗓️</div><p>Aucune séance.</p></div>'; return; }
    const sMap = { scheduled: ['blue','Planifiée'], completed: ['green','Terminée'], cancelled: ['red','Annulée'] };
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Client</th><th>Date & heure</th><th>Type</th><th>Durée</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${sessions.map(s => {
          const [cls, lbl] = sMap[s.status] || ['grey', s.status];
          return `<tr>
            <td><strong>${s.first_name} ${s.last_name}</strong></td>
            <td>${fmtDatetime(s.scheduled_at)}</td>
            <td style="text-transform:capitalize">${s.session_type || '—'}</td>
            <td>${s.duration_min} min</td>
            <td><span class="badge ${cls}">${lbl}</span></td>
            <td style="white-space:nowrap">
              ${s.status === 'scheduled' ? `
                <button class="btn btn-outline btn-sm" onclick="updateStatus(${s.id},'completed')">Terminée</button>
                <button class="btn btn-danger btn-sm" onclick="updateStatus(${s.id},'cancelled')">Annuler</button>
              ` : ''}
            </td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>`;
  } catch { /* silent */ }
}

async function updateStatus(id, status) {
  await fetch(`/api/coach/sessions/${id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  _loaded.sessions = false; loadSessions();
}

async function openSessionModal() {
  const clients = allClients.length ? allClients : await fetch('/api/coach/all-clients').then(r => r.json());
  document.getElementById('sesClient').innerHTML = clients.map(c => `<option value="${c.id}">${c.first_name} ${c.last_name}</option>`).join('');
  const now = new Date(); now.setMinutes(0,0,0); now.setHours(now.getHours()+1);
  document.getElementById('sesDate').value = now.toISOString().slice(0,16);
  showAlert('sessionAlert', '', '');
  document.getElementById('sessionModal').classList.add('open');
}
function closeSessionModal() { document.getElementById('sessionModal').classList.remove('open'); }

async function submitSession() {
  try {
    const r = await fetch('/api/coach/sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:    document.getElementById('sesClient').value,
        scheduled_at: document.getElementById('sesDate').value,
        duration_min: document.getElementById('sesDuration').value,
        session_type: document.getElementById('sesType').value,
        coach_notes:  document.getElementById('sesNotes').value
      })
    }).then(r => r.json());
    if (r.success) { closeSessionModal(); _loaded.sessions = false; loadSessions(); }
    else showAlert('sessionAlert', r.error || 'Erreur.', 'error');
  } catch { showAlert('sessionAlert', 'Erreur réseau.', 'error'); }
}

/* ── Measurements ── */
async function loadMeasClientsSelect() {
  const clients = allClients.length ? allClients : await fetch('/api/coach/all-clients').then(r => r.json());
  const sel = document.getElementById('measClientSelect');
  sel.innerHTML = '<option value="">— Choisir un client —</option>' +
    clients.map(c => `<option value="${c.id}">${c.first_name} ${c.last_name}</option>`).join('');
}

async function loadMeasurements() {
  const cid = document.getElementById('measClientSelect').value;
  const el  = document.getElementById('measurementsTable');
  if (!cid) { el.innerHTML = '<div class="empty-state"><p>Sélectionnez un client.</p></div>'; return; }
  try {
    const rows = await fetch(`/api/coach/measurements/${cid}`).then(r => r.json());
    if (!rows.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Aucune mesure.</p></div>'; return; }
    el.innerHTML = `
      <table class="data-table" style="min-width:700px;">
        <thead><tr><th>Date</th><th>Poids</th><th>Taille</th><th>MG%</th><th>MM</th><th>Poitrine</th><th>Taille</th><th>Hanches</th><th>Biceps</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td>${fmtDate(r.recorded_at)}</td>
          <td>${r.weight_kg ?? '—'} kg</td><td>${r.height_cm ?? '—'} cm</td>
          <td>${r.body_fat_pct ?? '—'}%</td><td>${r.muscle_mass_kg ?? '—'} kg</td>
          <td>${r.chest_cm ?? '—'} cm</td><td>${r.waist_cm ?? '—'} cm</td>
          <td>${r.hips_cm ?? '—'} cm</td><td>${r.bicep_cm ?? '—'} cm</td>
        </tr>`).join('')}
        </tbody>
      </table>`;
  } catch { el.innerHTML = '<div class="empty-state"><p>Erreur.</p></div>'; }
}

async function openMeasureModal() {
  const clients = allClients.length ? allClients : await fetch('/api/coach/all-clients').then(r => r.json());
  document.getElementById('meaClient').innerHTML = clients.map(c => `<option value="${c.id}">${c.first_name} ${c.last_name}</option>`).join('');
  const selected = document.getElementById('measClientSelect').value;
  if (selected) document.getElementById('meaClient').value = selected;
  ['meaWeight','meaHeight','meaFat','meaMuscle','meaChest','meaWaist','meaHips','meaBicep','meaNotes']
    .forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  showAlert('measureAlert', '', '');
  document.getElementById('measureModal').classList.add('open');
}
function closeMeasureModal() { document.getElementById('measureModal').classList.remove('open'); }

async function submitMeasure() {
  try {
    const g = id => document.getElementById(id).value || null;
    const r = await fetch('/api/coach/measurements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: document.getElementById('meaClient').value,
        weight_kg: g('meaWeight'), height_cm: g('meaHeight'),
        body_fat_pct: g('meaFat'), muscle_mass_kg: g('meaMuscle'),
        chest_cm: g('meaChest'), waist_cm: g('meaWaist'),
        hips_cm: g('meaHips'), bicep_cm: g('meaBicep'), notes: g('meaNotes')
      })
    }).then(r => r.json());
    if (r.success) { closeMeasureModal(); loadMeasurements(); }
    else showAlert('measureAlert', r.error || 'Erreur.', 'error');
  } catch { showAlert('measureAlert', 'Erreur réseau.', 'error'); }
}

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = msg ? `alert ${type} show` : 'alert';
}

/* ── Check-ins ── */
async function loadCoachCheckins() {
  const date = document.getElementById('ciDate')?.value || '';
  try {
    const url     = '/api/admin/checkins' + (date ? `?date=${date}` : '');
    const records = await fetch(url).then(r => r.json());
    const el      = document.getElementById('checkinsTable');
    if (!records.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Aucune entrée.</p></div>'; return; }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Client</th><th>Entrée</th><th>Sortie</th><th>Durée</th></tr></thead>
        <tbody>${records.map(r => `
          <tr>
            <td><strong>${r.first_name} ${r.last_name}</strong></td>
            <td>${fmtDatetime(r.check_in_at)}</td>
            <td>${r.check_out_at ? fmtDatetime(r.check_out_at) : '<span style="color:var(--gold)">En salle</span>'}</td>
            <td>${r.duration_min != null ? r.duration_min + ' min' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch { /* silent */ }
}

/* ── Sidebar mobile ── */
document.getElementById('menuToggle').addEventListener('click', openSidebar);
document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
function openSidebar()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarOverlay').classList.add('open'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('open'); }

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = 'index.html';
});

/* ── Helpers ── */
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function fmtDate(str)  { if (!str) return '—'; return new Date(str).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }); }
function fmtDatetime(str) { if (!str) return '—'; return new Date(str).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }
function fmtTime(str)  { if (!str) return '—'; return new Date(str).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }); }

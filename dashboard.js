/* ==============================
   S-Factory Premium — dashboard.js
   ============================== */
'use strict';

/* ── Auth guard: redirect to login if not authenticated ── */
(async function init() {
  try {
    const res  = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.authenticated) {
      window.location.href = 'login.html';
      return;
    }
    loadProfile();
  } catch {
    window.location.href = 'login.html';
  }
})();

/* ── Load full profile data ── */
async function loadProfile() {
  try {
    const res  = await fetch('/api/profile/me');
    const data = await res.json();
    renderAll(data);
  } catch {
    showError('Erreur lors du chargement des données.');
  }
}

/* ── Render everything ── */
function renderAll({ user, membership, stats, notifications, lastMeasurement }) {
  setUserIdentity(user);
  renderStats(user, membership, stats);
  renderMembershipCard(membership);
  renderMembershipDetail(membership);
  renderProfileCard(user);
  renderNotifications(notifications);
  prefillSettings(user);
}

/* ── User identity (name + avatar initials) ── */
function setUserIdentity(user) {
  const initials = (user.first_name[0] + user.last_name[0]).toUpperCase();
  const fullName = user.first_name + ' ' + user.last_name;

  setText('sidebarName',  fullName);
  setText('welcomeName',  user.first_name);
  setText('topbarName',   user.first_name);
  setText('userAvatar',   initials);
  setText('topbarAvatar', initials);
}

/* ── Stats cards ── */
function renderStats(user, membership, stats) {
  setText('statCheckins', stats.checkIns.toString());
  setText('statSessions', stats.sessions.toString());

  if (membership) {
    setText('statPlanName', membership.plan_name);
    const days = daysRemaining(membership.end_date);
    setText('statDaysLeft', days > 0 ? days + ' j' : 'Expiré');
  } else {
    setText('statPlanName', 'Aucun');
    setText('statDaysLeft', '—');
  }
}

/* ── Membership card (dashboard) ── */
function renderMembershipCard(membership) {
  const card = document.getElementById('membershipCard');

  if (!membership) {
    card.innerHTML = `
      <div class="mc-no-membership">
        <p>Vous n'avez pas encore d'abonnement actif.<br/>Contactez-nous pour commencer votre transformation.</p>
        <a href="index.html#contact" class="mc-contact-btn">Prendre un abonnement</a>
      </div>`;
    return;
  }

  const days     = daysRemaining(membership.end_date);
  const statusCls = days > 0 ? 'active' : 'expired';
  const statusLbl = days > 0 ? '● Actif' : '● Expiré';
  const features  = (membership.features || '').split(',').map(f => f.trim()).filter(Boolean);

  card.innerHTML = `
    <div class="mc-plan-name">${membership.plan_name}</div>
    <span class="mc-status ${statusCls}">${statusLbl}</span>
    <div class="mc-dates">
      <div class="mc-date-item">
        <div class="lbl">Début</div>
        <div class="val">${fmtDate(membership.start_date)}</div>
      </div>
      <div class="mc-date-item">
        <div class="lbl">Fin</div>
        <div class="val">${fmtDate(membership.end_date)}</div>
      </div>
      <div class="mc-date-item">
        <div class="lbl">Restant</div>
        <div class="val">${days > 0 ? days + ' jours' : 'Expiré'}</div>
      </div>
    </div>
    <div class="mc-features">
      ${features.map(f => `<span class="mc-feat-tag">${f}</span>`).join('')}
    </div>`;
}

/* ── Membership detail section ── */
function renderMembershipDetail(membership) {
  const el = document.getElementById('membershipDetail');

  if (!membership) {
    el.innerHTML = `
      <div class="coming-soon-card">
        <div class="cs-icon">💳</div>
        <h3>Aucun abonnement actif</h3>
        <p>Contactez S-Factory Premium pour souscrire à l'une de nos formules et commencer votre parcours.</p>
        <a href="index.html#abonnements" class="cs-btn">Voir les formules</a>
      </div>`;
    return;
  }

  const days     = daysRemaining(membership.end_date);
  const statusCls = days > 0 ? 'active' : 'expired';
  const statusLbl = days > 0 ? '● Actif' : '● Expiré';
  const features  = (membership.features || '').split(',').map(f => f.trim()).filter(Boolean);

  el.innerHTML = `
    <div class="membership-detail-card">
      <div class="mc-plan-name">${membership.plan_name}</div>
      <span class="mc-status ${statusCls}">${statusLbl}</span>
      <div style="margin:20px 0 0;display:flex;flex-direction:column;gap:0;">
        ${makeInfoRow('Formule',        membership.plan_name)}
        ${makeInfoRow('Description',    membership.plan_desc || '—')}
        ${makeInfoRow('Date de début',  fmtDate(membership.start_date))}
        ${makeInfoRow('Date de fin',    fmtDate(membership.end_date))}
        ${makeInfoRow('Jours restants', days > 0 ? days + ' jours' : 'Abonnement expiré')}
        ${makeInfoRow('Paiement',       membership.payment_status === 'paid' ? '✓ Payé' : membership.payment_status)}
      </div>
      <div style="margin-top:20px;">
        <div class="card-section-title" style="margin-bottom:10px;">Inclus dans votre formule</div>
        <div class="mc-features">
          ${features.map(f => `<span class="mc-feat-tag">${f}</span>`).join('')}
        </div>
      </div>
    </div>`;
}

/* ── Profile card ── */
function renderProfileCard(user) {
  const goalLabels = {
    perte_poids: 'Perte de poids',
    prise_masse: 'Prise de masse / Musculation',
    cardio:      'Cardio & Endurance',
    transformation: 'Transformation corporelle',
    autre: 'Autre'
  };

  setText('profileAvatar', (user.first_name[0] + user.last_name[0]).toUpperCase());

  document.getElementById('profileInfo').innerHTML = `
    ${makeProfileRow('Prénom',        user.first_name)}
    ${makeProfileRow('Nom',           user.last_name)}
    ${makeProfileRow('Email',         user.email)}
    ${makeProfileRow('Téléphone',     user.phone || 'Non renseigné')}
    ${makeProfileRow('Objectif',      goalLabels[user.goal] || user.goal || 'Non renseigné')}
    ${makeProfileRow('Membre depuis', fmtDate(user.created_at))}
    ${makeProfileRow('Dernière connexion', user.last_login ? fmtDatetime(user.last_login) : 'Première connexion')}`;
}

/* ── Notifications ── */
function renderNotifications(notifications) {
  const list    = document.getElementById('notifList');
  const dot     = document.getElementById('notifDot');
  const unread  = notifications.filter(n => !n.is_read);

  if (unread.length > 0) dot.style.display = 'block';

  if (!notifications.length) {
    list.innerHTML = '<div class="notif-empty">Aucune notification pour le moment.</div>';
    return;
  }

  list.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.type} ${n.is_read ? 'read' : 'unread'}" data-id="${n.id}">
      <div class="notif-title">${n.title}</div>
      ${n.message ? `<div class="notif-msg">${n.message}</div>` : ''}
      <div class="notif-time">${timeAgo(n.created_at)}</div>
    </div>`).join('');

  list.querySelectorAll('.notif-item.unread').forEach(el => {
    el.addEventListener('click', function () {
      const id = this.dataset.id;
      fetch(`/api/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
      this.classList.replace('unread', 'read');
      const remaining = list.querySelectorAll('.notif-item.unread').length;
      if (remaining === 0) dot.style.display = 'none';
    });
  });
}

/* ── QR Code ── */
async function loadQrCode() {
  const wrap = document.getElementById('qrWrap');
  if (!wrap) return;
  try {
    const res  = await fetch('/api/qr/my');
    const data = await res.json();
    if (data.qr) {
      wrap.innerHTML = `
        <img src="${data.qr}" alt="QR Code check-in" class="qr-img"/>
        <div class="qr-url">${data.url}</div>`;
    }
  } catch {
    if (wrap) wrap.innerHTML = '<div style="color:#ff6b5b;font-size:.85rem;">Erreur chargement QR.</div>';
  }
}

/* ── Attendance calendar ── */
let calendarData    = [];
let calendarYear    = new Date().getFullYear();
let calendarMonth   = new Date().getMonth(); // 0-based

async function loadCalendar() {
  try {
    const res  = await fetch('/api/attendance/my');
    calendarData = await res.json();
    renderCalendar(calendarYear, calendarMonth);
  } catch {
    document.getElementById('calendarContainer').innerHTML =
      '<div style="color:#ff6b5b;font-size:.85rem;">Erreur chargement calendrier.</div>';
  }
}

function renderCalendar(year, month) {
  const container = document.getElementById('calendarContainer');
  if (!container) return;

  /* Build a lookup: 'YYYY-MM-DD' → array of sessions */
  const byDay = {};
  for (const ci of calendarData) {
    const day = ci.check_in_at.substring(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(ci);
  }

  const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin',
                      'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const dayNames   = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

  const firstDay   = new Date(year, month, 1);
  const lastDay    = new Date(year, month + 1, 0);
  /* Monday-first offset */
  let startOffset  = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  let cells = '';
  for (let i = 0; i < startOffset; i++) cells += '<div class="cal-cell empty"></div>';

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const key     = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const sessions = byDay[key] || [];
    const hasVisit = sessions.length > 0;

    let tooltip = '';
    if (hasVisit) {
      tooltip = sessions.map(s => {
        const inT  = fmtTimeOnly(s.check_in_at);
        const outT = s.check_out_at ? fmtTimeOnly(s.check_out_at) : '—';
        const dur  = s.duration_min != null ? `${s.duration_min} min` : '';
        return `${inT} → ${outT}${dur ? ' ('+dur+')' : ''}`;
      }).join('\n');
    }

    cells += `<div class="cal-cell${hasVisit ? ' visited' : ''}" ${hasVisit ? `data-tip="${tooltip}"` : ''}>${d}</div>`;
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
      <div class="cal-legend">
        <span class="cal-dot visited"></span> Jour d'entraînement
      </div>
    </div>
    <div class="cal-tooltip" id="calTooltip" style="display:none;"></div>`;

  document.getElementById('calPrev').addEventListener('click', () => {
    calendarMonth--;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    renderCalendar(calendarYear, calendarMonth);
  });
  document.getElementById('calNext').addEventListener('click', () => {
    calendarMonth++;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    renderCalendar(calendarYear, calendarMonth);
  });

  /* Tooltip on hover */
  const tip = document.getElementById('calTooltip');
  container.querySelectorAll('.cal-cell.visited').forEach(cell => {
    cell.addEventListener('mouseenter', (e) => {
      tip.textContent = cell.dataset.tip;
      tip.style.display = 'block';
      const r = cell.getBoundingClientRect();
      const cr = container.getBoundingClientRect();
      tip.style.left = (r.left - cr.left) + 'px';
      tip.style.top  = (r.bottom - cr.top + 6) + 'px';
    });
    cell.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });
}

function fmtTimeOnly(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/* ── Sidebar navigation ── */
const sections   = document.querySelectorAll('.section');
const navItems   = document.querySelectorAll('.nav-item');
const sectionTitles = {
  dashboard:  'Tableau de bord',
  profile:    'Mon Profil',
  membership: 'Mon Abonnement',
  qrcode:     'Mon QR Code',
  calendar:   'Calendrier',
  sessions:   'Mes Séances',
  progress:   'Ma Progression',
  settings:   'Paramètres'
};

navItems.forEach(function (item) {
  item.addEventListener('click', function (e) {
    e.preventDefault();
    const target = this.dataset.section;
    switchSection(target);
    closeSidebar();
  });
});

const _loaded = {};

function switchSection(name) {
  sections.forEach(s => s.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));

  const sec = document.getElementById('sec-' + name);
  if (sec) sec.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-section="${name}"]`);
  if (navItem) navItem.classList.add('active');

  setText('topbarTitle', sectionTitles[name] || name);

  if (name === 'qrcode'    && !_loaded.qr)       { _loaded.qr       = true; loadQrCode(); }
  if (name === 'calendar'  && !_loaded.cal)      { _loaded.cal      = true; loadCalendar(); }
  if (name === 'sessions'  && !_loaded.sessions) { _loaded.sessions = true; loadSessions(); }
  if (name === 'progress'  && !_loaded.progress) { _loaded.progress = true; loadProgress(); }
}

/* ── Mobile sidebar ── */
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const menuToggle     = document.getElementById('menuToggle');
const sidebarClose   = document.getElementById('sidebarClose');

menuToggle.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

/* ── Logout ── */
document.getElementById('logoutBtn').addEventListener('click', async function () {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = 'index.html';
});

/* ── Sessions ── */
async function loadSessions() {
  const el = document.getElementById('sessionsContent');
  try {
    const sessions = await fetch('/api/client/sessions').then(r => r.json());
    if (!sessions.length) {
      el.innerHTML = `
        <div class="coming-soon-card">
          <div class="cs-icon">🗓️</div>
          <h3>Aucune séance enregistrée</h3>
          <p>Vos séances de coaching avec votre entraîneur apparaîtront ici.</p>
        </div>`;
      return;
    }
    const sMap = { scheduled: ['blue','Planifiée'], completed: ['green','Terminée'], cancelled: ['red','Annulée'] };
    el.innerHTML = `
      <div class="membership-detail-card" style="max-width:none;overflow-x:auto;">
        <table class="dt-table">
          <thead><tr><th>Coach</th><th>Date & heure</th><th>Type</th><th>Durée</th><th>Statut</th></tr></thead>
          <tbody>${sessions.map(s => {
            const [cls, lbl] = sMap[s.status] || ['grey', s.status];
            return `<tr>
              <td><strong>${s.coach_name}</strong></td>
              <td>${fmtDatetime(s.scheduled_at)}</td>
              <td style="text-transform:capitalize">${s.session_type || '—'}</td>
              <td>${s.duration_min} min</td>
              <td><span class="badge ${cls}">${lbl}</span></td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch {
    if (el) el.innerHTML = '<div style="color:#ff6b5b;font-size:.85rem;">Erreur chargement séances.</div>';
  }
}

/* ── Progress ── */
async function loadProgress() {
  const el = document.getElementById('progressContent');
  try {
    const rows = await fetch('/api/client/measurements').then(r => r.json());
    if (!rows.length) {
      el.innerHTML = `
        <div class="coming-soon-card">
          <div class="cs-icon">📊</div>
          <h3>Aucune mesure disponible</h3>
          <p>Vos mesures corporelles apparaîtront ici une fois saisies par votre coach.</p>
        </div>`;
      return;
    }
    const m = rows[0];
    const history = rows.length > 1 ? `
      <div class="membership-detail-card" style="max-width:none;">
        <div class="mc-plan-name" style="font-size:1rem;margin-bottom:16px;">Historique</div>
        <div style="overflow-x:auto;">
          <table class="dt-table">
            <thead><tr><th>Date</th><th>Poids</th><th>MG %</th><th>MM kg</th></tr></thead>
            <tbody>${rows.map(r => `<tr>
              <td>${fmtDate(r.recorded_at)}</td>
              <td>${r.weight_kg ?? '—'} kg</td>
              <td>${r.body_fat_pct ?? '—'}</td>
              <td>${r.muscle_mass_kg ?? '—'}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>` : '';

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:900px;">
        <div class="membership-detail-card" style="max-width:none;">
          <div class="mc-plan-name" style="font-size:1rem;margin-bottom:16px;">Dernière mesure — ${fmtDate(m.recorded_at)}</div>
          ${makeInfoRow('Poids',            m.weight_kg      ? m.weight_kg      + ' kg' : '—')}
          ${makeInfoRow('Taille',           m.height_cm      ? m.height_cm      + ' cm' : '—')}
          ${makeInfoRow('Masse grasse',     m.body_fat_pct   ? m.body_fat_pct   + ' %'  : '—')}
          ${makeInfoRow('Masse musculaire', m.muscle_mass_kg ? m.muscle_mass_kg + ' kg' : '—')}
          ${makeInfoRow('Poitrine',         m.chest_cm       ? m.chest_cm       + ' cm' : '—')}
          ${makeInfoRow('Tour de taille',   m.waist_cm       ? m.waist_cm       + ' cm' : '—')}
          ${makeInfoRow('Hanches',          m.hips_cm        ? m.hips_cm        + ' cm' : '—')}
          ${makeInfoRow('Biceps',           m.bicep_cm       ? m.bicep_cm       + ' cm' : '—')}
        </div>
        ${history}
      </div>`;
  } catch {
    if (el) el.innerHTML = '<div style="color:#ff6b5b;font-size:.85rem;">Erreur chargement mesures.</div>';
  }
}

/* ── Settings ── */
function prefillSettings(user) {
  const f = id => document.getElementById(id);
  if (f('setFirstName')) f('setFirstName').value = user.first_name || '';
  if (f('setLastName'))  f('setLastName').value  = user.last_name  || '';
  if (f('setPhone'))     f('setPhone').value     = user.phone      || '';
  if (f('setGoal'))      f('setGoal').value      = user.goal       || '';
}

async function saveProfile() {
  showDashAlert('profileAlert', '', '');
  try {
    const r = await fetch('/api/profile/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: document.getElementById('setFirstName').value,
        last_name:  document.getElementById('setLastName').value,
        phone:      document.getElementById('setPhone').value,
        goal:       document.getElementById('setGoal').value
      })
    }).then(r => r.json());
    if (r.success) showDashAlert('profileAlert', 'Profil mis à jour.', 'success');
    else           showDashAlert('profileAlert', r.error || 'Erreur.', 'error');
  } catch { showDashAlert('profileAlert', 'Erreur réseau.', 'error'); }
}

async function changePassword() {
  showDashAlert('pwAlert', '', '');
  const pw = document.getElementById('pwNew').value;
  const cf = document.getElementById('pwConfirm').value;
  if (!pw || pw !== cf) { showDashAlert('pwAlert', 'Les mots de passe ne correspondent pas.', 'error'); return; }
  try {
    const r = await fetch('/api/auth/change-password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: document.getElementById('pwCurrent').value, new_password: pw })
    }).then(r => r.json());
    if (r.success) {
      showDashAlert('pwAlert', 'Mot de passe changé avec succès.', 'success');
      ['pwCurrent','pwNew','pwConfirm'].forEach(id => { document.getElementById(id).value = ''; });
    } else showDashAlert('pwAlert', r.error || 'Erreur.', 'error');
  } catch { showDashAlert('pwAlert', 'Erreur réseau.', 'error'); }
}

function showDashAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = msg ? `alert ${type} show` : 'alert';
}

/* ── Utility functions ── */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function makeProfileRow(key, val) {
  return `<div class="profile-row">
    <span class="profile-key">${key}</span>
    <span class="profile-val">${val}</span>
  </div>`;
}

function makeInfoRow(key, val) {
  return `<div class="profile-row">
    <span class="profile-key">${key}</span>
    <span class="profile-val">${val}</span>
  </div>`;
}

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtDatetime(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function daysRemaining(endDate) {
  const end  = new Date(endDate);
  const now  = new Date();
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return diff;
}

function timeAgo(str) {
  const d    = new Date(str);
  const now  = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)   return "À l'instant";
  if (diff < 3600) return Math.floor(diff / 60) + ' min';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return fmtDate(str);
}

function showError(msg) {
  const content = document.querySelector('.page-content');
  const div = document.createElement('div');
  div.style.cssText = 'padding:20px;color:#ff6b5b;font-size:0.9rem;';
  div.textContent = msg;
  content.prepend(div);
}

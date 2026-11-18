'use strict';

/* ── Auth guard ── */
(async function init() {
  try {
    const res  = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.authenticated || data.user.role !== 'admin') {
      window.location.href = 'login.html';
      return;
    }
    const u = data.user;
    const initials = (u.first_name[0] + u.last_name[0]).toUpperCase();
    setText('userAvatar',   initials);
    setText('topbarAvatar', initials);
    setText('sidebarName',  u.first_name + ' ' + u.last_name);
    setText('topbarName',   u.first_name);
    loadOverview();
  } catch {
    window.location.href = 'login.html';
  }
})();

/* ── Navigation ── */
const sectionTitles = {
  overview:    'Vue d\'ensemble',
  users:       'Utilisateurs',
  memberships: 'Abonnements',
  checkins:    'Check-ins',
  cleaning:    'Nettoyage',
  payments:    'Paiements'
};
const _loaded = {};

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    switchSection(item.dataset.section);
    closeSidebar();
  });
});

function switchSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById('sec-' + name);
  if (sec) sec.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-section="${name}"]`);
  if (nav) nav.classList.add('active');
  setText('topbarTitle', sectionTitles[name] || name);

  if (name === 'users'       && !_loaded.users)       { _loaded.users       = true; loadUsers(); }
  if (name === 'memberships' && !_loaded.memberships) { _loaded.memberships = true; loadMemberships(); }
  if (name === 'checkins'    && !_loaded.checkins)    { _loaded.checkins    = true; loadCheckins(); }
  if (name === 'cleaning'    && !_loaded.cleaning)    { _loaded.cleaning    = true; loadCleaning(); }
  if (name === 'payments'    && !_loaded.payments)    { _loaded.payments    = true; loadPayments(); }
}

/* ── Overview ── */
async function loadOverview() {
  try {
    const [stats, checkins] = await Promise.all([
      fetch('/api/admin/stats').then(r => r.json()),
      fetch('/api/admin/checkins').then(r => r.json())
    ]);
    setText('stTotal',   stats.total);
    setText('stMembers', stats.members);
    setText('stToday',   stats.todayIn);
    setText('stRevenue', Number(stats.revenue).toLocaleString('fr-FR', { minimumFractionDigits: 2 }));
    renderCheckinsTable('overviewCheckins', checkins.slice(0, 20));
  } catch { /* silent */ }
}

/* ── Users ── */
async function loadUsers() {
  const q = document.getElementById('userSearch')?.value || '';
  try {
    const users = await fetch('/api/admin/users').then(r => r.json());
    const filtered = q
      ? users.filter(u => `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()))
      : users;

    if (!filtered.length) {
      document.getElementById('usersTable').innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>Aucun utilisateur.</p></div>';
      return;
    }

    document.getElementById('usersTable').innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>Nom</th><th>Email</th><th>Rôle</th><th>Abonnement</th><th>Statut</th><th>Actions</th>
        </tr></thead>
        <tbody>${filtered.map(u => `
          <tr>
            <td><strong>${u.first_name} ${u.last_name}</strong></td>
            <td>${u.email}</td>
            <td><span class="role-badge ${u.role}">${u.role}</span></td>
            <td>${u.plan_name ? `${u.plan_name}<br><small style="color:var(--grey)">${fmtDate(u.plan_end)}</small>` : '<span style="color:var(--grey)">—</span>'}</td>
            <td><span class="badge ${u.is_active ? 'green' : 'red'}">${u.is_active ? 'Actif' : 'Inactif'}</span></td>
            <td>
              <button class="btn btn-outline btn-sm" onclick="changeRole(${u.id}, '${u.role}')">Rôle</button>
              <button class="btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-outline'}" onclick="toggleActive(${u.id}, this)">${u.is_active ? 'Désactiver' : 'Activer'}</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch { /* silent */ }
}

async function toggleActive(id, btn) {
  btn.disabled = true;
  try {
    const r = await fetch(`/api/admin/users/${id}/active`, { method: 'PATCH' }).then(r => r.json());
    btn.textContent = r.is_active ? 'Désactiver' : 'Activer';
    btn.className   = `btn btn-sm ${r.is_active ? 'btn-danger' : 'btn-outline'}`;
  } finally { btn.disabled = false; }
}

async function changeRole(id, current) {
  const roles = ['client', 'coach', 'cashier', 'cleaning', 'admin'];
  const role  = prompt(`Nouveau rôle pour l'utilisateur #${id}\n(${roles.join(', ')})`, current);
  if (!role || !roles.includes(role)) return;
  await fetch(`/api/admin/users/${id}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role })
  });
  loadUsers();
}

/* ── Memberships ── */
async function loadMemberships() {
  try {
    const users = await fetch('/api/admin/users').then(r => r.json());
    const noMembership = users.filter(u => u.role === 'client' && !u.plan_name);
    const el = document.getElementById('noMembershipTable');
    if (!noMembership.length) {
      el.innerHTML = '<div class="empty-state"><p>Tous les clients ont un abonnement actif.</p></div>';
      return;
    }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Action</th></tr></thead>
        <tbody>${noMembership.map(u => `
          <tr>
            <td>${u.first_name} ${u.last_name}</td>
            <td>${u.email}</td>
            <td>${u.phone || '—'}</td>
            <td><button class="btn btn-gold btn-sm" onclick="openMembershipModalFor(${u.id})">Assigner</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch { /* silent */ }
}

/* ── Check-ins ── */
async function loadCheckins() {
  const date = document.getElementById('ciDateFilter')?.value || '';
  try {
    const url     = '/api/admin/checkins' + (date ? `?date=${date}` : '');
    const records = await fetch(url).then(r => r.json());
    renderCheckinsTable('checkinsTable', records);
  } catch { /* silent */ }
}

function renderCheckinsTable(elId, records) {
  const el = document.getElementById(elId);
  if (!records.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Aucune entrée.</p></div>';
    return;
  }
  el.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Client</th><th>Entrée</th><th>Sortie</th><th>Durée</th></tr></thead>
      <tbody>${records.map(r => `
        <tr>
          <td><strong>${r.first_name} ${r.last_name}</strong><br><small style="color:var(--grey)">${r.email}</small></td>
          <td>${fmtDatetime(r.check_in_at)}</td>
          <td>${r.check_out_at ? fmtDatetime(r.check_out_at) : '<span style="color:var(--gold)">En salle</span>'}</td>
          <td>${r.duration_min != null ? r.duration_min + ' min' : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

/* ── Cleaning ── */
async function loadCleaning() {
  try {
    const tasks = await fetch('/api/admin/cleaning/tasks').then(r => r.json());
    const el    = document.getElementById('tasksTable');
    if (!tasks.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🧹</div><p>Aucune tâche.</p></div>'; return; }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Tâche</th><th>Zone</th><th>Shift</th><th>Assigné à</th><th>Statut</th></tr></thead>
        <tbody>${tasks.map(t => `
          <tr>
            <td><strong>${t.title}</strong></td>
            <td>${t.area || '—'}</td>
            <td>${t.shift || '—'}</td>
            <td>${t.first_name ? `${t.first_name} ${t.last_name}` : '—'}</td>
            <td><span class="badge ${t.is_done ? 'green' : 'grey'}">${t.is_done ? 'Fait' : 'À faire'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch { /* silent */ }
}

/* ── Modal: Membership ── */
let _clients = [], _plans = [];

async function openMembershipModal() {
  if (!_clients.length) {
    const users = await fetch('/api/admin/users').then(r => r.json());
    _clients = users.filter(u => u.role === 'client');
  }
  if (!_plans.length) _plans = await fetch('/api/plans').then(r => r.json());

  const sel = document.getElementById('mClientId');
  sel.innerHTML = _clients.map(c => `<option value="${c.id}">${c.first_name} ${c.last_name}</option>`).join('');
  document.getElementById('mPlanId').innerHTML = _plans.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('mStartDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('membershipModal').classList.add('open');
}

function openMembershipModalFor(clientId) {
  openMembershipModal().then(() => {
    document.getElementById('mClientId').value = clientId;
  });
}

function closeMembershipModal() {
  document.getElementById('membershipModal').classList.remove('open');
  showAlert('membershipAlert', '', '');
}

async function submitMembership() {
  const btn = document.getElementById('membershipSubmit');
  btn.disabled = true;
  try {
    const r = await fetch('/api/admin/memberships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id:        document.getElementById('mClientId').value,
        plan_id:        document.getElementById('mPlanId').value,
        start_date:     document.getElementById('mStartDate').value,
        payment_status: document.getElementById('mPayment').value
      })
    }).then(r => r.json());

    if (r.success) {
      showAlert('membershipAlert', 'Abonnement assigné avec succès.', 'success');
      setTimeout(closeMembershipModal, 1200);
      _loaded.memberships = false; loadMemberships();
    } else {
      showAlert('membershipAlert', r.error || 'Erreur.', 'error');
    }
  } finally { btn.disabled = false; }
}

/* ── Modal: Task ── */
async function openTaskModal() {
  const staff = await fetch('/api/admin/cleaning/staff').then(r => r.json());
  const sel   = document.getElementById('taskAssigned');
  sel.innerHTML = '<option value="">— Non assigné —</option>' +
    staff.map(s => `<option value="${s.id}">${s.first_name} ${s.last_name}</option>`).join('');
  document.getElementById('taskModal').classList.add('open');
}
function closeTaskModal() { document.getElementById('taskModal').classList.remove('open'); }

async function submitTask() {
  const r = await fetch('/api/admin/cleaning/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title:       document.getElementById('taskTitle').value,
      area:        document.getElementById('taskArea').value,
      shift:       document.getElementById('taskShift').value,
      assigned_to: document.getElementById('taskAssigned').value || null
    })
  }).then(r => r.json());
  if (r.success) { closeTaskModal(); _loaded.cleaning = false; loadCleaning(); }
}

/* ── Modal: Shift ── */
async function openShiftModal() {
  const staff = await fetch('/api/admin/cleaning/staff').then(r => r.json());
  document.getElementById('shiftUser').innerHTML = staff.map(s => `<option value="${s.id}">${s.first_name} ${s.last_name}</option>`).join('');
  document.getElementById('shiftDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('shiftModal').classList.add('open');
}
function closeShiftModal() { document.getElementById('shiftModal').classList.remove('open'); }

async function submitShift() {
  const r = await fetch('/api/admin/cleaning/shifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id:    document.getElementById('shiftUser').value,
      shift_date: document.getElementById('shiftDate').value,
      start_time: document.getElementById('shiftStart').value,
      end_time:   document.getElementById('shiftEnd').value,
      area:       document.getElementById('shiftArea').value
    })
  }).then(r => r.json());
  if (r.success) { closeShiftModal(); showAlert('shiftAlert', '', ''); }
  else showAlert('shiftAlert', r.error || 'Erreur.', 'error');
}

/* ── Payments ── */
async function loadPayments() {
  try {
    const rows = await fetch('/api/admin/payments').then(r => r.json());
    const el   = document.getElementById('paymentsTable');
    if (!rows.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div><p>Aucun paiement.</p></div>'; return; }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Client</th><th>Formule</th><th>Montant</th><th>Méthode</th><th>Date</th><th>Statut</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td><strong>${r.first_name} ${r.last_name}</strong><br><small style="color:var(--grey)">${r.email}</small></td>
            <td>${r.plan_name || '—'}</td>
            <td><strong style="color:var(--gold)">${Number(r.amount).toLocaleString('fr-FR',{minimumFractionDigits:2})} TND</strong></td>
            <td>${r.method}</td>
            <td>${fmtDatetime(r.paid_at)}</td>
            <td><span class="badge ${r.status === 'paid' ? 'green' : 'gold'}">${r.status}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch { /* silent */ }
}

/* ── Create user ── */
function openCreateUserModal() {
  ['cuFirstName','cuLastName','cuEmail','cuPhone','cuPassword'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('cuRole').value = 'client';
  showAlert('createUserAlert', '', '');
  document.getElementById('createUserModal').classList.add('open');
}
function closeCreateUserModal() { document.getElementById('createUserModal').classList.remove('open'); }

async function submitCreateUser() {
  try {
    const r = await fetch('/api/admin/users/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: document.getElementById('cuFirstName').value,
        last_name:  document.getElementById('cuLastName').value,
        email:      document.getElementById('cuEmail').value,
        phone:      document.getElementById('cuPhone').value,
        role:       document.getElementById('cuRole').value,
        password:   document.getElementById('cuPassword').value
      })
    }).then(r => r.json());
    if (r.success) {
      showAlert('createUserAlert', `Utilisateur créé (ID : ${r.id}).`, 'success');
      setTimeout(() => { closeCreateUserModal(); _loaded.users = false; loadUsers(); }, 1400);
    } else showAlert('createUserAlert', r.error || 'Erreur.', 'error');
  } catch { showAlert('createUserAlert', 'Erreur réseau.', 'error'); }
}

/* ── Sidebar mobile ── */
document.getElementById('menuToggle').addEventListener('click', openSidebar);
document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
function openSidebar()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarOverlay').classList.add('open'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('open'); }

/* ── Logout ── */
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = 'index.html';
});

/* ── Helpers ── */
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = 'alert' + (type ? ' ' + type : '');
  if (type) el.classList.add('show');
}
function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDatetime(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

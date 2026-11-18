'use strict';

let _foundClientId     = null;
let _payClientId       = null;
let _payMembershipId   = null;

(async function init() {
  try {
    const res  = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.authenticated || !['cashier','admin'].includes(data.user.role)) {
      window.location.href = 'login.html'; return;
    }
    const u = data.user;
    const initials = (u.first_name[0] + u.last_name[0]).toUpperCase();
    setText('userAvatar', initials); setText('topbarAvatar', initials);
    setText('sidebarName', u.first_name + ' ' + u.last_name);
    setText('topbarName', u.first_name);
    loadPlans();
  } catch { window.location.href = 'login.html'; }
})();

async function loadPlans() {
  const plans = await fetch('/api/plans').then(r => r.json());
  document.getElementById('mPlanId').innerHTML = plans.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('mStartDate').value = new Date().toISOString().split('T')[0];
}

/* ── Navigation ── */
const sectionTitles = { clients: 'Clients', membership: 'Abonnement', payment: 'Paiement', history: 'Historique' };

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => { e.preventDefault(); switchSection(item.dataset.section); closeSidebar(); });
});

const _loaded = {};

function switchSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-' + name)?.classList.add('active');
  document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add('active');
  setText('topbarTitle', sectionTitles[name] || name);
  if (name === 'history' && !_loaded.history) { _loaded.history = true; loadPaymentHistory(); }
}

/* ── Search clients ── */
async function searchClients() {
  const q  = document.getElementById('clientSearch').value;
  const el = document.getElementById('clientsTable');
  if (!q.trim()) { el.innerHTML = '<div class="empty-state"><p>Saisissez un terme de recherche.</p></div>'; return; }
  try {
    const clients = await fetch(`/api/cashier/clients?q=${encodeURIComponent(q)}`).then(r => r.json());
    if (!clients.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>Aucun résultat.</p></div>'; return; }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Abonnement</th><th>Paiement</th><th>Statut</th></tr></thead>
        <tbody>${clients.map(c => `
          <tr>
            <td><strong>${c.first_name} ${c.last_name}</strong></td>
            <td>${c.email}</td>
            <td>${c.phone || '—'}</td>
            <td>${c.plan_name || '—'}</td>
            <td>${c.payment_status ? `<span class="badge ${c.payment_status === 'paid' ? 'green' : 'gold'}">${c.payment_status}</span>` : '—'}</td>
            <td><span class="badge ${c.is_active ? 'green' : 'red'}">${c.is_active ? 'Actif' : 'Inactif'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch { el.innerHTML = '<div class="empty-state"><p>Erreur.</p></div>'; }
}

/* ── Lookup client for membership ── */
async function lookupClient() {
  const email = document.getElementById('mEmail').value.trim();
  if (!email) return;
  try {
    const clients = await fetch(`/api/cashier/clients?q=${encodeURIComponent(email)}`).then(r => r.json());
    const c = clients.find(x => x.email.toLowerCase() === email.toLowerCase());
    if (c) {
      _foundClientId = c.id;
      setText('clientFound', `✓ ${c.first_name} ${c.last_name}`);
    } else {
      _foundClientId = null;
      setText('clientFound', 'Client introuvable.');
    }
  } catch { setText('clientFound', 'Erreur réseau.'); }
}

async function submitMembership() {
  if (!_foundClientId) { showAlert('membershipAlert', 'Sélectionnez d\'abord un client.', 'error'); return; }
  const btn = document.getElementById('membershipSubmit');
  btn.disabled = true;
  try {
    const r = await fetch('/api/admin/memberships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id:        _foundClientId,
        plan_id:        document.getElementById('mPlanId').value,
        start_date:     document.getElementById('mStartDate').value,
        payment_status: document.getElementById('mPayment').value
      })
    }).then(r => r.json());
    if (r.success) {
      showAlert('membershipAlert', 'Abonnement assigné avec succès.', 'success');
      _foundClientId = null; setText('clientFound', ''); document.getElementById('mEmail').value = '';
    } else showAlert('membershipAlert', r.error || 'Erreur.', 'error');
  } finally { btn.disabled = false; }
}

/* ── Payment ── */
async function lookupPaymentClient() {
  const email = document.getElementById('pEmail').value.trim();
  if (!email) return;
  try {
    const detail = await fetch(`/api/cashier/clients?q=${encodeURIComponent(email)}`).then(r => r.json());
    const c = detail.find(x => x.email.toLowerCase() === email.toLowerCase());
    if (c) {
      _payClientId = c.id; _payMembershipId = null;
      const detail2 = await fetch(`/api/admin/users/${c.id}`).then(r => r.json());
      const active  = detail2.memberships?.find(m => m.status === 'active');
      if (active) _payMembershipId = active.id;
      setText('paymentClientFound', `✓ ${c.first_name} ${c.last_name}${active ? ' — ' + active.plan_name : ''}`);
    } else {
      _payClientId = null;
      setText('paymentClientFound', 'Client introuvable.');
    }
  } catch { setText('paymentClientFound', 'Erreur réseau.'); }
}

async function submitPayment() {
  if (!_payClientId) { showAlert('paymentAlert', 'Sélectionnez d\'abord un client.', 'error'); return; }
  const btn = document.getElementById('paymentSubmit');
  btn.disabled = true;
  try {
    const r = await fetch('/api/admin/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id:       _payClientId,
        membership_id: _payMembershipId,
        amount:        document.getElementById('pAmount').value,
        method:        document.getElementById('pMethod').value,
        notes:         document.getElementById('pNotes').value
      })
    }).then(r => r.json());
    if (r.success) {
      showAlert('paymentAlert', 'Paiement enregistré.', 'success');
      _payClientId = null; _payMembershipId = null;
      document.getElementById('pEmail').value = '';
      setText('paymentClientFound', '');
      document.getElementById('pAmount').value = '';
    } else showAlert('paymentAlert', r.error || 'Erreur.', 'error');
  } finally { btn.disabled = false; }
}

/* ── Payment history ── */
async function loadPaymentHistory() {
  try {
    const rows = await fetch('/api/admin/payments').then(r => r.json());
    const el   = document.getElementById('historyTable');
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

function fmtDatetime(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

/* ── New client ── */
function openNewClientModal() {
  ['ncFirst','ncLast','ncEmail','ncPhone'].forEach(id => { document.getElementById(id).value = ''; });
  showAlert('newClientAlert', '', '');
  document.getElementById('newClientModal').classList.add('open');
}
function closeNewClientModal() { document.getElementById('newClientModal').classList.remove('open'); }

async function submitNewClient() {
  try {
    const r = await fetch('/api/cashier/clients/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: document.getElementById('ncFirst').value,
        last_name:  document.getElementById('ncLast').value,
        email:      document.getElementById('ncEmail').value,
        phone:      document.getElementById('ncPhone').value
      })
    }).then(r => r.json());
    if (r.success) {
      showAlert('newClientAlert', `Client créé. Mot de passe provisoire : ${r.temp_password}`, 'success');
      setTimeout(closeNewClientModal, 2500);
    } else showAlert('newClientAlert', r.error || 'Erreur.', 'error');
  } catch { showAlert('newClientAlert', 'Erreur réseau.', 'error'); }
}

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = msg ? `alert ${type} show` : 'alert';
}

/* ── Sidebar ── */
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
function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg; el.className = 'alert' + (type ? ' ' + type : '');
  if (type) el.classList.add('show');
}

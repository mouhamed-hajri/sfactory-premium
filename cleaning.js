'use strict';

(async function init() {
  try {
    const res  = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.authenticated || !['cleaning','admin'].includes(data.user.role)) {
      window.location.href = 'login.html'; return;
    }
    const u = data.user;
    const initials = (u.first_name[0] + u.last_name[0]).toUpperCase();
    setText('userAvatar', initials); setText('topbarAvatar', initials);
    setText('sidebarName', u.first_name + ' ' + u.last_name);
    setText('topbarName', u.first_name);
    loadTasks();
  } catch { window.location.href = 'login.html'; }
})();

/* ── Navigation ── */
const sectionTitles = { tasks: 'Mes tâches', shifts: 'Mon planning' };
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
  document.getElementById('sec-' + name)?.classList.add('active');
  document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add('active');
  setText('topbarTitle', sectionTitles[name] || name);
  if (name === 'shifts' && !_loaded.shifts) { _loaded.shifts = true; loadShifts(); }
}

/* ── Tasks ── */
async function loadTasks() {
  try {
    const tasks = await fetch('/api/cleaning/tasks').then(r => r.json());
    const el    = document.getElementById('tasksCard');

    if (!tasks.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>Aucune tâche assignée.</p></div>';
      return;
    }

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${tasks.map(t => `
          <div class="task-item ${t.is_done ? 'done' : ''}" id="task-${t.id}">
            <div class="task-body">
              <div class="task-title">${t.title}</div>
              ${t.area  ? `<div class="task-meta">📍 ${t.area}</div>`  : ''}
              ${t.shift ? `<div class="task-meta">🕐 ${t.shift}</div>` : ''}
              ${t.done_at ? `<div class="task-meta" style="color:var(--green);">✓ Fait le ${fmtDatetime(t.done_at)}</div>` : ''}
            </div>
            ${!t.is_done ? `<button class="btn btn-gold btn-sm" onclick="markDone(${t.id}, this)">Marquer fait</button>` : '<span class="badge green">Fait</span>'}
          </div>`).join('')}
      </div>`;
  } catch {
    document.getElementById('tasksCard').innerHTML = '<div class="empty-state"><p>Erreur chargement.</p></div>';
  }
}

async function markDone(id, btn) {
  btn.disabled = true;
  try {
    const r = await fetch(`/api/cleaning/tasks/${id}/done`, { method: 'PATCH' }).then(r => r.json());
    if (r.success) {
      const item = document.getElementById('task-' + id);
      if (item) {
        item.classList.add('done');
        btn.replaceWith(Object.assign(document.createElement('span'), { className: 'badge green', textContent: 'Fait' }));
      }
    }
  } catch { btn.disabled = false; }
}

/* ── Shifts ── */
async function loadShifts() {
  try {
    const shifts = await fetch('/api/cleaning/shifts').then(r => r.json());
    const el     = document.getElementById('shiftsCard');

    if (!shifts.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>Aucun shift programmé.</p></div>';
      return;
    }

    el.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Date</th><th>Début</th><th>Fin</th><th>Zone</th><th>Notes</th></tr></thead>
        <tbody>${shifts.map(s => `
          <tr>
            <td><strong>${fmtDate(s.shift_date)}</strong></td>
            <td>${s.start_time}</td>
            <td>${s.end_time}</td>
            <td>${s.area || '—'}</td>
            <td>${s.notes || '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch {
    document.getElementById('shiftsCard').innerHTML = '<div class="empty-state"><p>Erreur chargement.</p></div>';
  }
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
function fmtDate(str) { if (!str) return '—'; return new Date(str).toLocaleDateString('fr-FR', { weekday:'short', day:'2-digit', month:'long', year:'numeric' }); }
function fmtDatetime(str) { if (!str) return '—'; return new Date(str).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }

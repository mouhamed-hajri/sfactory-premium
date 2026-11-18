/* ============================
   S-Factory Premium — login.js
   ============================ */
'use strict';

/* ── Tab switching ── */
function switchTab(tab) {
  const loginForm    = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabLogin     = document.getElementById('tabLogin');
  const tabRegister  = document.getElementById('tabRegister');

  clearAlert();

  if (tab === 'login') {
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
  } else {
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
  }
}

/* ── Password visibility toggle ── */
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.style.color = 'var(--gold)';
  } else {
    input.type = 'password';
    btn.style.color = '';
  }
}

/* ── Alert helpers ── */
function showAlert(message, type) {
  const box = document.getElementById('formAlert');
  box.textContent = message;
  box.className = 'form-alert ' + type;
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearAlert() {
  const box = document.getElementById('formAlert');
  box.style.display = 'none';
  box.className = 'form-alert';
  box.textContent = '';
}

function setLoading(btnId, loading, defaultText) {
  const btn = document.getElementById(btnId);
  btn.disabled = loading;
  btn.textContent = loading ? 'Chargement…' : defaultText;
}

/* ── Redirect after auth ── */
function redirectAfterAuth(role) {
  const map = {
    admin:    'admin.html',
    coach:    'coach.html',
    cashier:  'cashier.html',
    cleaning: 'cleaning.html',
    client:   'dashboard.html'
  };
  window.location.href = map[role] || 'dashboard.html';
}

/* ── Check if already logged in ── */
(function checkSession() {
  fetch('/api/auth/me')
    .then(r => r.json())
    .then(data => {
      if (data.authenticated) redirectAfterAuth(data.user.role);
    })
    .catch(() => {});
})();

/* ── Login form ── */
document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  clearAlert();

  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showAlert('Veuillez remplir tous les champs.', 'error');
    return;
  }

  setLoading('loginBtn', true, 'Se connecter');

  try {
    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showAlert('Connexion réussie ! Redirection…', 'success');
      setTimeout(() => redirectAfterAuth(data.role), 700);
    } else {
      showAlert(data.error || 'Erreur de connexion.', 'error');
      setLoading('loginBtn', false, 'Se connecter');
    }
  } catch {
    showAlert('Erreur réseau. Vérifiez votre connexion.', 'error');
    setLoading('loginBtn', false, 'Se connecter');
  }
});

/* ── Register form ── */
document.getElementById('registerForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  clearAlert();

  const first_name = document.getElementById('regFirstName').value.trim();
  const last_name  = document.getElementById('regLastName').value.trim();
  const email      = document.getElementById('regEmail').value.trim();
  const phone      = document.getElementById('regPhone').value.trim();
  const goal       = document.getElementById('regGoal').value;
  const password   = document.getElementById('regPassword').value;
  const confirm    = document.getElementById('regConfirm').value;

  if (!first_name || !last_name || !email || !password) {
    showAlert('Prénom, nom, email et mot de passe sont obligatoires.', 'error');
    return;
  }

  if (password.length < 6) {
    showAlert('Le mot de passe doit contenir au moins 6 caractères.', 'error');
    return;
  }

  if (password !== confirm) {
    showAlert('Les mots de passe ne correspondent pas.', 'error');
    return;
  }

  setLoading('registerBtn', true, 'Créer mon compte');

  try {
    const res  = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name, last_name, email, phone, goal, password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showAlert('Compte créé avec succès ! Redirection…', 'success');
      setTimeout(() => redirectAfterAuth('client'), 800);
    } else {
      showAlert(data.error || 'Erreur lors de la création du compte.', 'error');
      setLoading('registerBtn', false, 'Créer mon compte');
    }
  } catch {
    showAlert('Erreur réseau. Vérifiez votre connexion.', 'error');
    setLoading('registerBtn', false, 'Créer mon compte');
  }
});

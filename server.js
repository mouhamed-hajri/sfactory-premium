'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const session  = require('express-session');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const QRCode   = require('qrcode');

const app  = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

/* ══════════════════════════════════════════════════════
   sql.js compatibility shim
   ══════════════════════════════════════════════════════ */
async function createDatabase(dbPath) {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  const sqlDb = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();

  function save() {
    fs.writeFileSync(dbPath, Buffer.from(sqlDb.export()));
  }

  function toArray(args) {
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    return Array.from(args);
  }

  return {
    pragma(str) {
      sqlDb.run('PRAGMA ' + str + ';');
    },
    exec(sql) {
      sqlDb.exec(sql);
      save();
    },
    prepare(sql) {
      return {
        get(...args) {
          const params = toArray(args);
          const stmt   = sqlDb.prepare(sql);
          if (params.length) stmt.bind(params);
          const row = stmt.step() ? stmt.getAsObject() : undefined;
          stmt.free();
          return row;
        },
        all(...args) {
          const params = toArray(args);
          const stmt   = sqlDb.prepare(sql);
          if (params.length) stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        },
        run(...args) {
          const params = toArray(args);
          sqlDb.run(sql, params);
          const idRes = sqlDb.exec('SELECT last_insert_rowid()');
          const lastInsertRowid = idRes[0]?.values[0][0] ?? null;
          const changes         = sqlDb.getRowsModified();
          save();
          return { lastInsertRowid, changes };
        }
      };
    }
  };
}

/* ══════════════════════════════════════════════════════
   Bootstrap
   ══════════════════════════════════════════════════════ */
async function start() {

  const dbPath = process.env.DB_PATH || path.join(__dirname, 'sfactory.db');
  const db = await createDatabase(dbPath);
  db.pragma('foreign_keys = ON');

  /* ── Core schema ── */
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name    TEXT    NOT NULL,
      last_name     TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      phone         TEXT,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'client',
      avatar_url    TEXT,
      gender        TEXT,
      birth_date    DATE,
      goal          TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login    DATETIME
    );

    CREATE TABLE IF NOT EXISTS membership_plans (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      price_tnd     REAL,
      duration_days INTEGER NOT NULL DEFAULT 30,
      description   TEXT,
      features      TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_memberships (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL,
      plan_id        INTEGER NOT NULL,
      start_date     DATE    NOT NULL,
      end_date       DATE    NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'active',
      payment_status TEXT    NOT NULL DEFAULT 'pending',
      assigned_by    INTEGER,
      notes          TEXT,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES membership_plans(id)
    );

    CREATE TABLE IF NOT EXISTS coaches (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER,
      full_name  TEXT NOT NULL,
      specialty  TEXT,
      bio        TEXT,
      photo_url  TEXT,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS training_sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_id     INTEGER NOT NULL,
      client_id    INTEGER NOT NULL,
      scheduled_at DATETIME NOT NULL,
      duration_min INTEGER  NOT NULL DEFAULT 60,
      session_type TEXT,
      status       TEXT     NOT NULL DEFAULT 'scheduled',
      client_notes TEXT,
      coach_notes  TEXT,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (coach_id)  REFERENCES coaches(id),
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS check_ins (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      check_in_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      check_out_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      membership_id INTEGER,
      amount        REAL    NOT NULL,
      currency      TEXT    NOT NULL DEFAULT 'TND',
      method        TEXT    NOT NULL DEFAULT 'cash',
      status        TEXT    NOT NULL DEFAULT 'paid',
      reference     TEXT,
      paid_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      notes         TEXT,
      FOREIGN KEY (user_id)       REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (membership_id) REFERENCES user_memberships(id)
    );

    CREATE TABLE IF NOT EXISTS body_measurements (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL,
      recorded_at    DATE    NOT NULL DEFAULT CURRENT_DATE,
      weight_kg      REAL,
      height_cm      REAL,
      body_fat_pct   REAL,
      muscle_mass_kg REAL,
      chest_cm       REAL,
      waist_cm       REAL,
      hips_cm        REAL,
      bicep_cm       REAL,
      notes          TEXT,
      recorded_by    INTEGER,
      FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recorded_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_goals (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      goal_type     TEXT    NOT NULL,
      description   TEXT,
      target_value  REAL,
      current_value REAL,
      unit          TEXT,
      target_date   DATE,
      status        TEXT    NOT NULL DEFAULT 'active',
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      title      TEXT    NOT NULL,
      message    TEXT,
      type       TEXT    NOT NULL DEFAULT 'info',
      is_read    INTEGER NOT NULL DEFAULT 0,
      action_url TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cleaning_tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      area        TEXT,
      shift       TEXT,
      assigned_to INTEGER,
      is_done     INTEGER NOT NULL DEFAULT 0,
      done_at     DATETIME,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_to) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      shift_date DATE    NOT NULL,
      start_time TEXT    NOT NULL,
      end_time   TEXT    NOT NULL,
      area       TEXT,
      notes      TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_email       ON users (email);
    CREATE INDEX IF NOT EXISTS idx_um_user           ON user_memberships (user_id);
    CREATE INDEX IF NOT EXISTS idx_ts_client         ON training_sessions (client_id);
    CREATE INDEX IF NOT EXISTS idx_ci_user           ON check_ins (user_id);
    CREATE INDEX IF NOT EXISTS idx_notif_user        ON notifications (user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_shifts_user       ON shifts (user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned    ON cleaning_tasks (assigned_to);

    INSERT OR IGNORE INTO membership_plans (id, name, duration_days, description, features) VALUES
      (1, 'Basic',   30, 'Accès salle standard',
       'Accès 6j/7,Zone musculation,Zone cardio,Vestiaires & douches'),
      (2, 'Premium', 30, 'Accès complet + coaching',
       'Accès 7j/7,Zone musculation,Zone cardio,Vestiaires & douches,2 séances coaching/mois,Bilan nutritionnel'),
      (3, 'VIP',     30, 'Expérience premium illimitée',
       'Accès 7j/7 illimité,Zone musculation & cardio,Vestiaires premium,Coaching inclus,Suivi nutritionnel,Cours collectifs,Zone VIP exclusive');

    INSERT OR IGNORE INTO coaches (id, full_name, specialty) VALUES
      (1, 'Coach Fitness',        'fitness'),
      (2, 'Coach Musculation',    'musculation'),
      (3, 'Coach Transformation', 'transformation');
  `);

  /* ── Migrations: add columns if missing ── */
  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('checkin_token')) {
    db.exec('ALTER TABLE users ADD COLUMN checkin_token TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_token ON users (checkin_token)');
  }

  /* Generate tokens for any user who doesn't have one */
  const noToken = db.prepare('SELECT id FROM users WHERE checkin_token IS NULL').all();
  for (const u of noToken) {
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('UPDATE users SET checkin_token = ? WHERE id = ?').run(token, u.id);
  }

  /* ── Schema migrations table ── */
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  function runMigration(name, fn) {
    const done = db.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(name);
    if (done) return;
    fn();
    db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    console.log(`  ✓  Migration: ${name}`);
  }

  /* ── Seed default admin (first run only) ── */
  const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!adminExists) {
    // Admin password comes from ADMIN_PASSWORD, or a random one printed once on first run.
    const adminPw = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
    const hash  = bcrypt.hashSync(adminPw, 12);
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare(`
      INSERT INTO users (first_name, last_name, email, password_hash, role, checkin_token)
      VALUES (?, ?, ?, ?, 'admin', ?)
    `).run('Admin', 'S-Factory', 'admin@sfactory.com', hash, token);
    console.log(`  ✓  Admin created  →  admin@sfactory.com${process.env.ADMIN_PASSWORD ? ' (password from ADMIN_PASSWORD)' : ' / ' + adminPw + '  (change it after first login)'}`);
    db.prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)').run('admin_pw_v2');
  }

  /* ── Migration: demo / sample data ── */
  runMigration('demo_data_v1', () => {
    // Demo accounts share one random password, printed once.
    const demoPw = crypto.randomBytes(9).toString('base64url');
    console.log(`  ✓  Demo staff/client accounts created, password: ${demoPw}`);
    function rng(seed) {
      const s = Math.sin(seed + 1) * 43758.5453123;
      return s - Math.floor(s);
    }

    /* Staff */
    const staffList = [
      { first_name: 'Ahmed',   last_name: 'Ben Salah', email: 'coach@sfactory.tn',      role: 'coach' },
      { first_name: 'Fatma',   last_name: 'Trabelsi',  email: 'caisse@sfactory.tn',     role: 'cashier' },
      { first_name: 'Mohamed', last_name: 'Gharbi',    email: 'nettoyage@sfactory.tn',  role: 'cleaning' }
    ];
    for (const s of staffList) {
      if (!db.prepare('SELECT id FROM users WHERE email = ?').get(s.email)) {
        const token = crypto.randomBytes(24).toString('hex');
        db.prepare(`
          INSERT INTO users (first_name, last_name, email, password_hash, role, checkin_token)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(s.first_name, s.last_name, s.email, bcrypt.hashSync(demoPw, 12), s.role, token);
      }
    }

    /* Link coach user → coaches table */
    const coachUser = db.prepare("SELECT id FROM users WHERE email = 'coach@sfactory.tn'").get();
    let coachRowId = null;
    if (coachUser) {
      let cr = db.prepare('SELECT id FROM coaches WHERE user_id = ?').get(coachUser.id);
      if (!cr) {
        const r = db.prepare("INSERT INTO coaches (user_id, full_name, specialty) VALUES (?, 'Ahmed Ben Salah', 'musculation & cardio')")
          .run(coachUser.id);
        coachRowId = r.lastInsertRowid;
      } else {
        coachRowId = cr.id;
      }
    }

    /* 12 Tunisian clients */
    const clientDefs = [
      { first_name: 'Karim',   last_name: 'Mansouri', email: 'karim.mansouri@gmail.com',  gender: 'M', goal: 'Prise de masse',        plan: 2 },
      { first_name: 'Sana',    last_name: 'Khelifi',  email: 'sana.khelifi@gmail.com',    gender: 'F', goal: 'Perte de poids',         plan: 1 },
      { first_name: 'Youssef', last_name: 'Ammar',    email: 'youssef.ammar@gmail.com',   gender: 'M', goal: 'Remise en forme',        plan: 1 },
      { first_name: 'Mariem',  last_name: 'Zaabi',    email: 'mariem.zaabi@gmail.com',    gender: 'F', goal: 'Tonification',           plan: 3 },
      { first_name: 'Anis',    last_name: 'Hammami',  email: 'anis.hammami@gmail.com',    gender: 'M', goal: 'Cardio endurance',       plan: 2 },
      { first_name: 'Rania',   last_name: 'Ayari',    email: 'rania.ayari@gmail.com',     gender: 'F', goal: 'Bien-être général',      plan: 1 },
      { first_name: 'Walid',   last_name: 'Chaabane', email: 'walid.chaabane@gmail.com',  gender: 'M', goal: 'Prise de masse',         plan: 3 },
      { first_name: 'Hajer',   last_name: 'Jebali',   email: 'hajer.jebali@gmail.com',    gender: 'F', goal: 'Perte de poids',         plan: 1 },
      { first_name: 'Zied',    last_name: 'Bouaziz',  email: 'zied.bouaziz@gmail.com',    gender: 'M', goal: 'Remise en forme',        plan: 2 },
      { first_name: 'Ines',    last_name: 'Ben Ali',  email: 'ines.benali@gmail.com',     gender: 'F', goal: 'Yoga & souplesse',       plan: 2 },
      { first_name: 'Tarek',   last_name: 'Gharbi',   email: 'tarek.gharbi@gmail.com',    gender: 'M', goal: 'Compétition fitness',    plan: 3 },
      { first_name: 'Nour',    last_name: 'Trabelsi', email: 'nour.trabelsi@gmail.com',   gender: 'F', goal: 'Maintien de la forme',   plan: 1 }
    ];

    const clientIds = [];
    for (let i = 0; i < clientDefs.length; i++) {
      const c = clientDefs[i];
      let row = db.prepare('SELECT id FROM users WHERE email = ?').get(c.email);
      if (!row) {
        const token = crypto.randomBytes(24).toString('hex');
        const r = db.prepare(`
          INSERT INTO users (first_name, last_name, email, password_hash, role, gender, goal, checkin_token)
          VALUES (?, ?, ?, ?, 'client', ?, ?, ?)
        `).run(c.first_name, c.last_name, c.email, bcrypt.hashSync(demoPw, 12), c.gender, c.goal, token);
        clientIds.push({ id: r.lastInsertRowid, plan: c.plan, idx: i });
      } else {
        clientIds.push({ id: row.id, plan: c.plan, idx: i });
      }
    }

    /* Memberships */
    const today       = new Date();
    const planPrices  = { 1: 60, 2: 90, 3: 150 };
    const adminRow    = db.prepare("SELECT id FROM users WHERE email = 'admin@sfactory.com'").get();
    const assignedBy  = adminRow?.id || 1;

    for (const { id: uid, plan: planId, idx } of clientIds) {
      if (db.prepare("SELECT id FROM user_memberships WHERE user_id = ? AND status = 'active'").get(uid)) continue;
      const startOffset = 15 + Math.floor(rng(idx * 7 + 1) * 10);
      const sd = new Date(today); sd.setDate(sd.getDate() - startOffset);
      const ed = new Date(sd);    ed.setDate(ed.getDate() + 30);
      const startStr = sd.toISOString().split('T')[0];
      const endStr   = ed.toISOString().split('T')[0];
      const mr = db.prepare(`
        INSERT INTO user_memberships (user_id, plan_id, start_date, end_date, status, payment_status, assigned_by)
        VALUES (?, ?, ?, ?, 'active', 'paid', ?)
      `).run(uid, planId, startStr, endStr, assignedBy);
      db.prepare("INSERT INTO payments (user_id, membership_id, amount, method, status) VALUES (?, ?, ?, 'cash', 'paid')")
        .run(uid, mr.lastInsertRowid, planPrices[planId]);
    }

    /* Check-ins — past 30 days */
    const rates = [0.65, 0.55, 0.50, 0.70, 0.60, 0.45, 0.68, 0.52, 0.58, 0.63, 0.72, 0.48];
    for (let dayOff = 30; dayOff >= 1; dayOff--) {
      const day = new Date(today);
      day.setDate(day.getDate() - dayOff);
      const dateStr = day.toISOString().split('T')[0];

      for (let i = 0; i < clientIds.length; i++) {
        const uid  = clientIds[i].id;
        const seed = i * 1000 + dayOff * 13;
        if (rng(seed) > rates[i]) continue;

        const isMorning = rng(seed + 1) < 0.45;
        const baseHour  = isMorning ? 7 : 18;
        const minOff    = Math.floor(rng(seed + 2) * 120);
        const inH = baseHour + Math.floor(minOff / 60);
        const inM = minOff % 60;
        const dur = 45 + Math.floor(rng(seed + 3) * 46);
        const outTotal = inH * 60 + inM + dur;
        const outH = Math.floor(outTotal / 60);
        const outM = outTotal % 60;

        const inStr  = `${dateStr} ${String(inH).padStart(2,'0')}:${String(inM).padStart(2,'0')}:00`;
        const outStr = `${dateStr} ${String(outH).padStart(2,'0')}:${String(outM).padStart(2,'0')}:00`;

        if (!db.prepare("SELECT id FROM check_ins WHERE user_id = ? AND date(check_in_at) = ?").get(uid, dateStr)) {
          db.prepare('INSERT INTO check_ins (user_id, check_in_at, check_out_at) VALUES (?, ?, ?)')
            .run(uid, inStr, outStr);
        }
      }
    }

    /* Training sessions (coach → first 5 clients, 4 sessions each) */
    if (coachRowId) {
      for (let ci = 0; ci < 5; ci++) {
        for (let si = 0; si < 4; si++) {
          const d = new Date(today);
          d.setDate(d.getDate() - (25 - ci * 5 - si * 2));
          const scheduled = `${d.toISOString().split('T')[0]} 10:00:00`;
          db.prepare(`
            INSERT INTO training_sessions (coach_id, client_id, scheduled_at, duration_min, session_type, status)
            VALUES (?, ?, ?, 60, 'individual', 'completed')
          `).run(coachRowId, clientIds[ci].id, scheduled);
        }
      }
    }

    /* Body measurements for 4 clients */
    const measures = [
      [82, 178, 18, 38, 98,  88, 95,  33],
      [61, 165, 24, 26, 88,  72, 96,  27],
      [79, 175, 20, 36, 95,  85, 92,  31],
      [95, 182, 15, 44, 108, 92, 100, 38]
    ];
    for (let i = 0; i < 4; i++) {
      const uid = clientIds[i].id;
      if (!db.prepare('SELECT id FROM body_measurements WHERE user_id = ?').get(uid)) {
        const [w, h, f, mu, ch, wa, hi, bi] = measures[i];
        db.prepare(`
          INSERT INTO body_measurements (user_id, weight_kg, height_cm, body_fat_pct, muscle_mass_kg, chest_cm, waist_cm, hips_cm, bicep_cm)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(uid, w, h, f, mu, ch, wa, hi, bi);
      }
    }

    /* Cleaning tasks */
    const cleanUser = db.prepare("SELECT id FROM users WHERE email = 'nettoyage@sfactory.tn'").get();
    const cleanId   = cleanUser?.id || null;
    const taskDefs  = [
      ['Nettoyage salle de musculation',   'Musculation', 'matin'],
      ['Désinfection des appareils cardio','Cardio',      'matin'],
      ['Nettoyage vestiaires hommes',      'Vestiaires',  'soir' ],
      ['Nettoyage vestiaires femmes',      'Vestiaires',  'soir' ],
      ['Entretien réception & couloirs',   'Accueil',     'matin']
    ];
    for (const [title, area, shift] of taskDefs) {
      if (!db.prepare('SELECT id FROM cleaning_tasks WHERE title = ?').get(title)) {
        db.prepare('INSERT INTO cleaning_tasks (title, area, shift, assigned_to) VALUES (?, ?, ?, ?)')
          .run(title, area, shift, cleanId);
      }
    }

    /* Shifts — 7 days back and 7 days forward */
    if (cleanId) {
      for (let d = -7; d <= 7; d++) {
        const day = new Date(today);
        day.setDate(day.getDate() + d);
        const ds = day.toISOString().split('T')[0];
        if (!db.prepare('SELECT id FROM shifts WHERE user_id = ? AND shift_date = ?').get(cleanId, ds)) {
          db.prepare("INSERT INTO shifts (user_id, shift_date, start_time, end_time, area) VALUES (?, ?, '07:00', '15:00', 'Salle complète')")
            .run(cleanId, ds);
        }
      }
    }
  });

  /* ── Middleware ── */
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname)));

  app.use(session({
    // ponytail: random fallback logs everyone out on restart; set SESSION_SECRET in production
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
  }));

  /* ── Auth guard ── */
  function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Non authentifié.' });
    next();
  }

  /* ── Role guard ── */
  function requireRole(...roles) {
    return (req, res, next) => {
      if (!req.session.userId) return res.status(401).json({ error: 'Non authentifié.' });
      if (!roles.includes(req.session.role)) return res.status(403).json({ error: 'Accès refusé.' });
      next();
    };
  }

  /* ══════════════════════════════════════════════
     AUTH ROUTES
     ══════════════════════════════════════════════ */

  app.post('/api/auth/register', (req, res) => {
    const { first_name, last_name, email, phone, password, goal } = req.body;

    if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: 'Prénom, nom, email et mot de passe sont obligatoires.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Adresse email invalide.' });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
    if (existing) return res.status(409).json({ error: 'Cette adresse email est déjà utilisée.' });

    const hash   = bcrypt.hashSync(password, 12);
    const token  = crypto.randomBytes(24).toString('hex');
    const result = db.prepare(`
      INSERT INTO users (first_name, last_name, email, phone, password_hash, goal, checkin_token)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      first_name.trim(), last_name.trim(),
      email.toLowerCase().trim(), phone?.trim() || null,
      hash, goal || null, token
    );

    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'success')
    `).run(result.lastInsertRowid,
      'Bienvenue chez S-Factory Premium !',
      'Votre compte a été créé. Contactez-nous pour activer votre abonnement.');

    req.session.userId = result.lastInsertRowid;
    req.session.role   = 'client';
    res.json({ success: true, role: 'client' });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email?.trim() || !password)
      return res.status(400).json({ error: 'Email et mot de passe requis.' });

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1')
                   .get(email.toLowerCase().trim());

    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });

    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    req.session.userId = user.id;
    req.session.role   = user.role;
    res.json({ success: true, role: user.role });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
  });

  app.get('/api/auth/me', (req, res) => {
    if (!req.session.userId) return res.json({ authenticated: false });

    const user = db.prepare(
      'SELECT id, first_name, last_name, email, phone, role, avatar_url, goal, created_at FROM users WHERE id = ?'
    ).get(req.session.userId);

    if (!user) { req.session.destroy(() => {}); return res.json({ authenticated: false }); }
    res.json({ authenticated: true, user });
  });

  /* ══════════════════════════════════════════════
     PROFILE ROUTES
     ══════════════════════════════════════════════ */

  app.get('/api/profile/me', requireAuth, (req, res) => {
    const uid = req.session.userId;

    const user = db.prepare(`
      SELECT id, first_name, last_name, email, phone, role,
             avatar_url, gender, birth_date, goal, created_at, last_login
      FROM users WHERE id = ?
    `).get(uid);

    const membership = db.prepare(`
      SELECT um.*, mp.name AS plan_name, mp.features, mp.description AS plan_desc
      FROM   user_memberships um
      JOIN   membership_plans mp ON mp.id = um.plan_id
      WHERE  um.user_id = ? AND um.status = 'active'
      ORDER  BY um.end_date DESC LIMIT 1
    `).get(uid);

    const stats = {
      checkIns: db.prepare('SELECT COUNT(*) AS n FROM check_ins WHERE user_id = ?').get(uid).n,
      sessions: db.prepare("SELECT COUNT(*) AS n FROM training_sessions WHERE client_id = ? AND status != 'cancelled'").get(uid).n,
      payments: db.prepare("SELECT COUNT(*) AS n FROM payments WHERE user_id = ? AND status = 'paid'").get(uid).n
    };

    const notifications = db.prepare(`
      SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(uid);

    const lastMeasurement = db.prepare(`
      SELECT * FROM body_measurements WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1
    `).get(uid);

    res.json({ user, membership: membership || null, stats, notifications, lastMeasurement: lastMeasurement || null });
  });

  app.patch('/api/notifications/:id/read', requireAuth, (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.session.userId);
    res.json({ success: true });
  });

  /* ══════════════════════════════════════════════
     QR CODE
     ══════════════════════════════════════════════ */

  /* Return QR code as data URL for the logged-in client */
  app.get('/api/qr/my', requireAuth, async (req, res) => {
    const user = db.prepare('SELECT checkin_token FROM users WHERE id = ?').get(req.session.userId);
    if (!user?.checkin_token) return res.status(404).json({ error: 'Token introuvable.' });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const url     = `${baseUrl}/checkin?token=${user.checkin_token}`;

    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
      res.json({ qr: dataUrl, url });
    } catch {
      res.status(500).json({ error: 'Erreur génération QR.' });
    }
  });

  /* ══════════════════════════════════════════════
     QR CHECK-IN / CHECK-OUT  (public, no auth)
     ══════════════════════════════════════════════ */

  app.get('/checkin', (req, res) => {
    const { token } = req.query;
    if (!token) return res.redirect('/');

    const user = db.prepare(
      'SELECT id, first_name, last_name, is_active FROM users WHERE checkin_token = ?'
    ).get(token);

    if (!user || !user.is_active) {
      return res.send(checkinPage('error', 'Token invalide ou compte désactivé.', '', ''));
    }

    /* Find the last check-in record */
    const last = db.prepare(
      'SELECT * FROM check_ins WHERE user_id = ? ORDER BY check_in_at DESC LIMIT 1'
    ).get(user.id);

    const name = user.first_name + ' ' + user.last_name;

    if (!last || last.check_out_at) {
      /* No open session → register entry */
      db.prepare('INSERT INTO check_ins (user_id) VALUES (?)').run(user.id);
      return res.send(checkinPage('in', name, '', ''));
    } else {
      /* Open session exists → register exit */
      const inTime  = new Date(last.check_in_at);
      const outTime = new Date();
      const durMin  = Math.round((outTime - inTime) / 60000);
      const durStr  = durMin >= 60
        ? `${Math.floor(durMin / 60)}h${String(durMin % 60).padStart(2, '0')}`
        : `${durMin} min`;

      db.prepare('UPDATE check_ins SET check_out_at = CURRENT_TIMESTAMP WHERE id = ?').run(last.id);
      return res.send(checkinPage('out', name, durStr, fmtTimeStr(last.check_in_at)));
    }
  });

  function fmtTimeStr(dt) {
    return new Date(dt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function checkinPage(type, name, duration, entryTime) {
    const isIn    = type === 'in';
    const isError = type === 'error';
    const bg      = isError ? '#1a0000' : (isIn ? '#001a0d' : '#0d0014');
    const accent  = isError ? '#ff4444' : (isIn ? '#2ecc71' : '#c9a84c');
    const icon    = isError ? '⚠️'       : (isIn ? '✅'      : '👋');
    const title   = isError ? 'Erreur'
                  : isIn    ? `Bienvenue, ${name} !`
                  :           `À bientôt, ${name} !`;
    const msg     = isError ? name
                  : isIn    ? 'Votre entrée a été enregistrée.'
                  :           `Séance terminée — Durée&nbsp;: <strong>${duration}</strong>`;
    const sub     = (!isIn && !isError) ? `<p style="color:#888;font-size:.85rem;margin-top:8px;">Entrée à ${entryTime}</p>` : '';

    return `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>S-Factory — Check-in</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Segoe UI',Arial,sans-serif;color:#fff;padding:24px;text-align:center}
.card{background:rgba(255,255,255,0.05);border:1px solid ${accent}33;border-radius:20px;padding:40px 32px;max-width:360px;width:100%;box-shadow:0 0 40px ${accent}22}
.icon{font-size:4rem;margin-bottom:20px;line-height:1}
.gym{font-size:.75rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${accent};margin-bottom:16px}
h1{font-size:1.35rem;font-weight:800;margin-bottom:10px;line-height:1.3}
p{font-size:.95rem;color:#ccc;line-height:1.6}
.time{display:inline-block;margin-top:18px;background:${accent}22;border:1px solid ${accent}44;color:${accent};font-size:1.1rem;font-weight:700;padding:10px 24px;border-radius:50px}
.back{display:inline-block;margin-top:28px;color:#555;font-size:.8rem;text-decoration:none}
</style>
</head><body>
<div class="card">
  <div class="icon">${icon}</div>
  <div class="gym">S-Factory Premium</div>
  <h1>${title}</h1>
  <p>${msg}</p>
  ${sub}
  ${(!isError && !isIn) ? `<div class="time">${duration}</div>` : ''}
</div>
<a class="back" href="javascript:window.close()">Fermer</a>
</body></html>`;
  }

  /* ══════════════════════════════════════════════
     ATTENDANCE / CALENDAR
     ══════════════════════════════════════════════ */

  /* Client's own attendance */
  app.get('/api/attendance/my', requireAuth, (req, res) => {
    const uid = req.session.userId;
    const rows = db.prepare(`
      SELECT id, check_in_at, check_out_at,
        CASE WHEN check_out_at IS NOT NULL
          THEN ROUND((julianday(check_out_at) - julianday(check_in_at)) * 1440)
          ELSE NULL END AS duration_min
      FROM check_ins WHERE user_id = ? ORDER BY check_in_at DESC
    `).all(uid);
    res.json(rows);
  });

  /* Admin/coach view any client's attendance */
  app.get('/api/attendance/user/:id', requireRole('admin', 'coach'), (req, res) => {
    const rows = db.prepare(`
      SELECT id, check_in_at, check_out_at,
        CASE WHEN check_out_at IS NOT NULL
          THEN ROUND((julianday(check_out_at) - julianday(check_in_at)) * 1440)
          ELSE NULL END AS duration_min
      FROM check_ins WHERE user_id = ? ORDER BY check_in_at DESC
    `).all(req.params.id);
    res.json(rows);
  });

  /* ══════════════════════════════════════════════
     ADMIN ROUTES
     ══════════════════════════════════════════════ */

  /* List all users */
  app.get('/api/admin/users', requireRole('admin'), (req, res) => {
    const users = db.prepare(`
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.role, u.is_active,
             u.created_at, u.last_login,
             mp.name AS plan_name, um.end_date AS plan_end, um.status AS plan_status
      FROM users u
      LEFT JOIN user_memberships um ON um.user_id = u.id AND um.status = 'active'
      LEFT JOIN membership_plans mp ON mp.id = um.plan_id
      ORDER BY u.created_at DESC
    `).all();
    res.json(users);
  });

  /* Get a single user detail */
  app.get('/api/admin/users/:id', requireRole('admin', 'cashier'), (req, res) => {
    const user = db.prepare(`
      SELECT id, first_name, last_name, email, phone, role, gender,
             birth_date, goal, is_active, created_at, last_login, checkin_token
      FROM users WHERE id = ?
    `).get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const memberships = db.prepare(`
      SELECT um.*, mp.name AS plan_name FROM user_memberships um
      JOIN membership_plans mp ON mp.id = um.plan_id
      WHERE um.user_id = ? ORDER BY um.created_at DESC
    `).all(req.params.id);

    const recentCheckins = db.prepare(`
      SELECT * FROM check_ins WHERE user_id = ? ORDER BY check_in_at DESC LIMIT 10
    `).all(req.params.id);

    res.json({ user, memberships, recentCheckins });
  });

  /* Toggle user active */
  app.patch('/api/admin/users/:id/active', requireRole('admin'), (req, res) => {
    db.prepare('UPDATE users SET is_active = CASE WHEN is_active=1 THEN 0 ELSE 1 END WHERE id = ?')
      .run(req.params.id);
    const u = db.prepare('SELECT is_active FROM users WHERE id = ?').get(req.params.id);
    res.json({ success: true, is_active: u.is_active });
  });

  /* Change user role */
  app.patch('/api/admin/users/:id/role', requireRole('admin'), (req, res) => {
    const { role } = req.body;
    const valid = ['client', 'coach', 'cashier', 'cleaning', 'admin'];
    if (!valid.includes(role)) return res.status(400).json({ error: 'Rôle invalide.' });
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
    res.json({ success: true });
  });

  /* All check-ins (admin) — optional date filter */
  app.get('/api/admin/checkins', requireRole('admin', 'coach'), (req, res) => {
    const { date, user_id } = req.query;
    let sql = `
      SELECT ci.id, ci.user_id, ci.check_in_at, ci.check_out_at,
        CASE WHEN ci.check_out_at IS NOT NULL
          THEN ROUND((julianday(ci.check_out_at) - julianday(ci.check_in_at)) * 1440)
          ELSE NULL END AS duration_min,
        u.first_name, u.last_name, u.email
      FROM check_ins ci
      JOIN users u ON u.id = ci.user_id
      WHERE 1=1
    `;
    const params = [];
    if (date)    { sql += " AND date(ci.check_in_at) = ?"; params.push(date); }
    if (user_id) { sql += " AND ci.user_id = ?"; params.push(user_id); }
    sql += " ORDER BY ci.check_in_at DESC LIMIT 200";
    res.json(db.prepare(sql).all(params));
  });

  /* Assign membership */
  app.post('/api/admin/memberships', requireRole('admin', 'cashier'), (req, res) => {
    const { user_id, plan_id, start_date, payment_status, notes } = req.body;
    if (!user_id || !plan_id || !start_date)
      return res.status(400).json({ error: 'user_id, plan_id et start_date sont requis.' });

    const plan = db.prepare('SELECT * FROM membership_plans WHERE id = ?').get(plan_id);
    if (!plan) return res.status(404).json({ error: 'Formule introuvable.' });

    const end = new Date(start_date);
    end.setDate(end.getDate() + plan.duration_days);
    const end_date = end.toISOString().split('T')[0];

    /* Deactivate any existing active membership */
    db.prepare("UPDATE user_memberships SET status = 'expired' WHERE user_id = ? AND status = 'active'")
      .run(user_id);

    const r = db.prepare(`
      INSERT INTO user_memberships (user_id, plan_id, start_date, end_date, payment_status, assigned_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(user_id, plan_id, start_date, end_date, payment_status || 'pending',
           req.session.userId, notes || null);

    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, 'success')`)
      .run(user_id, 'Abonnement activé', `Formule ${plan.name} activée jusqu'au ${end_date}.`);

    res.json({ success: true, membership_id: r.lastInsertRowid });
  });

  /* Record payment */
  app.post('/api/admin/payments', requireRole('admin', 'cashier'), (req, res) => {
    const { user_id, membership_id, amount, method, notes } = req.body;
    if (!user_id || !amount) return res.status(400).json({ error: 'user_id et amount requis.' });

    db.prepare(`
      INSERT INTO payments (user_id, membership_id, amount, method, notes) VALUES (?, ?, ?, ?, ?)
    `).run(user_id, membership_id || null, amount, method || 'cash', notes || null);

    if (membership_id) {
      db.prepare("UPDATE user_memberships SET payment_status = 'paid' WHERE id = ?").run(membership_id);
    }
    res.json({ success: true });
  });

  /* List membership plans */
  app.get('/api/plans', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM membership_plans WHERE is_active = 1').all());
  });

  /* ── Cleaning tasks (admin manages, cleaning reads) ── */
  app.get('/api/admin/cleaning/staff', requireRole('admin'), (req, res) => {
    res.json(db.prepare("SELECT id, first_name, last_name FROM users WHERE role = 'cleaning' AND is_active = 1").all());
  });

  app.post('/api/admin/cleaning/tasks', requireRole('admin'), (req, res) => {
    const { title, area, shift, assigned_to } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre requis.' });
    const r = db.prepare('INSERT INTO cleaning_tasks (title, area, shift, assigned_to) VALUES (?, ?, ?, ?)')
      .run(title, area || null, shift || null, assigned_to || null);
    res.json({ success: true, id: r.lastInsertRowid });
  });

  app.get('/api/admin/cleaning/tasks', requireRole('admin'), (req, res) => {
    const tasks = db.prepare(`
      SELECT ct.*, u.first_name, u.last_name FROM cleaning_tasks ct
      LEFT JOIN users u ON u.id = ct.assigned_to
      ORDER BY ct.created_at DESC
    `).all();
    res.json(tasks);
  });

  app.post('/api/admin/cleaning/shifts', requireRole('admin'), (req, res) => {
    const { user_id, shift_date, start_time, end_time, area, notes } = req.body;
    if (!user_id || !shift_date || !start_time || !end_time)
      return res.status(400).json({ error: 'user_id, shift_date, start_time et end_time requis.' });
    db.prepare('INSERT INTO shifts (user_id, shift_date, start_time, end_time, area, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(user_id, shift_date, start_time, end_time, area || null, notes || null);
    res.json({ success: true });
  });

  /* ── Admin dashboard stats ── */
  app.get('/api/admin/stats', requireRole('admin'), (req, res) => {
    const total    = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'client'").get().n;
    const active   = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'client' AND is_active = 1").get().n;
    const members  = db.prepare("SELECT COUNT(*) AS n FROM user_memberships WHERE status = 'active'").get().n;
    const todayIn  = db.prepare("SELECT COUNT(*) AS n FROM check_ins WHERE date(check_in_at) = date('now')").get().n;
    const revenue  = db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE status = 'paid'").get().n;
    res.json({ total, active, members, todayIn, revenue });
  });

  /* ══════════════════════════════════════════════
     COACH ROUTES
     ══════════════════════════════════════════════ */

  /* Coach's client list (via training_sessions) */
  app.get('/api/coach/clients', requireRole('coach', 'admin'), (req, res) => {
    const coachUser = db.prepare('SELECT id FROM coaches WHERE user_id = ?').get(req.session.userId);
    if (!coachUser) return res.json([]);
    const clients = db.prepare(`
      SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.phone,
        mp.name AS plan_name, um.end_date AS plan_end
      FROM training_sessions ts
      JOIN users u ON u.id = ts.client_id
      LEFT JOIN user_memberships um ON um.user_id = u.id AND um.status = 'active'
      LEFT JOIN membership_plans mp ON mp.id = um.plan_id
      WHERE ts.coach_id = ?
      ORDER BY u.first_name
    `).all(coachUser.id);
    res.json(clients);
  });

  /* Coach add notes to a training session */
  app.patch('/api/coach/sessions/:id/notes', requireRole('coach', 'admin'), (req, res) => {
    const { coach_notes } = req.body;
    db.prepare('UPDATE training_sessions SET coach_notes = ? WHERE id = ?')
      .run(coach_notes, req.params.id);
    res.json({ success: true });
  });

  /* List all clients for coach (simpler — all clients) */
  app.get('/api/coach/all-clients', requireRole('coach', 'admin'), (req, res) => {
    const clients = db.prepare(`
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
        mp.name AS plan_name, um.end_date AS plan_end,
        (SELECT COUNT(*) FROM check_ins ci WHERE ci.user_id = u.id) AS total_checkins
      FROM users u
      LEFT JOIN user_memberships um ON um.user_id = u.id AND um.status = 'active'
      LEFT JOIN membership_plans mp ON mp.id = um.plan_id
      WHERE u.role = 'client'
      ORDER BY u.first_name
    `).all();
    res.json(clients);
  });

  /* ══════════════════════════════════════════════
     CASHIER ROUTES
     ══════════════════════════════════════════════ */

  app.get('/api/cashier/clients', requireRole('cashier', 'admin'), (req, res) => {
    const { q } = req.query;
    let sql = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active,
        mp.name AS plan_name, um.end_date AS plan_end, um.payment_status
      FROM users u
      LEFT JOIN user_memberships um ON um.user_id = u.id AND um.status = 'active'
      LEFT JOIN membership_plans mp ON mp.id = um.plan_id
      WHERE u.role = 'client'
    `;
    const params = [];
    if (q) { sql += " AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)"; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    sql += ' ORDER BY u.first_name LIMIT 100';
    res.json(db.prepare(sql).all(params));
  });

  /* ══════════════════════════════════════════════
     CLEANING ROUTES
     ══════════════════════════════════════════════ */

  app.get('/api/cleaning/tasks', requireRole('cleaning', 'admin'), (req, res) => {
    const tasks = db.prepare(
      'SELECT * FROM cleaning_tasks WHERE assigned_to = ? OR assigned_to IS NULL ORDER BY created_at DESC'
    ).all(req.session.userId);
    res.json(tasks);
  });

  app.patch('/api/cleaning/tasks/:id/done', requireRole('cleaning', 'admin'), (req, res) => {
    db.prepare('UPDATE cleaning_tasks SET is_done = 1, done_at = CURRENT_TIMESTAMP WHERE id = ? AND (assigned_to = ? OR assigned_to IS NULL)')
      .run(req.params.id, req.session.userId);
    res.json({ success: true });
  });

  app.get('/api/cleaning/shifts', requireRole('cleaning', 'admin'), (req, res) => {
    const shifts = db.prepare(
      'SELECT * FROM shifts WHERE user_id = ? ORDER BY shift_date DESC, start_time'
    ).all(req.session.userId);
    res.json(shifts);
  });

  /* ══════════════════════════════════════════════
     CLIENT ROUTES
     ══════════════════════════════════════════════ */

  app.get('/api/client/sessions', requireAuth, (req, res) => {
    const sessions = db.prepare(`
      SELECT ts.*, c.full_name AS coach_name
      FROM training_sessions ts
      JOIN coaches c ON c.id = ts.coach_id
      WHERE ts.client_id = ?
      ORDER BY ts.scheduled_at DESC
    `).all(req.session.userId);
    res.json(sessions);
  });

  app.get('/api/client/measurements', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT * FROM body_measurements WHERE user_id = ? ORDER BY recorded_at DESC').all(req.session.userId));
  });

  app.patch('/api/profile/update', requireAuth, (req, res) => {
    const { first_name, last_name, phone, goal } = req.body;
    if (!first_name?.trim() || !last_name?.trim())
      return res.status(400).json({ error: 'Prénom et nom requis.' });
    db.prepare('UPDATE users SET first_name=?, last_name=?, phone=?, goal=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(first_name.trim(), last_name.trim(), phone?.trim() || null, goal || null, req.session.userId);
    res.json({ success: true });
  });

  app.patch('/api/auth/change-password', requireAuth, (req, res) => {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ error: 'Les deux mots de passe sont requis.' });
    if (new_password.length < 6)
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.session.userId);
    if (!bcrypt.compareSync(current_password, user.password_hash))
      return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 12), req.session.userId);
    res.json({ success: true });
  });

  /* ══════════════════════════════════════════════
     ADMIN EXTENDED ROUTES
     ══════════════════════════════════════════════ */

  app.get('/api/admin/payments', requireRole('admin', 'cashier'), (req, res) => {
    res.json(db.prepare(`
      SELECT p.*, u.first_name, u.last_name, u.email, mp.name AS plan_name
      FROM payments p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN user_memberships um ON um.id = p.membership_id
      LEFT JOIN membership_plans mp ON mp.id = um.plan_id
      ORDER BY p.paid_at DESC LIMIT 300
    `).all());
  });

  app.post('/api/admin/users/create', requireRole('admin'), (req, res) => {
    const { first_name, last_name, email, phone, role, password } = req.body;
    const valid = ['client','coach','cashier','cleaning','admin'];
    if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: 'Tous les champs obligatoires.' });
    if (!valid.includes(role))
      return res.status(400).json({ error: 'Rôle invalide.' });
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim()))
      return res.status(409).json({ error: 'Email déjà utilisé.' });
    const token = crypto.randomBytes(24).toString('hex');
    const r = db.prepare(`
      INSERT INTO users (first_name, last_name, email, phone, password_hash, role, checkin_token)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(first_name.trim(), last_name.trim(), email.toLowerCase().trim(),
           phone?.trim() || null, bcrypt.hashSync(password, 12), role, token);
    res.json({ success: true, id: r.lastInsertRowid });
  });

  /* ══════════════════════════════════════════════
     COACH EXTENDED ROUTES
     ══════════════════════════════════════════════ */

  app.get('/api/coach/sessions', requireRole('coach', 'admin'), (req, res) => {
    const cr = db.prepare('SELECT id FROM coaches WHERE user_id = ?').get(req.session.userId);
    if (!cr) return res.json([]);
    res.json(db.prepare(`
      SELECT ts.*, u.first_name, u.last_name, u.email
      FROM training_sessions ts
      JOIN users u ON u.id = ts.client_id
      WHERE ts.coach_id = ?
      ORDER BY ts.scheduled_at DESC
    `).all(cr.id));
  });

  app.post('/api/coach/sessions', requireRole('coach', 'admin'), (req, res) => {
    const { client_id, scheduled_at, duration_min, session_type, coach_notes } = req.body;
    if (!client_id || !scheduled_at) return res.status(400).json({ error: 'client_id et scheduled_at requis.' });
    const cr = db.prepare('SELECT id FROM coaches WHERE user_id = ?').get(req.session.userId);
    if (!cr) return res.status(404).json({ error: 'Profil coach introuvable.' });
    const r = db.prepare(`
      INSERT INTO training_sessions (coach_id, client_id, scheduled_at, duration_min, session_type, coach_notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(cr.id, client_id, scheduled_at, duration_min || 60, session_type || 'individual', coach_notes || null);
    res.json({ success: true, id: r.lastInsertRowid });
  });

  app.patch('/api/coach/sessions/:id/status', requireRole('coach', 'admin'), (req, res) => {
    const { status } = req.body;
    if (!['scheduled','completed','cancelled'].includes(status))
      return res.status(400).json({ error: 'Statut invalide.' });
    db.prepare('UPDATE training_sessions SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true });
  });

  app.get('/api/coach/measurements/:clientId', requireRole('coach', 'admin'), (req, res) => {
    res.json(db.prepare('SELECT * FROM body_measurements WHERE user_id = ? ORDER BY recorded_at DESC').all(req.params.clientId));
  });

  app.post('/api/coach/measurements', requireRole('coach', 'admin'), (req, res) => {
    const { user_id, weight_kg, height_cm, body_fat_pct, muscle_mass_kg, chest_cm, waist_cm, hips_cm, bicep_cm, notes } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id requis.' });
    const r = db.prepare(`
      INSERT INTO body_measurements (user_id, weight_kg, height_cm, body_fat_pct, muscle_mass_kg, chest_cm, waist_cm, hips_cm, bicep_cm, notes, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user_id, weight_kg||null, height_cm||null, body_fat_pct||null, muscle_mass_kg||null,
           chest_cm||null, waist_cm||null, hips_cm||null, bicep_cm||null, notes||null, req.session.userId);
    res.json({ success: true, id: r.lastInsertRowid });
  });

  /* ══════════════════════════════════════════════
     CASHIER EXTENDED ROUTES
     ══════════════════════════════════════════════ */

  app.post('/api/cashier/clients/create', requireRole('cashier', 'admin'), (req, res) => {
    const { first_name, last_name, email, phone } = req.body;
    if (!first_name?.trim() || !last_name?.trim() || !email?.trim())
      return res.status(400).json({ error: 'Prénom, nom et email requis.' });
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim()))
      return res.status(409).json({ error: 'Email déjà utilisé.' });
    const token = crypto.randomBytes(24).toString('hex');
    const tempPw = crypto.randomBytes(9).toString('base64url');
    const r = db.prepare(`
      INSERT INTO users (first_name, last_name, email, phone, password_hash, role, checkin_token)
      VALUES (?, ?, ?, ?, ?, 'client', ?)
    `).run(first_name.trim(), last_name.trim(), email.toLowerCase().trim(),
           phone?.trim() || null, bcrypt.hashSync(tempPw, 12), token);
    res.json({ success: true, id: r.lastInsertRowid, temp_password: tempPw });
  });

  /* ── Start ── */
  app.listen(PORT, () => {
    console.log(`\n  ⚡  S-Factory Premium  →  http://localhost:${PORT}\n`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

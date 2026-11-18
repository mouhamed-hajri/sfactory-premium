-- ============================================================
--  S-Factory Premium — Database Schema
--  Engine: SQLite (compatible with MySQL / PostgreSQL with
--          minor type adjustments noted in comments)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1. USERS  (clients, coaches, admins)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name    TEXT    NOT NULL,
  last_name     TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  phone         TEXT,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'client',   -- client | coach | admin
  avatar_url    TEXT,
  gender        TEXT,                                -- M | F | other
  birth_date    DATE,
  goal          TEXT,                                -- perte_poids | prise_masse | cardio | transformation | autre
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login    DATETIME
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users (role);

-- ------------------------------------------------------------
-- 2. MEMBERSHIP PLANS  (catalogue)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS membership_plans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,               -- Basic | Premium | VIP
  price_tnd     REAL,                           -- price in Tunisian Dinar
  duration_days INTEGER NOT NULL DEFAULT 30,
  description   TEXT,
  features      TEXT,                           -- comma-separated feature list
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default plans
INSERT OR IGNORE INTO membership_plans (id, name, duration_days, description, features) VALUES
  (1, 'Basic',   30, 'Accès salle standard',
   'Accès 6j/7,Zone musculation,Zone cardio,Vestiaires & douches'),
  (2, 'Premium', 30, 'Accès complet + coaching mensuel',
   'Accès 7j/7,Zone musculation,Zone cardio,Vestiaires & douches,2 séances coaching/mois,Bilan nutritionnel initial'),
  (3, 'VIP',     30, 'Expérience premium illimitée',
   'Accès 7j/7 illimité,Zone musculation & cardio,Vestiaires premium,Coaching personnel inclus,Suivi nutritionnel complet,Cours collectifs inclus,Zone VIP exclusive');

-- ------------------------------------------------------------
-- 3. USER MEMBERSHIPS  (active subscriptions)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_memberships (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL,
  plan_id        INTEGER NOT NULL,
  start_date     DATE    NOT NULL,
  end_date       DATE    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'active',   -- active | expired | cancelled | paused
  payment_status TEXT    NOT NULL DEFAULT 'pending',  -- pending | paid | overdue
  assigned_by    INTEGER,                             -- admin user id
  notes          TEXT,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id)     REFERENCES membership_plans(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_um_user   ON user_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_um_status ON user_memberships (status);

-- ------------------------------------------------------------
-- 4. COACHES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coaches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,                          -- links to users table if coach has login
  full_name  TEXT NOT NULL,
  specialty  TEXT,                             -- fitness | musculation | transformation | nutrition
  bio        TEXT,
  photo_url  TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Seed default coaches
INSERT OR IGNORE INTO coaches (id, full_name, specialty) VALUES
  (1, 'Coach Fitness',        'fitness'),
  (2, 'Coach Musculation',    'musculation'),
  (3, 'Coach Transformation', 'transformation');

-- ------------------------------------------------------------
-- 5. TRAINING SESSIONS  (1-on-1 or group bookings)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS training_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id       INTEGER NOT NULL,
  client_id      INTEGER NOT NULL,
  scheduled_at   DATETIME NOT NULL,
  duration_min   INTEGER  NOT NULL DEFAULT 60,
  session_type   TEXT,                              -- personal | group | cardio | nutrition
  status         TEXT     NOT NULL DEFAULT 'scheduled', -- scheduled | completed | cancelled | no_show
  client_notes   TEXT,
  coach_notes    TEXT,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (coach_id)  REFERENCES coaches(id),
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ts_client ON training_sessions (client_id);
CREATE INDEX IF NOT EXISTS idx_ts_coach  ON training_sessions (coach_id);

-- ------------------------------------------------------------
-- 6. CHECK-INS  (gym attendance log)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS check_ins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  check_in_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  check_out_at  DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ci_user ON check_ins (user_id);
CREATE INDEX IF NOT EXISTS idx_ci_date ON check_ins (check_in_at);

-- ------------------------------------------------------------
-- 7. PAYMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  membership_id INTEGER,
  amount        REAL    NOT NULL,
  currency      TEXT    NOT NULL DEFAULT 'TND',
  method        TEXT    NOT NULL DEFAULT 'cash',  -- cash | card | virement
  status        TEXT    NOT NULL DEFAULT 'paid',  -- paid | pending | failed | refunded
  reference     TEXT,                             -- receipt / invoice number
  paid_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes         TEXT,
  FOREIGN KEY (user_id)       REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (membership_id) REFERENCES user_memberships(id)
);

CREATE INDEX IF NOT EXISTS idx_pay_user ON payments (user_id);

-- ------------------------------------------------------------
-- 8. BODY MEASUREMENTS  (progress tracking)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS body_measurements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  recorded_at     DATE    NOT NULL DEFAULT CURRENT_DATE,
  weight_kg       REAL,
  height_cm       REAL,
  body_fat_pct    REAL,
  muscle_mass_kg  REAL,
  chest_cm        REAL,
  waist_cm        REAL,
  hips_cm         REAL,
  bicep_cm        REAL,
  notes           TEXT,
  recorded_by     INTEGER,                        -- coach id if measured by coach
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bm_user ON body_measurements (user_id, recorded_at);

-- ------------------------------------------------------------
-- 9. USER GOALS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_goals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  goal_type     TEXT    NOT NULL,  -- weight_loss | muscle_gain | endurance | body_recomp | other
  description   TEXT,
  target_value  REAL,              -- e.g. target weight in kg
  current_value REAL,
  unit          TEXT,              -- kg | % | kg | reps
  target_date   DATE,
  status        TEXT    NOT NULL DEFAULT 'active',  -- active | achieved | abandoned
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON user_goals (user_id, status);

-- ------------------------------------------------------------
-- 10. NOTIFICATIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  title      TEXT    NOT NULL,
  message    TEXT,
  type       TEXT    NOT NULL DEFAULT 'info',   -- info | success | warning | alert
  is_read    INTEGER NOT NULL DEFAULT 0,
  action_url TEXT,                               -- optional deep-link
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id, is_read);

-- ============================================================
-- END OF SCHEMA
-- ============================================================

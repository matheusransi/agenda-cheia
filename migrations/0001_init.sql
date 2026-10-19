-- Clínicas atendidas. Configurações editáveis pelo portal ficam em `settings` (JSON).
CREATE TABLE clinics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  calendar_id TEXT NOT NULL DEFAULT '',
  wa_phone_number_id TEXT NOT NULL DEFAULT '',
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_clinics_wa ON clinics (wa_phone_number_id);

-- Consultas e horários vagos. kind = 'consulta' | 'vaga'.
CREATE TABLE appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics (id),
  kind TEXT NOT NULL DEFAULT 'consulta',
  source TEXT NOT NULL DEFAULT 'manual',
  calendar_event_id TEXT,
  patient_name TEXT,
  phone TEXT,
  procedure TEXT NOT NULL DEFAULT '',
  value INTEGER,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL,
  confirm_sent_at TEXT,
  second_sent_at TEXT,
  final_sent_at TEXT,
  replied_at TEXT,
  offered_slots TEXT,
  moved_from TEXT,
  replaced_name TEXT,
  offered_to INTEGER,
  offered_ids TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_appt_clinic_start ON appointments (clinic_id, starts_at);
CREATE UNIQUE INDEX idx_appt_event ON appointments (clinic_id, calendar_event_id);

-- Lista de espera. status = 'espera' | 'oferta' | 'encaixado'.
CREATE TABLE waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics (id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  procedure TEXT NOT NULL DEFAULT '',
  value INTEGER,
  preference TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'espera',
  offered_appointment_id INTEGER,
  offered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_wait_clinic ON waitlist (clinic_id, status);

-- Todas as mensagens enviadas e recebidas (reais ou simuladas).
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics (id),
  appointment_id INTEGER,
  waitlist_id INTEGER,
  phone TEXT NOT NULL,
  phone_key TEXT NOT NULL,
  direction TEXT NOT NULL,
  body TEXT NOT NULL,
  buttons TEXT,
  wa_id TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_msg_phone ON messages (clinic_id, phone_key, created_at);
CREATE INDEX idx_msg_wa ON messages (wa_id);

-- Registro do que o sistema fez, mostrado no portal.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics (id),
  appointment_id INTEGER,
  text TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_events_clinic ON events (clinic_id, created_at);

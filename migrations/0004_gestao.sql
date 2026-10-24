-- Gestão da clínica: ficha do paciente (cadastro, anamnese, odontograma), evoluções, orçamentos e financeiro.

-- Ficha do paciente. phone_key = DDD + últimos 8 dígitos (ver phoneKey em src/parse.ts), para achar as consultas dele.
-- anamnesis: {"pergunta": {"a": "sim"|"nao"|"", "d": "detalhe"}}. odontogram: {"11": {"s": "carie", "n": "obs."}}.
CREATE TABLE patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics (id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  phone_key TEXT NOT NULL DEFAULT '',
  phone2 TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  cpf TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  sex TEXT NOT NULL DEFAULT '',
  profession TEXT NOT NULL DEFAULT '',
  cep TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  neighborhood TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  insurance TEXT NOT NULL DEFAULT '',
  insurance_number TEXT NOT NULL DEFAULT '',
  guardian_name TEXT NOT NULL DEFAULT '',
  guardian_phone TEXT NOT NULL DEFAULT '',
  referral TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  anamnesis TEXT NOT NULL DEFAULT '{}',
  anamnesis_at TEXT,
  odontogram TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_patients_clinic ON patients (clinic_id, name);
CREATE INDEX idx_patients_phone ON patients (clinic_id, phone_key);

-- Evoluções do prontuário (o que foi feito em cada atendimento).
CREATE TABLE patient_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics (id),
  patient_id INTEGER NOT NULL REFERENCES patients (id),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_notes_patient ON patient_notes (patient_id, created_at);

-- Orçamentos / planos de tratamento. status = 'aberto' | 'aprovado' | 'recusado'.
-- items: [{"proc": "Restauração", "tooth": "36", "value": 25000, "done": false}]. Valores em centavos.
CREATE TABLE budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics (id),
  patient_id INTEGER NOT NULL REFERENCES patients (id),
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aberto',
  items TEXT NOT NULL DEFAULT '[]',
  discount INTEGER NOT NULL DEFAULT 0,
  installments INTEGER NOT NULL DEFAULT 1,
  method TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_budgets_patient ON budgets (clinic_id, patient_id);

-- Financeiro: contas a receber (receita) e a pagar (despesa). Valores em centavos; datas no formato AAAA-MM-DD.
CREATE TABLE finance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics (id),
  kind TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  paid_at TEXT,
  method TEXT NOT NULL DEFAULT '',
  patient_id INTEGER,
  budget_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_finance_due ON finance (clinic_id, due_date);
CREATE INDEX idx_finance_patient ON finance (clinic_id, patient_id);

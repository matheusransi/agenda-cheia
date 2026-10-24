-- Termos para o paciente assinar pelo celular (link enviado pelo WhatsApp) e anexos da ficha (fotos, raio-X, exames).

-- kind = 'termo' (consentimento, contrato) | 'entrada' (ficha de entrada: cadastro + anamnese + termo) | 'orcamento'.
-- status = 'pendente' | 'assinado' | 'cancelado'. token = parte secreta do link /p/<token>.
-- Na assinatura guardamos nome, CPF, desenho da assinatura, data, IP, navegador e o código (SHA-256) do texto assinado.
CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics (id),
  patient_id INTEGER NOT NULL REFERENCES patients (id),
  budget_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'termo',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pendente',
  sent_at TEXT,
  opened_at TEXT,
  expires_at TEXT NOT NULL,
  signer_name TEXT,
  signer_cpf TEXT,
  signature TEXT,
  signed_at TEXT,
  signed_ip TEXT,
  signed_ua TEXT,
  body_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_documents_patient ON documents (clinic_id, patient_id);

-- Arquivos da ficha. data = arquivo (foto já reduzida no navegador, ou PDF); thumb = miniatura para a galeria.
CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_id INTEGER NOT NULL REFERENCES clinics (id),
  patient_id INTEGER NOT NULL REFERENCES patients (id),
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  data BLOB NOT NULL,
  thumb BLOB,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_attachments_patient ON attachments (clinic_id, patient_id, created_at);

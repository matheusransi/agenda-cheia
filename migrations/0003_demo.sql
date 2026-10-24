-- Clínicas de demonstração: criadas pelo link /demo, com dados fictícios, sem WhatsApp de verdade e apagadas depois de 1 dia.
ALTER TABLE clinics ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_clinics_demo ON clinics (demo, created_at);

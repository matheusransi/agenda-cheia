-- Credenciais do WhatsApp por clínica, editáveis pelo portal (substituem os segredos do GitHub quando preenchidas).
ALTER TABLE clinics ADD COLUMN wa_token TEXT NOT NULL DEFAULT '';
ALTER TABLE clinics ADD COLUMN wa_app_secret TEXT NOT NULL DEFAULT '';

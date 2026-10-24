# Agenda Cheia

Startup de confirmação de consultas por WhatsApp para clínicas odontológicas. O dono do projeto não programa: explique as mudanças em português simples e mantenha o README (guia de instalação para leigos) atualizado.

## Stack

- Cloudflare Worker (TypeScript) com Hono, banco D1, cron a cada 15 min (`wrangler.toml`).
- Portal estático em `public/` (JS puro, sem build), servido pelo próprio Worker. Rotas `/api/*` e `/webhook/*` passam pelo Worker primeiro.
- Deploy pelo GitHub Actions (`.github/workflows/deploy.yml`) em todo push na `main`. O ID do D1 é preenchido no CI por `scripts/ci-prepare.mjs`; os segredos vêm dos Secrets do GitHub via `scripts/ci-secrets.mjs`.

## Regras importantes

- Tudo voltado ao usuário em português do Brasil.
- Horários: guardar em UTC (ISO) no banco; converter com `src/time.ts` usando o fuso da clínica.
- Mensagens iniciadas pela clínica fora da janela de 24h precisam de modelo aprovado (`kind: 'template'`). A ordem dos parâmetros de cada modelo está documentada no README; não mude sem atualizar o README.
- IDs dos botões: `c:` confirmar, `r:` remarcar, `s:<appt>:<minutos epoch>` escolher horário, `h:` falar com a recepção, `a:`/`d:` aceitar/recusar vaga.
- Novas configurações por clínica: adicionar em `DEFAULT_SETTINGS` (`src/settings.ts`) e na tela de configurações em `public/app.js`.
- Mudanças no banco: nova migração em `migrations/` (nunca editar uma já aplicada).
- Gestão (pacientes, anamnese, odontograma, orçamentos, financeiro): `src/records.ts` e `public/gestao.js`. Dinheiro em centavos nessas tabelas. As telas só aparecem com `modules_beta` ligado (a demo liga; clínicas reais ficam desligadas até o dono aprovar).

## Comandos

`npm test`, `npm run typecheck`, `npm run dev` (precisa de `.dev.vars` e `npm run db:local`). Com `ALLOW_TIME_TRAVEL=1` dá para simular horários em `POST /api/clinics/:id/run` com `{"now": "..."}`.

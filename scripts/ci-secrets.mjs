// Envia para o Cloudflare as senhas e chaves configuradas nos Secrets do GitHub (só as preenchidas).
import { execSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

const NAMES = ['ADMIN_PASSWORD', 'GOOGLE_SERVICE_ACCOUNT', 'WHATSAPP_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'];
const secrets = Object.fromEntries(NAMES.filter((n) => process.env[n]?.trim()).map((n) => [n, process.env[n].trim()]));

if (!secrets.ADMIN_PASSWORD) console.log('::warning::ADMIN_PASSWORD não configurada: ninguém consegue entrar no portal.');
if (!Object.keys(secrets).length) process.exit(0);

writeFileSync('secrets.json', JSON.stringify(secrets));
try {
  execSync('npx wrangler secret bulk secrets.json', { stdio: 'inherit' });
} finally {
  rmSync('secrets.json', { force: true });
}
console.log(`Enviados: ${Object.keys(secrets).join(', ')}`);

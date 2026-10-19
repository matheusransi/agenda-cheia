// Localiza (ou cria) o banco D1 "agenda-cheia" e grava o ID dele no wrangler.toml antes do deploy.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const NAME = 'agenda-cheia';
const run = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function findId() {
  const list = JSON.parse(run('npx wrangler d1 list --json'));
  return list.find((db) => db.name === NAME)?.uuid;
}

let id = findId();
if (!id) {
  console.log(`Criando o banco ${NAME}...`);
  run(`npx wrangler d1 create ${NAME}`);
  id = findId();
}
if (!id) throw new Error('Não consegui criar nem encontrar o banco de dados no Cloudflare.');

const toml = readFileSync('wrangler.toml', 'utf8').replace(/database_id = "[^"]*"/, `database_id = "${id}"`);
writeFileSync('wrangler.toml', toml);
console.log(`Banco ${NAME}: ${id}`);

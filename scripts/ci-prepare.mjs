// Localiza (ou cria) o banco D1 "agenda-cheia" e grava o ID dele no wrangler.toml antes do deploy.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const NAME = 'agenda-cheia';

/** Roda um comando do wrangler. Em caso de erro, mostra o motivo como anotação no GitHub Actions. */
function wrangler(args) {
  const r = spawnSync('npx', ['wrangler', ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    const out = `${r.stdout}\n${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, '');
    const reason = out.split('\n').map((l) => l.trim()).filter((l) => /error|erro|✘|authentication|permission|not found|invalid/i.test(l)).slice(0, 6).join(' | ');
    console.log(out);
    console.log(`::error::Falha em "wrangler ${args.join(' ')}": ${reason || out.trim().slice(-500)}`);
    process.exit(1);
  }
  return r.stdout;
}

function findId() {
  const out = wrangler(['d1', 'list', '--json']);
  const json = out.slice(out.indexOf('['), out.lastIndexOf(']') + 1);
  return JSON.parse(json || '[]').find((db) => db.name === NAME)?.uuid;
}

let id = findId();
if (!id) {
  console.log(`Criando o banco ${NAME}...`);
  wrangler(['d1', 'create', NAME]);
  id = findId();
}
if (!id) {
  console.log('::error::Não consegui criar nem encontrar o banco de dados no Cloudflare.');
  process.exit(1);
}

const toml = readFileSync('wrangler.toml', 'utf8').replace(/database_id = "[^"]*"/, `database_id = "${id}"`);
writeFileSync('wrangler.toml', toml);
console.log(`Banco ${NAME}: ${id}`);

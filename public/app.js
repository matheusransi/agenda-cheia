// Portal da Agenda Cheia: agenda do dia, lista de espera, atividade, conversa com o paciente e configurações.
'use strict';

// ---------- Ícones (traço, 24x24) ----------

const ICONS = {
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  send: '<path d="m22 2-11 11M22 2l-7 20-4-9-9-4 20-7z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  trend: '<path d="m23 6-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="3"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
};
function icon(name) { return `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`; }

const STATUS = {
  agendado: ['Agendado', '', 'clock'],
  aguardando: ['Aguardando resposta', 'info', 'clock'],
  sem_resposta: ['2º lembrete enviado', 'warn', 'clock'],
  ligar: ['Ligar para o paciente', 'bad', 'phone'],
  confirmado: ['Confirmado', 'ok', 'check'],
  remarcando: ['Escolhendo horário', 'info', 'calendar'],
  remarcar: ['Remarcar com a recepção', 'bad', 'phone'],
  cancelado: ['Cancelado', '', 'x'],
  sem_telefone: ['Sem telefone', 'warn', 'alert'],
  encaixe: ['Encaixe feito', 'ok', 'spark'],
  vago: ['Horário vago', 'bad', 'alert'],
  oferecido: ['Oferecido à lista', 'warn', 'users'],
};
const WSTATUS = { espera: ['Na espera', '', 'clock'], oferta: ['Oferta enviada', 'warn', 'send'], encaixado: ['Encaixado', 'ok', 'check'] };
const MSG_STATUS = { simulado: 'simulado', enviado: '✓', entregue: '✓✓', lido: '✓✓ lido', erro: 'não enviada', recebido: '' };
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const NAV = [
  ['painel', 'Agenda', 'Agenda', 'calendar'],
  ['espera', 'Lista de espera', 'Espera', 'users'],
  ['atividade', 'Atividade', 'Atividade', 'activity'],
  ['config', 'Configurações', 'Ajustes', 'sliders'],
];
const NEEDS_ACTION = ['ligar', 'remarcar', 'vago', 'sem_telefone'];

const state = {
  demo: false, clinics: [], clinicId: null, view: 'painel', date: null, weekStart: null, data: null, sel: null, mode: 'patient', status: null, timer: null,
};
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');

// ---------- Utilitários ----------

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function chip([label, tone, ic]) { return `<span class="chip ${tone}">${ic ? icon(ic) : ''}${esc(label)}</span>`; }
function brl(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR'); }
function clinic() { return state.clinics.find((c) => c.id === state.clinicId); }
function tz() { return clinic()?.timezone || 'America/Sao_Paulo'; }
function fmt(iso, opts) { return new Intl.DateTimeFormat('pt-BR', { timeZone: tz(), ...opts }).format(new Date(iso)); }
function fmtTime(iso) { return fmt(iso, { hour: '2-digit', minute: '2-digit' }); }
function fmtShort(iso) { return fmt(iso, { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', ''); }
function hourOf(iso) { return Number(fmt(iso, { hour: '2-digit', hourCycle: 'h23' })); }
function todayKey() { return new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date()); }
function fmtPhone(p) {
  const d = String(p || '').replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p || '';
}
function keyDate(key) { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); }
function shiftDate(key, days) { const d = keyDate(key); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((keyDate(b) - keyDate(a)) / 86400000); }
function dateLabel(key, opts) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...opts }).format(keyDate(key)); }
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
function timeAgo(iso) {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return fmt(iso, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}
function isSimulated(c = clinic()) {
  if (!c) return true;
  const hasToken = c.has_wa_token || state.status?.whatsapp?.env_token;
  return c.settings.test_mode || !hasToken || !c.wa_phone_number_id;
}

let toastTimer;
function toast(text, bad = false) {
  const el = $('#toast');
  el.textContent = text;
  el.className = 'toast' + (bad ? ' bad' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, bad ? 6000 : 3000);
}

async function api(path, opts = {}) {
  if (!navigator.onLine) throw new Error('Sem internet. Confira a conexão.');
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body !== undefined ? { 'content-type': 'application/json' } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.demo) { location.href = '/demo'; throw new Error('A demonstração expirou. Abrindo outra...'); }
  if (res.status === 401 && path !== '/api/login') { showLogin(); throw new Error(data.error || 'Faça login.'); }
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

async function act(fn, okText) {
  try {
    const r = await fn();
    if (okText) toast(okText);
    return r;
  } catch (e) {
    toast(e.message, true);
    return null;
  }
}

// ---------- Login e navegação ----------

function showLogin() {
  stopPolling();
  closeDrawer();
  $('#shell').hidden = true;
  const auth = $('#auth');
  auth.hidden = false;
  auth.innerHTML = `
    <section class="card auth-card">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span><span>Agenda Cheia</span></div>
      <div><h1>Bem-vindo de volta</h1><p class="muted">Entre para ver a agenda e as confirmações da clínica.</p></div>
      <form id="login-form">
        <label class="field">Senha<input type="password" id="login-pass" autocomplete="current-password" required></label>
        <button class="btn primary" type="submit">Entrar</button>
        <p class="error" id="login-error" hidden></p>
      </form>
    </section>`;
  $('#login-pass').focus();
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.hidden = true;
    try {
      await api('/api/login', { method: 'POST', body: { password: $('#login-pass').value } });
      await start();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
}

async function start() {
  try { state.demo = Boolean((await api('/api/me')).demo); } catch { return; }
  $('#auth').hidden = true;
  $('#shell').hidden = false;
  state.status = await api('/api/status').catch(() => null);
  await loadClinics();
  route();
}

async function loadClinics(selectId) {
  state.clinics = await api('/api/clinics');
  let saved = null;
  try { saved = Number(localStorage.getItem('clinicId')); } catch { /* sem armazenamento */ }
  const wanted = selectId ?? state.clinicId ?? saved;
  state.clinicId = state.clinics.some((c) => c.id === wanted) ? wanted : state.clinics[0]?.id ?? null;
  const options = state.clinics.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('') + (state.demo ? '' : '<option value="new">+ Nova clínica</option>');
  for (const sel of [$('#clinic-select'), $('#clinic-select-m')]) {
    sel.innerHTML = options;
    if (state.clinicId) sel.value = String(state.clinicId);
  }
}

function renderChrome() {
  const attention = state.data?.attention?.length || 0;
  $('#side-nav').innerHTML = NAV.map(([id, label, , ic]) => `
    <a class="side-link${state.view === id ? ' active' : ''}" href="#${id}">${icon(ic)}<span>${label}</span>${id === 'painel' && attention ? `<span class="count">${attention}</span>` : ''}</a>`).join('');
  $('#tabbar').innerHTML = NAV.map(([id, , short, ic]) => `
    <a class="tab${state.view === id ? ' active' : ''}" href="#${id}">${icon(ic)}<span>${short}</span>${id === 'painel' && attention ? '<span class="dot"></span>' : ''}</a>`).join('');
  $('#logout').innerHTML = `${icon('logout')}<span>${state.demo ? 'Sair da demonstração' : 'Sair'}</span>`;
  renderThemeButtons();
  const sim = isSimulated();
  for (const el of [$('#mode-pill'), $('#mode-pill-m')]) {
    el.hidden = !clinic();
    el.className = `mode-pill${sim ? '' : ' live'}${el.id === 'mode-pill-m' ? ' small' : ''}`;
    el.textContent = sim ? 'Modo teste' : 'WhatsApp ativo';
    el.title = sim ? 'Nenhuma mensagem real é enviada. Ajuste em Configurações.' : 'As mensagens saem pelo WhatsApp.';
  }
}

function route() {
  const view = location.hash.replace('#', '');
  state.view = NAV.some(([id]) => id === view) ? view : 'painel';
  closeDrawer();
  if (!state.clinicId) { renderChrome(); return showNewClinic(true); }
  try { localStorage.setItem('clinicId', String(state.clinicId)); } catch { /* sem armazenamento */ }
  renderChrome();
  window.scrollTo(0, 0);
  if (state.view === 'config') showConfig();
  else if (state.view === 'espera') showEspera();
  else if (state.view === 'atividade') showAtividade();
  else showPainel();
  if (state.demo) app.insertAdjacentHTML('afterbegin', demoBar());
}

function demoBar() {
  return `<div class="demo-bar" role="note">
    <span class="demo-ic">${icon('spark')}</span>
    <p><strong>Demonstração com dados fictícios.</strong> Nenhuma mensagem sai pelo WhatsApp. Toque num paciente para ver a conversa e responder como se fosse ele.</p>
    <a class="btn small" href="/demo?novo">${icon('refresh')}Recomeçar</a>
  </div>`;
}

function showNewClinic(first) {
  stopPolling();
  app.innerHTML = `
    <section class="card auth-card" style="margin: 6vh auto 0">
      <div><h1>${first ? 'Cadastre a primeira clínica' : 'Nova clínica'}</h1><p class="muted">Depois você ajusta endereço, horários e o WhatsApp em Configurações.</p></div>
      <form id="clinic-form">
        <label class="field">Nome da clínica<input id="clinic-name" required placeholder="Ex.: Clínica Sorriso Vivo"></label>
        <button class="btn primary" type="submit">Cadastrar</button>
        ${first ? '' : '<button class="btn ghost" type="button" id="clinic-cancel">Voltar</button>'}
      </form>
    </section>`;
  $('#clinic-name').focus();
  $('#clinic-cancel')?.addEventListener('click', () => { syncSelects(); route(); });
  $('#clinic-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = await act(() => api('/api/clinics', { method: 'POST', body: { name: $('#clinic-name').value } }), 'Clínica cadastrada.');
    if (!c) return;
    await loadClinics(c.id);
    location.hash = '#config';
    route();
  });
}

function syncSelects() {
  for (const sel of [$('#clinic-select'), $('#clinic-select-m')]) sel.value = String(state.clinicId);
}

// ---------- Dados do dia ----------

function stopPolling() { clearInterval(state.timer); state.timer = null; }
function startPolling() {
  stopPolling();
  state.timer = setInterval(() => { if (!document.hidden) refresh(); }, 15000);
}

async function loadDay(date) {
  const today = todayKey();
  state.date = date || state.date || shiftDate(today, 1);
  if (!state.weekStart || daysBetween(state.weekStart, state.date) < 0 || daysBetween(state.weekStart, state.date) > 6) {
    state.weekStart = daysBetween(today, state.date) >= 0 && daysBetween(today, state.date) <= 6 ? today : state.date;
  }
  const data = await act(() => api(`/api/clinics/${state.clinicId}/day?date=${state.date}&from=${state.weekStart}`));
  if (!data) return;
  state.data = data;
  renderView();
}

async function refresh() {
  if (!state.date || state.view === 'config') return;
  const data = await api(`/api/clinics/${state.clinicId}/day?date=${state.date}&from=${state.weekStart}`).catch(() => null);
  if (!data) return;
  state.data = data;
  renderView();
}

function renderView() {
  renderChrome();
  if (state.view === 'painel') renderPainel();
  if (state.view === 'espera') renderEspera();
  if (state.view === 'atividade') renderAtividade();
  if (state.sel) refreshDrawer();
}

function findAppt(id) {
  return state.data?.appointments.find((a) => a.id === id) || state.data?.attention.find((a) => a.id === id);
}

// ---------- Agenda ----------

function showPainel() {
  app.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow" id="greet"></p><h1 id="day-title">Agenda</h1></div>
      <div class="actions">
        <button class="btn hide-mobile" type="button" id="btn-new">${icon('plus')}Nova consulta</button>
        <button class="btn icon" type="button" id="btn-run" title="Ler a agenda e atualizar agora" aria-label="Atualizar agora">${icon('refresh')}</button>
        <button class="btn primary" type="button" id="btn-force">${icon('send')}Enviar confirmações</button>
      </div>
    </div>
    <div class="daystrip">
      <button class="btn icon" type="button" id="wk-prev" aria-label="Semana anterior">${icon('left')}</button>
      <div class="days" id="days"></div>
      <button class="btn icon" type="button" id="wk-next" aria-label="Próxima semana">${icon('right')}</button>
      <button class="btn icon" type="button" id="pick" aria-label="Escolher data" title="Escolher data">${icon('calendar')}</button>
      <input type="date" id="pick-date" class="sr-only" tabindex="-1">
    </div>
    <div class="kpis" id="kpis"></div>
    <div class="board">
      <section class="card">
        <div class="card-head"><h2>Consultas do dia</h2><span class="muted" id="agenda-count"></span></div>
        <div id="agenda"></div>
      </section>
      <div class="side-col">
        <section class="card attn" id="attn" hidden></section>
        <section class="card hide-mobile">
          <div class="card-head"><h2>Lista de espera</h2><a class="link-btn" href="#espera">Ver tudo</a></div>
          <ul class="wait-list" id="wait-mini"></ul>
        </section>
        <section class="card hide-mobile">
          <div class="card-head"><h2>Atividade recente</h2><a class="link-btn" href="#atividade">Ver tudo</a></div>
          <ul class="feed" id="feed-mini"></ul>
        </section>
      </div>
    </div>
    <button class="fab" type="button" id="fab" aria-label="Nova consulta">${icon('plus')}</button>
    ${newDialogHtml()}`;

  $('#wk-prev').addEventListener('click', () => { state.weekStart = shiftDate(state.weekStart, -7); loadDay(shiftDate(state.date, -7)); });
  $('#wk-next').addEventListener('click', () => { state.weekStart = shiftDate(state.weekStart, 7); loadDay(shiftDate(state.date, 7)); });
  $('#pick').addEventListener('click', () => { const i = $('#pick-date'); i.value = state.date; i.showPicker ? i.showPicker() : i.click(); });
  $('#pick-date').addEventListener('change', (e) => { if (e.target.value) { state.weekStart = null; loadDay(e.target.value); } });
  $('#btn-run').addEventListener('click', () => runCycle(false));
  $('#btn-force').addEventListener('click', () => runCycle(true));
  $('#btn-new').addEventListener('click', openNewDialog);
  $('#fab').addEventListener('click', openNewDialog);
  bindNewDialog();
  if (state.data && state.date) renderPainel();
  loadDay(state.date);
  startPolling();
}

function renderPainel() {
  const d = state.data;
  if (!d || !$('#days')) return;
  const today = d.today;
  const rel = daysBetween(today, d.date);
  const relLabel = rel === 0 ? 'Hoje' : rel === 1 ? 'Amanhã' : rel === -1 ? 'Ontem' : '';
  const longDate = dateLabel(d.date, { weekday: 'long', day: 'numeric', month: 'long' });
  // Hífen que não quebra linha, para "terça-feira" não ficar dividido no celular.
  const title = (relLabel ? `${relLabel}, ${longDate}` : longDate.charAt(0).toUpperCase() + longDate.slice(1)).replace(/-/g, '\u2011');
  $('#day-title').textContent = title;
  const h = new Date().getHours();
  $('#greet').textContent = `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'} · ${clinic().name}`;

  $('#days').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDate(state.weekStart, i);
    const n = d.counts?.[key] || 0;
    return `<button type="button" class="day${key === d.date ? ' active' : ''}${key === today ? ' today' : ''}" data-date="${key}">
      <span class="dw">${key === today ? 'Hoje' : dateLabel(key, { weekday: 'short' }).replace('.', '')}</span>
      <span class="dn">${dateLabel(key, { day: 'numeric' })}</span>
      <span class="dc">${n ? `${n} cons.` : '·'}</span>
    </button>`;
  }).join('');

  const appts = d.appointments.filter((a) => a.status !== 'cancelado' || a.source === 'manual');
  const live = appts.filter((a) => a.status !== 'cancelado' && a.status !== 'vago' && a.status !== 'oferecido');
  const filled = live.filter((a) => a.status === 'confirmado' || a.status === 'encaixe');
  const waiting = live.filter((a) => a.status === 'aguardando' || a.status === 'sem_resposta').length;
  const notSent = live.filter((a) => a.status === 'agendado').length;
  const recovered = live.filter((a) => a.status === 'encaixe');
  const todo = appts.filter((a) => NEEDS_ACTION.includes(a.status)).length;
  const expected = live.reduce((s, a) => s + (a.value || 0), 0);
  const pct = live.length ? Math.round((filled.length / live.length) * 100) : 0;
  const subConf = [waiting && `${waiting} aguardando`, notSent && `${notSent} ainda não enviada${notSent > 1 ? 's' : ''}`].filter(Boolean).join(' · ') || (live.length ? `${pct}% da agenda` : 'Sem consultas');
  $('#kpis').innerHTML = `
    <div class="card kpi"><div class="kpi-top"><span class="kpi-ic ok">${icon('check')}</span>Confirmadas</div>
      <div class="kpi-v">${filled.length}<small> / ${live.length}</small></div><div class="bar"><span style="width:${pct}%"></span></div><div class="kpi-sub">${subConf}</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-ic">${icon('money')}</span>Receita garantida</div>
      <div class="kpi-v">${brl(filled.reduce((s, a) => s + (a.value || 0), 0))}</div><div class="kpi-sub">de ${brl(expected)} previstos</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-ic info">${icon('trend')}</span>Horários reaproveitados</div>
      <div class="kpi-v">${recovered.length}</div><div class="kpi-sub">${recovered.length ? brl(recovered.reduce((s, a) => s + (a.value || 0), 0)) + ' recuperados' : 'Vagas preenchidas pela lista'}</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-ic ${todo ? 'bad' : 'ok'}">${icon(todo ? 'alert' : 'check')}</span>Para resolver</div>
      <div class="kpi-v">${todo}</div><div class="kpi-sub">${todo ? 'Ligar, remarcar ou vaga livre' : 'Nenhuma pendência'}</div></div>`;

  $('#agenda-count').textContent = live.length ? `${live.length} consulta${live.length > 1 ? 's' : ''}` : '';
  if (!appts.length) {
    $('#agenda').innerHTML = `<div class="empty-state"><span class="big">${icon('calendar')}</span><strong>Nenhuma consulta neste dia</strong>
      <span>Cadastre pelo botão “Nova consulta” ou no Google Agenda da clínica.</span>
      <button class="btn" type="button" data-new>${icon('plus')}Nova consulta</button></div>`;
  } else {
    const groups = [['Manhã', (h) => h < 12], ['Tarde', (h) => h >= 12 && h < 18], ['Noite', (h) => h >= 18]];
    $('#agenda').innerHTML = groups.map(([label, test]) => {
      const items = appts.filter((a) => test(hourOf(a.starts_at)));
      return items.length ? `<div class="period">${label}</div><ul class="appts">${items.map((a) => apptRow(a, false)).join('')}</ul>` : '';
    }).join('');
  }

  const attn = $('#attn');
  attn.hidden = !d.attention.length;
  attn.innerHTML = d.attention.length ? `
    <div class="card-head"><h2>${icon('alert')}Precisa de atenção</h2><span class="chip bad">${d.attention.length}</span></div>
    <ul class="appts">${d.attention.slice(0, 6).map((a) => apptRow(a, true)).join('')}</ul>` : '';

  $('#wait-mini').innerHTML = d.waitlist.length
    ? d.waitlist.slice(0, 4).map(waitRow).join('')
    : '<li class="muted" style="padding: 6px 10px 10px; font-size: 14px">Ninguém na lista ainda.</li>';
  $('#feed-mini').innerHTML = feedItems(d.events.slice(0, 6));
}

function apptRow(a, withDate) {
  const free = a.status === 'vago' || a.status === 'oferecido';
  const [, tone] = STATUS[a.status] || ['', ''];
  const name = free ? 'Horário livre' : a.patient_name || 'Sem nome';
  let sub = esc(a.procedure || 'Consulta');
  if (free) sub = a.replaced_name ? `Era de ${esc(a.replaced_name)}` : 'Disponível para a lista de espera';
  else if (a.status === 'encaixe' && a.replaced_name) sub = `${esc(a.procedure)} · no lugar de ${esc(a.replaced_name)}`;
  else if (a.moved_from) sub = `${esc(a.procedure)} · remarcado de ${fmtShort(a.moved_from)}`;
  else if (!a.phone) sub = 'Adicione o telefone na agenda';
  return `<li><button type="button" class="appt${state.sel?.apptId === a.id ? ' sel' : ''}${a.status === 'cancelado' ? ' faded' : ''}" data-appt="${a.id}">
    <span class="t">${fmtTime(a.starts_at)}${withDate ? `<small>${fmtShort(a.starts_at)}</small>` : ''}</span>
    <span class="avatar ${tone}">${free ? icon('clock') : esc(initials(name))}</span>
    <span class="who"><span class="name">${esc(name)}</span><span class="sub">${sub}</span></span>
    <span class="end">${chip(STATUS[a.status] || [a.status, ''])}${a.value ? `<span class="val">${brl(a.value)}</span>` : ''}</span>
  </button></li>`;
}

function waitRow(w) {
  const [, tone] = WSTATUS[w.status] || ['', ''];
  return `<li><button type="button" class="wait-row" data-wait="${w.id}">
    <span class="avatar ${tone}">${esc(initials(w.name))}</span>
    <span class="who"><span class="name">${esc(w.name)}</span><span class="sub">${esc([w.procedure, w.preference].filter(Boolean).join(' · ') || fmtPhone(w.phone))}</span></span>
    ${chip(WSTATUS[w.status] || [w.status, ''])}
  </button></li>`;
}

function feedItems(events) {
  if (!events.length) return '<li style="display:block" class="muted">Nada ainda. As ações do sistema aparecem aqui.</li>';
  return events.map((e) => `<li><span class="dot ${esc(e.tone)}"></span><div><p class="txt">${esc(e.text)}</p><span class="when">${timeAgo(e.created_at)}</span></div></li>`).join('');
}

async function runCycle(force) {
  const btn = force ? $('#btn-force') : $('#btn-run');
  btn.disabled = true;
  const r = await act(() => api(`/api/clinics/${state.clinicId}/run`, { method: 'POST', body: { force } }));
  btn.disabled = false;
  if (!r) return;
  const parts = [];
  if (r.sync) parts.push(`agenda lida (${r.sync.created} nova(s), ${r.sync.changed} alterada(s), ${r.sync.removed} removida(s))`);
  if (r.syncError) parts.push('erro ao ler a agenda');
  if (r.confirmations) parts.push(`${r.confirmations} confirmação(ões) enviada(s)`);
  if (r.seconds) parts.push(`${r.seconds} 2º lembrete(s)`);
  if (r.finals) parts.push(`${r.finals} lembrete(s) final(is)`);
  if (r.escalated) parts.push(`${r.escalated} para a recepção ligar`);
  toast(parts.length ? 'Feito: ' + parts.join(', ') + '.' : force ? 'Nenhuma confirmação pendente para enviar.' : 'Tudo em dia.', Boolean(r.syncError));
  await refresh();
}

// ---------- Nova consulta ----------

function newDialogHtml() {
  return `<dialog id="new-dialog">
    <form id="new-form" method="dialog">
      <div class="full"><h2>Nova consulta</h2><p class="hint" id="n-hint"></p></div>
      <label class="field full">Paciente<input id="n-patient" required placeholder="Nome completo"></label>
      <label class="field">WhatsApp do paciente<input id="n-phone" inputmode="tel" placeholder="(11) 98765-4321"></label>
      <label class="field">Procedimento<input id="n-proc" placeholder="Limpeza"></label>
      <label class="field">Data<input type="date" id="n-date" required></label>
      <label class="field">Horário<input type="time" id="n-time" required step="300"></label>
      <label class="field">Duração (min)<input type="number" id="n-dur" value="60" min="15" step="15"></label>
      <label class="field">Valor (R$)<input type="number" id="n-value" min="0" step="1" placeholder="Opcional"></label>
      <div class="actions"><button class="btn ghost" type="button" id="n-cancel">Cancelar</button><button class="btn primary" type="submit">Salvar consulta</button></div>
    </form>
  </dialog>`;
}

function bindNewDialog() {
  $('#n-cancel').addEventListener('click', () => $('#new-dialog').close());
  $('#new-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      patient: $('#n-patient').value, phone: $('#n-phone').value, procedure: $('#n-proc').value, date: $('#n-date').value,
      time: $('#n-time').value, duration: $('#n-dur').value, value: $('#n-value').value,
    };
    const r = await act(() => api(`/api/clinics/${state.clinicId}/appointments`, { method: 'POST', body }), 'Consulta adicionada.');
    if (!r) return;
    $('#new-dialog').close();
    state.weekStart = null;
    await loadDay(body.date);
  });
}

function openNewDialog() {
  $('#new-form').reset();
  $('#n-date').value = state.date;
  $('#n-dur').value = 60;
  const c = clinic();
  $('#n-hint').textContent = c.calendar_id && state.status?.google.configured
    ? 'Ela também será criada no Google Agenda da clínica.'
    : 'Sem Google Agenda conectado, a consulta fica só no portal.';
  $('#new-dialog').showModal();
  $('#n-patient').focus();
}

// ---------- Lista de espera ----------

function showEspera() {
  app.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">Encaixes automáticos</p><h1>Lista de espera</h1></div>
      <div class="actions"><button class="btn primary" type="button" id="wait-toggle">${icon('plus')}Adicionar pessoa</button></div>
    </div>
    <p class="muted" style="max-width: 640px">Quando um horário vaga, o sistema oferece na hora para o primeiro da lista pelo WhatsApp. Se a pessoa não responder a tempo, passa para a próxima.</p>
    <section class="card" id="wait-form-card" hidden>
      <form class="card-body" id="wait-form" style="padding-top: 18px">
        <div class="grid2">
          <label class="field">Nome<input id="w-name" required></label>
          <label class="field">WhatsApp<input id="w-phone" required inputmode="tel" placeholder="(11) 98765-4321"></label>
          <label class="field">Procedimento<input id="w-proc" placeholder="Limpeza"></label>
          <label class="field">Preferência<input id="w-pref" placeholder="Ex.: só à tarde"></label>
        </div>
        <div class="actions"><button class="btn primary" type="submit">Adicionar à lista</button><button class="btn ghost" type="button" id="wait-cancel">Cancelar</button></div>
      </form>
    </section>
    <section class="card"><ul class="wait-list" id="wait-full"></ul></section>`;
  $('#wait-toggle').addEventListener('click', () => { $('#wait-form-card').hidden = false; $('#w-name').focus(); });
  $('#wait-cancel').addEventListener('click', () => { $('#wait-form-card').hidden = true; });
  $('#wait-form').addEventListener('submit', addWait);
  if (state.data) renderEspera();
  loadDay(state.date);
  startPolling();
}

function renderEspera() {
  const el = $('#wait-full');
  if (!el || !state.data) return;
  el.innerHTML = state.data.waitlist.length
    ? state.data.waitlist.map(waitRow).join('')
    : `<li><div class="empty-state"><span class="big">${icon('users')}</span><strong>Ninguém na lista ainda</strong><span>Coloque aqui quem quer antecipar a consulta.</span></div></li>`;
}

async function addWait(e) {
  e.preventDefault();
  const body = { name: $('#w-name').value, phone: $('#w-phone').value, procedure: $('#w-proc').value, preference: $('#w-pref').value };
  const r = await act(() => api(`/api/clinics/${state.clinicId}/waitlist`, { method: 'POST', body }), 'Adicionado à lista de espera.');
  if (!r) return;
  $('#wait-form').reset();
  $('#wait-form-card').hidden = true;
  await refresh();
}

// ---------- Atividade ----------

function showAtividade() {
  app.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">Tudo o que o sistema fez</p><h1>Atividade</h1></div></div>
    <section class="card"><ul class="feed" id="feed-full" style="padding-top: 14px"></ul></section>`;
  if (state.data) renderAtividade();
  loadDay(state.date);
  startPolling();
}

function renderAtividade() {
  const el = $('#feed-full');
  if (el && state.data) el.innerHTML = feedItems(state.data.events);
}

// ---------- Conversa (painel deslizante) ----------

function openDrawer(sel) {
  state.sel = sel;
  const dr = $('#drawer');
  dr.innerHTML = `
    <div class="dr-head" id="dr-head"></div>
    <div class="dr-info" id="dr-info"></div>
    <div class="dr-actions" id="dr-actions"></div>
    <div class="chat" id="chat" aria-live="polite"></div>
    <div class="composer" id="composer" hidden>
      <div id="modes"></div>
      <form id="compose-form"><input id="compose-input" autocomplete="off"><button class="btn primary send" type="submit" aria-label="Enviar">${icon('send')}</button></form>
    </div>`;
  $('#compose-form').addEventListener('submit', compose);
  dr.classList.add('open');
  dr.setAttribute('aria-hidden', 'false');
  $('#drawer-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  if (state.view === 'painel') renderPainel();
  refreshDrawer();
}

function closeDrawer() {
  if (!state.sel) return;
  state.sel = null;
  const dr = $('#drawer');
  dr.classList.remove('open');
  dr.setAttribute('aria-hidden', 'true');
  $('#drawer-backdrop').hidden = true;
  document.body.style.overflow = '';
  if (state.view === 'painel') renderPainel();
}

let convToken = 0;
async function refreshDrawer() {
  const sel = state.sel;
  if (!sel) return;
  const appt = sel.apptId ? findAppt(sel.apptId) : null;
  const wait = sel.waitId ? state.data?.waitlist.find((w) => w.id === sel.waitId) : null;
  if (appt) sel.phone = appt.phone;
  const free = appt && (appt.status === 'vago' || appt.status === 'oferecido');
  const name = appt ? (free ? 'Horário livre' : appt.patient_name || 'Sem nome') : wait?.name || sel.name;
  const st = appt ? STATUS[appt.status] : wait ? WSTATUS[wait.status] : null;

  $('#dr-head').innerHTML = `
    <span class="avatar ${st?.[1] || ''}">${free ? icon('clock') : esc(initials(name))}</span>
    <div class="who"><div class="name">${esc(name)}</div><div class="sub">${sel.phone ? esc(fmtPhone(sel.phone)) : 'Sem telefone'}</div></div>
    ${st ? chip(st) : ''}
    <button class="btn ghost icon" type="button" id="dr-close" aria-label="Fechar">${icon('x')}</button>`;
  $('#dr-close').addEventListener('click', closeDrawer);

  $('#dr-info').innerHTML = appt
    ? `<div><span>Horário</span><strong>${fmt(appt.starts_at, { day: '2-digit', month: '2-digit' })} · ${fmtTime(appt.starts_at)}</strong></div>
       <div><span>Procedimento</span><strong>${esc(appt.procedure || '—')}</strong></div>
       <div><span>Valor</span><strong>${appt.value ? brl(appt.value) : '—'}</strong></div>`
    : wait ? `<div><span>Procedimento</span><strong>${esc(wait.procedure || '—')}</strong></div>
       <div><span>Preferência</span><strong>${esc(wait.preference || '—')}</strong></div>
       <div><span>Na lista desde</span><strong>${fmt(wait.created_at, { day: '2-digit', month: '2-digit' })}</strong></div>` : '';

  const actions = $('#dr-actions');
  actions.innerHTML = '';
  if (appt && appt.source === 'manual' && appt.status !== 'cancelado') {
    actions.innerHTML = `<button class="btn small danger" type="button" id="cancel-appt">${icon('trash')}Cancelar ${appt.kind === 'vaga' ? 'horário' : 'consulta'}</button>`;
    $('#cancel-appt').addEventListener('click', () => cancelAppt(appt));
  }
  if (wait) {
    actions.innerHTML = `<button class="btn small danger" type="button" id="remove-wait">${icon('trash')}Tirar da lista</button>`;
    $('#remove-wait').addEventListener('click', () => removeWait(wait.id));
  }

  const chat = $('#chat');
  if (!sel.phone) {
    chat.innerHTML = `<p class="chat-empty">${free
      ? 'Este horário está livre e é oferecido automaticamente para a lista de espera.'
      : 'Sem telefone. Coloque o número na descrição do evento, ex.: “Tel: (11) 98765-4321”.'}</p>`;
    $('#composer').hidden = true;
    return;
  }

  const token = ++convToken;
  const data = await api(`/api/clinics/${state.clinicId}/conversation?phone=${encodeURIComponent(sel.phone)}`).catch(() => null);
  if (!data || token !== convToken || !state.sel) return;
  const sim = isSimulated();
  const msgs = data.messages;
  const lastOut = [...msgs].reverse().find((m) => m.direction === 'out');
  const lastIsOut = msgs.length && msgs[msgs.length - 1].direction === 'out';
  let html = '';
  let lastDay = '';
  for (const m of msgs) {
    const day = fmt(m.created_at, { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (day !== lastDay) { html += `<span class="day-sep">${fmt(m.created_at, { weekday: 'long', day: '2-digit', month: '2-digit' })}</span>`; lastDay = day; }
    const dir = m.direction === 'out' ? 'in' : 'out';
    const status = m.direction === 'out' ? MSG_STATUS[m.status] ?? m.status : '';
    let buttons = '';
    if (m.buttons && m === lastOut) {
      const active = sim && lastIsOut;
      buttons = JSON.parse(m.buttons).map((b) => `<button type="button" class="qr" data-reply="${esc(b.id)}" ${active ? '' : 'disabled'}>${esc(b.title)}</button>`).join('');
    }
    // Respostas antigas guardavam só o código do botão (ex.: "c:12").
    const body = /^[a-z]:\d+(:\d+)?$/.test(m.body) ? 'Tocou num botão' : m.body;
    html += `<div class="bubble-group ${dir}"><div class="bubble">${esc(body)}<span class="meta${m.status === 'erro' ? ' err' : ''}"${m.error ? ` title="${esc(m.error)}"` : ''}>${fmtTime(m.created_at)}${status ? ' · ' + esc(status) : ''}</span></div>${buttons}</div>`;
  }
  const atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
  chat.innerHTML = html || `<p class="chat-empty">Nenhuma mensagem ainda. ${sim ? 'Use “Enviar confirmações” para testar.' : 'A confirmação sai automaticamente na véspera.'}</p>`;
  if (atBottom || token === 1 || chat.dataset.phone !== sel.phone) chat.scrollTop = chat.scrollHeight;
  chat.dataset.phone = sel.phone;

  $('#composer').hidden = false;
  const modes = $('#modes');
  if (sim) {
    if (state.mode !== 'clinic') state.mode = 'patient';
    modes.innerHTML = `<div class="seg"><button type="button" data-mode="patient" class="${state.mode === 'patient' ? 'on' : ''}">Responder como paciente</button><button type="button" data-mode="clinic" class="${state.mode === 'clinic' ? 'on' : ''}">Como clínica</button></div>`;
    modes.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { state.mode = b.dataset.mode; refreshDrawer(); }));
  } else {
    state.mode = 'clinic';
    modes.innerHTML = data.window_open ? '' : '<p class="hint">Fora da janela de 24h: o WhatsApp só libera mensagem livre depois que o paciente escrever.</p>';
  }
  $('#compose-input').placeholder = state.mode === 'patient' ? 'Ex.: vou sim / preciso remarcar' : 'Escreva como a recepção';
}

async function simulateReply(body) {
  const ok = await act(() => api(`/api/clinics/${state.clinicId}/simulate`, { method: 'POST', body: { phone: state.sel.phone, ...body } }));
  if (ok) await refresh();
}

async function compose(e) {
  e.preventDefault();
  const input = $('#compose-input');
  const text = input.value.trim();
  if (!text || !state.sel?.phone) return;
  if (state.mode === 'patient') {
    await simulateReply({ text });
  } else {
    const ok = await act(() => api(`/api/clinics/${state.clinicId}/send`, { method: 'POST', body: { phone: state.sel.phone, text } }));
    if (!ok) return;
    await refresh();
  }
  input.value = '';
}

async function cancelAppt(a) {
  const btn = $('#cancel-appt');
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1';
    btn.textContent = 'Toque de novo para confirmar';
    return;
  }
  const r = await act(() => api(`/api/clinics/${state.clinicId}/appointments/${a.id}/cancel`, { method: 'POST', body: {} }), 'Consulta cancelada.');
  if (r) await refresh();
}

async function removeWait(id) {
  const btn = $('#remove-wait');
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1';
    btn.textContent = 'Toque de novo para confirmar';
    return;
  }
  const r = await act(() => api(`/api/clinics/${state.clinicId}/waitlist/${id}`, { method: 'DELETE' }), 'Removido da lista.');
  if (r) { closeDrawer(); await refresh(); }
}

// ---------- Configurações ----------

function showConfig() {
  stopPolling();
  const c = clinic();
  const s = c.settings;
  const st = state.status || { google: {}, whatsapp: {} };
  const field = (id, label, value, attrs = '') => `<label class="field">${label}<input id="${id}" value="${esc(value)}" ${attrs}></label>`;
  const area = (id, label, value) => `<label class="field">${label}<textarea id="${id}">${esc(value)}</textarea></label>`;
  const check = (id, label, value) => `<label class="check"><input type="checkbox" id="${id}" ${value ? 'checked' : ''}> ${label}</label>`;
  const section = (title, desc, body) => `<section class="card"><div class="card-head"><div><h2>${title}</h2>${desc ? `<p class="hint">${desc}</p>` : ''}</div></div><div class="card-body">${body}</div></section>`;
  const hasToken = c.has_wa_token || st.whatsapp.env_token;
  const hasSecret = c.has_wa_app_secret || st.whatsapp.env_app_secret;
  const waReady = hasToken && c.wa_phone_number_id;
  const waStatus = !waReady ? ['Não configurado', 'warn', 'alert'] : s.test_mode ? ['Pronto, em modo teste', 'info', 'clock'] : ['Enviando de verdade', 'ok', 'check'];
  const waHint = !waReady
    ? 'Preencha o ID do número e o token abaixo. Enquanto isso, tudo funciona em modo teste (mensagens simuladas).'
    : s.test_mode
      ? 'Desmarque “Modo teste” e salve para as mensagens saírem pelo WhatsApp.'
      : `As mensagens saem pelo WhatsApp.${hasSecret ? '' : ' Falta a chave secreta do app para receber as respostas.'}`;

  app.innerHTML = `
    <div class="page-head config-head"><div><p class="eyebrow">Configurações</p><h1>${esc(c.name)}</h1></div></div>
    <form id="config-form" class="config">
      ${section('Clínica', 'Nome e endereço aparecem nas mensagens para o paciente.', `
        <div class="grid2">
          ${field('c-name', 'Nome', c.name, 'required')}
          ${field('c-address', 'Endereço', c.address, 'placeholder="Rua das Acácias, 120, sala 4"')}
        </div>`)}

      ${state.demo ? section('WhatsApp e Google Agenda', '', `
        <div class="status-row">${chip(['Modo teste', 'info', 'clock'])}<p>Na demonstração as mensagens são só simuladas. Na versão da sua clínica, o sistema envia pelo WhatsApp oficial da clínica e lê as consultas direto do Google Agenda.</p></div>`) : ''}
      ${state.demo ? '' : section('WhatsApp', '', `
        <div class="status-row">${chip(waStatus)}<p>${waHint}</p></div>
        <p class="hint">Na Meta: <strong>developers.facebook.com → seu app → WhatsApp → Configuração da API</strong>. A chave secreta fica em <strong>Configurações do app → Básico</strong>.</p>
        <div class="grid2">
          ${field('c-wa', 'ID do número (Phone Number ID)', c.wa_phone_number_id, 'inputmode="numeric" placeholder="Ex.: 1433470756509005"')}
          ${field('s-waba', 'ID da conta do WhatsApp Business', s.wa_business_account_id, 'inputmode="numeric" placeholder="Ex.: 4846783048931640"')}
          <label class="field">Token de acesso<input id="c-wa-token" type="password" autocomplete="off" placeholder="${hasToken ? 'Já salvo. Cole um novo para trocar' : 'Cole o token gerado na Meta'}"></label>
          <label class="field">Chave secreta do app<input id="c-wa-secret" type="password" autocomplete="off" placeholder="${hasSecret ? 'Já salva. Cole uma nova para trocar' : 'Cole a chave secreta do app'}"></label>
        </div>
        <p class="hint">No webhook da Meta (<strong>WhatsApp → Configuração</strong>), use estes valores e assine o campo <strong>messages</strong>:</p>
        <div class="copy">URL de retorno <code>${esc(st.webhook_url)}</code><button type="button" class="btn small" data-copy="${esc(st.webhook_url)}">${icon('copy')}Copiar</button></div>
        <div class="copy">Token de verificação <code>${esc(st.whatsapp.verify_token)}</code><button type="button" class="btn small" data-copy="${esc(st.whatsapp.verify_token)}">${icon('copy')}Copiar</button></div>
        ${check('s-test', 'Modo teste (não envia mensagens reais)', s.test_mode)}
        <div class="actions"><button type="button" class="btn" id="wa-check">${icon('check')}Salvar, verificar e ligar o WhatsApp</button></div>
        <ul class="status-list" id="wa-check-result"></ul>`)}

      ${state.demo ? '' : section('Google Agenda', st.google.configured
        ? `Compartilhe a agenda da clínica com <code>${esc(st.google.email)}</code> marcando “Fazer alterações nos eventos”.`
        : 'Sem a conta de serviço do Google, as consultas são cadastradas pelo portal (“Nova consulta”).', `
        ${field('c-calendar', 'ID do Google Agenda', c.calendar_id, 'placeholder="xxxx@group.calendar.google.com"')}
        <p class="hint">Cadastre cada consulta com o título <code>Nome do paciente - Procedimento</code> e, na descrição, <code>Tel: (11) 98765-4321</code> (e, se quiser, <code>Valor: 180</code>).</p>`)}

      ${section('Quando enviar', 'Horários das mensagens automáticas.', `
        <div class="grid2">
          ${field('s-days', 'Confirmar quantos dias antes', s.confirm_days_before, 'type="number" min="1" max="7"')}
          ${field('s-confirm', 'Horário da confirmação', s.confirm_time, 'type="time"')}
        </div>
        ${check('s-second', 'Enviar 2º lembrete para quem não respondeu', s.second_reminder)}
        <div class="grid2">
          ${field('s-second-time', 'Horário do 2º lembrete', s.second_time, 'type="time"')}
          ${field('s-escalate', 'Avisar a recepção a partir de', s.escalate_time, 'type="time"')}
        </div>
        ${check('s-final', 'Lembrete no dia, antes da consulta', s.final_reminder)}
        <div class="grid2">
          ${field('s-final-hours', 'Quantas horas antes', s.final_hours, 'type="number" min="1" max="12"')}
          <span></span>
          ${field('s-from', 'Não enviar antes de', s.send_from, 'type="time"')}
          ${field('s-until', 'Não enviar depois de', s.send_until, 'type="time"')}
        </div>`)}

      ${section('Remarcação e lista de espera', 'Horário de atendimento, usado para oferecer novos horários. Deixe vazio nos dias em que a clínica fecha.', `
        <div class="weekdays">
          ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<span>${WEEKDAYS[d]}</span><input id="wh-${d}" value="${esc(s.work_hours[d] ?? '')}" placeholder="08:00-12:00, 13:00-18:00" aria-label="${WEEKDAYS[d]}">`).join('')}
        </div>
        <div class="grid2">
          ${field('s-step', 'Intervalo entre horários (min)', s.slot_step, 'type="number" min="10" step="5"')}
          ${field('s-offer-min', 'Tempo para aceitar uma vaga (min)', s.offer_minutes, 'type="number" min="5"')}
        </div>
        ${check('s-offer-cancel', 'Oferecer à lista de espera quando uma consulta sair da agenda', s.offer_on_cancel)}`)}

      ${section('Textos das respostas', 'Use <code>{nome}</code>, <code>{clinica}</code>, <code>{procedimento}</code>, <code>{data}</code>, <code>{hora}</code>, <code>{endereco}</code> e, na remarcação, <code>{novo_horario}</code>.', `
        <div class="grid2">
          ${area('t-confirmed', 'Paciente confirmou', s.texts.confirmed)}
          ${area('t-reschedule', 'Paciente quer remarcar (antes das opções)', s.texts.reschedule)}
          ${area('t-rescheduled', 'Remarcação concluída', s.texts.rescheduled)}
          ${area('t-reschedule-none', 'Sem horários livres', s.texts.reschedule_none)}
          ${area('t-human', 'Pediu para falar com a recepção', s.texts.human)}
          ${area('t-fallback', 'Mensagem que o sistema não entendeu', s.texts.fallback)}
          ${area('t-offer-accepted', 'Lista de espera: aceitou a vaga', s.texts.offer_accepted)}
          ${area('t-offer-declined', 'Lista de espera: recusou', s.texts.offer_declined)}
          ${area('t-offer-taken', 'Lista de espera: vaga já preenchida', s.texts.offer_taken)}
          ${area('t-reminder', 'Lembrete no dia (conversa aberta)', s.texts.reminder_text)}
        </div>`)}

      ${section('Modelos aprovados pela Meta', 'Mensagens que a clínica inicia precisam de modelo aprovado. O texto aqui deve ser igual ao aprovado; a ordem das variáveis está no README.', `
        <div class="grid3">
          ${field('m-confirm', 'Confirmação: nome', s.templates.confirm.name)}
          ${field('m-offer', 'Oferta de vaga: nome', s.templates.offer.name)}
          ${field('m-reminder', 'Lembrete: nome', s.templates.reminder.name)}
        </div>
        <div class="grid3">
          ${area('p-confirm', 'Texto da confirmação', s.templates.confirm.preview)}
          ${area('p-offer', 'Texto da oferta', s.templates.offer.preview)}
          ${area('p-reminder', 'Texto do lembrete', s.templates.reminder.preview)}
        </div>`)}

      <div class="save-bar"><span class="hint" id="save-state"></span><button class="btn primary" type="submit">${icon('check')}Salvar configurações</button></div>
    </form>
    <div><button class="btn ghost danger" type="button" id="logout-config">${icon('logout')}${state.demo ? 'Sair da demonstração' : 'Sair da conta'}</button></div>`;

  $('#config-form').addEventListener('input', () => { $('#save-state').textContent = 'Alterações não salvas'; });
  $('#config-form').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copiado.'); } catch { toast('Não deu para copiar. Selecione o texto e copie.', true); }
  });
  $('#config-form').addEventListener('submit', saveConfig);
  $('#wa-check')?.addEventListener('click', checkWhatsApp);
  $('#logout-config').addEventListener('click', logout);
}

async function checkWhatsApp() {
  const btn = $('#wa-check');
  btn.disabled = true;
  btn.textContent = 'Verificando...';
  const saved = await saveConfig(null, true);
  const r = saved && await act(() => api(`/api/clinics/${state.clinicId}/whatsapp-check`, { method: 'POST', body: {} }));
  const box = $('#wa-check-result');
  if (box && r) box.innerHTML = r.steps.map((s) => `<li>${chip(s.ok ? ['OK', 'ok', 'check'] : ['Problema', 'bad', 'alert'])}<p>${esc(s.text)}</p></li>`).join('');
  if ($('#wa-check')) { $('#wa-check').disabled = false; $('#wa-check').innerHTML = `${icon('check')}Salvar, verificar e ligar o WhatsApp`; }
}

async function saveConfig(e, keepScreen = false) {
  if (e) e.preventDefault();
  // Na demonstração os campos do WhatsApp e do Google não aparecem (o servidor ignora esses valores).
  const v = (id) => $('#' + id)?.value ?? '';
  const n = (id) => Number($('#' + id).value);
  const ch = (id) => $('#' + id)?.checked ?? true;
  const work = {};
  for (const d of [0, 1, 2, 3, 4, 5, 6]) work[d] = v('wh-' + d).trim();
  const body = {
    name: v('c-name'), address: v('c-address'), calendar_id: v('c-calendar'), wa_phone_number_id: v('c-wa'),
    wa_token: v('c-wa-token'), wa_app_secret: v('c-wa-secret'),
    settings: {
      test_mode: ch('s-test'), wa_business_account_id: v('s-waba').replace(/\D/g, ''), confirm_days_before: n('s-days'), confirm_time: v('s-confirm'),
      second_reminder: ch('s-second'), second_time: v('s-second-time'), escalate_time: v('s-escalate'),
      final_reminder: ch('s-final'), final_hours: n('s-final-hours'), send_from: v('s-from'), send_until: v('s-until'),
      work_hours: work, slot_step: n('s-step'), offer_minutes: n('s-offer-min'), offer_on_cancel: ch('s-offer-cancel'),
      texts: {
        confirmed: v('t-confirmed'), reschedule: v('t-reschedule'), rescheduled: v('t-rescheduled'), reschedule_none: v('t-reschedule-none'),
        human: v('t-human'), fallback: v('t-fallback'), offer_accepted: v('t-offer-accepted'), offer_declined: v('t-offer-declined'),
        offer_taken: v('t-offer-taken'), reminder_text: v('t-reminder'),
      },
      templates: {
        confirm: { name: v('m-confirm'), preview: v('p-confirm') },
        offer: { name: v('m-offer'), preview: v('p-offer') },
        reminder: { name: v('m-reminder'), preview: v('p-reminder') },
      },
    },
  };
  const saved = await act(() => api(`/api/clinics/${state.clinicId}`, { method: 'PUT', body }), 'Configurações salvas.');
  if (!saved) return null;
  await loadClinics(state.clinicId);
  renderChrome();
  if (keepScreen) {
    $('#c-wa-token').value = '';
    $('#c-wa-secret').value = '';
    $('#save-state').textContent = 'Salvo';
    return saved;
  }
  showConfig();
  if (state.demo) app.insertAdjacentHTML('afterbegin', demoBar());
  $('#save-state').textContent = 'Salvo';
  return saved;
}

// ---------- Tema claro / escuro ----------

function currentTheme() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
function renderThemeButtons() {
  const dark = currentTheme() === 'dark';
  $('#theme-side').innerHTML = `${icon(dark ? 'sun' : 'moon')}<span>${dark ? 'Tema claro' : 'Tema escuro'}</span>`;
  $('#theme-m').innerHTML = icon(dark ? 'sun' : 'moon');
  $('#theme-m').setAttribute('aria-label', dark ? 'Usar tema claro' : 'Usar tema escuro');
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0d171a' : '#0b3a40');
}
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* sem armazenamento */ }
  renderThemeButtons();
}

// ---------- Eventos globais ----------

document.addEventListener('click', (e) => {
  const day = e.target.closest('[data-date]');
  if (day) return loadDay(day.dataset.date);
  if (e.target.closest('[data-new]')) return openNewDialog();
  const row = e.target.closest('[data-appt]');
  if (row) {
    const a = findAppt(Number(row.dataset.appt));
    if (a) openDrawer({ apptId: a.id, phone: a.phone, name: a.patient_name || 'Horário livre' });
    return;
  }
  const w = e.target.closest('[data-wait]');
  if (w) {
    const entry = state.data?.waitlist.find((x) => x.id === Number(w.dataset.wait));
    if (entry) openDrawer({ waitId: entry.id, phone: entry.phone, name: entry.name });
    return;
  }
  const qr = e.target.closest('[data-reply]');
  if (qr && state.sel?.phone) simulateReply({ reply_id: qr.dataset.reply, label: qr.textContent });
});
$('#drawer-backdrop').addEventListener('click', closeDrawer);
$('#theme-side').addEventListener('click', toggleTheme);
$('#theme-m').addEventListener('click', toggleTheme);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.sel && !document.querySelector('dialog[open]')) closeDrawer(); });
window.addEventListener('hashchange', () => { if (!$('#shell').hidden) route(); });
for (const sel of [$('#clinic-select'), $('#clinic-select-m')]) {
  sel.addEventListener('change', (e) => {
    if (e.target.value === 'new') { closeDrawer(); renderChrome(); return showNewClinic(false); }
    state.clinicId = Number(e.target.value);
    state.data = null;
    state.date = null;
    state.weekStart = null;
    syncSelects();
    route();
  });
}
async function logout() {
  state.demo = false;
  await api('/api/logout', { method: 'POST', body: {} }).catch(() => null);
  showLogin();
}
$('#logout').addEventListener('click', logout);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

start();

// Portal da Agenda Cheia: painel do dia, conversa com o paciente e configurações.
'use strict';

const STATUS = {
  agendado: ['Agendado', ''],
  aguardando: ['Aguardando', 'info'],
  sem_resposta: ['2º lembrete', 'warn'],
  ligar: ['Recepção liga', 'bad'],
  confirmado: ['Confirmado', 'ok'],
  remarcando: ['Escolhendo horário', 'info'],
  remarcar: ['Remarcar (recepção)', 'bad'],
  cancelado: ['Cancelado', ''],
  sem_telefone: ['Sem telefone', 'warn'],
  encaixe: ['Encaixe feito', 'ok'],
  vago: ['Horário vago', 'bad'],
  oferecido: ['Oferecido à lista', 'warn'],
};
const WSTATUS = { espera: ['Na espera', ''], oferta: ['Oferta enviada', 'warn'], encaixado: ['Encaixado', 'ok'] };
const MSG_STATUS = { simulado: 'simulado', enviado: '✓', entregue: '✓✓', lido: '✓✓ lido', erro: 'não enviada', recebido: '' };
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const state = {
  clinics: [], clinicId: null, view: 'painel', date: null, data: null, sel: null, mode: 'patient', status: null, timer: null,
};
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');

// ---------- Utilitários ----------

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function pill([label, tone]) { return `<span class="pill ${tone}">${esc(label)}</span>`; }
function brl(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR'); }
function clinic() { return state.clinics.find((c) => c.id === state.clinicId); }
function tz() { return clinic()?.timezone || 'America/Sao_Paulo'; }
function fmt(iso, opts) { return new Intl.DateTimeFormat('pt-BR', { timeZone: tz(), ...opts }).format(new Date(iso)); }
function fmtTime(iso) { return fmt(iso, { hour: '2-digit', minute: '2-digit' }); }
function fmtShort(iso) { return fmt(iso, { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', ''); }
function fmtStamp(iso) { return fmt(iso, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''); }
function fmtPhone(p) {
  const d = String(p || '').replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p || '';
}
function dateLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: '2-digit' }).format(dt);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function shiftDate(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
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
  if (!navigator.onLine) throw new Error('Sem internet. Confira a conexão do celular.');
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body !== undefined ? { 'content-type': 'application/json' } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
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
  $('#topbar').hidden = true;
  app.innerHTML = `
    <section class="login panel panel-pad">
      <span class="eyebrow">Portal da clínica</span>
      <h1>Agenda Cheia</h1>
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
  try { await api('/api/me'); } catch { return; }
  $('#topbar').hidden = false;
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
  const sel = $('#clinic-select');
  sel.innerHTML = state.clinics.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')
    + '<option value="new">+ Nova clínica</option>';
  if (state.clinicId) sel.value = String(state.clinicId);
}

function route() {
  state.view = location.hash === '#config' ? 'config' : 'painel';
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.view === state.view));
  if (!state.clinicId) return showNewClinic(true);
  try { localStorage.setItem('clinicId', String(state.clinicId)); } catch { /* sem armazenamento */ }
  if (state.view === 'config') showConfig();
  else showPainel();
}

function showNewClinic(first) {
  stopPolling();
  app.innerHTML = `
    <section class="login panel panel-pad">
      <span class="eyebrow">${first ? 'Primeiro passo' : 'Nova clínica'}</span>
      <h1>${first ? 'Cadastre a primeira clínica' : 'Cadastrar clínica'}</h1>
      <form id="clinic-form">
        <label class="field">Nome da clínica<input id="clinic-name" required placeholder="Ex.: Clínica Sorriso Vivo"></label>
        <button class="btn primary" type="submit">Cadastrar</button>
        ${first ? '' : '<button class="btn" type="button" id="clinic-cancel">Voltar</button>'}
      </form>
    </section>`;
  $('#clinic-name').focus();
  $('#clinic-cancel')?.addEventListener('click', () => { $('#clinic-select').value = String(state.clinicId); route(); });
  $('#clinic-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = await act(() => api('/api/clinics', { method: 'POST', body: { name: $('#clinic-name').value } }), 'Clínica cadastrada.');
    if (!c) return;
    await loadClinics(c.id);
    location.hash = '#config';
    route();
  });
}

// ---------- Painel ----------

function stopPolling() { clearInterval(state.timer); state.timer = null; }

function showPainel() {
  stopPolling();
  state.data = null;
  state.sel = null;
  app.innerHTML = `
    <div id="banner"></div>
    <section class="board">
      <div class="panel">
        <div class="board-head">
          <div class="daynav">
            <button class="btn small" type="button" id="day-prev" aria-label="Dia anterior">‹</button>
            <h2 id="day-label"></h2>
            <button class="btn small" type="button" id="day-next" aria-label="Próximo dia">›</button>
            <label><span class="sr-only">Escolher dia</span><input type="date" id="day-input"></label>
          </div>
          <div class="toolbar">
            <button class="btn" type="button" id="btn-new">+ Consulta</button>
            <button class="btn" type="button" id="btn-run">Atualizar agora</button>
            <button class="btn primary" type="button" id="btn-force">Enviar confirmações agora</button>
          </div>
        </div>
        <div class="metrics" id="metrics"></div>
        <div id="attention"></div>
        <div class="section-label"><span class="eyebrow">Consultas do dia</span><span class="hint">Clique num paciente para ver a conversa</span></div>
        <ul class="list" id="appts"></ul>
        <div class="lower">
          <div>
            <div class="section-label"><span class="eyebrow">Lista de espera</span><button class="btn small" type="button" id="wait-toggle">+ Adicionar</button></div>
            <form class="inline-form" id="wait-form" hidden>
              <label class="field">Nome<input id="w-name" required></label>
              <label class="field">Telefone<input id="w-phone" required inputmode="tel" placeholder="(11) 98765-4321"></label>
              <label class="field">Procedimento<input id="w-proc" placeholder="Limpeza"></label>
              <label class="field">Preferência<input id="w-pref" placeholder="Qualquer horário"></label>
              <div class="actions"><button class="btn primary small" type="submit">Adicionar à lista</button><button class="btn small" type="button" id="wait-cancel">Cancelar</button></div>
            </form>
            <ul class="list" id="waitlist"></ul>
          </div>
          <div>
            <div class="section-label"><span class="eyebrow">O que o sistema fez</span></div>
            <ul class="log" id="log"></ul>
          </div>
        </div>
      </div>
      <div class="phone-col" id="phone-col">
        <div class="phone-caption"><strong id="phone-owner">Conversa</strong><span class="hint" id="phone-kind"></span></div>
        <div class="phone">
          <div class="screen">
            <div class="wa-head">
              <div class="avatar" id="wa-avatar">AC</div>
              <div><div class="n" id="wa-name"></div><div class="s">Conta comercial</div></div>
            </div>
            <div class="chat" id="chat" aria-live="polite"><p class="chat-empty">Escolha um paciente na lista.</p></div>
            <div class="composer" id="composer" hidden>
              <div class="modes" id="modes"></div>
              <form id="compose-form"><input id="compose-input" autocomplete="off"><button class="btn primary small" type="submit">Enviar</button></form>
            </div>
          </div>
        </div>
        <div class="phone-actions" id="phone-actions"></div>
      </div>
    </section>
    <dialog id="new-dialog">
      <form id="new-form" method="dialog">
        <h2 class="full">Nova consulta</h2>
        <label class="field full">Paciente<input id="n-patient" required></label>
        <label class="field">Telefone (WhatsApp)<input id="n-phone" inputmode="tel" placeholder="(11) 98765-4321"></label>
        <label class="field">Procedimento<input id="n-proc" placeholder="Limpeza"></label>
        <label class="field">Data<input type="date" id="n-date" required></label>
        <label class="field">Horário<input type="time" id="n-time" required step="300"></label>
        <label class="field">Duração (min)<input type="number" id="n-dur" value="60" min="15" step="15"></label>
        <label class="field">Valor (R$)<input type="number" id="n-value" min="0" step="1" placeholder="Opcional"></label>
        <p class="hint full" id="n-hint"></p>
        <div class="actions"><button class="btn" type="button" id="n-cancel">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
      </form>
    </dialog>`;

  $('#wa-name').textContent = clinic().name;
  $('#wa-avatar').textContent = clinic().name.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'AC';
  $('#day-prev').addEventListener('click', () => loadDay(shiftDate(state.date, -1)));
  $('#day-next').addEventListener('click', () => loadDay(shiftDate(state.date, 1)));
  $('#day-input').addEventListener('change', (e) => e.target.value && loadDay(e.target.value));
  $('#btn-run').addEventListener('click', () => runCycle(false));
  $('#btn-force').addEventListener('click', () => runCycle(true));
  $('#btn-new').addEventListener('click', openNewDialog);
  $('#n-cancel').addEventListener('click', () => $('#new-dialog').close());
  $('#new-form').addEventListener('submit', saveNewAppointment);
  $('#wait-toggle').addEventListener('click', () => { $('#wait-form').hidden = !$('#wait-form').hidden; if (!$('#wait-form').hidden) $('#w-name').focus(); });
  $('#wait-cancel').addEventListener('click', () => { $('#wait-form').hidden = true; });
  $('#wait-form').addEventListener('submit', addWait);
  $('#compose-form').addEventListener('submit', compose);

  loadDay(null);
  state.timer = setInterval(() => { if (!document.hidden) refresh(); }, 15000);
}

async function loadDay(date) {
  const q = date ? `?date=${date}` : '';
  const data = await act(() => api(`/api/clinics/${state.clinicId}/day${q}`));
  if (!data) return;
  state.date = data.date;
  state.data = data;
  renderDay();
  renderConversation();
}

async function refresh() {
  if (!state.date || state.view !== 'painel') return;
  const data = await api(`/api/clinics/${state.clinicId}/day?date=${state.date}`).catch(() => null);
  if (!data) return;
  state.data = data;
  renderDay();
  renderConversation();
}

function renderDay() {
  const d = state.data;
  const sim = d.simulated;
  $('#banner').innerHTML = sim
    ? `<div class="banner"><span><strong>Modo teste:</strong> nenhuma mensagem real é enviada. Use o celular ao lado para responder como o paciente.</span><a href="#config">Ligar o WhatsApp</a></div>`
    : '';
  $('#day-label').textContent = dateLabel(d.date) + (d.date === d.today ? ' (hoje)' : d.date === shiftDate(d.today, 1) ? ' (amanhã)' : '');
  $('#day-input').value = d.date;

  const appts = d.appointments.filter((a) => a.status !== 'cancelado' || a.source === 'manual');
  const live = appts.filter((a) => a.status !== 'cancelado');
  const filled = live.filter((a) => a.status === 'confirmado' || a.status === 'encaixe');
  const recovered = live.filter((a) => a.status === 'encaixe');
  const todo = live.filter((a) => ['ligar', 'remarcar', 'vago', 'sem_telefone'].includes(a.status)).length;
  $('#metrics').innerHTML = [
    ['Confirmadas', `${filled.length}/${live.length}`, live.length && filled.length === live.length ? 'good' : ''],
    ['Horários reaproveitados', String(recovered.length), recovered.length ? 'good' : ''],
    ['Receita garantida', brl(filled.reduce((s, a) => s + (a.value || 0), 0)), ''],
    ['Para a recepção resolver', String(todo), todo ? 'alert' : ''],
  ].map(([k, v, c]) => `<div class="metric"><span class="k">${k}</span><span class="v ${c}">${v}</span></div>`).join('');

  $('#attention').innerHTML = d.attention.length ? `
    <div class="attention">
      <div class="section-label"><span class="eyebrow">Precisa de atenção (próximos dias)</span></div>
      <ul class="list">${d.attention.map((a) => apptRow(a, true)).join('')}</ul>
    </div>` : '';

  $('#appts').innerHTML = appts.length
    ? appts.map((a) => apptRow(a, false)).join('')
    : '<li class="empty">Nenhuma consulta neste dia. Use “+ Consulta” ou cadastre no Google Agenda.</li>';

  $('#waitlist').innerHTML = d.waitlist.length ? d.waitlist.map((w) => `
    <li><button type="button" class="row${state.sel?.waitId === w.id ? ' sel' : ''}" data-wait="${w.id}" style="grid-template-columns:minmax(0,1fr) auto">
      <span class="who"><span class="name">${esc(w.name)}</span><span class="sub">${esc([w.procedure, w.preference].filter(Boolean).join(' · ') || fmtPhone(w.phone))}</span></span>
      <span class="right">${pill(WSTATUS[w.status] || [w.status, ''])}</span>
    </button></li>`).join('') : '<li class="empty">Ninguém na lista. Quem quiser antecipar a consulta entra aqui.</li>';

  $('#log').innerHTML = d.events.length
    ? d.events.map((e) => `<li><span class="t">${fmtStamp(e.created_at)}</span><span class="${esc(e.tone)}">${esc(e.text)}</span></li>`).join('')
    : '<li class="muted">Nada ainda.</li>';
}

function apptRow(a, withDate) {
  const isSel = state.sel?.apptId === a.id;
  const free = a.status === 'vago' || a.status === 'oferecido';
  const name = free ? 'Horário livre' : a.patient_name || 'Sem nome';
  let sub = esc(a.procedure || '');
  if (free) sub = a.replaced_name ? `Era de ${esc(a.replaced_name)}` : 'Disponível para a lista de espera';
  else if (a.status === 'encaixe' && a.replaced_name) sub = `${esc(a.procedure)} · no lugar de ${esc(a.replaced_name)}`;
  else if (a.moved_from) sub = `${esc(a.procedure)} · remarcado de ${fmtShort(a.moved_from)} ${fmtTime(a.moved_from)}`;
  else if (!a.phone) sub = `${esc(a.procedure)} · adicione o telefone na agenda`;
  return `<li><button type="button" class="row${isSel ? ' sel' : ''}${a.status === 'cancelado' ? ' faded' : ''}" data-appt="${a.id}">
    <span class="time">${fmtTime(a.starts_at)}${withDate ? `<br><span class="when">${fmtShort(a.starts_at)}</span>` : ''}</span>
    <span class="who"><span class="name">${esc(name)}</span><span class="sub">${sub || '&nbsp;'}</span></span>
    <span class="right">${pill(STATUS[a.status] || [a.status, ''])}${a.value ? `<span class="val">${brl(a.value)}</span>` : ''}</span>
  </button></li>`;
}

function findAppt(id) {
  return state.data.appointments.find((a) => a.id === id) || state.data.attention.find((a) => a.id === id);
}

function onBoardClick(e) {
  const row = e.target.closest('[data-appt]');
  if (row) {
    const a = findAppt(Number(row.dataset.appt));
    if (!a) return;
    state.sel = { apptId: a.id, phone: a.phone, name: a.patient_name || 'Horário livre', kind: a.status };
    selectChanged();
    return;
  }
  const w = e.target.closest('[data-wait]');
  if (w) {
    const entry = state.data.waitlist.find((x) => x.id === Number(w.dataset.wait));
    state.sel = { waitId: entry.id, phone: entry.phone, name: entry.name, kind: 'lista' };
    selectChanged();
    return;
  }
  const qr = e.target.closest('[data-reply]');
  if (qr && state.sel?.phone) simulateReply({ reply_id: qr.dataset.reply, label: qr.textContent });
}

function selectChanged() {
  renderDay();
  renderConversation();
  if (window.innerWidth <= 960) $('#phone-col').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let convToken = 0;
async function renderConversation() {
  const sel = state.sel;
  const chat = $('#chat');
  const actions = $('#phone-actions');
  actions.innerHTML = '';
  if (!sel) return;
  $('#phone-owner').textContent = sel.phone ? `Celular de ${sel.name}` : sel.name;
  $('#phone-kind').textContent = sel.phone ? fmtPhone(sel.phone) : '';

  const appt = sel.apptId ? findAppt(sel.apptId) : null;
  if (appt && appt.source === 'manual' && appt.status !== 'cancelado') {
    actions.innerHTML = `<button class="btn small danger" type="button" id="cancel-appt">Cancelar ${appt.kind === 'vaga' ? 'horário' : 'consulta'}</button>`;
    $('#cancel-appt').addEventListener('click', () => cancelAppt(appt));
  }
  if (sel.waitId) {
    actions.innerHTML = '<button class="btn small danger" type="button" id="remove-wait">Tirar da lista de espera</button>';
    $('#remove-wait').addEventListener('click', () => removeWait(sel.waitId));
  }

  if (!sel.phone) {
    chat.innerHTML = `<p class="chat-empty">${appt && (appt.status === 'vago' || appt.status === 'oferecido')
      ? 'Este horário está livre. Ele é oferecido automaticamente para a lista de espera.'
      : 'Sem telefone. Coloque o número na descrição do evento, ex.: “Tel: (11) 98765-4321”.'}</p>`;
    $('#composer').hidden = true;
    return;
  }

  const token = ++convToken;
  const data = await api(`/api/clinics/${state.clinicId}/conversation?phone=${encodeURIComponent(sel.phone)}`).catch(() => null);
  if (!data || token !== convToken) return;
  const sim = state.data?.simulated;
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
      const list = JSON.parse(m.buttons);
      const active = sim && lastIsOut;
      buttons = list.map((b) => `<button type="button" class="qr" data-reply="${esc(b.id)}" ${active ? '' : 'disabled'}>${esc(b.title)}</button>`).join('');
    }
    html += `<div class="bubble-group ${dir}"><div class="bubble">${esc(m.body)}<span class="meta${m.status === 'erro' ? ' err' : ''}"${m.error ? ` title="${esc(m.error)}"` : ''}>${fmtTime(m.created_at)}${status ? ' · ' + esc(status) : ''}</span></div>${buttons}</div>`;
  }
  chat.innerHTML = html || `<p class="chat-empty">Nenhuma mensagem ainda. ${sim ? 'Use “Enviar confirmações agora” para testar.' : 'A confirmação sai automaticamente na véspera.'}</p>`;
  chat.scrollTop = chat.scrollHeight;

  $('#composer').hidden = false;
  const modes = $('#modes');
  if (sim) {
    if (state.mode !== 'clinic') state.mode = 'patient';
    modes.innerHTML = `<button type="button" data-mode="patient" class="${state.mode === 'patient' ? 'on' : ''}">Responder como paciente</button><button type="button" data-mode="clinic" class="${state.mode === 'clinic' ? 'on' : ''}">Responder como clínica</button>`;
    modes.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { state.mode = b.dataset.mode; renderConversation(); }));
  } else {
    state.mode = 'clinic';
    modes.innerHTML = data.window_open ? '' : '<span class="hint">Fora da janela de 24h: o WhatsApp não permite mensagem livre agora.</span>';
  }
  $('#compose-input').placeholder = state.mode === 'patient' ? 'Ex.: vou sim / preciso remarcar' : 'Mensagem da recepção';
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

function openNewDialog() {
  $('#new-form').reset();
  $('#n-date').value = state.date;
  $('#n-dur').value = 60;
  const c = clinic();
  $('#n-hint').textContent = c.calendar_id && state.status?.google.configured
    ? 'A consulta também será criada no Google Agenda da clínica.'
    : 'Sem Google Agenda conectado: a consulta fica só no portal (ótimo para testar).';
  $('#new-dialog').showModal();
  $('#n-patient').focus();
}

async function saveNewAppointment(e) {
  e.preventDefault();
  const body = {
    patient: $('#n-patient').value, phone: $('#n-phone').value, procedure: $('#n-proc').value, date: $('#n-date').value,
    time: $('#n-time').value, duration: $('#n-dur').value, value: $('#n-value').value,
  };
  const r = await act(() => api(`/api/clinics/${state.clinicId}/appointments`, { method: 'POST', body }), 'Consulta adicionada.');
  if (!r) return;
  $('#new-dialog').close();
  await loadDay(body.date);
}

async function cancelAppt(a) {
  const btn = $('#cancel-appt');
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1';
    btn.textContent = 'Clique de novo para confirmar';
    setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ''; btn.textContent = 'Cancelar consulta'; } }, 4000);
    return;
  }
  const r = await act(() => api(`/api/clinics/${state.clinicId}/appointments/${a.id}/cancel`, { method: 'POST', body: {} }), 'Consulta cancelada.');
  if (r) await refresh();
}

async function addWait(e) {
  e.preventDefault();
  const body = { name: $('#w-name').value, phone: $('#w-phone').value, procedure: $('#w-proc').value, preference: $('#w-pref').value };
  const r = await act(() => api(`/api/clinics/${state.clinicId}/waitlist`, { method: 'POST', body }), 'Adicionado à lista de espera.');
  if (!r) return;
  $('#wait-form').reset();
  $('#wait-form').hidden = true;
  await refresh();
}

async function removeWait(id) {
  const btn = $('#remove-wait');
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1';
    btn.textContent = 'Clique de novo para confirmar';
    return;
  }
  const r = await act(() => api(`/api/clinics/${state.clinicId}/waitlist/${id}`, { method: 'DELETE' }), 'Removido da lista.');
  if (r) { state.sel = null; $('#chat').innerHTML = '<p class="chat-empty">Escolha um paciente na lista.</p>'; $('#composer').hidden = true; await refresh(); }
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
  const hasToken = c.has_wa_token || st.whatsapp.env_token;
  const hasSecret = c.has_wa_app_secret || st.whatsapp.env_app_secret;
  const waReady = hasToken && c.wa_phone_number_id;
  const waStatus = !waReady ? ['Não configurado', 'warn'] : s.test_mode ? ['Pronto, em modo teste', 'info'] : ['Enviando de verdade', 'ok'];
  const waHint = !waReady
    ? 'Preencha o ID do número e o token abaixo. Enquanto isso, tudo funciona em modo teste (mensagens simuladas).'
    : s.test_mode
      ? 'Desmarque “Modo teste” e salve para as mensagens saírem pelo WhatsApp.'
      : `As mensagens saem pelo WhatsApp.${hasSecret ? '' : ' Falta a chave secreta do app para receber as respostas.'}`;

  app.innerHTML = `
    <div><span class="eyebrow">Configurações</span><h1>${esc(c.name)}</h1></div>
    <form id="config-form" class="config">
      <section class="panel panel-pad">
        <h2>Clínica</h2>
        ${field('c-name', 'Nome (aparece nas mensagens)', c.name, 'required')}
        ${field('c-address', 'Endereço (vai no lembrete)', c.address, 'placeholder="Rua das Acácias, 120, sala 4"')}
      </section>

      <section class="panel panel-pad">
        <h2>Google Agenda</h2>
        <ul class="status-list">
          <li>${pill(st.google.configured ? ['Conectado', 'ok'] : ['Não configurado', 'warn'])}<div><p class="hint">${st.google.configured
            ? `Compartilhe a agenda da clínica com <code>${esc(st.google.email)}</code> e marque “Fazer alterações nos eventos”.`
            : 'Sem a conta de serviço do Google, as consultas são cadastradas pelo portal (“+ Consulta”).'}</p></div></li>
        </ul>
        ${field('c-calendar', 'ID do Google Agenda', c.calendar_id, 'placeholder="xxxx@group.calendar.google.com"')}
        <p class="hint">No Google Agenda: Configurações da agenda → “Integrar agenda” → ID da agenda. Na agenda, cadastre a consulta com o título <code>Nome do paciente - Procedimento</code> e na descrição <code>Tel: (11) 98765-4321</code> (e, se quiser, <code>Valor: 180</code>).</p>
      </section>

      <section class="panel panel-pad span">
        <h2>WhatsApp</h2>
        <ul class="status-list"><li>${pill(waStatus)}<div><p class="hint">${waHint}</p></div></li></ul>
        <p class="hint">Na Meta: <strong>developers.facebook.com → seu app → WhatsApp → Configuração da API</strong>. Copie de lá o ID do número e o token. A chave secreta fica em <strong>Configurações do app → Básico</strong>.</p>
        <div class="grid3">
          ${field('c-wa', 'ID do número (Phone Number ID)', c.wa_phone_number_id, 'inputmode="numeric" placeholder="Ex.: 1433470756509005"')}
          <label class="field">Token de acesso<input id="c-wa-token" type="password" autocomplete="off" placeholder="${hasToken ? 'Já salvo. Cole um novo para trocar' : 'Cole o token gerado na Meta'}"></label>
          <label class="field">Chave secreta do app<input id="c-wa-secret" type="password" autocomplete="off" placeholder="${hasSecret ? 'Já salva. Cole uma nova para trocar' : 'Cole a chave secreta do app'}"></label>
        </div>
        <p class="hint">Para receber as respostas, em <strong>WhatsApp → Configuração → Webhook</strong> na Meta, cole estes dois valores e assine o campo <strong>messages</strong>:</p>
        <div class="copy">URL de retorno: <code>${esc(st.webhook_url)}</code><button type="button" class="btn small" data-copy="${esc(st.webhook_url)}">Copiar</button></div>
        <div class="copy">Token de verificação: <code>${esc(st.whatsapp.verify_token)}</code><button type="button" class="btn small" data-copy="${esc(st.whatsapp.verify_token)}">Copiar</button></div>
        ${field('s-waba', 'ID da conta do WhatsApp Business (na Meta, ao lado do ID do número)', s.wa_business_account_id, 'inputmode="numeric" placeholder="Ex.: 4846783048931640"')}
        ${check('s-test', 'Modo teste (não envia mensagens reais)', s.test_mode)}
        <div class="toolbar"><button type="button" class="btn" id="wa-check">Salvar, verificar e ligar o WhatsApp</button></div>
        <ul class="status-list" id="wa-check-result"></ul>
      </section>

      <section class="panel panel-pad">
        <h2>Quando enviar</h2>
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
        ${field('s-final-hours', 'Quantas horas antes', s.final_hours, 'type="number" min="1" max="12"')}
        <div class="grid2">
          ${field('s-from', 'Não enviar antes de', s.send_from, 'type="time"')}
          ${field('s-until', 'Não enviar depois de', s.send_until, 'type="time"')}
        </div>
      </section>

      <section class="panel panel-pad">
        <h2>Remarcação e lista de espera</h2>
        <p class="hint">Horário de atendimento, usado para oferecer novos horários a quem quer remarcar. Deixe vazio nos dias em que a clínica fecha.</p>
        <div class="weekdays">
          ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<span>${WEEKDAYS[d]}</span><input id="wh-${d}" value="${esc(s.work_hours[d] ?? '')}" placeholder="08:00-12:00, 13:00-18:00" aria-label="${WEEKDAYS[d]}">`).join('')}
        </div>
        <div class="grid2">
          ${field('s-step', 'Intervalo entre horários (min)', s.slot_step, 'type="number" min="10" step="5"')}
          ${field('s-offer-min', 'Tempo para aceitar uma vaga (min)', s.offer_minutes, 'type="number" min="5"')}
        </div>
        ${check('s-offer-cancel', 'Oferecer à lista de espera quando uma consulta sair da agenda', s.offer_on_cancel)}
      </section>

      <section class="panel panel-pad span">
        <h2>Textos das respostas</h2>
        <p class="hint">Use <code>{nome}</code>, <code>{clinica}</code>, <code>{procedimento}</code>, <code>{data}</code>, <code>{hora}</code>, <code>{endereco}</code> e, na remarcação, <code>{novo_horario}</code>.</p>
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
          ${area('t-reminder', 'Lembrete no dia (quando a conversa está aberta)', s.texts.reminder_text)}
        </div>
      </section>

      <section class="panel panel-pad span">
        <h2>Modelos aprovados pela Meta</h2>
        <p class="hint">Mensagens que a clínica inicia precisam de um modelo aprovado no WhatsApp Manager. O texto abaixo é só o que aparece no portal; ele deve ser igual ao aprovado. A ordem das variáveis está no README do projeto.</p>
        <div class="grid3">
          ${field('m-confirm', 'Confirmação: nome do modelo', s.templates.confirm.name)}
          ${field('m-offer', 'Oferta de vaga: nome do modelo', s.templates.offer.name)}
          ${field('m-reminder', 'Lembrete: nome do modelo', s.templates.reminder.name)}
        </div>
        <div class="grid3">
          ${area('p-confirm', 'Texto da confirmação', s.templates.confirm.preview)}
          ${area('p-offer', 'Texto da oferta', s.templates.offer.preview)}
          ${area('p-reminder', 'Texto do lembrete', s.templates.reminder.preview)}
        </div>
      </section>

      <div class="save-bar span"><span class="hint" id="save-state"></span><button class="btn primary" type="submit">Salvar configurações</button></div>
    </form>`;

  $('#config-form').addEventListener('input', () => { $('#save-state').textContent = 'Alterações não salvas'; });
  $('#config-form').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copiado.'); } catch { toast('Não deu para copiar. Selecione o texto e copie.', true); }
  });
  $('#config-form').addEventListener('submit', saveConfig);
  $('#wa-check').addEventListener('click', checkWhatsApp);
}

async function checkWhatsApp() {
  const btn = $('#wa-check');
  btn.disabled = true;
  btn.textContent = 'Verificando...';
  const saved = await saveConfig(null, true);
  const r = saved && await act(() => api(`/api/clinics/${state.clinicId}/whatsapp-check`, { method: 'POST', body: {} }));
  const box = $('#wa-check-result');
  if (box && r) box.innerHTML = r.steps.map((s) => `<li>${pill(s.ok ? ['OK', 'ok'] : ['Problema', 'bad'])}<div><p>${esc(s.text)}</p></div></li>`).join('');
  if ($('#wa-check')) { $('#wa-check').disabled = false; $('#wa-check').textContent = 'Salvar, verificar e ligar o WhatsApp'; }
}

async function saveConfig(e, keepScreen = false) {
  if (e) e.preventDefault();
  const v = (id) => $('#' + id).value;
  const n = (id) => Number($('#' + id).value);
  const ch = (id) => $('#' + id).checked;
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
  if (keepScreen) {
    $('#c-wa-token').value = '';
    $('#c-wa-secret').value = '';
    $('#save-state').textContent = 'Salvo';
    return saved;
  }
  showConfig();
  $('#save-state').textContent = 'Salvo';
  return saved;
}

// ---------- Início ----------

app.addEventListener('click', (e) => { if (state.view === 'painel' && state.data) onBoardClick(e); });
window.addEventListener('hashchange', () => { if (state.clinicId) route(); });
$('#clinic-select').addEventListener('change', (e) => {
  if (e.target.value === 'new') return showNewClinic(false);
  state.clinicId = Number(e.target.value);
  route();
});
$('#logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST', body: {} }).catch(() => null);
  showLogin();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

start();

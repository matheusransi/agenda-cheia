// Gestão da clínica: pacientes (ficha, anamnese, odontograma, evoluções, orçamentos), financeiro e documentos para imprimir.
// Usa os utilitários de app.js (carregado depois deste arquivo): $, api, act, esc, icon, chip, state, clinic, fmt...
'use strict';

// ---------- Tabelas fixas ----------

// [chave, pergunta, rótulo curto quando é alerta (vazio = não é alerta)]
const ANAMNESE = [
  ['tratamento', 'Está em tratamento médico?', ''],
  ['medicamentos', 'Toma algum medicamento?', ''],
  ['alergia', 'Tem alergia a algum medicamento ou material (látex, anestésico)?', 'Alergia'],
  ['anestesia', 'Já teve reação ruim à anestesia?', 'Reação à anestesia'],
  ['pressao', 'Tem pressão alta?', 'Pressão alta'],
  ['diabetes', 'Tem diabetes?', 'Diabetes'],
  ['coracao', 'Tem algum problema no coração?', 'Problema cardíaco'],
  ['sangramento', 'Sangra muito quando se corta ou usa anticoagulante?', 'Sangramento'],
  ['gestante', 'Está grávida ou amamentando?', 'Gestante/amamentando'],
  ['infeccao', 'Tem ou já teve hepatite, HIV ou outra doença infecciosa?', 'Doença infecciosa'],
  ['cirurgia', 'Já fez alguma cirurgia ou ficou internado?', ''],
  ['fumante', 'Fuma?', ''],
  ['sensibilidade', 'Sente sensibilidade nos dentes (frio, doce)?', ''],
  ['sangra_gengiva', 'A gengiva sangra ao escovar?', ''],
  ['bruxismo', 'Range ou aperta os dentes?', ''],
];

const TOOTH = {
  carie: 'Cárie', restaurado: 'Restaurado', canal: 'Canal', coroa: 'Coroa', implante: 'Implante',
  ausente: 'Ausente', extrair: 'A extrair', fratura: 'Fratura', protese: 'Prótese',
};
const ARCH_UP = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const ARCH_DOWN = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const KIDS_UP = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const KIDS_DOWN = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

const BUDGET_STATUS = { aberto: ['Em aberto', 'warn', 'clock'], aprovado: ['Aprovado', 'ok', 'check'], recusado: ['Recusado', '', 'x'] };
const METHODS = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Boleto', 'Transferência', 'Débito automático', 'Convênio'];
const CATEGORIES = {
  receita: ['Consulta', 'Tratamento', 'Convênio', 'Outros'],
  despesa: ['Aluguel', 'Material', 'Laboratório', 'Salários', 'Contas da clínica', 'Impostos', 'Marketing', 'Outros'],
};
const REFERRALS = ['Indicação de amigo', 'Instagram', 'Google', 'Facebook', 'Convênio', 'Passou na frente', 'Outro'];
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

// ---------- Utilitários ----------

/** "1.234,56", "180" ou "180.5" → centavos. */
function parseMoney(v) {
  let t = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}$/.test(t)) t = t.replace(/\./g, '');
  const n = Math.round(Number(t) * 100);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function brlc(cents) { return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function moneyInput(cents) { return cents ? (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''; }
function fmtKey(key) { if (!key) return ''; const [y, m, d] = key.split('-'); return `${d}/${m}/${y}`; }
function fmtKeyShort(key) { if (!key) return ''; const [, m, d] = key.split('-'); return `${d}/${m}`; }
function isoKey(iso) { return new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date(iso)); }
function fmtCpf(c) { const d = String(c || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d; }
function fmtCep(c) { const d = String(c || '').replace(/\D/g, ''); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; }
function age(birth) {
  if (!birth) return null;
  const [y, m, d] = birth.split('-').map(Number);
  const [ty, tm, td] = todayKey().split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}
function plain(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function json(s, fallback) { try { return JSON.parse(s || '') ?? fallback; } catch { return fallback; } }

/** Tabela de procedimentos das configurações ("Limpeza = 180", um por linha) → [{ name, value (centavos) }]. */
function procedureList() {
  return String(clinic()?.settings?.procedures || '').split('\n').map((line) => {
    const m = /^(.*?)\s*(?:[=:;\t]\s*(?:R\$\s*)?([\d.,]+))?\s*$/.exec(line.trim());
    return m && m[1] ? { name: m[1].trim(), value: m[2] ? parseMoney(m[2]) : null } : null;
  }).filter(Boolean);
}

/** Alertas de saúde marcados na anamnese, ex.: ["Alergia: Penicilina", "Pressão alta"]. */
function healthAlerts(anamnesisJson) {
  const a = typeof anamnesisJson === 'string' ? json(anamnesisJson, {}) : anamnesisJson || {};
  return ANAMNESE.filter(([k, , short]) => short && a[k]?.a === 'sim').map(([k, , short]) => (a[k].d ? `${short}: ${a[k].d}` : short));
}

// Máscaras dos campos (CPF, telefone, CEP) enquanto a pessoa digita.
function applyMask(el) {
  const d = el.value.replace(/\D/g, '');
  const kind = el.dataset.mask;
  if (kind === 'cpf') el.value = d.slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  if (kind === 'cep') el.value = d.slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
  if (kind === 'phone') {
    const x = d.replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
    el.value = x.length > 10 ? x.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3') : x.length > 6 ? x.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3') : x.length > 2 ? x.replace(/(\d{2})(\d+)/, '($1) $2') : x;
  }
}
document.addEventListener('input', (e) => { if (e.target.dataset?.mask) applyMask(e.target); });

async function loadPatientsList() {
  const list = await api(`/api/clinics/${state.clinicId}/patients`).catch(() => null);
  if (list) state.patients = list;
  return state.patients || [];
}

function confirmTwice(btn, fn) {
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1';
    btn.dataset.label = btn.innerHTML;
    btn.textContent = 'Toque de novo para confirmar';
    setTimeout(() => { if (btn.isConnected && btn.dataset.confirm === '1') { btn.dataset.confirm = ''; btn.innerHTML = btn.dataset.label; } }, 4000);
    return;
  }
  fn();
}

// ---------- Cliques compartilhados ----------

function gestaoClick(e) {
  const p = e.target.closest('[data-patient]');
  if (p) { location.hash = `#pacientes/${p.dataset.patient}`; return true; }
  const f = e.target.closest('[data-fin]');
  if (f) { const entry = (state.fin?.entries || []).concat(state.fin?.overdue || [], state.patient?.finance || []).find((x) => x.id === Number(f.dataset.fin)); if (entry) openFinanceDialog(entry); return true; }
  const pay = e.target.closest('[data-pay]');
  if (pay) { payEntry(Number(pay.dataset.pay)); return true; }
  return false;
}

// Na conversa (painel deslizante): botão para abrir a ficha e os alertas de saúde do paciente.
const drawerCache = new Map();
async function drawerPatientLink(box, name, phone) {
  const key = `${phone || ''}|${name}`;
  let found = drawerCache.get(key);
  if (found === undefined) {
    const list = phone ? await api(`/api/clinics/${state.clinicId}/patients?phone=${encodeURIComponent(phone)}`).catch(() => []) : await loadPatientsList();
    const first = plain(name).split(' ')[0];
    found = list.find((p) => plain(p.name) === plain(name)) || list.find((p) => phone && plain(p.name).split(' ')[0] === first) || null;
    drawerCache.set(key, found);
    setTimeout(() => drawerCache.delete(key), 60000);
  }
  if (!found || !box.isConnected || box.querySelector('[data-patient]')) return;
  const alerts = healthAlerts(found.anamnesis);
  box.insertAdjacentHTML('afterbegin', `<button class="btn small" type="button" data-patient="${found.id}">${icon('id')}Ficha do paciente</button>${alerts.map((a) => chip([a, 'bad', 'heart'])).join('')}`);
}

// ---------- Lista de pacientes ----------

function showPacientes(sub) {
  stopPolling();
  const [id, action] = sub;
  if (id === 'novo') return patientForm(null);
  if (/^\d+$/.test(id || '')) return action === 'editar' ? editPatient(Number(id)) : showPatient(Number(id));
  state.pq = state.pq || '';
  state.pfilter = state.pfilter || 'todos';
  app.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">Cadastro e prontuário</p><h1>Pacientes</h1></div>
      <div class="actions"><button class="btn" type="button" id="p-intake">${icon('send')}Cadastro pelo WhatsApp</button><a class="btn primary" href="#pacientes/novo">${icon('plus')}Novo paciente</a></div>
    </div>
    <div class="kpis" id="p-kpis"></div>
    <section class="card">
      <div class="toolbar">
        <label class="search">${icon('search')}<input id="p-search" type="search" placeholder="Buscar por nome, telefone ou CPF" value="${esc(state.pq)}" autocomplete="off"></label>
        <div class="filters" id="p-filters"></div>
      </div>
      <ul class="plist" id="p-list"><li class="muted" style="padding:18px">Carregando...</li></ul>
    </section>`;
  $('#p-intake').addEventListener('click', openIntakeDialog);
  $('#p-search').addEventListener('input', (e) => { state.pq = e.target.value; renderPatientList(); });
  $('#p-filters').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { state.pfilter = b.dataset.f; renderPatientList(); } });
  if (state.patients) renderPatientList();
  loadPatientsList().then(() => { if (state.view === 'pacientes' && !state.sub.length) renderPatientList(); });
}

function patientFlags(p) {
  const today = todayKey();
  const sixMonths = shiftDate(today, -180);
  return {
    next: Boolean(p.next_at),
    inactive: !p.next_at && (!p.last_at || isoKey(p.last_at) < sixMonths),
    birthday: Boolean(p.birth_date) && p.birth_date.slice(5, 7) === today.slice(5, 7),
    alert: healthAlerts(p.anamnesis).length > 0,
  };
}

function renderPatientList() {
  const list = state.patients || [];
  const flags = new Map(list.map((p) => [p.id, patientFlags(p)]));
  const count = (k) => list.filter((p) => flags.get(p.id)[k]).length;
  const month = todayKey().slice(0, 7);
  const newThisMonth = list.filter((p) => isoKey(p.created_at).slice(0, 7) === month).length;
  const bdays = list.filter((p) => flags.get(p.id).birthday).sort((a, b) => a.birth_date.slice(8).localeCompare(b.birth_date.slice(8)));
  $('#p-kpis').innerHTML = `
    <div class="card kpi"><div class="kpi-top"><span class="kpi-ic">${icon('id')}</span>Pacientes</div>
      <div class="kpi-v">${list.length}</div><div class="kpi-sub">${newThisMonth ? `${newThisMonth} novo${newThisMonth > 1 ? 's' : ''} este mês` : 'Cadastrados na clínica'}</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-ic info">${icon('cake')}</span>Aniversariantes do mês</div>
      <div class="kpi-v">${bdays.length}</div><div class="kpi-sub">${bdays.length ? esc(bdays.slice(0, 2).map((p) => `${p.name.split(' ')[0]} (${fmtKeyShort(p.birth_date.replace(/^\d{4}/, '2000'))})`).join(', ')) : 'Ninguém este mês'}</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-ic bad">${icon('clock')}</span>Sem retorno há 6 meses</div>
      <div class="kpi-v">${count('inactive')}</div><div class="kpi-sub">Chame para uma revisão</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-ic bad">${icon('heart')}</span>Alerta de saúde</div>
      <div class="kpi-v">${count('alert')}</div><div class="kpi-sub">Alergias, pressão, diabetes...</div></div>`;
  const filters = [['todos', 'Todos', list.length], ['next', 'Com consulta marcada', count('next')], ['inactive', 'Sem retorno', count('inactive')], ['birthday', 'Aniversariantes', bdays.length], ['alert', 'Alerta de saúde', count('alert')]];
  $('#p-filters').innerHTML = filters.map(([k, label, n]) => `<button type="button" class="fchip${state.pfilter === k ? ' on' : ''}" data-f="${k}">${label}<span>${n}</span></button>`).join('');

  const q = plain(state.pq).trim();
  const digits = q.replace(/\D/g, '');
  const shown = list.filter((p) => (state.pfilter === 'todos' || flags.get(p.id)[state.pfilter])
    && (!q || plain(p.name).includes(q) || (digits.length >= 3 && (String(p.phone).includes(digits) || String(p.cpf).includes(digits)))));
  const el = $('#p-list');
  if (!list.length) {
    el.innerHTML = `<li><div class="empty-state"><span class="big">${icon('id')}</span><strong>Nenhum paciente cadastrado ainda</strong>
      <span>Cadastre o primeiro ou traga automaticamente quem já tem consulta na agenda.</span>
      <div class="actions" style="justify-content:center"><a class="btn primary" href="#pacientes/novo">${icon('plus')}Novo paciente</a><button class="btn" type="button" id="p-import">${icon('refresh')}Trazer da agenda</button></div></div></li>`;
    $('#p-import').addEventListener('click', async () => {
      const r = await act(() => api(`/api/clinics/${state.clinicId}/patients/import`, { method: 'POST', body: {} }));
      if (r) { toast(r.created ? `${r.created} ficha(s) criada(s) a partir da agenda.` : 'Nenhum paciente novo na agenda.'); await loadPatientsList(); renderPatientList(); }
    });
    return;
  }
  el.innerHTML = shown.length ? shown.map((p) => {
    const a = age(p.birth_date);
    const f = flags.get(p.id);
    const alerts = healthAlerts(p.anamnesis);
    const sub = [a != null ? `${a} anos` : '', fmtPhone(p.phone), p.insurance && p.insurance !== 'Particular' ? p.insurance : ''].filter(Boolean).join(' · ');
    const when = p.next_at ? `<span class="when ok">Próxima: ${esc(fmtShort(p.next_at))}</span>` : p.last_at ? `<span class="when${f.inactive ? ' bad' : ''}">Última: ${esc(fmt(p.last_at, { day: '2-digit', month: '2-digit', year: '2-digit' }))}</span>` : '<span class="when">Sem consultas</span>';
    return `<li><button type="button" class="prow" data-patient="${p.id}">
      <span class="avatar${alerts.length ? ' bad' : ''}">${esc(initials(p.name))}</span>
      <span class="who"><span class="name">${esc(p.name)}${f.birthday ? ` <span title="Aniversário este mês">${icon('cake')}</span>` : ''}</span><span class="sub">${esc(sub || 'Sem telefone')}</span></span>
      <span class="end">${alerts.length ? chip([alerts[0].split(':')[0], 'bad', 'heart']) : ''}${when}</span>
    </button></li>`;
  }).join('') : '<li class="muted" style="padding:18px">Nenhum paciente encontrado.</li>';
}

// ---------- Ficha do paciente ----------

async function showPatient(id, tab) {
  if (tab) state.ptab = tab;
  if (!state.patient || state.patient.patient.id !== id) { state.ptab = tab || state.nextTab || 'resumo'; state.patient = null; }
  state.nextTab = null;
  app.innerHTML = '<p class="muted">Carregando ficha...</p>';
  const data = await act(() => api(`/api/clinics/${state.clinicId}/patients/${id}`));
  if (!data) { app.innerHTML = '<p class="muted">Ficha não encontrada. <a href="#pacientes">Voltar</a></p>'; return; }
  state.patient = data;
  renderPatient();
}

async function reloadPatient() {
  const p = state.patient?.patient;
  if (!p) return;
  const data = await act(() => api(`/api/clinics/${state.clinicId}/patients/${p.id}`));
  if (!data) return;
  state.patient = data;
  state.patients = null;
  renderPatient();
}

function renderPatient() {
  const { patient: p, notes, budgets } = state.patient;
  const a = age(p.birth_date);
  const alerts = healthAlerts(p.anamnesis);
  const { documents, attachments } = state.patient;
  const tabs = [['resumo', 'Resumo', 'id'], ['anamnese', 'Anamnese', 'clipboard'], ['odonto', 'Odontograma', 'tooth'], ['tratamentos', 'Orçamentos', 'money'],
    ['evolucoes', 'Evoluções', 'file'], ['termos', 'Termos', 'pen'], ['arquivos', 'Fotos e exames', 'image']];
  const counts = { evolucoes: notes.length, tratamentos: budgets.length, termos: documents.length, arquivos: attachments.length };
  const scroll = window.scrollY;
  app.innerHTML = `
    <a class="back" href="#pacientes">${icon('left')}Pacientes</a>
    <section class="card phead">
      <span class="avatar xl${alerts.length ? ' bad' : ''}">${esc(initials(p.name))}</span>
      <div class="who">
        <h1>${esc(p.name)}</h1>
        <p class="muted">${esc([a != null ? `${a} anos` : '', p.sex, p.insurance || 'Particular', p.cpf ? `CPF ${fmtCpf(p.cpf)}` : ''].filter(Boolean).join(' · '))}</p>
      </div>
      <div class="actions">
        <a class="btn" href="#pacientes/${p.id}/editar">${icon('edit')}Editar</a>
        ${p.phone ? `<button class="btn" type="button" id="p-chat">${icon('message')}Conversa</button>` : ''}
        <button class="btn" type="button" id="p-docs">${icon('printer')}Documentos</button>
        <button class="btn primary" type="button" id="p-book">${icon('calendar')}Agendar</button>
      </div>
    </section>
    ${alerts.length ? `<div class="alert-banner">${icon('heart')}<p><strong>Atenção na anamnese:</strong> ${esc(alerts.join(' · '))}</p></div>` : ''}
    <div class="ptabs" role="tablist">${tabs.map(([k, label, ic]) => `<button type="button" role="tab" class="${state.ptab === k ? 'on' : ''}" data-ptab="${k}">${icon(ic)}<span>${label}</span>${counts[k] ? `<small>${counts[k]}</small>` : ''}</button>`).join('')}</div>
    <div id="ptab"></div>
    ${newDialogHtml()}${budgetDialogHtml()}${financeDialogHtml()}${docsDialogHtml()}${termDialogHtml()}`;
  bindNewDialog();
  bindBudgetDialog();
  bindFinanceDialog();
  bindDocsDialog();
  bindTermDialog();
  $('#p-book').addEventListener('click', () => openNewDialog({ name: p.name, phone: p.phone }));
  $('#p-chat')?.addEventListener('click', () => openDrawer({ phone: p.phone, name: p.name }));
  $('#p-docs').addEventListener('click', openDocsDialog);
  app.querySelector('.ptabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ptab]');
    if (!b) return;
    state.ptab = b.dataset.ptab;
    app.querySelectorAll('[data-ptab]').forEach((x) => x.classList.toggle('on', x === b));
    renderPatientTab();
  });
  renderPatientTab();
  markDemo();
  window.scrollTo(0, scroll);
}

function renderPatientTab() {
  const box = $('#ptab');
  ({ resumo: tabResumo, anamnese: tabAnamnese, odonto: tabOdonto, tratamentos: tabTratamentos, evolucoes: tabEvolucoes, termos: tabTermos, arquivos: tabArquivos }[state.ptab] || tabResumo)(box);
}

function tabResumo(box) {
  const { patient: p, appointments, finance, budgets } = state.patient;
  const now = new Date().toISOString();
  const live = appointments.filter((x) => !['cancelado', 'vago', 'oferecido'].includes(x.status));
  const next = live.filter((x) => x.starts_at >= now).reverse();
  const past = appointments.filter((x) => x.starts_at < now);
  const done = past.filter((x) => x.status === 'confirmado' || x.status === 'encaixe').length;
  const missed = appointments.filter((x) => x.status === 'cancelado').length;
  const paid = finance.filter((f) => f.paid_at).reduce((s, f) => s + f.amount, 0);
  const pending = finance.filter((f) => !f.paid_at).reduce((s, f) => s + f.amount, 0);
  const openB = budgets.filter((b) => b.status === 'aberto');
  const row = (label, value) => (value ? `<div><dt>${label}</dt><dd>${value}</dd></div>` : '');
  const group = (title, rows) => (rows.trim() ? `<div class="dgroup"><h3>${title}</h3><dl>${rows}</dl></div>` : '');
  const addr = [p.address, p.neighborhood, [p.city, p.state].filter(Boolean).join('/'), p.cep ? `CEP ${fmtCep(p.cep)}` : ''].filter(Boolean).join(' · ');
  const apptLi = (x) => `<li class="hrow"><span class="t">${esc(fmt(x.starts_at, { day: '2-digit', month: '2-digit', year: '2-digit' }))}<small>${fmtTime(x.starts_at)}</small></span>
    <span class="who"><span class="name">${esc(x.procedure || 'Consulta')}</span><span class="sub">${x.value ? brl(x.value) : ''}</span></span>${chip(STATUS[x.status] || [x.status, ''])}</li>`;
  box.innerHTML = `
    <div class="kpis">
      <div class="card kpi"><div class="kpi-top"><span class="kpi-ic ok">${icon('check')}</span>Consultas feitas</div><div class="kpi-v">${done}</div><div class="kpi-sub">${next.length ? `Próxima: ${esc(fmtShort(next[0].starts_at))} ${fmtTime(next[0].starts_at)}` : 'Nenhuma marcada'}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-ic bad">${icon('x')}</span>Cancelamentos</div><div class="kpi-v">${missed}</div><div class="kpi-sub">${missed ? 'Consultas desmarcadas' : 'Nenhum'}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-ic">${icon('money')}</span>Total pago</div><div class="kpi-v">${brlc(paid)}</div><div class="kpi-sub">${pending ? `${brlc(pending)} a receber` : 'Nada pendente'}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-ic info">${icon('file')}</span>Orçamentos em aberto</div><div class="kpi-v">${openB.length}</div><div class="kpi-sub">${openB.length ? brlc(openB.reduce((s, b) => s + b.total, 0)) + ' aguardando' : 'Nenhum'}</div></div>
    </div>
    <div class="board">
      <section class="card"><div class="card-head"><h2>Dados do paciente</h2><a class="link-btn" href="#pacientes/${p.id}/editar">Editar</a></div>
        <div class="card-body details">
          ${group('Contato', row('WhatsApp', esc(fmtPhone(p.phone))) + row('Outro telefone', esc(fmtPhone(p.phone2))) + row('E-mail', esc(p.email)))}
          ${group('Dados pessoais', row('Nascimento', p.birth_date ? `${fmtKey(p.birth_date)} (${age(p.birth_date)} anos)` : '') + row('Sexo', esc(p.sex)) + row('CPF', esc(fmtCpf(p.cpf))) + row('Profissão', esc(p.profession)))}
          ${group('Endereço', row('Endereço', esc(addr)))}
          ${group('Convênio', row('Plano', esc(p.insurance || 'Particular')) + row('Carteirinha', esc(p.insurance_number)))}
          ${group('Responsável', row('Nome', esc(p.guardian_name)) + row('Telefone', esc(fmtPhone(p.guardian_phone))))}
          ${group('Outras informações', row('Como conheceu', esc(p.referral)) + row('Observações', esc(p.notes)) + row('Ficha criada em', fmt(p.created_at, { day: '2-digit', month: '2-digit', year: 'numeric' })))}
        </div></section>
      <div class="side-col">
        <section class="card"><div class="card-head"><h2>Próximas consultas</h2></div>
          <ul class="hlist">${next.length ? next.map(apptLi).join('') : '<li class="muted hempty">Nenhuma consulta marcada.</li>'}</ul></section>
        <section class="card"><div class="card-head"><h2>Histórico</h2><span class="muted">${past.length}</span></div>
          <ul class="hlist">${past.length ? past.slice(0, 12).map(apptLi).join('') : '<li class="muted hempty">Ainda sem consultas.</li>'}</ul></section>
      </div>
    </div>`;
}

function tabAnamnese(box) {
  const p = state.patient.patient;
  const a = json(p.anamnesis, {});
  const byPatient = state.patient.documents.find((d) => d.kind === 'entrada' && d.status === 'assinado' && d.signed_at === p.anamnesis_at);
  box.innerHTML = `
    <section class="card"><div class="card-head"><div><h2>Anamnese</h2><p class="hint">${p.anamnesis_at ? `${byPatient ? 'Preenchida pelo próprio paciente no celular' : 'Atualizada'} em ${fmt(p.anamnesis_at, { day: '2-digit', month: '2-digit', year: 'numeric' })}` : 'Ainda não preenchida'}. As respostas “Sim” em perguntas de saúde aparecem como alerta na ficha e na conversa.</p></div></div>
      <form class="card-body" id="an-form">
        <label class="field">Queixa principal (o que trouxe o paciente)<textarea id="an-queixa" rows="2" placeholder="Ex.: dor ao mastigar do lado esquerdo">${esc(a.queixa?.d || '')}</textarea></label>
        <ul class="qlist">${ANAMNESE.map(([k, q, short]) => `<li class="${short ? 'alertq' : ''}${a[k]?.a === 'sim' && short ? ' alert' : ''}">
          <span class="q">${esc(q)}</span>
          <span class="yn" role="radiogroup" aria-label="${esc(q)}">
            <button type="button" data-q="${k}" data-a="sim" class="${a[k]?.a === 'sim' ? 'on yes' : ''}">Sim</button>
            <button type="button" data-q="${k}" data-a="nao" class="${a[k]?.a === 'nao' ? 'on' : ''}">Não</button>
          </span>
          <input id="an-d-${k}" value="${esc(a[k]?.d || '')}" placeholder="Detalhes (qual, desde quando...)" aria-label="Detalhes">
        </li>`).join('')}</ul>
        <div class="actions" style="justify-content:space-between"><button class="btn ghost" type="button" id="an-none">Marcar “Não” no que estiver vazio</button><button class="btn primary" type="submit">${icon('check')}Salvar anamnese</button></div>
      </form></section>`;
  const answers = Object.fromEntries(ANAMNESE.map(([k]) => [k, a[k]?.a || '']));
  box.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.q;
    answers[k] = answers[k] === b.dataset.a ? '' : b.dataset.a;
    box.querySelectorAll(`[data-q="${k}"]`).forEach((x) => x.classList.toggle('on', x.dataset.a === answers[k]));
    box.querySelector(`[data-q="${k}"][data-a="sim"]`).classList.toggle('yes', answers[k] === 'sim');
  }));
  $('#an-none').addEventListener('click', () => {
    for (const [k] of ANAMNESE) if (!answers[k]) { answers[k] = 'nao'; box.querySelector(`[data-q="${k}"][data-a="nao"]`).classList.add('on'); }
  });
  $('#an-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = { queixa: { a: '', d: $('#an-queixa').value } };
    for (const [k] of ANAMNESE) out[k] = { a: answers[k], d: $('#an-d-' + k).value };
    const r = await act(() => api(`/api/clinics/${state.clinicId}/patients/${p.id}`, { method: 'PUT', body: { anamnesis: out } }), 'Anamnese salva.');
    if (r) reloadPatient();
  });
}

function tabOdonto(box) {
  const p = state.patient.patient;
  const marks = json(p.odontogram, {});
  // Procedimentos ainda não feitos dos orçamentos em aberto ou aprovados, por dente.
  const planned = {};
  for (const b of state.patient.budgets) {
    if (b.status === 'recusado') continue;
    for (const it of b.items) {
      if (it.done) continue;
      for (const t of String(it.tooth).match(/\d{2}/g) || []) (planned[t] = planned[t] || []).push(it.proc);
    }
  }
  const kids = state.kidsTeeth ?? (age(p.birth_date) != null && age(p.birth_date) < 12);
  const tooth = (n) => {
    const m = marks[n];
    return `<button type="button" class="tooth${m?.s ? ' ts-' + m.s : ''}${planned[n] ? ' planned' : ''}${state.tooth === n ? ' sel' : ''}" data-tooth="${n}" title="${esc([TOOTH[m?.s], m?.n, planned[n] ? 'Planejado: ' + planned[n].join(', ') : ''].filter(Boolean).join(' · ') || 'Dente ' + n)}">
      <span class="crown">${icon('tooth')}</span><span class="tn">${n}</span></button>`;
  };
  const arch = (teeth, cls = '') => `<div class="arch ${cls}">${teeth.map(tooth).join('')}</div>`;
  const listed = Object.keys(marks).sort();
  box.innerHTML = `
    <section class="card"><div class="card-head"><div><h2>Odontograma</h2><p class="hint">Toque num dente para registrar como ele está. O pontinho mostra tratamento planejado num orçamento.</p></div>
      <label class="check"><input type="checkbox" id="od-kids" ${kids ? 'checked' : ''}> Dentes de leite</label></div>
      <div class="card-body">
        <div class="odonto">
          <p class="arch-label">Superior</p>
          ${arch(ARCH_UP)}${kids ? arch(KIDS_UP, 'kids') : ''}
          <div class="arch-mid"></div>
          ${kids ? arch(KIDS_DOWN, 'kids') : ''}${arch(ARCH_DOWN)}
          <p class="arch-label">Inferior</p>
        </div>
        <div class="legend">${Object.entries(TOOTH).map(([k, l]) => `<span><i class="ts-${k}"></i>${l}</span>`).join('')}<span><i class="planned-dot"></i>Planejado</span></div>
        <div id="od-panel"></div>
      </div></section>
    <section class="card"><div class="card-head"><h2>Dentes com registro</h2><span class="muted">${listed.length}</span></div>
      <ul class="hlist">${listed.length ? listed.map((n) => `<li class="hrow"><span class="t">${n}</span><span class="who"><span class="name">${esc(TOOTH[marks[n].s] || 'Anotação')}</span><span class="sub">${esc(marks[n].n)}</span></span><button class="btn small ghost" type="button" data-tooth="${n}">Abrir</button></li>`).join('') : '<li class="muted hempty">Nenhum dente registrado ainda.</li>'}</ul></section>`;
  $('#od-kids').addEventListener('change', (e) => { state.kidsTeeth = e.target.checked; tabOdonto(box); });
  box.querySelectorAll('[data-tooth]').forEach((b) => b.addEventListener('click', () => { state.tooth = Number(b.dataset.tooth); tabOdonto(box); $('#od-panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }));
  const n = state.tooth;
  if (!n || !(ARCH_UP.includes(n) || ARCH_DOWN.includes(n) || KIDS_UP.includes(n) || KIDS_DOWN.includes(n))) return;
  const m = marks[n] || { s: '', n: '' };
  $('#od-panel').innerHTML = `<div class="tooth-panel">
    <div class="tp-head"><strong>Dente ${n}</strong>${planned[n] ? `<span class="hint">Planejado: ${esc(planned[n].join(', '))}</span>` : ''}<button class="btn ghost icon small" type="button" id="tp-close" aria-label="Fechar">${icon('x')}</button></div>
    <div class="tp-status"><button type="button" data-ts="" class="${!m.s ? 'on' : ''}">Saudável</button>${Object.entries(TOOTH).map(([k, l]) => `<button type="button" data-ts="${k}" class="${m.s === k ? 'on' : ''}"><i class="ts-${k}"></i>${l}</button>`).join('')}</div>
    <div class="tp-note"><input id="tp-note" value="${esc(m.n)}" placeholder="Observação (ex.: face oclusal, resina)"><button class="btn primary" type="button" id="tp-save">Salvar</button></div>
  </div>`;
  let status = m.s;
  $('#tp-close').addEventListener('click', () => { state.tooth = null; tabOdonto(box); });
  $('#od-panel').querySelectorAll('[data-ts]').forEach((b) => b.addEventListener('click', () => {
    status = b.dataset.ts;
    $('#od-panel').querySelectorAll('[data-ts]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#tp-save').addEventListener('click', async () => {
    const next = { ...marks };
    const note = $('#tp-note').value.trim();
    if (status || note) next[n] = { s: status, n: note }; else delete next[n];
    const r = await act(() => api(`/api/clinics/${state.clinicId}/patients/${p.id}`, { method: 'PUT', body: { odontogram: next } }), `Dente ${n} salvo.`);
    if (r) { state.patient.patient.odontogram = JSON.stringify(next); state.tooth = null; tabOdonto(box); }
  });
}

function tabTratamentos(box) {
  const { budgets, finance } = state.patient;
  const today = todayKey();
  box.innerHTML = `
    <div class="board">
      <div class="stack">
        <div class="row-head"><h2>Orçamentos</h2><button class="btn primary" type="button" id="b-new">${icon('plus')}Novo orçamento</button></div>
        ${budgets.length ? budgets.map(budgetCard).join('') : `<section class="card"><div class="empty-state"><span class="big">${icon('file')}</span><strong>Nenhum orçamento ainda</strong><span>Monte o plano de tratamento com os procedimentos e o valor de cada um.</span></div></section>`}
      </div>
      <section class="card"><div class="card-head"><h2>Pagamentos</h2><button class="btn small" type="button" id="f-new-p">${icon('plus')}Lançar</button></div>
        <ul class="flist compact">${finance.length ? finance.map((f) => financeRow(f, today, true)).join('') : '<li class="muted hempty">Nenhum pagamento lançado.</li>'}</ul></section>
    </div>`;
  $('#b-new').addEventListener('click', () => openBudgetDialog(null));
  $('#f-new-p').addEventListener('click', () => openFinanceDialog({ kind: 'receita', patient_id: state.patient.patient.id, category: 'Consulta' }));
  box.querySelectorAll('[data-bact]').forEach((b) => b.addEventListener('click', () => budgetAction(Number(b.dataset.bid), b.dataset.bact, b)));
  box.querySelectorAll('[data-done]').forEach((c) => c.addEventListener('change', () => toggleDone(Number(c.dataset.done))));
}

function budgetCard(b) {
  const sub = b.items.reduce((s, i) => s + i.value, 0);
  const doneN = b.items.filter((i) => i.done).length;
  const each = b.installments > 1 ? ` em ${b.installments}x de ${brlc(Math.floor(b.total / b.installments))}` : '';
  const button = (k, label, ic, cls = '') => `<button class="btn small ${cls}" type="button" data-bid="${b.id}" data-bact="${k}">${ic ? icon(ic) : ''}${label}</button>`;
  const signDoc = (state.patient.documents || []).find((d) => d.budget_id === b.id && d.status !== 'cancelado');
  return `<section class="card budget">
    <div class="card-head"><div><h3>${esc(b.title || 'Orçamento')}</h3><p class="hint">Criado em ${fmt(b.created_at, { day: '2-digit', month: '2-digit', year: 'numeric' })}${b.approved_at ? ` · aprovado em ${fmt(b.approved_at, { day: '2-digit', month: '2-digit', year: 'numeric' })}` : ''}</p></div>${chip(BUDGET_STATUS[b.status] || [b.status, ''])}</div>
    <table class="items"><thead><tr>${b.status === 'aprovado' ? '<th class="c">Feito</th>' : ''}<th>Procedimento</th><th>Dente</th><th class="r">Valor</th></tr></thead><tbody>
      ${b.items.map((i, idx) => `<tr class="${i.done ? 'done' : ''}">${b.status === 'aprovado' ? `<td class="c"><input type="checkbox" aria-label="Feito" data-done="${b.id}" data-idx="${idx}" ${i.done ? 'checked' : ''}></td>` : ''}<td>${esc(i.proc)}</td><td>${esc(i.tooth || '—')}</td><td class="r">${brlc(i.value)}</td></tr>`).join('')}
    </tbody></table>
    <div class="totals">
      ${b.discount ? `<div><span>Subtotal</span><span>${brlc(sub)}</span></div><div><span>Desconto</span><span>− ${brlc(b.discount)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${brlc(b.total)}</span></div>
      <p class="hint">${esc([b.method, each.trim()].filter(Boolean).join(', ') || 'À vista')}${b.status === 'aprovado' ? ` · ${doneN} de ${b.items.length} feito${b.items.length > 1 ? 's' : ''}` : ''}</p>
      ${b.notes ? `<p class="hint">${esc(b.notes)}</p>` : ''}
      ${signDoc ? `<p class="hint sign-state">${icon('pen')}${signDoc.status === 'assinado' ? `Assinado pelo paciente em ${esc(fmtDateTime(signDoc.signed_at))}` : `Enviado para assinar${signDoc.opened_at ? ' · o paciente já abriu o link' : ''}`}</p>` : ''}
    </div>
    <div class="actions budget-actions">
      ${b.status === 'aberto' ? button('approve', 'Aprovar', 'check', 'primary') + button('sign', signDoc ? 'Reenviar para assinar' : 'Enviar para assinar', 'pen') + button('edit', 'Editar', 'edit') + button('refuse', 'Recusado', 'x') : ''}
      ${b.status === 'recusado' ? button('reopen', 'Reabrir', 'refresh') : ''}
      ${button('print', 'Imprimir', 'printer')}
      ${button('delete', 'Excluir', 'trash', 'ghost danger')}
    </div>
  </section>`;
}

function financeRow(f, today, compact = false) {
  const late = !f.paid_at && f.due_date < today;
  const st = f.paid_at ? ['Pago', 'ok', 'check'] : late ? ['Vencido', 'bad', 'alert'] : ['A ' + (f.kind === 'receita' ? 'receber' : 'pagar'), 'warn', 'clock'];
  const date = f.paid_at || f.due_date;
  const sub = [compact ? '' : f.patient_name, f.category, f.method, f.paid_at ? `pago em ${fmtKeyShort(f.paid_at)}` : `vence ${fmtKeyShort(f.due_date)}`].filter(Boolean).join(' · ');
  return `<li class="frow${late ? ' late' : ''}">
    <button type="button" class="fmain" data-fin="${f.id}">
      <span class="t">${fmtKeyShort(date)}</span>
      <span class="fic ${f.kind}">${icon(f.kind === 'receita' ? 'arrowDown' : 'arrowUp')}</span>
      <span class="who"><span class="name">${esc(f.description)}</span><span class="sub">${esc(sub)}</span></span>
      <span class="end"><span class="amt ${f.kind}">${f.kind === 'despesa' ? '− ' : ''}${brlc(f.amount)}</span>${compact && !f.paid_at ? '' : chip(st)}</span>
    </button>
    ${f.paid_at ? '' : `<button type="button" class="btn small${late ? ' danger' : ''}" data-pay="${f.id}">${f.kind === 'receita' ? 'Receber' : 'Pagar'}</button>`}
  </li>`;
}

async function budgetAction(id, kind, btn) {
  const b = state.patient.budgets.find((x) => x.id === id);
  if (!b) return;
  const base = `/api/clinics/${state.clinicId}/budgets/${id}`;
  if (kind === 'edit') return openBudgetDialog(b);
  if (kind === 'print') return printBudget(b);
  if (kind === 'approve') return openApproveDialog(b);
  if (kind === 'sign') return createSignDoc({ kind: 'orcamento', budget_id: b.id, send: true }, btn);
  if (kind === 'delete') {
    return confirmTwice(btn, async () => {
      if (await act(() => api(base, { method: 'DELETE' }), b.status === 'aprovado' ? 'Orçamento excluído. Parcelas não pagas saíram do financeiro.' : 'Orçamento excluído.')) reloadPatient();
    });
  }
  const status = kind === 'refuse' ? 'recusado' : 'aberto';
  if (await act(() => api(base, { method: 'PUT', body: { ...b, status } }), kind === 'refuse' ? 'Marcado como recusado.' : 'Orçamento reaberto.')) reloadPatient();
}

async function toggleDone(id) {
  const boxes = [...document.querySelectorAll(`[data-done="${id}"]`)];
  const done = boxes.map((c) => c.checked);
  if (await act(() => api(`/api/clinics/${state.clinicId}/budgets/${id}`, { method: 'PUT', body: { done } }), 'Tratamento atualizado.')) reloadPatient();
}

function openApproveDialog(b) {
  const d = $('#approve-dialog') || document.body.appendChild(Object.assign(document.createElement('dialog'), { id: 'approve-dialog' }));
  d.innerHTML = `<form method="dialog" id="ap-form">
    <div class="full"><h2>Aprovar orçamento</h2><p class="hint">${esc(b.title || 'Orçamento')}: ${brlc(b.total)}${b.installments > 1 ? ` em ${b.installments}x` : ''}. As parcelas entram no Financeiro como contas a receber.</p></div>
    <label class="field">Vencimento da 1ª parcela<input type="date" id="ap-first" value="${todayKey()}" required></label>
    <label class="field">Parcelas<input type="number" id="ap-n" value="${b.installments}" min="1" max="24"></label>
    <div class="actions"><button class="btn ghost" type="button" id="ap-cancel">Cancelar</button><button class="btn primary" type="submit">${icon('check')}Aprovar</button></div>
  </form>`;
  $('#ap-cancel').addEventListener('click', () => d.close());
  $('#ap-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = Number($('#ap-n').value) || 1;
    if (n !== b.installments && !(await act(() => api(`/api/clinics/${state.clinicId}/budgets/${b.id}`, { method: 'PUT', body: { ...b, installments: n } })))) return;
    const r = await act(() => api(`/api/clinics/${state.clinicId}/budgets/${b.id}/approve`, { method: 'POST', body: { first_due: $('#ap-first').value } }));
    if (!r) return;
    d.close();
    toast(`Orçamento aprovado: ${r.installments} parcela(s) no financeiro.`);
    reloadPatient();
  });
  d.showModal();
}

// ---------- Orçamento (criar / editar) ----------

function budgetDialogHtml() {
  return `<dialog id="budget-dialog" class="wide"><form id="budget-form" method="dialog">
    <div class="full"><h2 id="bd-title">Novo orçamento</h2></div>
    <label class="field full">Nome do plano<input id="bd-name" placeholder="Ex.: Canal e restauração do 36"></label>
    <div class="full"><div class="bitems-head"><span>Procedimento</span><span>Dente</span><span>Valor (R$)</span><span></span></div><div id="bd-items"></div>
      <button class="btn small" type="button" id="bd-add">${icon('plus')}Adicionar procedimento</button></div>
    <label class="field">Desconto (R$)<input id="bd-discount" inputmode="decimal" placeholder="0,00"></label>
    <label class="field">Parcelas<select id="bd-inst">${Array.from({ length: 24 }, (_, i) => `<option value="${i + 1}">${i ? `${i + 1}x` : 'À vista'}</option>`).join('')}</select></label>
    <label class="field">Forma de pagamento<select id="bd-method"><option value="">—</option>${METHODS.map((m) => `<option>${m}</option>`).join('')}</select></label>
    <label class="field">Observações<input id="bd-notes" placeholder="Opcional"></label>
    <div class="full bd-total" id="bd-total"></div>
    <datalist id="bd-procs"></datalist>
    <div class="actions"><button class="btn ghost" type="button" id="bd-cancel">Cancelar</button><button class="btn primary" type="submit">Salvar orçamento</button></div>
  </form></dialog>`;
}

function budgetItemRow(it = {}) {
  return `<div class="bitem"><input class="bi-proc" list="bd-procs" value="${esc(it.proc || '')}" placeholder="Procedimento" aria-label="Procedimento" autocomplete="off">
    <input class="bi-tooth" value="${esc(it.tooth || '')}" placeholder="Ex.: 36" aria-label="Dente" inputmode="numeric">
    <input class="bi-value" value="${esc(moneyInput(it.value))}" placeholder="0,00" aria-label="Valor" inputmode="decimal">
    <button class="btn ghost icon small" type="button" data-rm aria-label="Remover">${icon('x')}</button></div>`;
}

function bindBudgetDialog() {
  const d = $('#budget-dialog');
  const items = $('#bd-items');
  const total = () => {
    const sum = [...items.querySelectorAll('.bi-value')].reduce((s, i) => s + parseMoney(i.value), 0);
    const t = Math.max(0, sum - parseMoney($('#bd-discount').value));
    const n = Number($('#bd-inst').value);
    $('#bd-total').innerHTML = `<span>Total</span><strong>${brlc(t)}</strong>${n > 1 ? `<span class="hint">${n}x de ${brlc(Math.floor(t / n))}</span>` : ''}`;
  };
  $('#bd-add').addEventListener('click', () => { items.insertAdjacentHTML('beforeend', budgetItemRow()); items.lastElementChild.querySelector('input').focus(); });
  items.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { e.target.closest('.bitem').remove(); total(); } });
  items.addEventListener('change', (e) => {
    if (!e.target.classList.contains('bi-proc')) return;
    const pr = procedureList().find((x) => x.name === e.target.value);
    const v = e.target.closest('.bitem').querySelector('.bi-value');
    if (pr?.value != null && !v.value) { v.value = moneyInput(pr.value); total(); }
  });
  d.addEventListener('input', total);
  $('#bd-cancel').addEventListener('click', () => d.close());
  $('#budget-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      title: $('#bd-name').value, discount: parseMoney($('#bd-discount').value), installments: Number($('#bd-inst').value), method: $('#bd-method').value, notes: $('#bd-notes').value,
      items: [...items.querySelectorAll('.bitem')].map((r) => ({ proc: r.querySelector('.bi-proc').value, tooth: r.querySelector('.bi-tooth').value, value: parseMoney(r.querySelector('.bi-value').value) })).filter((i) => i.proc.trim()),
    };
    const id = d.dataset.id;
    const path = id ? `/api/clinics/${state.clinicId}/budgets/${id}` : `/api/clinics/${state.clinicId}/patients/${state.patient.patient.id}/budgets`;
    const r = await act(() => api(path, { method: id ? 'PUT' : 'POST', body }), 'Orçamento salvo.');
    if (!r) return;
    d.close();
    state.ptab = 'tratamentos';
    reloadPatient();
  });
  d._total = total;
}

function openBudgetDialog(b) {
  const d = $('#budget-dialog');
  d.dataset.id = b ? b.id : '';
  $('#bd-title').textContent = b ? 'Editar orçamento' : 'Novo orçamento';
  $('#bd-name').value = b?.title || '';
  $('#bd-items').innerHTML = (b?.items?.length ? b.items : [{}]).map(budgetItemRow).join('');
  $('#bd-discount').value = moneyInput(b?.discount);
  $('#bd-inst').value = String(b?.installments || 1);
  $('#bd-method').value = b?.method || '';
  $('#bd-notes').value = b?.notes || '';
  $('#bd-procs').innerHTML = procedureList().map((p) => `<option value="${esc(p.name)}">${p.value != null ? brlc(p.value) : ''}</option>`).join('');
  d._total();
  d.showModal();
}

// ---------- Evoluções ----------

function tabEvolucoes(box) {
  const { notes, patient: p } = state.patient;
  box.innerHTML = `
    <section class="card"><div class="card-head"><div><h2>Evoluções do prontuário</h2><p class="hint">Registre o que foi feito em cada atendimento. Fica salvo com data e hora.</p></div></div>
      <form class="card-body" id="ev-form">
        <textarea id="ev-text" rows="3" placeholder="Ex.: Restauração em resina no 25, face oclusal. Paciente sem dor."></textarea>
        <div class="actions" style="justify-content:flex-end"><button class="btn primary" type="submit">${icon('check')}Salvar evolução</button></div>
      </form>
      <ul class="timeline">${notes.length ? notes.map((n) => `<li><span class="dot"></span><div><span class="when">${esc(fmt(n.created_at, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span>
        <p>${esc(n.text)}</p></div><button class="btn ghost icon small" type="button" data-note="${n.id}" aria-label="Apagar">${icon('trash')}</button></li>`).join('') : '<li class="muted hempty">Nenhuma evolução registrada.</li>'}</ul>
    </section>`;
  $('#ev-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await act(() => api(`/api/clinics/${state.clinicId}/patients/${p.id}/notes`, { method: 'POST', body: { text: $('#ev-text').value } }), 'Evolução salva.');
    if (r) reloadPatient();
  });
  box.querySelectorAll('[data-note]').forEach((b) => b.addEventListener('click', () => confirmTwice(b, async () => {
    if (await act(() => api(`/api/clinics/${state.clinicId}/patients/${p.id}/notes/${b.dataset.note}`, { method: 'DELETE' }), 'Evolução apagada.')) reloadPatient();
  })));
}

// ---------- Cadastro (novo / editar) ----------

async function editPatient(id) {
  if (state.patient?.patient.id !== id) {
    const data = await act(() => api(`/api/clinics/${state.clinicId}/patients/${id}`));
    if (!data) return;
    state.patient = data;
  }
  patientForm(state.patient.patient);
}

function patientForm(p) {
  const v = p || {};
  const field = (id, label, value, attrs = '') => `<label class="field">${label}<input id="pf-${id}" value="${esc(value ?? '')}" ${attrs}></label>`;
  const select = (id, label, value, options) => `<label class="field">${label}<select id="pf-${id}"><option value="">—</option>${options.map((o) => `<option${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}${value && !options.includes(value) ? `<option selected>${esc(value)}</option>` : ''}</select></label>`;
  const section = (title, desc, body) => `<section class="card"><div class="card-head"><div><h2>${title}</h2>${desc ? `<p class="hint">${desc}</p>` : ''}</div></div><div class="card-body"><div class="grid2">${body}</div></div></section>`;
  app.innerHTML = `
    <a class="back" href="${p ? `#pacientes/${p.id}` : '#pacientes'}">${icon('left')}${p ? esc(p.name) : 'Pacientes'}</a>
    <div class="page-head"><div><p class="eyebrow">${p ? 'Editar ficha' : 'Cadastro'}</p><h1>${p ? 'Dados do paciente' : 'Novo paciente'}</h1></div></div>
    <form id="pf-form" class="config" novalidate>
      ${section('Dados pessoais', '', `
        <label class="field full">Nome completo *<input id="pf-name" value="${esc(v.name || '')}" required autocomplete="off"></label>
        ${field('birth_date', 'Data de nascimento', v.birth_date, `type="date" max="${todayKey()}"`)}
        ${select('sex', 'Sexo', v.sex, ['Feminino', 'Masculino', 'Outro'])}
        ${field('cpf', 'CPF', fmtCpf(v.cpf), 'inputmode="numeric" data-mask="cpf" placeholder="000.000.000-00"')}
        ${field('profession', 'Profissão', v.profession)}`)}
      ${section('Contato', 'O WhatsApp é usado nas confirmações automáticas.', `
        ${field('phone', 'WhatsApp', fmtPhone(v.phone), 'inputmode="tel" data-mask="phone" placeholder="(11) 98765-4321"')}
        ${field('phone2', 'Outro telefone', fmtPhone(v.phone2), 'inputmode="tel" data-mask="phone"')}
        ${field('email', 'E-mail', v.email, 'type="email" inputmode="email" placeholder="nome@email.com"')}`)}
      ${section('Endereço', 'Digite o CEP para preencher o resto sozinho.', `
        ${field('cep', 'CEP', fmtCep(v.cep), 'inputmode="numeric" data-mask="cep" placeholder="00000-000"')}
        ${field('address', 'Rua, número e complemento', v.address)}
        ${field('neighborhood', 'Bairro', v.neighborhood)}
        <div class="grid-city">${field('city', 'Cidade', v.city)}${select('state', 'UF', v.state, UFS)}</div>`)}
      ${section('Convênio', 'Deixe vazio se o atendimento for particular.', `
        ${field('insurance', 'Convênio / plano', v.insurance, 'placeholder="Particular"')}
        ${field('insurance_number', 'Número da carteirinha', v.insurance_number)}`)}
      ${section('Responsável', 'Para menores de idade ou quem precisa de acompanhante.', `
        ${field('guardian_name', 'Nome do responsável', v.guardian_name)}
        ${field('guardian_phone', 'Telefone do responsável', fmtPhone(v.guardian_phone), 'inputmode="tel" data-mask="phone"')}`)}
      ${section('Outras informações', '', `
        ${select('referral', 'Como conheceu a clínica', v.referral, REFERRALS)}
        <label class="field full">Observações<textarea id="pf-notes" rows="3" placeholder="Preferências, avisos para a recepção...">${esc(v.notes || '')}</textarea></label>`)}
      <div class="save-bar">${p ? `<button class="btn ghost danger" type="button" id="pf-delete">${icon('trash')}Excluir ficha</button><span style="flex:1"></span>` : ''}<a class="btn ghost" href="${p ? `#pacientes/${p.id}` : '#pacientes'}">Cancelar</a><button class="btn primary" type="submit">${icon('check')}${p ? 'Salvar alterações' : 'Cadastrar paciente'}</button></div>
    </form>`;
  markDemo();
  $('#pf-name').focus();
  $('#pf-cep').addEventListener('input', async (e) => {
    const cep = e.target.value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    // Busca o endereço pelo CEP (serviço público ViaCEP). Se não responder, a pessoa preenche à mão.
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json());
      if (r.erro) return;
      if (!$('#pf-address').value) $('#pf-address').value = r.logradouro ? `${r.logradouro}, ` : '';
      if (!$('#pf-neighborhood').value) $('#pf-neighborhood').value = r.bairro || '';
      $('#pf-city').value = r.localidade || $('#pf-city').value;
      if (r.uf) $('#pf-state').value = r.uf;
      $('#pf-address').focus();
    } catch { /* sem internet ou serviço fora do ar */ }
  });
  $('#pf-delete')?.addEventListener('click', (e) => confirmTwice(e.currentTarget, async () => {
    if (await act(() => api(`/api/clinics/${state.clinicId}/patients/${p.id}`, { method: 'DELETE' }), 'Ficha excluída.')) { state.patients = null; state.patient = null; location.hash = '#pacientes'; }
  }));
  $('#pf-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = ['name', 'birth_date', 'sex', 'cpf', 'profession', 'phone', 'phone2', 'email', 'cep', 'address', 'neighborhood', 'city', 'state', 'insurance', 'insurance_number', 'guardian_name', 'guardian_phone', 'referral', 'notes'];
    const body = Object.fromEntries(ids.map((k) => [k, $('#pf-' + k).value]));
    const r = await act(() => api(p ? `/api/clinics/${state.clinicId}/patients/${p.id}` : `/api/clinics/${state.clinicId}/patients`, { method: p ? 'PUT' : 'POST', body }), p ? 'Ficha atualizada.' : 'Paciente cadastrado.');
    if (!r) return;
    state.patients = null;
    state.patient = null;
    location.hash = `#pacientes/${p ? p.id : r.id}`;
  });
}

// ---------- Termos e assinaturas pelo celular ----------

const DOC_STATUS = { pendente: ['Aguardando assinatura', 'warn', 'clock'], assinado: ['Assinado', 'ok', 'check'], cancelado: ['Cancelado', '', 'x'], vencido: ['Link vencido', 'bad', 'alert'] };
const DOC_KIND = { termo: 'Termo', entrada: 'Ficha de entrada', orcamento: 'Orçamento' };

function fmtDateTime(iso) { return iso ? `${fmt(iso, { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${fmtTime(iso)}` : ''; }
function docLink(d) { return `${location.origin}/p/${d.token}`; }
function docStatus(d) { return d.status === 'pendente' && d.expires_at < new Date().toISOString() ? 'vencido' : d.status; }

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Link copiado. Cole na conversa com o paciente.'); } catch { toast('Não deu para copiar. Selecione o link e copie.', true); }
}

function tabTermos(box) {
  const { documents, patient: p } = state.patient;
  const pending = documents.filter((d) => docStatus(d) === 'pendente').length;
  box.innerHTML = `
    <div class="row-head"><div><h2>Termos e assinaturas</h2><p class="hint">O paciente recebe um link pelo WhatsApp, lê e assina com o dedo na tela do celular. ${pending ? `${pending} aguardando assinatura.` : ''}</p></div>
      <div class="actions"><button class="btn" type="button" id="t-entry">${icon('clipboard')}Enviar ficha de entrada</button><button class="btn primary" type="button" id="t-new">${icon('plus')}Novo termo</button></div></div>
    ${documents.length ? `<div class="doc-list">${documents.map(docCard).join('')}</div>` : `<section class="card"><div class="empty-state"><span class="big">${icon('pen')}</span><strong>Nenhum termo enviado ainda</strong>
      <span>Envie o termo de consentimento do tratamento, a autorização de imagem ou a ficha de entrada para ${esc(p.name.split(' ')[0])} preencher e assinar pelo celular.</span></div></section>`}`;
  $('#t-new').addEventListener('click', () => openTermDialog('geral'));
  $('#t-entry').addEventListener('click', () => openTermDialog('entrada'));
  box.querySelectorAll('[data-dact]').forEach((b) => b.addEventListener('click', () => docAction(Number(b.dataset.did), b.dataset.dact, b)));
}

function docCard(d) {
  const st = docStatus(d);
  const steps = [
    ['Criado', d.created_at], ['Enviado pelo WhatsApp', d.sent_at], ['Aberto pelo paciente', d.opened_at], ['Assinado', d.signed_at],
  ].filter(([, at]) => at).map(([label, at]) => `<li>${icon('check')}<span>${label}</span><small>${esc(fmtDateTime(at))}</small></li>`).join('');
  const button = (k, label, ic, cls = '') => `<button class="btn small ${cls}" type="button" data-did="${d.id}" data-dact="${k}">${icon(ic)}${label}</button>`;
  return `<section class="card doc-card">
    <div class="card-head"><div>${d.kind === 'entrada' ? '' : `<p class="eyebrow">${DOC_KIND[d.kind] || 'Documento'}</p>`}<h3>${esc(d.title)}</h3></div>${chip(DOC_STATUS[st])}</div>
    <ul class="doc-steps">${steps}</ul>
    ${d.status === 'assinado' ? `<div class="doc-signed"><img src="${esc(d.signature)}" alt="Assinatura de ${esc(d.signer_name)}"><p>${esc(d.signer_name)}<br><small>CPF ${esc(fmtCpf(d.signer_cpf))}</small></p></div>` : ''}
    ${st === 'pendente' ? `<p class="hint">O link vale até ${esc(fmtDateTime(d.expires_at))}.</p>` : st === 'vencido' ? '<p class="hint">O prazo do link acabou. Reenvie para gerar um prazo novo.</p>' : ''}
    <div class="actions">
      ${st === 'pendente' || st === 'vencido' ? button('send', d.sent_at ? 'Reenviar pelo WhatsApp' : 'Enviar pelo WhatsApp', 'send', 'primary') + button('copy', 'Copiar link', 'copy') + button('open', 'Abrir', 'eye') + button('cancel', 'Cancelar', 'x', 'ghost danger') : ''}
      ${d.status === 'assinado' ? button('print', 'Ver comprovante', 'printer') : ''}
    </div>
  </section>`;
}

async function docAction(id, kind, btn) {
  const d = state.patient.documents.find((x) => x.id === id);
  if (!d) return;
  if (kind === 'copy') return copyText(docLink(d));
  if (kind === 'open') return window.open(docLink(d), '_blank', 'noopener');
  if (kind === 'print') return printSigned(d);
  if (kind === 'cancel') {
    return confirmTwice(btn, async () => {
      if (await act(() => api(`/api/clinics/${state.clinicId}/documents/${id}/cancel`, { method: 'POST' }), 'Documento cancelado. O link deixou de funcionar.')) reloadPatient();
    });
  }
  btn.disabled = true;
  const r = await act(() => api(`/api/clinics/${state.clinicId}/documents/${id}/send`, { method: 'POST' }), isSimulated() ? 'Envio simulado (sem WhatsApp real). O link vale por mais 7 dias.' : 'Enviado pelo WhatsApp. O link vale por mais 7 dias.');
  btn.disabled = false;
  if (r) reloadPatient();
}

/** Cria o documento (termo, ficha ou orçamento) e, se pedido, já envia pelo WhatsApp. */
async function createSignDoc(body, btn) {
  if (btn) btn.disabled = true;
  const r = await act(() => api(`/api/clinics/${state.clinicId}/patients/${state.patient.patient.id}/documents`, { method: 'POST', body }));
  if (btn) btn.disabled = false;
  if (!r) return null;
  if (r.sent) toast(isSimulated() ? 'Envio simulado (sem WhatsApp real).' : 'Enviado pelo WhatsApp. Aqui na ficha aparece quando o paciente abrir e assinar.');
  else if (body.send) toast(r.error || 'Não deu para enviar pelo WhatsApp. Copie o link e envie de outro jeito.', true);
  if (body.kind === 'orcamento') reloadPatient();
  else { state.ptab = 'termos'; await reloadPatient(); }
  if (!r.sent || state.demo) showLinkDialog(r.link, 'Link para o paciente assinar');
  return r;
}

function termDialogHtml() {
  return `<dialog id="term-dialog" class="wide"><form id="term-form" method="dialog">
    <div class="full"><h2>Enviar para assinar</h2><p class="hint">Escolha um modelo e ajuste o texto se precisar. O paciente recebe o link pelo WhatsApp e assina no celular, sem baixar nada.</p></div>
    <label class="field full">Modelo<select id="tm-model"></select></label>
    <label class="field full">Título<input id="tm-title" required maxlength="160"></label>
    <label class="field full">Texto que o paciente vai ler<textarea id="tm-body" rows="11" required></textarea></label>
    <p class="hint full" id="tm-entry-hint" hidden>${icon('clipboard')} Na ficha de entrada o paciente também preenche os dados pessoais, endereço, convênio e as perguntas de saúde. Tudo entra direto na ficha dele.</p>
    <label class="check full"><input type="checkbox" id="tm-send" checked> Enviar agora pelo WhatsApp</label>
    <div class="actions"><button class="btn ghost" type="button" id="tm-cancel">Cancelar</button><button class="btn primary" type="submit">${icon('send')}Criar link</button></div>
  </form></dialog>`;
}

function bindTermDialog() {
  const d = $('#term-dialog');
  const pick = () => {
    const m = (d._models || []).find((x) => x.key === $('#tm-model').value);
    if (!m) return;
    $('#tm-title').value = m.title;
    $('#tm-body').value = m.body;
    $('#tm-entry-hint').hidden = m.kind !== 'entrada';
  };
  $('#tm-model').addEventListener('change', pick);
  $('#tm-cancel').addEventListener('click', () => d.close());
  $('#term-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = d._models.find((x) => x.key === $('#tm-model').value);
    const btn = d.querySelector('[type=submit]');
    const r = await createSignDoc({ kind: m?.kind || 'termo', title: $('#tm-title').value, body: $('#tm-body').value, send: $('#tm-send').checked }, btn);
    if (r) d.close();
  });
  d._pick = pick;
}

async function openTermDialog(key) {
  const d = $('#term-dialog');
  if (!d._models) {
    d._models = await act(() => api(`/api/clinics/${state.clinicId}/patients/${state.patient.patient.id}/term-models`));
    if (!d._models) return;
    $('#tm-model').innerHTML = d._models.map((m) => `<option value="${m.key}">${esc(m.kind === 'entrada' ? 'Ficha de entrada (cadastro + saúde + termo)' : m.title)}</option>`).join('');
  }
  $('#tm-model').value = key;
  d._pick();
  $('#tm-send').checked = Boolean(state.patient.patient.phone);
  d.showModal();
}

function showLinkDialog(link, title) {
  const d = $('#link-dialog') || document.body.appendChild(Object.assign(document.createElement('dialog'), { id: 'link-dialog' }));
  d.innerHTML = `<form method="dialog">
    <div class="full"><h2>${esc(title)}</h2><p class="hint">${state.demo ? 'Na demonstração nada é enviado de verdade. Abra o link para ver o que o paciente vê no celular.' : 'Copie e mande para o paciente pelo WhatsApp da clínica ou por e-mail. O link vale por 7 dias.'}</p></div>
    <input class="full link-box" readonly value="${esc(link)}" aria-label="Link">
    <div class="actions"><button class="btn ghost" type="submit">Fechar</button><button class="btn" type="button" id="ld-copy">${icon('copy')}Copiar</button><a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener">${icon('eye')}Abrir como paciente</a></div>
  </form>`;
  $('#ld-copy').addEventListener('click', () => copyText(link));
  d.showModal();
  d.querySelector('.link-box').select();
}

// Cadastro pelo WhatsApp: a recepção digita só nome e WhatsApp; o paciente preenche o resto no celular.
function openIntakeDialog() {
  const d = $('#intake-dialog') || document.body.appendChild(Object.assign(document.createElement('dialog'), { id: 'intake-dialog' }));
  d.innerHTML = `<form method="dialog" id="in-form">
    <div class="full"><h2>Cadastro pelo WhatsApp</h2><p class="hint">O paciente recebe um link para preencher os próprios dados e as perguntas de saúde e assinar o termo. Quando ele chegar, a ficha já está pronta.</p></div>
    <label class="field full">Nome do paciente<input id="in-name" required autocomplete="off" placeholder="Ex.: Maria da Silva"></label>
    <label class="field full">WhatsApp<input id="in-phone" required inputmode="tel" data-mask="phone" placeholder="(11) 98765-4321"></label>
    <label class="check full"><input type="checkbox" id="in-send" checked> Enviar agora pelo WhatsApp</label>
    <div class="actions"><button class="btn ghost" type="button" id="in-cancel">Cancelar</button><button class="btn primary" type="submit">${icon('send')}Enviar ficha</button></div>
  </form>`;
  $('#in-cancel').addEventListener('click', () => d.close());
  $('#in-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = d.querySelector('[type=submit]');
    btn.disabled = true;
    const send = $('#in-send').checked;
    const r = await act(() => api(`/api/clinics/${state.clinicId}/intake`, { method: 'POST', body: { name: $('#in-name').value, phone: $('#in-phone').value, send } }));
    btn.disabled = false;
    if (!r) return;
    d.close();
    if (r.sent) toast(isSimulated() ? 'Envio simulado (sem WhatsApp real). A ficha aparece aqui quando o paciente preencher.' : 'Ficha enviada pelo WhatsApp. Ela se completa sozinha quando o paciente preencher.');
    else if (send) toast(r.error || 'Não deu para enviar pelo WhatsApp. Copie o link e envie de outro jeito.', true);
    state.patients = null;
    state.nextTab = 'termos';
    location.hash = `#pacientes/${r.patient_id}`;
    if (!r.sent || state.demo) setTimeout(() => showLinkDialog(r.link, 'Link da ficha de entrada'), 400);
  });
  d.showModal();
}

/** Comprovante da assinatura: texto assinado, desenho da assinatura e dados de quem assinou. */
function printSigned(d) {
  const paras = String(d.body).split(/\n{2,}/).map((t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('');
  printDoc(d.title, `${paras}
    ${d.kind === 'entrada' ? '<p class="small">Os dados pessoais e as respostas de saúde preenchidos pelo paciente estão na ficha dele (aba Anamnese).</p>' : ''}
    <div class="sign"><span><img src="${esc(d.signature)}" alt="" style="max-height:90px;display:block;margin:0 auto 4px">${esc(d.signer_name)}<br><small>CPF ${esc(fmtCpf(d.signer_cpf))}</small></span></div>
    <table class="small" style="margin-top:28px">
      <tr><td>Assinado eletronicamente em</td><td>${esc(fmtDateTime(d.signed_at))}</td></tr>
      <tr><td>Enviado ao paciente em</td><td>${esc(fmtDateTime(d.sent_at || d.created_at))}</td></tr>
      <tr><td>Endereço IP</td><td>${esc(d.signed_ip || '—')}</td></tr>
      <tr><td>Aparelho</td><td>${esc((d.signed_ua || '—').slice(0, 140))}</td></tr>
      <tr><td>Código de verificação do texto (SHA-256)</td><td style="word-break:break-all">${esc(d.body_hash || '')}</td></tr>
    </table>`, false);
}

// ---------- Fotos e exames ----------

const ATTACH_CATEGORIES = ['Foto clínica', 'Raio-X', 'Exame', 'Antes e depois', 'Documento', 'Outro'];

function attachUrl(a, extra = '') { return `/api/clinics/${state.clinicId}/attachments/${a.id}${extra}`; }
function fmtSize(n) { return n >= 1e6 ? `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`; }

function tabArquivos(box) {
  const { attachments } = state.patient;
  state.afilter = state.afilter || 'Todos';
  const cats = ['Todos', ...ATTACH_CATEGORIES.filter((c) => attachments.some((a) => a.category === c))];
  if (!cats.includes(state.afilter)) state.afilter = 'Todos';
  const shown = attachments.filter((a) => state.afilter === 'Todos' || a.category === state.afilter);
  box.innerHTML = `
    <div class="row-head"><div><h2>Fotos e exames</h2><p class="hint">Fotos clínicas, raio-X, exames e documentos do paciente. As fotos são reduzidas automaticamente para não ocupar espaço.</p></div>
      <label class="btn primary file-btn">${icon('upload')}Adicionar arquivos<input type="file" id="a-file" accept="image/*,application/pdf" multiple hidden></label></div>
    ${attachments.length ? `<div class="filters" id="a-filters">${cats.map((c) => `<button type="button" class="fchip${state.afilter === c ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}<span>${c === 'Todos' ? attachments.length : attachments.filter((a) => a.category === c).length}</span></button>`).join('')}</div>
      <div class="gallery">${shown.map((a) => `<button type="button" class="gitem" data-att="${a.id}">
        ${a.has_thumb || a.mime.startsWith('image/') ? `<img loading="lazy" src="${attachUrl(a, '?thumb')}" alt="${esc(a.caption || a.name)}">` : `<span class="gfile">${icon('file')}<small>PDF</small></span>`}
        <span class="gcap"><strong>${esc(a.caption || a.category)}</strong><small>${esc(a.category)} · ${fmt(a.created_at, { day: '2-digit', month: '2-digit', year: '2-digit' })}</small></span>
      </button>`).join('')}</div>`
    : `<label class="card drop" for="a-file"><span class="big">${icon('image')}</span><strong>Nenhum arquivo ainda</strong><span>Toque aqui para adicionar fotos (do celular ou do computador), raio-X ou exames em PDF.</span></label>`}`;
  $('#a-file').addEventListener('change', (e) => { if (e.target.files.length) openUploadDialog([...e.target.files]); e.target.value = ''; });
  $('#a-filters')?.addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { state.afilter = b.dataset.cat; tabArquivos(box); } });
  box.querySelectorAll('[data-att]').forEach((b) => b.addEventListener('click', () => openAttachment(Number(b.dataset.att))));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Não deu para ler o arquivo.'));
    r.readAsDataURL(blob);
  });
}

/** Reduz a foto no próprio navegador (lado maior até `max` px, JPEG). */
async function shrinkImage(source, max, quality) {
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function prepareFile(file) {
  if (file.type === 'application/pdf') {
    if (file.size > 1_500_000) throw new Error(`“${file.name}” tem mais de 1,5 MB. Reduza o PDF antes de enviar.`);
    return { name: file.name, mime: file.type, data: await blobToBase64(file), thumb: '' };
  }
  if (!file.type.startsWith('image/')) throw new Error(`“${file.name}” não é foto nem PDF.`);
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error(`Não deu para abrir a foto “${file.name}”. Tente tirar um print ou salvar como JPG.`); }
  const [big, small] = await Promise.all([shrinkImage(bmp, 1600, 0.82), shrinkImage(bmp, 360, 0.7)]);
  bmp.close?.();
  return { name: file.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', data: await blobToBase64(big), thumb: await blobToBase64(small) };
}

function openUploadDialog(files) {
  const d = $('#upload-dialog') || document.body.appendChild(Object.assign(document.createElement('dialog'), { id: 'upload-dialog' }));
  const guess = (f) => (f.type === 'application/pdf' ? 'Exame' : /rx|raio|panor|periap/i.test(f.name) ? 'Raio-X' : 'Foto clínica');
  d.innerHTML = `<form method="dialog" id="up-form">
    <div class="full"><h2>Adicionar ${files.length > 1 ? `${files.length} arquivos` : 'arquivo'}</h2><p class="hint">Escolha o tipo e, se quiser, escreva uma legenda (ex.: “Antes do clareamento”, “Panorâmica inicial”).</p></div>
    <ul class="full up-list">${files.map((f, i) => `<li>
      ${f.type.startsWith('image/') ? `<img alt="" data-prev="${i}">` : `<span class="gfile">${icon('file')}</span>`}
      <div><select data-upcat="${i}" aria-label="Tipo">${ATTACH_CATEGORIES.map((c) => `<option${c === guess(f) ? ' selected' : ''}>${c}</option>`).join('')}</select>
      <input data-upcap="${i}" maxlength="300" placeholder="Legenda (opcional)" aria-label="Legenda"><small class="muted">${esc(f.name)} · ${fmtSize(f.size)}</small></div>
    </li>`).join('')}</ul>
    <div class="actions"><span class="hint" id="up-state"></span><button class="btn ghost" type="button" id="up-cancel">Cancelar</button><button class="btn primary" type="submit">${icon('upload')}Salvar na ficha</button></div>
  </form>`;
  const urls = [];
  files.forEach((f, i) => { const img = d.querySelector(`[data-prev="${i}"]`); if (img) { const u = URL.createObjectURL(f); urls.push(u); img.src = u; } });
  const close = () => { urls.forEach((u) => URL.revokeObjectURL(u)); d.close(); };
  $('#up-cancel').addEventListener('click', close);
  $('#up-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = d.querySelector('[type=submit]');
    btn.disabled = true;
    let ok = 0;
    for (const [i, f] of files.entries()) {
      $('#up-state').textContent = `Enviando ${i + 1} de ${files.length}...`;
      const r = await act(async () => {
        const prepared = await prepareFile(f);
        return api(`/api/clinics/${state.clinicId}/patients/${state.patient.patient.id}/attachments`, {
          method: 'POST', body: { ...prepared, category: d.querySelector(`[data-upcat="${i}"]`).value, caption: d.querySelector(`[data-upcap="${i}"]`).value },
        });
      });
      if (r) ok++;
    }
    btn.disabled = false;
    if (ok) toast(ok > 1 ? `${ok} arquivos salvos na ficha.` : 'Arquivo salvo na ficha.');
    close();
    state.ptab = 'arquivos';
    reloadPatient();
  });
  d.showModal();
}

function openAttachment(id) {
  const a = state.patient.attachments.find((x) => x.id === id);
  if (!a) return;
  const d = $('#att-dialog') || document.body.appendChild(Object.assign(document.createElement('dialog'), { id: 'att-dialog', className: 'wide' }));
  const isImg = a.mime.startsWith('image/');
  d.innerHTML = `<form method="dialog" id="att-form">
    <div class="full att-view">${isImg ? `<img src="${attachUrl(a)}" alt="${esc(a.caption || a.name)}">` : `<a class="btn" href="${attachUrl(a)}" target="_blank" rel="noopener">${icon('file')}Abrir o PDF</a>`}</div>
    <label class="field">Tipo<select id="att-cat">${ATTACH_CATEGORIES.map((c) => `<option${c === a.category ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field">Legenda<input id="att-cap" maxlength="300" value="${esc(a.caption)}"></label>
    <p class="hint full">${esc(a.name)} · ${fmtSize(a.size)} · adicionado em ${esc(fmtDateTime(a.created_at))}</p>
    <div class="actions"><button class="btn ghost danger" type="button" id="att-del">${icon('trash')}Excluir</button><a class="btn" href="${attachUrl(a, '?download')}">${icon('download')}Baixar</a><button class="btn primary" type="submit">${icon('check')}Salvar</button></div>
  </form>`;
  $('#att-del').addEventListener('click', (e) => confirmTwice(e.currentTarget, async () => {
    if (await act(() => api(attachUrl(a), { method: 'DELETE' }), 'Arquivo excluído.')) { d.close(); reloadPatient(); }
  }));
  $('#att-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await act(() => api(attachUrl(a), { method: 'PUT', body: { category: $('#att-cat').value, caption: $('#att-cap').value } }), 'Arquivo atualizado.')) { d.close(); reloadPatient(); }
  });
  d.showModal();
}

// ---------- Documentos para imprimir ----------

function docsDialogHtml() {
  return `<dialog id="docs-dialog"><form id="docs-form" method="dialog">
    <div class="full"><h2>Documentos</h2><p class="hint">Sai com o nome da clínica, os dados do paciente e a assinatura do dentista. Dá para imprimir ou salvar em PDF.</p></div>
    <div class="full doc-types" id="doc-types">
      ${[['atestado', 'Atestado', 'file'], ['receita', 'Receita', 'clipboard'], ['declaracao', 'Declaração de comparecimento', 'check'], ['anamnese', 'Ficha de anamnese', 'heart']]
    .map(([k, l, ic], i) => `<label><input type="radio" name="doc" value="${k}" ${i ? '' : 'checked'}><span>${icon(ic)}${l}</span></label>`).join('')}
    </div>
    <div class="full grid2" id="doc-fields"></div>
    <div class="actions"><button class="btn ghost" type="button" id="doc-cancel">Cancelar</button><button class="btn primary" type="submit">${icon('printer')}Imprimir</button></div>
  </form></dialog>`;
}

function bindDocsDialog() {
  const fields = () => {
    const kind = document.querySelector('[name="doc"]:checked').value;
    const today = todayKey();
    $('#doc-fields').innerHTML = {
      atestado: `<label class="field">Dias de afastamento<input id="doc-days" type="number" min="0" value="1"></label><label class="field">Data do atendimento<input id="doc-date" type="date" value="${today}"></label>
        <label class="field">CID (opcional)<input id="doc-cid" placeholder="Ex.: K04.0"></label><span></span>`,
      receita: `<label class="field full">Medicamentos e como tomar<textarea id="doc-text" rows="6" placeholder="1. Amoxicilina 500 mg — 21 cápsulas\nTomar 1 cápsula de 8 em 8 horas por 7 dias."></textarea></label>`,
      declaracao: `<label class="field">Data<input id="doc-date" type="date" value="${today}"></label><span></span><label class="field">Chegou às<input id="doc-from" type="time" value="08:00"></label><label class="field">Saiu às<input id="doc-to" type="time" value="09:00"></label>`,
      anamnese: '<p class="hint full">Imprime as respostas da anamnese com espaço para a assinatura do paciente.</p>',
    }[kind];
  };
  $('#doc-types').addEventListener('change', fields);
  $('#doc-cancel').addEventListener('click', () => $('#docs-dialog').close());
  $('#docs-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const kind = document.querySelector('[name="doc"]:checked').value;
    const p = state.patient.patient;
    const who = `<strong>${esc(p.name)}</strong>${p.cpf ? `, CPF ${esc(fmtCpf(p.cpf))}` : ''}`;
    const v = (id) => $('#' + id)?.value || '';
    let title = '', body = '';
    if (kind === 'atestado') {
      const days = Number(v('doc-days')) || 0;
      title = 'Atestado odontológico';
      body = `<p>Atesto, para os devidos fins, que ${who} esteve sob meus cuidados profissionais no dia ${fmtKey(v('doc-date'))}${days ? `, devendo permanecer afastado(a) de suas atividades por <strong>${days} dia${days > 1 ? 's' : ''}</strong>` : ''}.</p>${v('doc-cid') ? `<p>CID: ${esc(v('doc-cid'))}</p>` : ''}`;
    } else if (kind === 'receita') {
      title = 'Receituário';
      body = `<p>Paciente: ${who}</p><div class="rx">${esc(v('doc-text')) || '&nbsp;'}</div>`;
    } else if (kind === 'declaracao') {
      title = 'Declaração de comparecimento';
      body = `<p>Declaro, para os devidos fins, que ${who} compareceu a esta clínica para atendimento odontológico no dia ${fmtKey(v('doc-date'))}, das ${esc(v('doc-from'))} às ${esc(v('doc-to'))}.</p>`;
    } else {
      const a = json(p.anamnesis, {});
      title = 'Ficha de anamnese';
      body = `<p>Paciente: ${who}${p.birth_date ? ` · Nascimento: ${fmtKey(p.birth_date)}` : ''}</p>${a.queixa?.d ? `<p><strong>Queixa principal:</strong> ${esc(a.queixa.d)}</p>` : ''}
        <table>${ANAMNESE.map(([k, q]) => `<tr><td>${esc(q)}</td><td class="c">${a[k]?.a === 'sim' ? 'Sim' : a[k]?.a === 'nao' ? 'Não' : '—'}</td><td>${esc(a[k]?.d || '')}</td></tr>`).join('')}</table>
        <p class="small">Declaro que as informações acima são verdadeiras.</p><div class="sign"><span>${esc(p.name)}</span></div>`;
    }
    printDoc(title, body, kind !== 'anamnese');
    $('#docs-dialog').close();
  });
  $('#docs-dialog')._fields = fields;
}

function openDocsDialog() { $('#docs-dialog')._fields(); $('#docs-dialog').showModal(); }

function printBudget(b) {
  const p = state.patient.patient;
  const sub = b.items.reduce((s, i) => s + i.value, 0);
  printDoc('Orçamento odontológico', `
    <p>Paciente: <strong>${esc(p.name)}</strong>${p.cpf ? `, CPF ${esc(fmtCpf(p.cpf))}` : ''}</p>
    ${b.title ? `<p>Plano de tratamento: <strong>${esc(b.title)}</strong></p>` : ''}
    <table><thead><tr><th>Procedimento</th><th>Dente</th><th class="r">Valor</th></tr></thead><tbody>
      ${b.items.map((i) => `<tr><td>${esc(i.proc)}</td><td>${esc(i.tooth || '—')}</td><td class="r">${brlc(i.value)}</td></tr>`).join('')}</tbody>
      <tfoot>${b.discount ? `<tr><td colspan="2">Subtotal</td><td class="r">${brlc(sub)}</td></tr><tr><td colspan="2">Desconto</td><td class="r">− ${brlc(b.discount)}</td></tr>` : ''}
      <tr class="grand"><td colspan="2">Total</td><td class="r">${brlc(b.total)}</td></tr></tfoot></table>
    <p>Forma de pagamento: ${esc(b.method || 'a combinar')}${b.installments > 1 ? `, em ${b.installments}x de ${brlc(Math.floor(b.total / b.installments))}` : ', à vista'}.</p>
    ${b.notes ? `<p>${esc(b.notes)}</p>` : ''}
    <p class="small">Orçamento válido por 30 dias. Valores podem mudar se o plano de tratamento for alterado.</p>
    <div class="sign"><span>${esc(p.name)}<br><small>Paciente (de acordo)</small></span></div>`, true);
}

/** Abre o documento numa janela própria, já pronto para imprimir ou salvar em PDF. */
function printDoc(title, body, signed) {
  const c = clinic();
  const s = c.settings;
  const today = new Intl.DateTimeFormat('pt-BR', { timeZone: tz(), day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const w = window.open('', '_blank');
  if (!w) { toast('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.', true); return; }
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)} - ${esc(state.patient?.patient?.name || '')}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #10262b; margin: 0; padding: 40px 48px; font-size: 14.5px; line-height: 1.6; }
    header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0e7c86; padding-bottom: 12px; margin-bottom: 28px; }
    header strong { font-size: 20px; color: #0b3a40; } header span { color: #5b6e73; font-size: 12.5px; text-align: right; }
    h1 { text-align: center; font-size: 18px; letter-spacing: .06em; text-transform: uppercase; margin: 8px 0 26px; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; } th, td { border-bottom: 1px solid #dfe7e9; padding: 7px 6px; text-align: left; vertical-align: top; }
    th { font-size: 12px; text-transform: uppercase; color: #5b6e73; } .r { text-align: right; } .c { text-align: center; width: 56px; }
    tr.grand td { font-weight: 700; font-size: 16px; border-top: 2px solid #10262b; }
    .rx { white-space: pre-wrap; border: 1px dashed #c9d6d9; border-radius: 8px; padding: 16px; min-height: 220px; margin-top: 12px; }
    .small { font-size: 12.5px; color: #5b6e73; } .place { margin-top: 36px; }
    .sign { margin-top: 64px; display: flex; justify-content: center; } .sign span { border-top: 1px solid #10262b; padding-top: 6px; min-width: 300px; text-align: center; }
    footer { margin-top: 48px; font-size: 11px; color: #8a9ca0; text-align: center; }
    @media print { body { padding: 0 8mm; } .noprint { display: none; } }
    .noprint { position: fixed; top: 12px; right: 12px; } .noprint button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 0; background: #0e7c86; color: #fff; cursor: pointer; }
  </style></head><body>
  <div class="noprint"><button onclick="print()">Imprimir / salvar PDF</button></div>
  <header><strong>${esc(c.name)}</strong><span>${esc(c.address)}</span></header>
  <h1>${esc(title)}</h1>${body}
  <p class="place">${esc(today)}.</p>
  ${signed ? `<div class="sign"><span>${esc(s.dentist_name || 'Cirurgião-dentista')}${s.dentist_cro ? `<br><small>${esc(s.dentist_cro)}</small>` : ''}</span></div>` : ''}
  <footer>${esc(c.name)}${c.address ? ' · ' + esc(c.address) : ''}</footer>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* o botão na página continua disponível */ } }, 300);
}

// ---------- Financeiro ----------

function showFinanceiro() {
  stopPolling();
  state.fmonth = state.fmonth || todayKey().slice(0, 7);
  state.ffilter = state.ffilter || 'todos';
  app.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">Contas a receber e a pagar</p><h1>Financeiro</h1></div>
      <div class="actions"><button class="btn" type="button" id="f-exp">${icon('arrowUp')}Nova despesa</button><button class="btn primary" type="button" id="f-inc">${icon('plus')}Nova receita</button></div>
    </div>
    <div class="monthbar"><button class="btn icon" type="button" id="m-prev" aria-label="Mês anterior">${icon('left')}</button><strong id="m-label"></strong><button class="btn icon" type="button" id="m-next" aria-label="Próximo mês">${icon('right')}</button><button class="btn small ghost" type="button" id="m-today">Este mês</button></div>
    <div class="kpis" id="f-kpis"></div>
    <section class="card attn" id="f-late" hidden></section>
    <div class="board">
      <section class="card"><div class="card-head"><h2>Lançamentos do mês</h2><div class="seg" id="f-filter"></div></div><ul class="flist" id="f-list"></ul></section>
      <div class="side-col">
        <section class="card"><div class="card-head"><h2>Despesas por categoria</h2></div><div class="card-body" id="f-cats"></div></section>
        <section class="card"><div class="card-head"><h2>Orçamentos em aberto</h2></div><div class="card-body" id="f-open"></div></section>
      </div>
    </div>
    ${financeDialogHtml()}`;
  bindFinanceDialog();
  const move = (n) => { const [y, m] = state.fmonth.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); state.fmonth = d.toISOString().slice(0, 7); loadFinance(); };
  $('#m-prev').addEventListener('click', () => move(-1));
  $('#m-next').addEventListener('click', () => move(1));
  $('#m-today').addEventListener('click', () => { state.fmonth = todayKey().slice(0, 7); loadFinance(); });
  $('#f-inc').addEventListener('click', () => openFinanceDialog({ kind: 'receita' }));
  $('#f-exp').addEventListener('click', () => openFinanceDialog({ kind: 'despesa' }));
  $('#f-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-ff]'); if (b) { state.ffilter = b.dataset.ff; renderFinance(); } });
  loadFinance();
}

async function loadFinance() {
  const data = await act(() => api(`/api/clinics/${state.clinicId}/finance?month=${state.fmonth}`));
  if (!data || state.view !== 'financeiro') return;
  state.fin = data;
  renderFinance();
}

function renderFinance() {
  const d = state.fin;
  if (!d || !$('#f-list')) return;
  const [y, m] = d.month.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 15)));
  $('#m-label').textContent = label.charAt(0).toUpperCase() + label.slice(1);
  $('#m-today').hidden = d.month === d.today.slice(0, 7);
  const inMonth = (k) => k && k.slice(0, 7) === d.month;
  const sum = (arr) => arr.reduce((s, f) => s + f.amount, 0);
  const rec = d.entries.filter((f) => f.kind === 'receita');
  const exp = d.entries.filter((f) => f.kind === 'despesa');
  const received = sum(rec.filter((f) => inMonth(f.paid_at)));
  const toReceive = sum(rec.filter((f) => !f.paid_at && inMonth(f.due_date)));
  const expPaid = sum(exp.filter((f) => inMonth(f.paid_at)));
  const expOpen = sum(exp.filter((f) => !f.paid_at && inMonth(f.due_date)));
  const balance = received - expPaid;
  const pctRec = received + toReceive ? Math.round((received / (received + toReceive)) * 100) : 0;
  $('#f-kpis').innerHTML = `
    <div class="card kpi"><div class="kpi-top"><span class="kpi-ic ok">${icon('arrowDown')}</span>Recebido</div><div class="kpi-v">${brlc(received)}</div><div class="bar"><span style="width:${pctRec}%"></span></div><div class="kpi-sub">${pctRec}% do previsto no mês</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-ic info">${icon('clock')}</span>A receber</div><div class="kpi-v">${brlc(toReceive)}</div><div class="kpi-sub">Ainda neste mês</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-ic bad">${icon('arrowUp')}</span>Despesas</div><div class="kpi-v">${brlc(expPaid + expOpen)}</div><div class="kpi-sub">${brlc(expPaid)} pagas · ${brlc(expOpen)} a pagar</div></div>
    <div class="card kpi"><div class="kpi-top"><span class="kpi-ic ${balance >= 0 ? 'ok' : 'bad'}">${icon('wallet')}</span>Saldo do mês</div><div class="kpi-v${balance < 0 ? ' neg' : ''}">${brlc(balance)}</div><div class="kpi-sub">Recebido menos despesas pagas</div></div>`;

  const late = $('#f-late');
  late.hidden = !d.overdue.length;
  late.innerHTML = d.overdue.length ? `<div class="card-head"><h2>${icon('alert')}Contas vencidas</h2><span class="chip bad">${d.overdue.length} · ${brlc(sum(d.overdue))}</span></div>
    <ul class="flist">${d.overdue.slice(0, 6).map((f) => financeRow(f, d.today)).join('')}</ul>` : '';

  const filters = [['todos', 'Todos'], ['receita', 'Receitas'], ['despesa', 'Despesas'], ['pendente', 'Pendentes']];
  $('#f-filter').innerHTML = filters.map(([k, l]) => `<button type="button" data-ff="${k}" class="${state.ffilter === k ? 'on' : ''}">${l}</button>`).join('');
  const shown = d.entries.filter((f) => state.ffilter === 'todos' || (state.ffilter === 'pendente' ? !f.paid_at : f.kind === state.ffilter))
    .sort((a, b) => (a.paid_at || a.due_date).localeCompare(b.paid_at || b.due_date) || a.id - b.id);
  $('#f-list').innerHTML = shown.length ? shown.map((f) => financeRow(f, d.today)).join('')
    : `<li><div class="empty-state"><span class="big">${icon('wallet')}</span><strong>Nada lançado ${state.ffilter === 'todos' ? 'neste mês' : 'com esse filtro'}</strong><span>Lance receitas (consultas, tratamentos) e despesas (aluguel, material).</span></div></li>`;

  const cats = {};
  for (const f of exp) cats[f.category || 'Outros'] = (cats[f.category || 'Outros'] || 0) + f.amount;
  const total = Object.values(cats).reduce((s, x) => s + x, 0);
  $('#f-cats').innerHTML = total ? Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, x]) => `<div class="catbar"><div><span>${esc(k)}</span><strong>${brlc(x)}</strong></div><div class="bar"><span style="width:${Math.round((x / total) * 100)}%"></span></div></div>`).join('')
    : '<p class="muted">Nenhuma despesa neste mês.</p>';
  $('#f-open').innerHTML = d.open_budgets.n
    ? `<p><strong class="big-num">${brlc(d.open_budgets.total)}</strong></p><p class="hint">${d.open_budgets.n} orçamento${d.open_budgets.n > 1 ? 's' : ''} esperando o paciente aprovar. Entram aqui como receita quando aprovados na ficha do paciente.</p>`
    : '<p class="muted">Nenhum orçamento esperando aprovação.</p>';
}

function financeDialogHtml() {
  return `<dialog id="fin-dialog"><form id="fin-form" method="dialog">
    <div class="full"><h2 id="fd-title">Novo lançamento</h2></div>
    <div class="full"><div class="seg" id="fd-kind"><button type="button" data-k="receita">Receita</button><button type="button" data-k="despesa">Despesa</button></div></div>
    <label class="field full">Descrição<input id="fd-desc" required placeholder="Ex.: Limpeza"></label>
    <label class="field">Valor (R$)<input id="fd-amount" required inputmode="decimal" placeholder="0,00"></label>
    <label class="field">Vencimento<input id="fd-due" type="date" required></label>
    <label class="field">Categoria<input id="fd-cat" list="fd-cats" autocomplete="off"></label>
    <label class="field">Forma de pagamento<select id="fd-method"><option value="">—</option>${METHODS.map((m) => `<option>${m}</option>`).join('')}</select></label>
    <label class="field full" id="fd-patient-wrap">Paciente (opcional)<input id="fd-patient" list="fd-patients" autocomplete="off" placeholder="Nome do paciente"></label>
    <label class="check full"><input type="checkbox" id="fd-paid"> Já foi pago</label>
    <label class="field" id="fd-paid-wrap">Data do pagamento<input id="fd-paid-at" type="date"></label>
    <datalist id="fd-cats"></datalist><datalist id="fd-patients"></datalist>
    <div class="actions"><button class="btn ghost danger" type="button" id="fd-delete">${icon('trash')}Excluir</button><span style="flex:1"></span><button class="btn ghost" type="button" id="fd-cancel">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
  </form></dialog>`;
}

function bindFinanceDialog() {
  const d = $('#fin-dialog');
  const setKind = (k) => {
    d.dataset.kind = k;
    $('#fd-kind').querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    $('#fd-cats').innerHTML = CATEGORIES[k].map((c) => `<option value="${c}">`).join('');
    $('#fd-patient-wrap').hidden = k !== 'receita';
  };
  $('#fd-kind').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) setKind(b.dataset.k); });
  $('#fd-paid').addEventListener('change', () => { $('#fd-paid-wrap').hidden = !$('#fd-paid').checked; if ($('#fd-paid').checked && !$('#fd-paid-at').value) $('#fd-paid-at').value = todayKey(); });
  $('#fd-cancel').addEventListener('click', () => d.close());
  $('#fd-delete').addEventListener('click', (e) => confirmTwice(e.currentTarget, async () => {
    if (await act(() => api(`/api/clinics/${state.clinicId}/finance/${d.dataset.id}`, { method: 'DELETE' }), 'Lançamento excluído.')) { d.close(); afterFinanceChange(); }
  }));
  $('#fin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#fd-patient').value.trim();
    const patient = name ? (state.patients || []).find((p) => p.name === name) : null;
    if (name && !patient && d.dataset.kind === 'receita') return toast('Escolha um paciente da lista ou deixe vazio.', true);
    const body = {
      kind: d.dataset.kind, description: $('#fd-desc').value, amount: parseMoney($('#fd-amount').value), due_date: $('#fd-due').value,
      category: $('#fd-cat').value, method: $('#fd-method').value, paid_at: $('#fd-paid').checked ? $('#fd-paid-at').value || todayKey() : '',
      patient_id: d.dataset.kind === 'receita' && patient ? patient.id : null,
    };
    const id = d.dataset.id;
    const r = await act(() => api(id ? `/api/clinics/${state.clinicId}/finance/${id}` : `/api/clinics/${state.clinicId}/finance`, { method: id ? 'PUT' : 'POST', body }), 'Lançamento salvo.');
    if (!r) return;
    d.close();
    afterFinanceChange();
  });
  d._setKind = setKind;
}

async function openFinanceDialog(f = {}) {
  const d = $('#fin-dialog');
  if (!d) return;
  d.dataset.id = f.id || '';
  $('#fd-title').textContent = f.id ? 'Editar lançamento' : f.kind === 'despesa' ? 'Nova despesa' : 'Nova receita';
  d._setKind(f.kind || 'receita');
  $('#fd-desc').value = f.description || '';
  $('#fd-amount').value = moneyInput(f.amount);
  $('#fd-due').value = f.due_date || todayKey();
  $('#fd-cat').value = f.category || '';
  $('#fd-method').value = f.method || '';
  $('#fd-paid').checked = Boolean(f.paid_at) || !f.id;
  $('#fd-paid-at').value = f.paid_at || (f.id ? '' : todayKey());
  $('#fd-paid-wrap').hidden = !$('#fd-paid').checked;
  $('#fd-delete').hidden = !f.id;
  const list = state.patients || await loadPatientsList();
  $('#fd-patients').innerHTML = list.map((p) => `<option value="${esc(p.name)}">`).join('');
  $('#fd-patient').value = f.patient_id ? list.find((p) => p.id === f.patient_id)?.name || '' : '';
  d.showModal();
  $('#fd-desc').focus();
}

async function payEntry(id) {
  const f = (state.fin?.entries || []).concat(state.fin?.overdue || [], state.patient?.finance || []).find((x) => x.id === id);
  if (!f) return;
  const r = await act(() => api(`/api/clinics/${state.clinicId}/finance/${id}`, { method: 'PUT', body: { paid_at: todayKey() } }), f.kind === 'receita' ? `Recebido: ${brlc(f.amount)}.` : `Pago: ${brlc(f.amount)}.`);
  if (r) afterFinanceChange();
}

function afterFinanceChange() {
  if (state.view === 'financeiro') loadFinance();
  else if (state.view === 'pacientes' && state.patient) reloadPatient();
}

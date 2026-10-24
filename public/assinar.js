// Página do paciente (/p/<código>): ler, preencher a ficha de entrada (quando for o caso) e assinar com o dedo.
'use strict';

const token = location.pathname.split('/')[2] || '';
const main = document.getElementById('main');
const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
let doc = null;

function fmtPhone(p) {
  const d = String(p || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p || '';
}
function fmtCpf(c) { const d = String(c || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d; }
function fmtCep(c) { const d = String(c || '').replace(/\D/g, ''); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; }
function when(iso) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(',', ' às');
}

// Máscaras enquanto digita.
document.addEventListener('input', (e) => {
  const el = e.target;
  const d = el.value.replace(/\D/g, '');
  if (el.dataset.mask === 'cpf') el.value = d.slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  if (el.dataset.mask === 'cep') el.value = d.slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
  if (el.dataset.mask === 'phone') {
    const x = d.slice(0, 11);
    el.value = x.length > 10 ? x.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3') : x.length > 6 ? x.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3') : x.length > 2 ? x.replace(/(\d{2})(\d+)/, '($1) $2') : x;
  }
});

function message(title, text, ok) {
  main.innerHTML = `<section class="card sign-done"><span class="big ${ok ? 'ok' : ''}">${ok ? '✓' : '!'}</span><h1>${esc(title)}</h1><p class="muted">${esc(text)}</p></section>`;
}

async function load() {
  if (!token) return message('Link inválido', 'Confira se você abriu o endereço inteiro que a clínica enviou.');
  try {
    const res = await fetch(`/p/${encodeURIComponent(token)}/dados`);
    const data = await res.json();
    if (!res.ok) return message('Link inválido', data.error || 'Confira o endereço com a clínica.');
    doc = data;
  } catch {
    return message('Sem conexão', 'Não conseguimos abrir o documento. Confira a internet e tente de novo.');
  }
  $('#clinic-name').textContent = doc.clinic.name;
  $('#clinic-address').textContent = doc.clinic.address || '';
  document.title = `${doc.title} - ${doc.clinic.name}`;
  if (doc.status === 'assinado') return message('Documento já assinado', `Este documento foi assinado em ${when(doc.signed_at)}. Obrigado!`, true);
  if (doc.status === 'cancelado') return message('Documento cancelado', 'A clínica cancelou este documento. Se tiver dúvida, fale com a recepção.');
  if (doc.status === 'vencido') return message('Link vencido', 'Este link passou do prazo. Peça para a clínica enviar de novo.');
  render();
}

function render() {
  const entry = doc.kind === 'entrada';
  const p = doc.patient;
  const a = doc.anamnesis || {};
  const field = (id, label, attrs = '', full = false) => `<label class="field${full ? ' full' : ''}">${label}<input id="f-${id}" value="${esc(id === 'phone' || id === 'phone2' || id === 'guardian_phone' ? fmtPhone(p[id]) : id === 'cpf' ? fmtCpf(p[id]) : id === 'cep' ? fmtCep(p[id]) : p[id])}" ${attrs}></label>`;
  const select = (id, label, opts) => `<label class="field">${label}<select id="f-${id}"><option value="">—</option>${opts.map((o) => `<option${o === p[id] ? ' selected' : ''}>${o}</option>`).join('')}</select></label>`;
  main.innerHTML = `
    <div class="sign-intro">
      <p class="eyebrow">${entry ? 'Leva uns 3 minutos' : 'Documento para assinar'}</p>
      <h1>${esc(doc.title)}</h1>
      <p class="muted">${entry ? 'Preencha seus dados e as perguntas de saúde. Assim seu atendimento fica mais rápido e seguro.' : 'Leia com atenção e assine no final. Se tiver dúvida, fale com a clínica antes de assinar.'}</p>
    </div>
    ${entry ? `
    <section class="card"><div class="card-head"><h2>1. Seus dados</h2></div><div class="card-body"><div class="grid2">
      ${field('name', 'Nome completo *', 'autocomplete="name" required', true)}
      ${field('birth_date', 'Data de nascimento', 'type="date"')}
      ${select('sex', 'Sexo', ['Feminino', 'Masculino', 'Outro'])}
      ${field('cpf', 'CPF *', 'inputmode="numeric" data-mask="cpf" placeholder="000.000.000-00"')}
      ${field('profession', 'Profissão')}
      ${field('phone', 'WhatsApp', 'inputmode="tel" data-mask="phone" autocomplete="tel"')}
      ${field('email', 'E-mail', 'type="email" inputmode="email" autocomplete="email"')}
      ${field('cep', 'CEP', 'inputmode="numeric" data-mask="cep" autocomplete="postal-code"')}
      ${field('address', 'Rua, número e complemento', 'autocomplete="street-address"')}
      ${field('neighborhood', 'Bairro')}
      <div class="grid-city">${field('city', 'Cidade')}${select('state', 'UF', UFS)}</div>
      ${field('insurance', 'Convênio (deixe vazio se for particular)')}
      ${field('insurance_number', 'Número da carteirinha')}
      ${field('guardian_name', 'Responsável (se for menor de idade)')}
      ${field('guardian_phone', 'Telefone do responsável', 'inputmode="tel" data-mask="phone"')}
    </div></div></section>
    <section class="card"><div class="card-head"><div><h2>2. Sua saúde</h2><p class="hint">Responda com sinceridade: isso ajuda o dentista a cuidar de você com segurança.</p></div></div>
      <div class="card-body"><label class="field">O que te traz à clínica?<textarea id="f-queixa" rows="2" placeholder="Ex.: dor, limpeza, quero clarear os dentes">${esc(a.queixa?.d || '')}</textarea></label>
      <ul class="qlist">${doc.questions.map(([k, q]) => `<li>
        <span class="q">${esc(q)}</span>
        <span class="yn" role="radiogroup" aria-label="${esc(q)}"><button type="button" data-q="${k}" data-a="sim" class="${a[k]?.a === 'sim' ? 'on yes' : ''}">Sim</button><button type="button" data-q="${k}" data-a="nao" class="${a[k]?.a === 'nao' ? 'on' : ''}">Não</button></span>
        <input id="f-d-${k}" value="${esc(a[k]?.d || '')}" placeholder="Se sim, qual?" aria-label="Detalhes" ${a[k]?.a === 'sim' ? '' : 'hidden'}>
      </li>`).join('')}</ul></div></section>` : ''}
    <section class="card"><div class="card-head"><h2>${entry ? '3. Termo' : 'Documento'}</h2></div>
      <div class="card-body"><div class="sign-text">${esc(doc.body)}</div></div></section>
    <section class="card"><div class="card-head"><div><h2>Assinatura</h2><p class="hint">Assine com o dedo no quadro abaixo.</p></div></div>
      <form class="card-body" id="sign-form" novalidate>
        <div class="grid2">
          <label class="field">Nome completo<input id="s-name" value="${esc(p.name || '')}" autocomplete="name" required></label>
          <label class="field">CPF<input id="s-cpf" value="${esc(fmtCpf(p.cpf))}" inputmode="numeric" data-mask="cpf" placeholder="000.000.000-00" required></label>
        </div>
        <div class="sign-pad"><canvas id="pad" aria-label="Quadro para assinar com o dedo"></canvas><span class="sign-line">Assine aqui</span><button class="btn small ghost" type="button" id="pad-clear">Limpar</button></div>
        <label class="check"><input type="checkbox" id="s-agree"> Li e concordo com ${entry ? 'o termo acima e confirmo que as informações são verdadeiras' : 'o documento acima'}.</label>
        <p class="error" id="s-error" hidden></p>
        <button class="btn primary sign-submit" type="submit">Assinar documento</button>
        <p class="hint">Ao assinar, registramos a data, a hora e o endereço de internet deste aparelho para comprovar a assinatura.</p>
      </form></section>`;

  const answers = {};
  for (const [k] of doc.questions || []) answers[k] = a[k]?.a || '';
  main.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.q;
    answers[k] = b.dataset.a;
    main.querySelectorAll(`[data-q="${k}"]`).forEach((x) => x.classList.toggle('on', x === b));
    main.querySelector(`[data-q="${k}"][data-a="sim"]`).classList.toggle('yes', answers[k] === 'sim');
    $(`#f-d-${k}`).hidden = answers[k] !== 'sim';
    if (answers[k] === 'sim') $(`#f-d-${k}`).focus();
  }));
  if (entry) {
    $('#f-name').addEventListener('input', (e) => { $('#s-name').value = e.target.value; });
    $('#f-cpf').addEventListener('input', (e) => { $('#s-cpf').value = e.target.value; });
    $('#f-cep').addEventListener('input', async (e) => {
      const cep = e.target.value.replace(/\D/g, '');
      if (cep.length !== 8) return;
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json());
        if (r.erro) return;
        if (!$('#f-address').value) $('#f-address').value = r.logradouro ? `${r.logradouro}, ` : '';
        if (!$('#f-neighborhood').value) $('#f-neighborhood').value = r.bairro || '';
        $('#f-city').value = r.localidade || $('#f-city').value;
        if (r.uf) $('#f-state').value = r.uf;
        $('#f-address').focus();
      } catch { /* preenche à mão */ }
    });
  }
  const pad = signaturePad($('#pad'));
  $('#pad-clear').addEventListener('click', pad.clear);
  $('#sign-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#s-error');
    err.hidden = true;
    const show = (t) => { err.textContent = t; err.hidden = false; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    if (entry) {
      const missing = (doc.questions || []).filter(([k]) => !answers[k]);
      if (missing.length) return show(`Responda todas as perguntas de saúde (faltam ${missing.length}).`);
    }
    if (pad.empty()) return show('Faça sua assinatura no quadro.');
    const body = { name: $('#s-name').value, cpf: $('#s-cpf').value, signature: pad.toDataURL(), agree: $('#s-agree').checked };
    if (entry) {
      const ids = ['name', 'birth_date', 'sex', 'cpf', 'profession', 'phone', 'email', 'cep', 'address', 'neighborhood', 'city', 'state', 'insurance', 'insurance_number', 'guardian_name', 'guardian_phone'];
      body.form = Object.fromEntries(ids.map((k) => [k, $('#f-' + k).value]));
      body.form.anamnesis = { queixa: { a: '', d: $('#f-queixa').value } };
      for (const [k] of doc.questions) body.form.anamnesis[k] = { a: answers[k], d: answers[k] === 'sim' ? $('#f-d-' + k).value : '' };
    }
    const btn = main.querySelector('.sign-submit');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      const res = await fetch(`/p/${encodeURIComponent(token)}/assinar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível assinar. Tente de novo.');
      window.scrollTo(0, 0);
      message('Pronto, documento assinado!', `Obrigado, ${body.name.split(' ')[0]}. A ${doc.clinic.name} já recebeu ${entry ? 'sua ficha e ' : ''}sua assinatura. Você pode fechar esta página.`, true);
    } catch (ex) {
      show(ex.message === 'Failed to fetch' ? 'Sem internet. Confira a conexão e tente de novo.' : ex.message);
      btn.disabled = false;
      btn.textContent = 'Assinar documento';
    }
  });
}

/** Quadro de assinatura com o dedo (ou mouse). */
function signaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false, last = null, strokes = 0;
  const size = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f2a4a';
    strokes = 0;
  };
  size();
  window.addEventListener('resize', () => { if (!strokes) size(); });
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p; strokes++;
  });
  const stop = () => { drawing = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  return {
    clear: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); strokes = 0; },
    empty: () => strokes < 8,
    toDataURL: () => canvas.toDataURL('image/png'),
  };
}

load();

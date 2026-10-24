// Imagens ilustrativas da demonstração (raio-X, fotos, assinaturas), desenhadas em SVG para não depender de arquivos reais de pacientes.

const enc = new TextEncoder();
const tag = '<text x="50%" y="96%" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#9fb3b8" opacity=".8">Imagem ilustrativa · demonstração</text>';

function tooth(x: number, y: number, w: number, h: number, down: boolean, fill: string, extra = ''): string {
  const r = down ? `M${x},${y} q${w / 2},-${h * 0.18} ${w},0 l-${w * 0.12},${h} q-${w * 0.38},${h * 0.12} -${w * 0.76},0 z`
    : `M${x},${y + h} q${w / 2},${h * 0.18} ${w},0 l-${w * 0.12},-${h} q-${w * 0.38},-${h * 0.12} -${w * 0.76},0 z`;
  return `<path d="${r}" fill="${fill}" ${extra}/>`;
}

/** Raio-X panorâmico estilizado. `mark` = posição (0 a 15) de um dente com canal na arcada de baixo. */
export function panoramicSvg(mark = -1, missing: number[] = []): Uint8Array {
  let teeth = '';
  for (let i = 0; i < 16; i++) {
    const x = 70 + i * 41;
    const curve = Math.pow((i - 7.5) / 7.5, 2) * 40;
    if (!missing.includes(i)) teeth += tooth(x, 70 + curve, 34, 120 - curve * 0.6, false, 'url(#bone)');
    if (!missing.includes(i + 16)) {
      teeth += tooth(x, 400 - curve, 34, 120 - curve * 0.6, true, 'url(#bone)');
      if (i === mark) teeth += `<path d="M${x + 17},${400 - curve} l-4,${100 - curve * 0.5} M${x + 17},${400 - curve} l5,${98 - curve * 0.5}" stroke="#fff" stroke-width="3"/><rect x="${x + 6}" y="${386 - curve}" width="22" height="16" rx="5" fill="#f4f8f9"/>`;
    }
  }
  return enc.encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" width="800" height="520">
<defs><radialGradient id="bg" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#3a4448"/><stop offset="1" stop-color="#090c0d"/></radialGradient>
<linearGradient id="bone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9e2e4"/><stop offset="1" stop-color="#7d8b8f"/></linearGradient></defs>
<rect width="800" height="520" fill="url(#bg)"/>
<path d="M40,250 Q400,330 760,250" stroke="#55615f" stroke-width="40" fill="none" opacity=".35"/>
${teeth}${tag}</svg>`);
}

/** Raio-X periapical (um dente de perto), com ou sem canal. */
export function periapicalSvg(canal: boolean): Uint8Array {
  return enc.encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520" width="400" height="520">
<defs><radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#4a5457"/><stop offset="1" stop-color="#0b0e0f"/></radialGradient>
<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef3f4"/><stop offset="1" stop-color="#8c999c"/></linearGradient></defs>
<rect width="400" height="520" fill="url(#bg)"/>
<path d="M110,90 q90,-40 180,0 q10,80 -10,130 l-25,230 q-30,25 -45,0 l-10,-150 l-10,150 q-15,25 -45,0 l-25,-230 q-20,-50 -10,-130z" fill="url(#t)"/>
<path d="M150,120 q50,-25 100,0 q5,50 -10,80 h-80 q-15,-30 -10,-80z" fill="#59666a" opacity=".7"/>
${canal ? '<path d="M175,200 l-10,240 M225,200 l12,240" stroke="#fff" stroke-width="7" stroke-linecap="round"/><rect x="145" y="105" width="110" height="60" rx="18" fill="#fbfdfd"/>'
    : '<circle cx="200" cy="470" r="28" fill="#2a3134" opacity=".9"/>'}
${tag}</svg>`);
}

/** Foto clínica estilizada de um sorriso. `shade` de 0 (amarelado) a 1 (branco). */
export function smileSvg(shade: number, label: string): Uint8Array {
  const c = (a: number, b: number) => Math.round(a + (b - a) * shade);
  const enamel = `rgb(${c(226, 250)},${c(204, 248)},${c(160, 240)})`;
  let teeth = '';
  for (let i = 0; i < 8; i++) {
    const w = [44, 50, 58, 66, 66, 58, 50, 44][i];
    const x = 200 + [0, 44, 94, 152, 218, 284, 342, 392][i];
    teeth += `<rect x="${x}" y="225" width="${w - 3}" height="${[62, 72, 84, 92, 92, 84, 72, 62][i]}" rx="12" fill="${enamel}" stroke="#c9b9a2" stroke-width="1.5"/>`;
  }
  return enc.encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 520" width="840" height="520">
<rect width="840" height="520" fill="#f1d9cc"/>
<path d="M150,250 Q420,110 690,250 Q420,450 150,250z" fill="#b5545a"/>
<path d="M190,252 Q420,190 650,252 Q420,400 190,252z" fill="#5a1e24"/>
${teeth}
<path d="M200,330 Q420,370 640,330 Q420,360 200,330z" fill="#e8a3a3"/>
<rect x="${420 - (label.length * 11 + 28) / 2}" y="40" rx="10" width="${label.length * 11 + 28}" height="38" fill="#0b3a40"/><text x="420" y="66" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="700" fill="#fff">${label}</text>
${tag.replace('#9fb3b8', '#7a5a50')}</svg>`);
}

/** Tomografia estilizada (corte da mandíbula). */
export function scanSvg(): Uint8Array {
  let slices = '';
  for (let i = 0; i < 6; i++) {
    const x = 30 + (i % 3) * 250;
    const y = 30 + Math.floor(i / 3) * 230;
    slices += `<rect x="${x}" y="${y}" width="230" height="210" rx="6" fill="#0d1112"/><path d="M${x + 40},${y + 160} q75,-${120 + i * 6} 150,0" stroke="#cfd8da" stroke-width="${18 - i}" fill="none" opacity=".85"/><text x="${x + 10}" y="${y + 22}" font-family="monospace" font-size="13" fill="#7f9296">corte ${i + 1}</text>`;
  }
  return enc.encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" width="800" height="520"><rect width="800" height="520" fill="#1d2426"/>${slices}${tag}</svg>`);
}

/** Assinatura "à mão" para os termos já assinados da demonstração (data URL): inicial grande com laço e o resto do nome corrido. */
export function signatureDataUrl(name: string): string {
  const seed = [...name].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const rnd = (i: number) => ((seed * (i + 7) * 9301 + 49297) % 233280) / 233280;
  let d = 'M18,88 C30,20 52,10 46,40 C40,70 20,92 34,78 C48,64 60,58 70,66';
  let x = 70;
  const letters = Math.min(10, name.replace(/\s/g, '').length);
  for (let i = 0; i < letters; i++) {
    const h = 16 + rnd(i) * 30;
    const w = 12 + rnd(i + 20) * 12;
    d += ` C${x + w * 0.3},${70 - h} ${x + w * 0.7},${70 - h} ${x + w * 0.5},68 S${x + w},74 ${x + w + 4},64`;
    x += w + 4;
  }
  d += ` M${40 + rnd(3) * 20},96 C${x * 0.4},84 ${x * 0.7},90 ${x + 12},80`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(x + 30)} 110"><path d="${d}" fill="none" stroke="#0f2a4a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

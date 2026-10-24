import { describe, expect, it } from 'vitest';
import { ANAMNESE_QUESTIONS, ATTACH_CATEGORIES, TERM_MODELS, budgetText, cleanAttachment } from '../src/signing';

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

describe('termos para assinar', () => {
  it('usa as mesmas perguntas de saúde da ficha no portal', async () => {
    // Lê o arquivo do portal pelo Node (o vitest roda em Node; o projeto não tem os tipos do Node instalados).
    const fs = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fs)) as { readFileSync: (p: string, e: string) => string };
    const portal = readFileSync('public/gestao.js', 'utf8');
    for (const [key, question] of ANAMNESE_QUESTIONS) expect(portal).toContain(`['${key}', '${question}'`);
  });

  it('todos os modelos citam o paciente e a clínica', () => {
    for (const m of TERM_MODELS) {
      expect(m.body).toContain('{paciente}');
      expect(m.body).toContain('{clinica}');
    }
  });

  it('monta o texto do orçamento com total e parcelas', () => {
    const clinic = { name: 'Clínica Teste', timezone: 'America/Sao_Paulo', settings: { dentist_name: '', dentist_cro: '' } } as never;
    const p = { name: 'Maria da Silva', cpf: '52998224725' } as never;
    const text = budgetText(clinic, p, {
      items: JSON.stringify([{ proc: 'Canal', tooth: '36', value: 90000 }, { proc: 'Resina', tooth: '', value: 25000 }]),
      discount: 5000, installments: 3, method: 'Pix', notes: '',
    } as never);
    expect(text).toContain('Maria da Silva, CPF 529.982.247-25');
    expect(text).toContain('Canal (dente 36)');
    expect(text).toMatch(/Total: R\$\s1\.100,00/);
    expect(text).toMatch(/3x de R\$\s366,66/);
  });
});

describe('anexos', () => {
  it('aceita foto e PDF e recusa outros tipos', () => {
    const a = cleanAttachment({ name: ' raio-x.jpg ', mime: 'image/jpeg', data: b64([1, 2, 3]), category: 'Raio-X', caption: ' Panorâmica ' });
    expect(a).toMatchObject({ name: 'raio-x.jpg', category: 'Raio-X', caption: 'Panorâmica', thumb: null });
    expect(a.data).toEqual(new Uint8Array([1, 2, 3]));
    expect(cleanAttachment({ mime: 'application/pdf', data: b64([9]), category: 'Inventada' }).category).toBe('Outro');
    expect(() => cleanAttachment({ mime: 'text/html', data: b64([1]) })).toThrow('Tipo');
    expect(() => cleanAttachment({ mime: 'image/png', data: '' })).toThrow('vazio');
    expect(() => cleanAttachment({ mime: 'image/png', data: '%%%' })).toThrow('corrompido');
    expect(ATTACH_CATEGORIES).toContain('Antes e depois');
  });
});

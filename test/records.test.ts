import { describe, expect, it } from 'vitest';
import {
  addMonths, budgetTotal, cleanAnamnesis, cleanBudget, cleanFinance, cleanOdontogram, cleanPatient, installmentPlan, isTooth, isValidCpf,
} from '../src/records';

const TODAY = '2026-10-24';

describe('cadastro do paciente', () => {
  it('confere o CPF', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224726')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });

  it('limpa e valida os campos', () => {
    const p = cleanPatient({ name: '  Maria   da Silva ', phone: '(11) 98765-4321', cpf: '529.982.247-25', cep: '01001-000', state: 'sp', birth_date: '1990-05-12' }, TODAY);
    expect(p.name).toBe('Maria da Silva');
    expect(p.phone).toBe('5511987654321');
    expect(p.phone_key).toBe('1187654321');
    expect(p.cpf).toBe('52998224725');
    expect(p.cep).toBe('01001000');
    expect(p.state).toBe('SP');
    expect(() => cleanPatient({ name: '' }, TODAY)).toThrow('nome');
    expect(() => cleanPatient({ name: 'Ana', cpf: '123.456.789-00' }, TODAY)).toThrow('CPF');
    expect(() => cleanPatient({ name: 'Ana', phone: '123' }, TODAY)).toThrow('WhatsApp');
    expect(() => cleanPatient({ name: 'Ana', birth_date: '2030-01-01' }, TODAY)).toThrow('nascimento');
    expect(() => cleanPatient({ name: 'Ana', email: 'ana@' }, TODAY)).toThrow('E-mail');
  });

  it('guarda só respostas válidas da anamnese e do odontograma', () => {
    expect(cleanAnamnesis({ alergia: { a: 'sim', d: ' Penicilina ' }, pressao: { a: 'talvez' }, 'X-1': { a: 'sim' } }))
      .toEqual({ alergia: { a: 'sim', d: 'Penicilina' } });
    expect(isTooth('36')).toBe(true);
    expect(isTooth('19')).toBe(false);
    expect(isTooth('55')).toBe(true);
    expect(isTooth('58')).toBe(false);
    expect(cleanOdontogram({ 36: { s: 'canal', n: '1ª sessão' }, 99: { s: 'carie' }, 11: { s: 'inventado' } }))
      .toEqual({ 36: { s: 'canal', n: '1ª sessão' } });
  });
});

describe('orçamentos e financeiro', () => {
  it('soma o orçamento com desconto', () => {
    const b = cleanBudget({ items: [{ proc: 'Canal', tooth: '36', value: 90000 }, { proc: 'Resina', value: 25000 }, { proc: '' }], discount: 5000, installments: 3 });
    expect(b.items).toHaveLength(2);
    expect(budgetTotal(b)).toBe(110000);
    expect(cleanBudget({ items: [{ proc: 'A', value: 100 }], discount: 999 }).discount).toBe(100);
    expect(() => cleanBudget({ items: [] })).toThrow('procedimento');
  });

  it('divide em parcelas mensais sem perder centavos', () => {
    const plan = installmentPlan(110000, 3, '2026-01-31');
    expect(plan.map((p) => p.amount)).toEqual([36668, 36666, 36666]);
    expect(plan.reduce((s, p) => s + p.amount, 0)).toBe(110000);
    expect(plan.map((p) => p.due)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('valida lançamentos', () => {
    expect(cleanFinance({ kind: 'despesa', description: 'Aluguel', amount: 350000, due_date: '2026-10-05', paid_at: '' }))
      .toMatchObject({ kind: 'despesa', amount: 350000, paid_at: null, patient_id: null });
    expect(() => cleanFinance({ description: 'X', amount: 0, due_date: '2026-10-05' })).toThrow('valor');
    expect(() => cleanFinance({ description: 'X', amount: 10, due_date: 'ontem' })).toThrow('vencimento');
  });
});

import { describe, expect, it } from 'vitest';
import { camposDoPadrao, montarCodigo, validarPadrao } from './codigo';

const PADRAO = 'PX-{campo:Área}-{campo:Projeto}-{campo:Disciplina}-{campo:Sigla}-{seq:4}';

describe('código da PX', () => {
  it('monta o exemplo da empresa', () => {
    expect(montarCodigo(PADRAO, 1, { 'Área': 'a2', Projeto: '1000', Disciplina: 'G', Sigla: 'PB' })).toBe('PX-A2-1000-G-PB-0001');
  });
  it('padrão inicial continua PX-0001', () => {
    expect(montarCodigo('PX-{seq:4}', 12, {})).toBe('PX-0012');
    expect(montarCodigo('PX-{seq}', 7, {})).toBe('PX-0007');
  });
  it('sequencial maior que a largura não é cortado', () => {
    expect(montarCodigo('{seq:2}', 123, {})).toBe('123');
  });
  it('campo vazio vira X e caracteres estranhos são removidos', () => {
    expect(montarCodigo(PADRAO, 3, { 'Área': 'a 2/', Projeto: '' })).toBe('PX-A2-X-X-X-0003');
  });
  it('ano', () => {
    expect(montarCodigo('{ano}-{seq:3}', 5, {}, 2026)).toBe('2026-005');
  });
  it('lista os campos do padrão', () => {
    expect(camposDoPadrao(PADRAO)).toEqual(['Área', 'Projeto', 'Disciplina', 'Sigla']);
  });
  it('valida o padrão', () => {
    expect(validarPadrao(PADRAO)).toEqual([]);
    expect(validarPadrao('PX-{campo:Área}').join()).toContain('{seq}');
    expect(validarPadrao('PX-{seq:4}-{area}').join()).toContain('chaves');
  });
});

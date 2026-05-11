import { isGroupJid, normalizePhone } from '../../src/domain/normalize/phone.util';

describe('normalizePhone', () => {
  it('preserva E.164 valido', () => {
    expect(normalizePhone('+5511999998888')).toBe('+5511999998888');
  });

  it('adiciona +55 em numero com DDD + 9 digitos', () => {
    expect(normalizePhone('11999998888')).toBe('+5511999998888');
  });

  it('adiciona +55 em numero com DDD + 8 digitos', () => {
    expect(normalizePhone('1133334444')).toBe('+551133334444');
  });

  it('adiciona + em numero que ja tem 55 + DDD + 9 digitos', () => {
    expect(normalizePhone('5511999998888')).toBe('+5511999998888');
  });

  it('remove formatacao com mascara', () => {
    expect(normalizePhone('+55 (11) 99999-8888')).toBe('+5511999998888');
  });

  it('retorna raw se vazio', () => {
    expect(normalizePhone('')).toBe('');
  });
});

describe('isGroupJid', () => {
  it('detecta JID de grupo', () => {
    expect(isGroupJid('120363000000000000@g.us')).toBe(true);
  });

  it('nao detecta JID individual como grupo', () => {
    expect(isGroupJid('5511999998888@s.whatsapp.net')).toBe(false);
  });
});

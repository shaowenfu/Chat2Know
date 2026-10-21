import { describe, expect, it } from 'vitest';
import { isEnvelope, unwrap } from '@/src/messaging/protocol';

describe('isEnvelope', () => {
  it('accepts a typed message', () => {
    expect(isEnvelope({ type: 'ping', payload: { from: 'sidepanel' } })).toBe(true);
  });

  it('rejects foreign messages', () => {
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope('ping')).toBe(false);
    expect(isEnvelope({ type: 'ping' })).toBe(false);
    expect(isEnvelope({ action: 'x', payload: {} })).toBe(false);
  });
});

describe('unwrap', () => {
  it('returns data on success', () => {
    expect(unwrap({ ok: true, data: 42 })).toBe(42);
  });

  it('throws the remote error message', () => {
    expect(() => unwrap({ ok: false, error: 'boom' })).toThrow('boom');
  });

  it('throws when nobody answered', () => {
    expect(() => unwrap(undefined)).toThrow('No response');
  });
});

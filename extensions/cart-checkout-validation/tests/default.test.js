import { describe, expect, it, vi } from 'vitest';
import { cartValidationsGenerateRun } from '../src/cart_validations_generate_run.js';

const future = Math.floor(Date.now() / 1000) + 3600;

function input(overrides = {}) {
  return {
    buyerJourney: { step: 'CHECKOUT_INTERACTION' },
    cart: {
      ageVerified: { value: 'true' },
      ageSignature: { value: 'signed-proof' },
      ageExpiresAt: { value: String(future) },
      buyerIdentity: {
        customer: {
          ageVerification: null,
        },
      },
      lines: [{ quantity: 1 }],
    },
    ...overrides,
  };
}

describe('cart_validations_generate_run', () => {
  it('allows checkout when age proof is valid', () => {
    expect(cartValidationsGenerateRun(input())).toEqual({ operations: [] });
  });

  it('blocks checkout when age proof is missing', () => {
    const result = cartValidationsGenerateRun(input({
      cart: {
        ageVerified: null,
        ageSignature: null,
        ageExpiresAt: null,
        buyerIdentity: {
          customer: {
            ageVerification: null,
          },
        },
        lines: [{ quantity: 1 }],
      },
    }));

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].validationAdd.errors[0].target).toBe('$.cart');
  });

  it('does not block normal cart interaction', () => {
    const result = cartValidationsGenerateRun(input({
      buyerJourney: { step: 'CART_INTERACTION' },
      cart: {
        ageVerified: null,
        ageSignature: null,
        ageExpiresAt: null,
        buyerIdentity: {
          customer: {
            ageVerification: null,
          },
        },
        lines: [{ quantity: 1 }],
      },
    }));

    expect(result).toEqual({ operations: [] });
  });

  it('blocks checkout when proof is expired', () => {
    vi.setSystemTime(new Date('2026-07-30T00:00:00Z'));

    const result = cartValidationsGenerateRun(input({
      cart: {
        ageVerified: { value: 'true' },
        ageSignature: { value: 'signed-proof' },
        ageExpiresAt: { value: '1' },
        buyerIdentity: {
          customer: {
            ageVerification: null,
          },
        },
        lines: [{ quantity: 1 }],
      },
    }));

    expect(result.operations).toHaveLength(1);
    vi.useRealTimers();
  });

  it('allows checkout when logged-in customer metafield proof is valid', () => {
    const result = cartValidationsGenerateRun(input({
      cart: {
        ageVerified: null,
        ageSignature: null,
        ageExpiresAt: null,
        buyerIdentity: {
          customer: {
            ageVerification: {
              value: JSON.stringify({
                verified: true,
                signature: 'customer-signed-proof',
                expires_at: future,
              }),
            },
          },
        },
        lines: [{ quantity: 1 }],
      },
    }));

    expect(result).toEqual({ operations: [] });
  });
});

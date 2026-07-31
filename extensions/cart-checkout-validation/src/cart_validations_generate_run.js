const NO_CHANGES = { operations: [] };

const CHECKOUT_STEPS = new Set([
  'CHECKOUT_INTERACTION',
  'CHECKOUT_COMPLETION',
]);

const CART_TARGET = '$.cart';
const ERROR_MESSAGE = 'Please verify your age before continuing to checkout.';

export function cartValidationsGenerateRun(input) {
  if (!CHECKOUT_STEPS.has(input?.buyerJourney?.step)) {
    return NO_CHANGES;
  }

  if (hasValidAgeProof(input?.cart)) {
    return NO_CHANGES;
  }

  return {
    operations: [
      {
        validationAdd: {
          errors: [
            {
              message: ERROR_MESSAGE,
              target: CART_TARGET,
            },
          ],
        },
      },
    ],
  };
}

function hasValidAgeProof(cart) {
  if (hasValidStoredProof({
    verified: cart?.ageVerified?.value === 'true',
    signature: cart?.ageSignature?.value || '',
    expires_at: cart?.ageExpiresAt?.value || '',
  })) {
    return true;
  }

  return hasValidStoredProof(readCustomerProof(cart));
}

function readCustomerProof(cart) {
  const value = cart?.buyerIdentity?.customer?.ageVerification?.value;
  if (!value) return {};

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function hasValidStoredProof(proof) {
  const verified = proof?.verified === true;
  const signature = proof?.signature || '';
  const expiresAt = Number.parseInt(proof?.expires_at || proof?.expiresAt || '', 10);
  const now = Math.floor(Date.now() / 1000);

  return verified && signature.length > 0 && Number.isFinite(expiresAt) && expiresAt > now;
}

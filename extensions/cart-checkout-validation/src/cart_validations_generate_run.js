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
  const verified = cart?.ageVerified?.value === 'true';
  const signature = cart?.ageSignature?.value || '';
  const expiresAt = Number.parseInt(cart?.ageExpiresAt?.value || '', 10);
  const now = Math.floor(Date.now() / 1000);

  return verified && signature.length > 0 && Number.isFinite(expiresAt) && expiresAt > now;
}

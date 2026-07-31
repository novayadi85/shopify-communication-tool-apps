// ../../node_modules/@shopify/shopify_function/run.ts
function run_default(userfunction) {
  try {
    ShopifyFunction;
  } catch (e) {
    throw new Error(
      "ShopifyFunction is not defined. Please rebuild your function using the latest version of Shopify CLI."
    );
  }
  const input_obj = ShopifyFunction.readInput();
  const output_obj = userfunction(input_obj);
  ShopifyFunction.writeOutput(output_obj);
}

// src/cart_validations_generate_run.js
var NO_CHANGES = { operations: [] };
var CHECKOUT_STEPS = /* @__PURE__ */ new Set([
  "CHECKOUT_INTERACTION",
  "CHECKOUT_COMPLETION"
]);
var CART_TARGET = "$.cart";
var ERROR_MESSAGE = "Please verify your age before continuing to checkout.";
function cartValidationsGenerateRun(input) {
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
              target: CART_TARGET
            }
          ]
        }
      }
    ]
  };
}
function hasValidAgeProof(cart) {
  const verified = cart?.ageVerified?.value === "true";
  const signature = cart?.ageSignature?.value || "";
  const expiresAt = Number.parseInt(cart?.ageExpiresAt?.value || "", 10);
  const now = Math.floor(Date.now() / 1e3);
  return verified && signature.length > 0 && Number.isFinite(expiresAt) && expiresAt > now;
}

// <stdin>
function cartValidationsGenerateRun2() {
  return run_default(cartValidationsGenerateRun);
}
export {
  cartValidationsGenerateRun2 as cartValidationsGenerateRun
};

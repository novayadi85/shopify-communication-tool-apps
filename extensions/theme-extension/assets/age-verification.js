// Idura Age Verification - modal age gate (à la VerifyID.dk)
// Taruh di: extensions/<extension-name>/assets/age-verification.js
//
// Implementasi manual OIDC Authorization Code + PKCE (TANPA SDK @criipto/auth-js,
// TANPA memanggil /oauth2/par). Alurnya persis seperti contoh di dokumentasi Idura:
//   GET /oauth2/authorize?...&response_type=code&... (navigasi browser biasa, no CORS)
// lalu setelah redirect balik dengan ?code=..., kita fetch() ke /oauth2/token
// (endpoint ini didesain mendukung PKCE dari browser/SPA, beda dengan /oauth2/par).

(function () {
  var STORAGE_KEY = 'idura_age_verified';
  var VERIFIER_KEY = 'idura_pkce_verifier';
  var STATE_KEY = 'idura_pkce_state';

  function base64UrlEncode(buffer) {
    var bytes = new Uint8Array(buffer);
    var str = '';
    for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomString(length) {
    var array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return base64UrlEncode(array.buffer);
  }

  function sha256(text) {
    var data = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', data).then(base64UrlEncode);
  }

  function decodeJwtPayload(idToken) {
    var payload = idToken.split('.')[1];
    var json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var modal = document.getElementById('idura-age-modal');
    var gate = modal || document.querySelector('[data-idura-age-gate]');
    if (!gate) return;

    var inlineConfig = {};
    var configEl = gate.querySelector('[data-idura-config]');
    if (configEl) {
      try {
        inlineConfig = JSON.parse(configEl.textContent || '{}');
      } catch (error) {
        console.warn('[Idura Age Verification] Config JSON tidak valid.', error);
      }
    }

    var config = Object.assign({}, window.IduraConfig || {}, inlineConfig);
    var domain = config.domain;
    var shop = config.shop || window.location.hostname;
    var clientId = config.clientId;
    var country = resolveCountry(config);
    var uiLanguage = resolveUiLanguage(config);
    var minAge = config.minAge || '18';
    var currentPageUrl = window.location.href.split('?')[0].split('#')[0];
    var redirectUri = resolveRedirectUri(config, country);
    var verifyUrl = config.verifyUrl || 'https://communication-tool.on-forge.com/api/idura/age/verify';
    var customer = config.customer || {};
    var isModal = !!modal || gate.classList.contains('idura-age-verify--modal');
    var pendingCheckoutUrl = sessionStorage.getItem('idura_pending_checkout_url') || '';

    if (!domain || !clientId) {
      console.warn('[Idura Age Verification] Domain / Client ID belum diisi di settings.');
      return;
    }

    if (!redirectUri) {
      console.warn('[Idura Age Verification] Redirect URI belum diisi untuk country ' + country + '. Isi Redirect URI map atau Fallback Redirect URI dengan URL statis yang terdaftar di Idura.');
      return;
    }

    function resolveCountry(settings) {
      var fallbackCountry = normalizeCountry(settings.country) || 'DK';
      var marketCountry = normalizeCountry(settings.marketCountry);

      if (settings.useMarketCountry === true && /^[A-Z]{2}$/.test(marketCountry)) {
        return marketCountry;
      }

      return fallbackCountry;
    }

    function normalizeCountry(value) {
      return String(value || '').trim().toUpperCase();
    }

    function resolveUiLanguage(settings) {
      var fallbackLanguage = normalizeLanguage(settings.uiLanguage) || 'da';
      var marketLanguage = normalizeLanguage(settings.marketLanguage);

      if (settings.useMarketLanguage === true && /^[a-z]{2}$/.test(marketLanguage)) {
        return marketLanguage;
      }

      return fallbackLanguage;
    }

    function normalizeLanguage(value) {
      return String(value || '').trim().toLowerCase().split('-')[0];
    }

    function resolveRedirectUri(settings, resolvedCountry) {
      var redirectUriMap = parseRedirectUriMap(settings.redirectUriMap);
      return redirectUriMap[resolvedCountry] || settings.redirectUri || '';
    }

    function parseRedirectUriMap(value) {
      if (!value) return {};

      if (typeof value === 'object') {
        return value;
      }

      try {
        return JSON.parse(value);
      } catch (error) {
        console.warn('[Idura Age Verification] Redirect URI map JSON tidak valid.', error);
        return {};
      }
    }

    function setState(state) {
      gate.querySelectorAll('[data-idura-state]').forEach(function (el) {
        el.hidden = el.dataset.iduraState !== state;
      });
    }

    function openGate() {
      document.querySelectorAll('.cart-drawer-overlay.cart-open').forEach(function (el) {
        el.classList.remove('cart-open');
      });

      if (isModal) {
        gate.hidden = false;
        document.documentElement.style.overflow = 'hidden';
      }
    }

    function completeGate() {
      if (isModal) {
        gate.hidden = true;
        document.documentElement.style.overflow = '';
      } else {
        setState('verified');
      }
    }

    function continueCheckout() {
      var url = pendingCheckoutUrl || '/checkout';
      sessionStorage.removeItem('idura_pending_checkout_url');
      window.location.href = url;
    }

    function cleanUrl() {
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, currentPageUrl);
      }
    }

    function hasValidProof() {
      if (hasValidCustomerProof()) return true;

      return hasValidSessionProof();
    }

    function hasValidSessionProof() {
      try {
        var proof = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
        return proof.verified === true && proof.signature && proof.expires_at > Math.floor(Date.now() / 1000);
      } catch (error) {
        return false;
      }
    }

    function readCustomerProof() {
      if (!customer.loggedIn || !customer.ageVerification) return {};

      if (typeof customer.ageVerification === 'object') {
        return customer.ageVerification;
      }

      try {
        return JSON.parse(customer.ageVerification);
      } catch (error) {
        return {};
      }
    }

    function hasValidCustomerProof() {
      var proof = readCustomerProof();
      var requiredAge = Number.parseInt(minAge, 10);
      var proofAge = Number.parseInt(proof.min_age || proof.minAge || '', 10);
      var expiresAt = Number.parseInt(proof.expires_at || proof.expiresAt || '', 10);
      var now = Math.floor(Date.now() / 1000);

      if (proof.verified !== true || !proof.signature || !Number.isFinite(expiresAt) || expiresAt <= now) {
        return false;
      }

      return !Number.isFinite(proofAge) || !Number.isFinite(requiredAge) || proofAge >= requiredAge;
    }

    function syncCustomerProofToCart() {
      var proof = readCustomerProof();
      return writeCartProof({
        verified: true,
        signature: proof.signature,
        expires_at: proof.expires_at || proof.expiresAt,
      });
    }

    function clearCartProof() {
      return writeCartProof({
        verified: false,
        signature: '',
        expires_at: '0',
      });
    }

    function readStoredProof() {
      try {
        return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      } catch (error) {
        return {};
      }
    }

    function writeCartProof(verification) {
      return fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attributes: {
            idura_age_verified: verification.verified ? 'true' : 'false',
            idura_age_signature: verification.signature || '',
            idura_age_expires_at: String(verification.expires_at || ''),
          },
        }),
      }).then(function (res) {
        if (!res.ok) throw new Error('Cart proof update gagal: ' + res.status);
        return res.json();
      });
    }

    function isCheckoutTrigger(el) {
      if (!el || !el.closest) return null;
      var trigger = el.closest('button, input, a');
      if (!trigger) return null;

      var href = trigger.getAttribute('href') || '';
      var name = trigger.getAttribute('name') || '';
      var type = trigger.getAttribute('type') || '';
      var formActionOverride = trigger.getAttribute('formaction') || '';
      var form = trigger.closest('form');
      var formAction = form ? (form.getAttribute('action') || '') : '';

      if (name === 'checkout') return { element: trigger, url: '/checkout' };
      if (href && /\/checkout(?:[?#].*)?$/.test(href)) return { element: trigger, url: href };
      if (formActionOverride && /\/checkout(?:[?#].*)?$/.test(formActionOverride)) {
        return { element: trigger, url: formActionOverride };
      }
      if (form && /\/cart(?:[?#].*)?$/.test(formAction) && type === 'submit' && name === 'checkout') {
        return { element: trigger, url: '/checkout' };
      }

      return null;
    }

    function bindCheckoutGuard() {
      document.addEventListener('click', function (event) {
        var checkout = isCheckoutTrigger(event.target);
        if (!checkout || hasValidProof()) return;

        event.preventDefault();
        event.stopPropagation();
        pendingCheckoutUrl = checkout.url;
        sessionStorage.setItem('idura_pending_checkout_url', pendingCheckoutUrl);
        setState('idle');
        openGate();
      }, true);

      document.addEventListener('submit', function (event) {
        var form = event.target;
        if (!form || !form.matches || hasValidProof()) return;

        var action = form.getAttribute('action') || '';
        var submitter = event.submitter;
        var submitterName = submitter ? (submitter.getAttribute('name') || '') : '';
        if (!/\/cart(?:[?#].*)?$/.test(action) || submitterName !== 'checkout') return;

        event.preventDefault();
        event.stopPropagation();
        pendingCheckoutUrl = '/checkout';
        sessionStorage.setItem('idura_pending_checkout_url', pendingCheckoutUrl);
        setState('idle');
        openGate();
      }, true);
    }

    // --- Login button: bangun authorize URL manual + PKCE, lalu navigasi (bukan fetch) ---
    var loginBtn = gate.querySelector('[data-idura-login]');
    if (loginBtn) {
      loginBtn.addEventListener('click', function () {
        var verifier = randomString(32);
        var state = randomString(16);
        sessionStorage.setItem(VERIFIER_KEY, verifier);
        sessionStorage.setItem(STATE_KEY, state);

        sha256(verifier).then(function (challenge) {
          var params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            response_mode: 'query',
            scope: 'openid is_over_' + minAge,
            acr_values: 'urn:age-verification',
            login_hint: 'country:' + country,
            ui_locales: uiLanguage,
            state: state,
            code_challenge: challenge,
            code_challenge_method: 'S256',
          });
          // Navigasi browser biasa (GET) - TIDAK melalui fetch, jadi tidak kena CORS
          window.location.href = 'https://' + domain + '/oauth2/authorize?' + params.toString();
        });
      });
    }

    bindCheckoutGuard();

    gate.querySelectorAll('[data-idura-close]').forEach(function (el) {
      el.addEventListener('click', completeGate);
    });

    // --- Cek apakah baru saja kembali dari redirect Idura (?code=...&state=...) ---
    var urlParams = new URLSearchParams(window.location.search);
    var code = urlParams.get('code');
    var returnedState = urlParams.get('state');

    if (code) {
      openGate();
      setState('verifying');
      var expectedState = sessionStorage.getItem(STATE_KEY);
      var verifier = sessionStorage.getItem(VERIFIER_KEY);

      if (!verifier || returnedState !== expectedState) {
        console.error('[Idura Age Verification] state tidak cocok atau verifier hilang.');
        setState('error');
        cleanUrl();
        return;
      }

      // Tukar code jadi token via fetch ke /oauth2/token (endpoint ini CORS-enabled untuk PKCE/SPA)
      fetch('https://' + domain + '/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: verifier,
        }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Token exchange gagal: ' + res.status);
          return res.json();
        })
        .then(function (tokenResponse) {
          var idToken = tokenResponse.id_token;
          var claims = decodeJwtPayload(idToken);
          var ageClaims = claims['http://ageverification.criipto.com'] || {};
          var isOverAge = ageClaims['is_over_' + minAge];

          if (isOverAge === true) {
            return fetch(verifyUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id_token: idToken,
                shop: shop,
                domain: domain,
                client_id: clientId,
                country: country,
                ui_language: uiLanguage,
                min_age: minAge,
                customer_id: customer.loggedIn ? customer.id : null,
                page_url: window.location.href,
              }),
            })
              .then(function (res) {
                if (!res.ok) throw new Error('Backend verification gagal: ' + res.status);
                return res.json();
              })
              .then(function (verification) {
                if (!verification.verified || !verification.signature) {
                  throw new Error('Backend verification ditolak');
                }

                sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                  verified: true,
                  signature: verification.signature,
                  expires_at: verification.expires_at,
                }));
                return writeCartProof(verification).then(function () {
                  setState('verified');
                  if (pendingCheckoutUrl) {
                    setTimeout(continueCheckout, 900);
                  } else {
                    setTimeout(completeGate, 1500);
                  }
                });
              });
          } else if (isOverAge === false) {
            setState('rejected');
          } else {
            console.log('[Idura Age Verification] claims:', claims);
            setState('error');
          }
        })
        .catch(function (error) {
          console.error('[Idura Age Verification] error:', error);
          setState('error');
        })
        .finally(function () {
          sessionStorage.removeItem(VERIFIER_KEY);
          sessionStorage.removeItem(STATE_KEY);
          cleanUrl();
        });
    } else if (urlParams.get('error')) {
      openGate();
      console.error('[Idura Age Verification]', urlParams.get('error'), urlParams.get('error_description'));
      setState('error');
      cleanUrl();
    } else {
      if (hasValidCustomerProof()) {
        syncCustomerProofToCart()
          .catch(function (error) {
            console.warn('[Idura Age Verification] Customer proof sync gagal.', error);
          })
          .finally(completeGate);
      } else if (hasValidSessionProof()) {
        writeCartProof(readStoredProof())
          .catch(function (error) {
            console.warn('[Idura Age Verification] Cart proof sync gagal.', error);
          })
          .finally(completeGate);
      } else {
        clearCartProof()
          .catch(function (error) {
            console.warn('[Idura Age Verification] Cart proof cleanup gagal.', error);
          });
      }
    }
  });
})();

/**
 * DEPRECATED safety-net DOM redactor.
 *
 * Primary masking now lives in `frontend/src/utils/demo.ts` (run dev with
 * `VITE_DEMO_MODE=true`). This script is kept only so existing callers
 * (`take-screenshots.mjs`, `record-demo.mjs`) continue to work; the rule
 * tables are intentionally empty and should NOT be re-populated. If a leak
 * appears, fix it at the hook level in `demo.ts`, not here.
 */

const PROVIDER_MAP = [];
const URL_PATTERNS = [];
const KEY_PATTERN = ['__never_match__\\b\\b\\b__\\b__nope__', ''];

// ---- Browser-side redaction logic (serialized as string for injection) ----

/**
 * Returns a self-contained function body string that, when executed in the
 * browser, defines buildRules() and redactDOM() and runs an initial sweep.
 * Accepts providerMap, urlPatterns, keyPattern as closure variables.
 */
function getRedactFnBody() {
  // This string is evaluated inside the browser — no access to Node scope.
  return `
    function buildRules(providerMap, urlPatterns, keyPattern) {
      var rules = [];
      for (var i = 0; i < providerMap.length; i++) {
        var escaped = providerMap[i][0].replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
        rules.push([new RegExp(escaped, 'gi'), providerMap[i][1]]);
      }
      for (var j = 0; j < urlPatterns.length; j++) {
        rules.push([new RegExp(urlPatterns[j][0], 'g'), urlPatterns[j][1]]);
      }
      rules.push([new RegExp(keyPattern[0], 'g'), keyPattern[1]]);
      return rules;
    }

    function applyRules(rules, text) {
      var out = text;
      for (var k = 0; k < rules.length; k++) {
        rules[k][0].lastIndex = 0;
        out = out.replace(rules[k][0], rules[k][1]);
      }
      return out;
    }

    function redactDOM(rules) {
      if (!document.body) return;
      // Text nodes
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (var i = 0; i < nodes.length; i++) {
        var r = applyRules(rules, nodes[i].textContent);
        if (r !== nodes[i].textContent) nodes[i].textContent = r;
      }
      // Input values
      var inputs = document.querySelectorAll('input, textarea');
      for (var j = 0; j < inputs.length; j++) {
        var rv = applyRules(rules, inputs[j].value);
        if (rv !== inputs[j].value) inputs[j].value = rv;
      }
      // Attributes
      var attrs = ['placeholder', 'title', 'aria-label', 'data-tooltip'];
      for (var a = 0; a < attrs.length; a++) {
        var els = document.querySelectorAll('[' + attrs[a] + ']');
        for (var e = 0; e < els.length; e++) {
          var val = els[e].getAttribute(attrs[a]);
          var ra = applyRules(rules, val);
          if (ra !== val) els[e].setAttribute(attrs[a], ra);
        }
      }
    }
  `;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * One-shot DOM redaction. Call after page load, before screenshot.
 */
export async function redactPage(page) {
  await page.evaluate(
    (providerMap, urlPatterns, keyPattern) => {
      function buildRules(pm, up, kp) {
        const rules = [];
        for (const [name, repl] of pm) {
          rules.push([new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), repl]);
        }
        for (const [src, repl] of up) {
          rules.push([new RegExp(src, 'g'), repl]);
        }
        rules.push([new RegExp(kp[0], 'g'), kp[1]]);
        return rules;
      }

      function applyRules(rules, text) {
        let out = text;
        for (const [re, repl] of rules) {
          re.lastIndex = 0;
          out = out.replace(re, repl);
        }
        return out;
      }

      function redactDOM(rules) {
        if (!document.body) return;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
          const r = applyRules(rules, node.textContent);
          if (r !== node.textContent) node.textContent = r;
        }
        for (const el of document.querySelectorAll('input, textarea')) {
          const r = applyRules(rules, el.value);
          if (r !== el.value) el.value = r;
        }
        for (const attr of ['placeholder', 'title', 'aria-label', 'data-tooltip']) {
          for (const el of document.querySelectorAll(`[${attr}]`)) {
            const val = el.getAttribute(attr);
            const r = applyRules(rules, val);
            if (r !== val) el.setAttribute(attr, r);
          }
        }
      }

      const rules = buildRules(providerMap, urlPatterns, keyPattern);
      redactDOM(rules);
    },
    PROVIDER_MAP,
    URL_PATTERNS,
    KEY_PATTERN,
  );
}

/**
 * Install a persistent MutationObserver that continuously redacts the DOM
 * as React re-renders. Injected via evaluateOnNewDocument so it survives
 * page navigations. Call once after creating the page, before any goto().
 */
export async function installRedactObserver(page) {
  await page.evaluateOnNewDocument(
    (providerMap, urlPatterns, keyPattern) => {
      function buildRules(pm, up, kp) {
        const rules = [];
        for (const [name, repl] of pm) {
          rules.push([new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), repl]);
        }
        for (const [src, repl] of up) {
          rules.push([new RegExp(src, 'g'), repl]);
        }
        rules.push([new RegExp(kp[0], 'g'), kp[1]]);
        return rules;
      }

      function applyRules(rules, text) {
        let out = text;
        for (const [re, repl] of rules) {
          re.lastIndex = 0;
          out = out.replace(re, repl);
        }
        return out;
      }

      function redactDOM(rules) {
        if (!document.body) return;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
          const r = applyRules(rules, node.textContent);
          if (r !== node.textContent) node.textContent = r;
        }
        for (const el of document.querySelectorAll('input, textarea')) {
          const r = applyRules(rules, el.value);
          if (r !== el.value) el.value = r;
        }
        for (const attr of ['placeholder', 'title', 'aria-label', 'data-tooltip']) {
          for (const el of document.querySelectorAll(`[${attr}]`)) {
            const val = el.getAttribute(attr);
            const r = applyRules(rules, val);
            if (r !== val) el.setAttribute(attr, r);
          }
        }
      }

      const rules = buildRules(providerMap, urlPatterns, keyPattern);

      // Boot: initial sweep + install observer
      function boot() {
        if (!document.body) {
          requestAnimationFrame(boot);
          return;
        }
        redactDOM(rules);

        let pending = false;
        const observer = new MutationObserver(() => {
          if (pending) return;
          pending = true;
          requestAnimationFrame(() => {
            pending = false;
            redactDOM(rules);
          });
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }

      if (document.body) boot();
      else document.addEventListener('DOMContentLoaded', boot);
    },
    PROVIDER_MAP,
    URL_PATTERNS,
    KEY_PATTERN,
  );
}

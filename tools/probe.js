/* Probe headless GENÉRICO — instancia o componente fora do navegador com um
 * shim mínimo de DOM. Não conhece as regras deste card/elemento: só garante
 * que o arquivo carrega, registra o custom element, aceita uma config mínima
 * e oferece editor. É o piso, não o teto — assim que houver comportamento que
 * dói perder (cor por estado, geometria, otimismo do toque), acrescente
 * verificações específicas aqui. Ver IA/lib/mw-devops/README.md.
 *
 * Roda no CI e antes de qualquer PR:  node tools/probe.js
 *
 * GERADO por IA/tools/mw-devops.sh na primeira aplicação; a partir daí é
 * SEU — o script nunca sobrescreve um probe existente.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const mkStyle = () => {
  const s = { _p: {} };
  s.setProperty = (k, v) => { s._p[k] = v; s[k] = v; };
  s.removeProperty = (k) => { delete s._p[k]; delete s[k]; };
  return s;
};

class Node {
  constructor(tag) {
    this.tagName = String(tag || "div").toUpperCase();
    this.style = mkStyle();
    this.children = [];
    this.dataset = {};
    this._attrs = {};
    this._listeners = {};
  }
  appendChild(n) { this.children.push(n); return n; }
  append(...n) { n.forEach((x) => this.children.push(x)); }
  removeChild(n) { this.children = this.children.filter((c) => c !== n); }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
  removeEventListener() {}
  dispatchEvent() { return true; }
  emit(t, ev) { (this._listeners[t] || []).forEach((f) => f(ev)); }
  querySelector() { return new Node("div"); }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { width: 100, height: 100, top: 0, left: 0 }; }
  attachInternals() { return {}; }
}

global.Node = Node;
global.HTMLElement = class extends Node {
  attachShadow() {
    this.shadowRoot = new Node("shadow-root");
    this.shadowRoot.adoptedStyleSheets = [];
    this.shadowRoot.innerHTML = "";
    return this.shadowRoot;
  }
};
const reg = {};
global.customElements = {
  define: (n, c) => { reg[n] = c; },
  get: (n) => reg[n],
  whenDefined: () => Promise.resolve(),
};
global.document = {
  createElement: (t) => new Node(t),
  createElementNS: (_ns, t) => new Node(t),
  head: new Node("head"),
  body: new Node("body"),
};
global.window = { customElements: global.customElements, matchMedia: () => ({ matches: false, addListener() {}, addEventListener() {} }) };
global.CustomEvent = class { constructor(t, d) { this.type = t; Object.assign(this, d); } };
global.Event = global.CustomEvent;
global.CSSStyleSheet = class { replaceSync(css) { this.css = css; } };
global.requestAnimationFrame = (f) => setTimeout(f, 0);
global.cancelAnimationFrame = clearTimeout;
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
console.info = () => {};

const root = path.join(__dirname, "..");
const asset = require(path.join(root, "hacs.json")).filename;
const src = fs.readFileSync(path.join(root, "dist", asset), "utf8");

let fails = 0;
const check = (label, cond, extra = "") => {
  if (cond) { console.log(`  ok   ${label}`); return true; }
  fails += 1;
  console.log(`  FAIL ${label}${extra ? " — " + extra : ""}`);
  return false;
};

console.log(`carga (${asset}):`);
let loaded = true;
try { eval(src); } catch (e) { loaded = false; console.log(`  FAIL o arquivo não carrega — ${e.message}`); fails += 1; }

if (loaded) {
  const names = Object.keys(reg);
  check("registra pelo menos um custom element", names.length > 0, names.join(", "));

  const main = names.filter((n) => !n.endsWith("-editor"))[0];
  const editor = names.filter((n) => n.endsWith("-editor"))[0];

  if (main) {
    console.log(`componente (${main}):`);
    let inst = null;
    try { inst = new reg[main](); } catch (e) { check("instancia", false, e.message); }
    if (inst) {
      check("instancia sem explodir", true);
      check("tem setConfig", typeof inst.setConfig === "function");
      check("recusa config vazia", (() => {
        try { inst.setConfig({}); return false; } catch (_) { return true; }
      })(), "setConfig({}) deveria lançar");
      check("oferece editor visual",
        typeof reg[main].getConfigElement === "function",
        "static getConfigElement() ausente");
    }
  }

  if (editor) {
    console.log(`editor (${editor}):`);
    try {
      const ed = new reg[editor]();
      check("editor instancia sem explodir", true);
      check("editor tem setConfig", typeof ed.setConfig === "function");
    } catch (e) { check("editor instancia", false, e.message); }
  } else {
    check("registra um *-editor", false, "sem editor o card não é configurável pela tela");
  }
}

console.log("versão:");
check("banner/const de versão presente",
  /(%c\s*v?\d+\.\d+\.\d+|VERSION\s*=\s*["']\d+\.\d+\.\d+["'])/.test(src),
  "o auto-release precisa achar a versão para sincronizar");

console.log(fails ? `\n${fails} verificação(ões) falharam` : "\ntudo ok");
process.exit(fails ? 1 : 0);

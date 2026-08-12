/* mw-ha-led-line-card — custom:mw-led-line-card
 * A fita LED como CARD: a serpentina desenhada de verdade, com o brilho da
 * luz, mais os comandos (liga, brilho, cor e cenas) na mesma peça.
 *
 * Irmão de tela do mw-led-line-element (que vive no picture-elements):
 * o mesmo motor de cor (rgb/rgbw/hs/kelvin), o mesmo mapa de efeito → animação
 * e as mesmas regras de desempenho.
 *
 * O que é dele:
 *  · a fita é um traço SVG segmentado — serpentina, linha, onda ou pontos
 *    próprios — que acende com a cor real da lâmpada;
 *  · cada CENA (effect_list) ganha uma paleta: por palavra-chave do nome
 *    ("Iceland blue" → azuis de gelo, "Fireworks" → festa) e, quando o nome
 *    não diz nada, por hash estável do próprio nome. A fita se pinta com essa
 *    paleta em degradê enquanto a cena estiver ativa;
 *  · brilho em slider próprio, cores em pastilhas, brancos em Kelvin.
 *
 * JS puro, arquivo único, sem build.
 * Repo: https://github.com/visaodeempresa/mw-ha-led-line-card
 */
(() => {
  "use strict";

  const VERSION = "0.1.1";
  const CARD = "mw-led-line-card";

  const DEFAULTS = {
    entity: "",
    name: "",
    icon: "",

    // --- desenho da fita ---
    shape: "serpentine",      // serpentine · line · wave · custom
    rows: 4,                  // voltas da serpentina
    points: null,             // shape: custom — "10 20, 90 20, 90 60"
    pixels: 30,               // LEDs desenhados (0 = fita contínua)
    thickness: 14,            // espessura em px
    strip_height: 150,        // altura da área da fita, em px
    round: true,              // pontas arredondadas

    // --- cor ---
    use_light_color: true,
    color_on: "",             // cor fixa (fita RGB de cor única ou branca)
    color_fallback: "255, 200, 120",
    color_off: "rgba(255, 255, 255, 0.10)",
    color_unavailable: "rgba(255, 60, 60, 0.75)",
    scene_gradient: true,     // pintar a fita com a paleta da cena ativa

    // --- brilho da fita ---
    glow: true,
    glow_scale: 1,
    glow_opacity: 1,
    dim_by_brightness: true,  // a fita apaga junto com o brightness

    // --- efeitos ---
    animation: "auto",
    animation_speed: 1,
    animation_idle: "none",
    animation_other: "breathe",
    effect_map: null,
    spark_color: "rgba(255, 255, 255, 0.92)",

    // --- comandos ---
    show_header: true,
    show_state: true,
    show_power: true,
    show_brightness: true,
    show_colors: true,
    show_effects: true,
    show_strip: true,
    collapsed: false,         // começa só com a fita e o cabeçalho
    default_tab: "color",     // aba aberta ao carregar: color · scene
    effects_max: 80,
    color_presets: null,      // ["#ff3b30", …]
    kelvin_presets: null,     // [2200, 2700, 4000, 6500]
    effect_palettes: null,    // { "Minha cena": ["#f0f", "#0ff"] }
    tap_action: "toggle",     // toque na fita
    hold_action: "more-info",
    haptic: true,
  };

  const SWATCHES = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be",
    "#30b0c7", "#0a84ff", "#5856d6", "#af52de", "#ff2d55"];
  const KELVINS = [2200, 2700, 3500, 4500, 6500];

  /* ------------------------------------------------------------ cores */
  const toRgb = (v) => {
    if (Array.isArray(v)) return v.slice(0, 3).map(Number);
    const s = String(v || "").trim();
    let m = s.match(/^rgba?\(([^)]+)\)$/i) || s.match(/^([\d.\s,]+)$/);
    if (m) {
      const p = m[1].split(",").map((x) => parseFloat(x.trim()));
      if (p.length >= 3 && p.every((n) => !isNaN(n))) return p.slice(0, 3);
    }
    m = s.match(/^#([0-9a-fA-F]{3,8})$/);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split("").map((x) => x + x).join("");
      const n = parseInt(h.slice(0, 6), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return null;
  };
  const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
  const rgbs = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

  const kelvinRgb = (k) => {
    const t = Math.max(1000, Math.min(12000, Number(k) || 2700)) / 100;
    const cl = (n) => Math.max(0, Math.min(255, Math.round(n)));
    const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
    const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * Math.pow(t - 60, -0.0755);
    const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
    return [cl(r), cl(g), cl(b)];
  };

  const hsRgb = (h, s) => {
    const S = (Number(s) || 0) / 100, H = ((Number(h) || 0) % 360) / 60;
    const c = S, x = c * (1 - Math.abs((H % 2) - 1));
    const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(H) % 6];
    const m = 1 - c;
    return t.map((v) => Math.round((v + m) * 255));
  };

  const lightRgb = (a) => {
    if (!a) return null;
    if (Array.isArray(a.rgb_color)) return a.rgb_color.slice(0, 3).map(Number);
    const w = a.rgbww_color || a.rgbw_color;
    if (Array.isArray(w)) {
      const c = w.slice(0, 3).map(Number);
      if (c.some((n) => n > 0)) return c;
      return kelvinRgb(a.color_temp_kelvin || 2700);
    }
    if (Array.isArray(a.hs_color)) return hsRgb(a.hs_color[0], a.hs_color[1]);
    if (a.color_temp_kelvin) return kelvinRgb(a.color_temp_kelvin);
    if (a.color_temp) return kelvinRgb(1e6 / Number(a.color_temp));
    return null;
  };

  const hslRgb = (h, s, l) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  };

  /* --------------------------------------------------- paletas de cena */
  // O HA só entrega o NOME do efeito — nunca as cores. Então a cor sai do
  // nome: primeiro por palavra-chave, senão por hash estável (a mesma cena
  // tem sempre a mesma paleta, em qualquer tela e em qualquer dia).
  const PALETTES = [
    [/iceland|glacier|ice|frost|arctic|gelo|geleira/i, ["#7fe3ff", "#3fb2ff", "#1f6dff", "#a6f0ff", "#4fd8ff"]],
    [/snow|winter|hut|neve|inverno/i, ["#e8fbff", "#b5ecff", "#7fd8ff", "#d8f6ff", "#9fe4ff"]],
    // as regras específicas vêm antes das genéricas: "Fireworks at sea" é
    // festa, não oceano — quem casar primeiro leva
    [/firework|party|disco|carnaval|festa|club|fogos/i, ["#ff2d95", "#ffd200", "#00e5ff", "#7c4dff", "#ff5252"]],
    [/ocean|sea|water|aqua|marin|mar|agua|água/i, ["#00d5c8", "#0a9bd6", "#1de9b6", "#0575e6", "#39f2e0"]],
    [/cloud|sky|mist|fog|nuvem|c[eé]u|neblina/i, ["#cfd9df", "#a8c0d6", "#eef4f8", "#8fb0c9", "#dbe6ee"]],
    [/fire|flame|candle|lava|fogo|vela|chama/i, ["#ff9d2f", "#ff5f1f", "#ffd166", "#ff3d00", "#ffb347"]],
    [/sunset|dusk|dawn|sunrise|p[oô]r do sol|amanhecer|entardecer/i, ["#ff9a6b", "#ff5f7e", "#ffd08a", "#c86dd7", "#ff7eb3"]],
    [/forest|jungle|leaf|grass|floresta|selva|folha|verde/i, ["#38ef7d", "#11998e", "#a8e063", "#0ba360", "#7fffd4"]],
    [/rainbow|colorloop|spectrum|arco.?[ií]ris|prisma/i, ["#ff004d", "#ff8a00", "#ffe600", "#00e676", "#00b0ff", "#7c4dff", "#ff00c8"]],
    [/night|sleep|moon|noite|dormir|lua|madrugada/i, ["#2b3a67", "#4a5fc1", "#8ea7ff", "#1b2450", "#6c7ae0"]],
    [/romant|love|rose|amor|namor|paix/i, ["#ff5f9e", "#ff9ecd", "#e0218a", "#ffc2e0", "#c2185b"]],
    [/gold|amber|warm|quente|dourado|[aâ]mbar/i, ["#ffcc80", "#ffa726", "#ffe0b2", "#ff8f00", "#ffd54f"]],
    [/read|work|study|focus|leitura|trabalho|estudo|foco/i, ["#fff3d6", "#ffe8b0", "#fffaf0", "#ffedc2"]],
    [/movie|cinema|tv|filme|s[eé]rie/i, ["#3a1c71", "#d76d77", "#ffaf7b", "#2b1055", "#7597de"]],
    [/spring|flower|bloom|primavera|flor/i, ["#ffd3e0", "#ffa8c5", "#c9f7a0", "#ffe6a7", "#b8e0ff"]],
    [/autumn|fall|outono|colheita/i, ["#c1440e", "#e08d3c", "#8f3b1b", "#d9a441", "#a94b1b"]],
    [/neon|cyber|game|gamer|synth/i, ["#00fff0", "#ff00e0", "#7b00ff", "#00ff85", "#ff0059"]],
  ];

  const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  };

  // paleta estável a partir do nome: matiz base + leque coerente
  const paletteOf = (name, custom) => {
    const n = String(name || "");
    if (custom && custom[n]) {
      const p = (Array.isArray(custom[n]) ? custom[n] : [custom[n]]).map(toRgb).filter(Boolean);
      if (p.length) return p;
    }
    const h = hash(n);
    const hit = PALETTES.find(([re]) => re.test(n));
    if (hit) {
      // duas cenas da mesma família ("Iceland blue" e "Glacier express")
      // giram a paleta em posições diferentes — parentes, não gêmeas
      const p = hit[1].map(toRgb);
      const k = h % p.length;
      return p.slice(k).concat(p.slice(0, k));
    }
    const base = h % 360;
    const spread = 18 + (h >> 9) % 70;         // cena monocromática ou variada
    const sat = 0.62 + ((h >> 4) % 30) / 100;
    return [-1, -0.5, 0, 0.5, 1].map((k, i) =>
      hslRgb((base + k * spread + 360) % 360, sat, 0.42 + (i % 2) * 0.16));
  };

  // cor da paleta numa posição 0..1 (degradê contínuo)
  const sample = (pal, t) => {
    if (!pal.length) return [255, 255, 255];
    if (pal.length === 1) return pal[0];
    const x = Math.max(0, Math.min(0.9999, t)) * (pal.length - 1);
    const i = Math.floor(x), f = x - i;
    const a = pal[i], b = pal[i + 1];
    return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f));
  };

  /* --------------------------------------------- efeito → animação */
  const EFFECT_RULES = [
    [/rainbow|arco|colorloop|color.?loop|spectrum|prisma/i, "rainbow"],
    [/comet|meteor|larson/i, "comet"],
    [/scan|bounce|ping.?pong|vaiv/i, "scan"],
    [/chase|run|marquee|theater|sweep|corrid|persegu|flow|stream/i, "chase"],
    [/twinkle|sparkle|glitter|star|snow|estrel|cintil|firework|fogos/i, "twinkle"],
    [/strobe|flash|blink|police|pisca/i, "strobe"],
    [/fire|flame|candle|lava|vela|fogo/i, "fire"],
    [/flicker|tremul/i, "flicker"],
    [/wave|ocean|water|sea|aurora|onda|cloud|nuvem/i, "wave"],
    [/music|sound|rhythm|beat|pulse|batid|pulso/i, "pulse"],
    [/breath|fade|smooth|gradual|respir|suave|night|noite/i, "breathe"],
  ];
  const NO_EFFECT = /^(none|off|solid|static|nenhum|desligad|fixo)/i;
  const ANIM_DUR = {
    breathe: 3.4, pulse: 1.2, flicker: 0.9, fire: 1.4, strobe: 0.7,
    rainbow: 6, chase: 2.2, comet: 2.6, scan: 3, twinkle: 1.6, wave: 4,
  };

  /* ------------------------------------------------------- geometria */
  const parsePoints = (v) => {
    if (!v) return [];
    if (typeof v === "string") {
      const n = v.match(/-?\d+(?:\.\d+)?/g) || [];
      const out = [];
      for (let i = 0; i + 1 < n.length; i += 2) out.push([+n[i], +n[i + 1]]);
      return out;
    }
    if (!Array.isArray(v)) return [];
    if (v.every((p) => typeof p === "number")) return parsePoints(v.join(" "));
    return v.map((p) => Array.isArray(p) ? [+p[0], +p[1]]
      : (p && typeof p === "object") ? [+p.x, +p.y]
        : parsePoints(String(p))[0] || [NaN, NaN])
      .filter((p) => !isNaN(p[0]) && !isNaN(p[1]));
  };

  // a serpentina do app: linhas retas com meia-volta nas pontas
  const serpentine = (rows) => {
    const R = Math.max(1, Math.min(12, Math.round(rows) || 4));
    const gap = 14, pad = 9, L = 9, Rt = 91;
    const H = pad * 2 + (R - 1) * gap;
    let y = pad, d = `M ${L} ${y}`;
    for (let i = 0; i < R; i++) {
      const right = i % 2 === 0;
      const xe = right ? Rt : L;
      d += ` L ${xe} ${y}`;
      if (i < R - 1) {
        y += gap;
        d += ` A ${gap / 2} ${gap / 2} 0 0 ${right ? 1 : 0} ${xe} ${y}`;
      }
    }
    return { d, H };
  };

  const wave = () => {
    let d = "M 6 30";
    for (let x = 6; x <= 94; x += 4) {
      const y = 30 - Math.sin((x - 6) / 88 * Math.PI * 3) * 18;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return { d, H: 60 };
  };

  const fire = (node, type, detail) => {
    node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  };

  /* ------------------------------------------------------------- CSS */
  const CSS = `
:host{display:block;--mw-pad:14px;}
ha-card{padding:var(--mw-pad);display:flex;flex-direction:column;gap:12px;
  overflow:hidden;position:relative;}
ha-card::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(120% 90% at 50% 0%,var(--mw-wash,transparent),transparent 70%);
  transition:background .4s ease;}
.head{display:flex;align-items:center;gap:12px;position:relative;}
.glyph{width:38px;height:38px;flex:0 0 auto;border-radius:12px;display:grid;
  place-items:center;background:var(--mw-chip,rgba(255,255,255,.06));
  color:var(--mw-ink,var(--secondary-text-color));
  box-shadow:var(--mw-chip-glow,none);transition:background .3s,box-shadow .3s,color .3s;}
.txt{flex:1 1 auto;min-width:0;}
.name{font-size:15px;font-weight:600;color:var(--primary-text-color);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sub{font-size:12px;color:var(--secondary-text-color);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pw{flex:0 0 auto;width:40px;height:40px;border:0;border-radius:50%;cursor:pointer;
  display:grid;place-items:center;background:var(--mw-chip,rgba(255,255,255,.06));
  color:var(--mw-ink,var(--secondary-text-color));
  box-shadow:var(--mw-chip-glow,none);transition:background .3s,box-shadow .3s,color .3s;}
.pw:active{transform:scale(.94);}

/* ---- a fita ---- */
.stage{position:relative;height:var(--mw-stage,150px);cursor:pointer;
  border-radius:14px;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}
svg{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible;}
path{fill:none;vector-effect:non-scaling-stroke;stroke-linejoin:round;
  stroke-linecap:var(--mw-cap,round);}
.bed{stroke:rgba(255,255,255,.07);stroke-width:var(--mw-w,14px);
  stroke-dasharray:var(--mw-dash,none);}
.core{stroke:var(--mw-stroke,transparent);stroke-width:var(--mw-w,14px);
  stroke-dasharray:var(--mw-dash,none);filter:var(--mw-glow,none);
  opacity:var(--mw-lit,1);transition:stroke .3s ease,opacity .3s ease;}
.spark{stroke:var(--mw-spark,transparent);stroke-width:calc(var(--mw-w,14px) * .45);
  stroke-dasharray:10 90;opacity:0;}
.stage:active .fx{transform:scale(.985);}
.fx{transform-origin:50% 50%;transition:transform .12s ease;}

/* ---- brilho ---- */
.bri{display:flex;align-items:center;gap:10px;}
.track{position:relative;flex:1 1 auto;height:38px;border-radius:12px;cursor:pointer;
  background:rgba(255,255,255,.06);overflow:hidden;touch-action:none;}
.fill{position:absolute;inset:0 auto 0 0;width:var(--mw-bri,0%);
  background:var(--mw-fill,rgba(255,255,255,.25));
  transition:width .25s cubic-bezier(.22,1,.36,1),background .3s ease;}
.track[dragging] .fill{transition:background .3s ease;}
.val{position:absolute;inset:0;display:flex;align-items:center;
  padding:0 12px;font-size:12px;font-weight:600;letter-spacing:.02em;
  color:var(--primary-text-color);pointer-events:none;
  text-shadow:0 1px 2px rgba(0,0,0,.35);}

/* ---- abas e pastilhas ---- */
.tabs{display:flex;gap:6px;}
.tab{flex:0 0 auto;border:0;cursor:pointer;padding:6px 12px;border-radius:999px;
  font:600 12px/1 inherit;color:var(--secondary-text-color);
  background:rgba(255,255,255,.06);}
.tab[on]{color:var(--mw-ink,var(--primary-text-color));
  background:var(--mw-chip,rgba(255,255,255,.14));}
.pane{display:none;}
.pane[on]{display:block;}
.swatches{display:flex;flex-wrap:wrap;gap:8px;}
.sw{width:32px;height:32px;border-radius:10px;border:0;cursor:pointer;padding:0;
  background:var(--c);box-shadow:0 0 0 1px rgba(0,0,0,.25) inset;
  transition:transform .12s ease,box-shadow .2s ease;}
.sw:active{transform:scale(.9);}
.sw[on]{box-shadow:0 0 0 2px var(--card-background-color),0 0 0 4px var(--c),
  0 0 12px 2px var(--c);}
.scenes{display:flex;flex-direction:column;gap:6px;
  max-height:var(--mw-scenes,208px);overflow-y:auto;
  scrollbar-width:thin;-webkit-overflow-scrolling:touch;}
.scene{display:flex;flex-direction:column;gap:6px;padding:9px 12px;border:0;
  border-radius:12px;cursor:pointer;text-align:left;
  background:rgba(255,255,255,.05);transition:background .2s ease;}
.scene:hover{background:rgba(255,255,255,.09);}
.scene[on]{background:var(--mw-chip,rgba(255,255,255,.12));
  box-shadow:inset 0 0 0 1.5px var(--mw-line,rgba(255,255,255,.35));}
.scene .lbl{font:600 12px/1.2 inherit;color:var(--primary-text-color);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dots{display:flex;align-items:center;gap:3px;height:12px;}
.dots i{display:block;border-radius:50%;background:var(--c);}
.empty{font-size:12px;color:var(--secondary-text-color);padding:2px;}

/* luz fora do ar: tudo esmaecido e sem resposta ao toque */
:host([mw-bad]) .stage,:host([mw-bad]) .bri,:host([mw-bad]) .swatches,
:host([mw-bad]) .scenes,:host([mw-bad]) .pw{opacity:.6;}
:host([mw-bad]) .stage,:host([mw-bad]) .track,:host([mw-bad]) .sw,
:host([mw-bad]) .scene,:host([mw-bad]) .pw{pointer-events:none;}

/* ---- animações (iguais às do elemento de planta) ---- */
:host([anim="breathe"]) .core{animation:mw-breathe var(--mw-dur,3.4s) ease-in-out infinite;}
:host([anim="wave"]) .core{animation:mw-breathe var(--mw-dur,4s) cubic-bezier(.4,0,.6,1) infinite;}
:host([anim="pulse"]) .core{animation:mw-pulse var(--mw-dur,1.2s) ease-in-out infinite;}
:host([anim="flicker"]) .core{animation:mw-flicker var(--mw-dur,.9s) steps(1,end) infinite;}
:host([anim="fire"]) .core{animation:mw-fire var(--mw-dur,1.4s) steps(1,end) infinite;}
:host([anim="strobe"]) .core{animation:mw-strobe var(--mw-dur,.7s) steps(1,end) infinite;}
:host([anim="rainbow"]) .fx{animation:mw-rainbow var(--mw-dur,6s) linear infinite;}
:host([anim="chase"]) .spark,:host([anim="comet"]) .spark,
:host([anim="twinkle"]) .spark{opacity:1;animation:mw-run var(--mw-dur,2.2s) linear infinite;}
:host([anim="scan"]) .spark{opacity:1;
  animation:mw-run var(--mw-dur,3s) ease-in-out infinite alternate;}
:host([anim="comet"]) .spark{stroke-dasharray:24 76;}
:host([anim="twinkle"]) .spark{stroke-dasharray:1.2 5;}
@keyframes mw-breathe{0%,100%{opacity:var(--mw-lit,1)}
  50%{opacity:calc(var(--mw-lit,1) * .42)}}
@keyframes mw-pulse{0%,100%{opacity:var(--mw-lit,1)}
  45%{opacity:calc(var(--mw-lit,1) * .65)}}
@keyframes mw-flicker{0%{opacity:var(--mw-lit,1)}12%{opacity:calc(var(--mw-lit,1)*.55)}
  24%{opacity:var(--mw-lit,1)}38%{opacity:calc(var(--mw-lit,1)*.32)}
  52%{opacity:var(--mw-lit,1)}66%{opacity:calc(var(--mw-lit,1)*.7)}
  80%{opacity:var(--mw-lit,1)}92%{opacity:calc(var(--mw-lit,1)*.45)}}
@keyframes mw-fire{0%{opacity:var(--mw-lit,1);filter:hue-rotate(0)}
  20%{opacity:calc(var(--mw-lit,1)*.72);filter:hue-rotate(-8deg)}
  40%{opacity:var(--mw-lit,1);filter:hue-rotate(6deg)}
  60%{opacity:calc(var(--mw-lit,1)*.6);filter:hue-rotate(-4deg)}
  80%{opacity:calc(var(--mw-lit,1)*.9);filter:hue-rotate(8deg)}
  100%{opacity:var(--mw-lit,1);filter:hue-rotate(0)}}
@keyframes mw-strobe{0%,45%{opacity:var(--mw-lit,1)}50%,100%{opacity:.06}}
@keyframes mw-rainbow{0%{filter:hue-rotate(0)}100%{filter:hue-rotate(360deg)}}
@keyframes mw-run{0%{stroke-dashoffset:100}100%{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){
  .core,.spark,.fx{animation:none!important;}}`;

  let SHEET;
  const sharedSheet = () => {
    if (SHEET !== undefined) return SHEET;
    try { const s = new CSSStyleSheet(); s.replaceSync(CSS); SHEET = s; }
    catch (e) { SHEET = null; }
    return SHEET;
  };

  /* ------------------------------------------------------------ card */
  class MwLedLineCard extends HTMLElement {
    static getConfigElement() { return document.createElement(CARD + "-editor"); }

    static getStubConfig(hass) {
      const first = hass && Object.keys(hass.states).find((e) => e.startsWith("light."));
      return { type: `custom:${CARD}`, entity: first || "" };
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._props = {};
      this._tab = "color";
    }

    setConfig(config) {
      if (!config || !config.entity) throw new Error("mw-led-line-card: informe 'entity'");
      if (!/^(light|switch|input_boolean)\./.test(config.entity)) {
        throw new Error("mw-led-line-card: 'entity' precisa ser light, switch ou input_boolean");
      }
      this._cfg = { ...DEFAULTS, ...config };
      this._props = {};
      this._st = undefined;
      this._effects = null;
      this._built = false;
      this._tab = (this._cfg.default_tab === "scene" && this._cfg.show_effects)
        || !this._cfg.show_colors ? "scene" : "color";
      this.shadowRoot.innerHTML = "";
      this._update();
    }

    getCardSize() {
      const c = this._cfg || DEFAULTS;
      return 2 + (c.show_strip ? Math.round(c.strip_height / 50) : 0)
        + (c.show_colors || c.show_effects ? 3 : 0);
    }

    getLayoutOptions() {
      const c = this._cfg || DEFAULTS;
      const rows = 2 + (c.show_strip ? Math.ceil(c.strip_height / 56) : 0)
        + (c.show_brightness ? 1 : 0) + (c.show_colors || c.show_effects ? 5 : 0);
      return { grid_rows: rows, grid_columns: 12, grid_min_rows: 3, grid_min_columns: 6 };
    }

    set hass(hass) {
      const first = !this._hass;
      this._hass = hass;
      if (!this._cfg) return;
      const st = hass && hass.states[this._cfg.entity];
      if (!first && st === this._st) return;   // mudou outra entidade: sai em O(1)
      this._st = st;
      this._update();
    }

    get hass() { return this._hass; }

    connectedCallback() { if (this._cfg) this._update(); }

    /* ------------------------------------------------------- serviços */
    _call(service, data) {
      if (!this._hass) return;
      const [dom] = this._cfg.entity.split(".");
      this._hass.callService(dom === "light" ? "light" : dom, service,
        { entity_id: this._cfg.entity, ...data });
      if (this._cfg.haptic) fire(this, "haptic", "light");
    }

    _moreInfo() { fire(this, "hass-more-info", { entityId: this._cfg.entity }); }

    /* ---------------------------------------------------------- build */
    _build() {
      const root = this.shadowRoot;
      const sheet = sharedSheet();
      if (sheet && "adoptedStyleSheets" in root) root.adoptedStyleSheets = [sheet];
      else { const s = document.createElement("style"); s.textContent = CSS; root.appendChild(s); }

      const c = this._cfg;
      const card = document.createElement("ha-card");
      root.appendChild(card);
      this._card = card;

      if (c.show_header) card.appendChild(this._buildHead());
      if (c.show_strip) card.appendChild(this._buildStage());
      if (c.show_brightness && !c.collapsed) card.appendChild(this._buildBri());
      if (!c.collapsed && (c.show_colors || c.show_effects)) card.appendChild(this._buildPanes());

      this._built = true;
    }

    _buildHead() {
      const head = document.createElement("div");
      head.className = "head";
      const glyph = document.createElement("div");
      glyph.className = "glyph";
      this._icon = document.createElement("ha-icon");
      glyph.appendChild(this._icon);
      glyph.addEventListener("click", () => this._moreInfo());
      const txt = document.createElement("div");
      txt.className = "txt";
      this._name = document.createElement("div");
      this._name.className = "name";
      this._sub = document.createElement("div");
      this._sub.className = "sub";
      txt.appendChild(this._name);
      if (this._cfg.show_state) txt.appendChild(this._sub);
      head.appendChild(glyph); head.appendChild(txt);
      if (this._cfg.show_power) {
        const pw = document.createElement("button");
        pw.className = "pw";
        pw.title = "Ligar / desligar";
        const i = document.createElement("ha-icon");
        i.setAttribute("icon", "mdi:power");
        pw.appendChild(i);
        pw.addEventListener("click", () => this._call("toggle", {}));
        head.appendChild(pw);
      }
      return head;
    }

    _buildStage() {
      const c = this._cfg;
      const stage = document.createElement("div");
      stage.className = "stage";
      stage.style.setProperty("--mw-stage", `${c.strip_height}px`);

      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("preserveAspectRatio", "none");

      let shapes = [];
      let H = 60;
      if (c.shape === "custom") {
        const pts = parsePoints(c.points);
        if (pts.length >= 2) {
          shapes = [pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ")];
          H = 100;
        }
      } else if (c.shape === "line") {
        shapes = ["M 6 30 L 94 30"]; H = 60;
      } else if (c.shape === "wave") {
        const w = wave(); shapes = [w.d]; H = w.H;
      }
      if (!shapes.length) { const s = serpentine(c.rows); shapes = [s.d]; H = s.H; }
      svg.setAttribute("viewBox", `0 0 100 ${H}`);

      const defs = document.createElementNS(NS, "defs");
      const grad = document.createElementNS(NS, "linearGradient");
      grad.setAttribute("id", "mwgrad");
      grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0");
      grad.setAttribute("x2", "1"); grad.setAttribute("y2", "0");
      defs.appendChild(grad);
      svg.appendChild(defs);
      this._grad = grad;

      const fx = document.createElementNS(NS, "g");
      fx.setAttribute("class", "fx");
      const mk = (cls) => {
        const p = document.createElementNS(NS, "path");
        p.setAttribute("class", cls);
        p.setAttribute("d", shapes[0]);
        p.setAttribute("pathLength", "100");
        fx.appendChild(p);
        return p;
      };
      mk("bed"); this._core = mk("core"); mk("spark");
      svg.appendChild(fx);
      stage.appendChild(svg);

      // toque na fita: liga/desliga; segurar abre o more-info
      let timer = null, held = false;
      stage.addEventListener("pointerdown", () => {
        held = false;
        timer = setTimeout(() => { held = true; this._act(this._cfg.hold_action); }, 480);
      });
      const end = () => { clearTimeout(timer); if (!held) this._act(this._cfg.tap_action); held = false; };
      stage.addEventListener("pointerup", end);
      stage.addEventListener("pointercancel", () => { clearTimeout(timer); held = false; });
      stage.addEventListener("pointerleave", () => { clearTimeout(timer); });
      return stage;
    }

    _act(action) {
      if (action === "none") return;
      if (action === "more-info") return this._moreInfo();
      this._call("toggle", {});
    }

    _buildBri() {
      const wrap = document.createElement("div");
      wrap.className = "bri";
      const track = document.createElement("div");
      track.className = "track";
      const fill = document.createElement("div");
      fill.className = "fill";
      const val = document.createElement("div");
      val.className = "val";
      track.appendChild(fill); track.appendChild(val);
      wrap.appendChild(track);
      this._fill = fill; this._val = val; this._track = track;

      const pct = (e) => {
        const r = track.getBoundingClientRect();
        return Math.max(1, Math.min(100, Math.round((e.clientX - r.left) / r.width * 100)));
      };
      const show = (p) => {
        fill.style.width = `${p}%`;
        val.textContent = `${p}%`;
      };
      let dragging = false;
      track.addEventListener("pointerdown", (e) => {
        dragging = true; this._drag = true;
        track.setAttribute("dragging", "");
        track.setPointerCapture(e.pointerId);
        show(pct(e));
      });
      track.addEventListener("pointermove", (e) => { if (dragging) show(pct(e)); });
      const done = (e) => {
        if (!dragging) return;
        dragging = false;
        track.removeAttribute("dragging");
        const p = pct(e);
        show(p);
        this._call("turn_on", { brightness_pct: p });
        // o estado do HA só chega depois; até lá o valor local manda
        setTimeout(() => { this._drag = false; this._update(); }, 900);
      };
      track.addEventListener("pointerup", done);
      track.addEventListener("pointercancel", () => {
        dragging = false; this._drag = false; track.removeAttribute("dragging"); this._update();
      });
      return wrap;
    }

    _buildPanes() {
      const c = this._cfg;
      const box = document.createElement("div");

      const tabs = document.createElement("div");
      tabs.className = "tabs";
      const panes = {};
      const mkTab = (key, label, pane) => {
        const b = document.createElement("button");
        b.className = "tab";
        b.textContent = label;
        b.addEventListener("click", () => { this._tab = key; this._syncTabs(); });
        b.dataset.key = key;
        tabs.appendChild(b);
        panes[key] = pane;
        pane.dataset.key = key;
        return b;
      };

      if (c.show_colors) {
        const p = document.createElement("div");
        p.className = "pane";
        this._sw = document.createElement("div");
        this._sw.className = "swatches";
        p.appendChild(this._sw);
        mkTab("color", "Cores", p);
      }
      if (c.show_effects) {
        const p = document.createElement("div");
        p.className = "pane";
        this._sc = document.createElement("div");
        this._sc.className = "scenes";
        p.appendChild(this._sc);
        mkTab("scene", "Cenas", p);
      }

      this._tabs = tabs;
      this._panes = panes;
      box.appendChild(tabs);
      Object.values(panes).forEach((p) => box.appendChild(p));
      if (Object.keys(panes).length < 2) tabs.style.display = "none";
      return box;
    }

    _syncTabs() {
      if (!this._tabs) return;
      if (!this._panes[this._tab]) this._tab = Object.keys(this._panes)[0];
      this._tabs.querySelectorAll(".tab").forEach((b) => {
        if (b.dataset.key === this._tab) b.setAttribute("on", ""); else b.removeAttribute("on");
      });
      Object.entries(this._panes).forEach(([k, p]) => {
        if (k === this._tab) p.setAttribute("on", ""); else p.removeAttribute("on");
      });
    }

    /* ------------------------------------------------------ pastilhas */
    _fillSwatches(attrs) {
      if (!this._sw || this._swDone) return;
      const c = this._cfg;
      const modes = attrs.supported_color_modes || [];
      const canColor = modes.some((m) => /rgb|hs|xy/.test(m));
      const canTemp = modes.includes("color_temp");
      const list = [];
      if (canColor || !modes.length) {
        (c.color_presets || SWATCHES).forEach((h) => {
          const rgb = toRgb(h);
          if (rgb) list.push({ rgb, kind: "rgb" });
        });
      }
      if (canTemp) (c.kelvin_presets || KELVINS).forEach((k) => list.push({ rgb: kelvinRgb(k), kind: "k", k }));

      list.forEach((it) => {
        const b = document.createElement("button");
        b.className = "sw";
        b.style.setProperty("--c", rgbs(it.rgb));
        b.title = it.kind === "k" ? `${it.k} K` : rgbs(it.rgb);
        b.dataset.key = it.kind === "k" ? `k${it.k}` : it.rgb.join(",");
        b.addEventListener("click", () => {
          if (it.kind === "k") this._call("turn_on", { color_temp_kelvin: it.k });
          else this._call("turn_on", { rgb_color: it.rgb });
        });
        this._sw.appendChild(b);
      });
      if (!list.length) {
        const e = document.createElement("div");
        e.className = "empty";
        e.textContent = "Esta luz não aceita cor.";
        this._sw.appendChild(e);
      }
      this._swDone = true;
    }

    // cada cena vira uma fileira de bolinhas com a paleta do próprio nome
    _fillScenes(attrs) {
      if (!this._sc) return;
      const list = (attrs.effect_list || []).slice(0, this._cfg.effects_max);
      const key = list.join("|");
      if (this._effects === key) return;
      this._effects = key;
      this._sc.innerHTML = "";
      if (!list.length) {
        const e = document.createElement("div");
        e.className = "empty";
        e.textContent = "Esta luz não tem cenas.";
        this._sc.appendChild(e);
        return;
      }
      list.forEach((name) => {
        const pal = paletteOf(name, this._cfg.effect_palettes);
        const b = document.createElement("button");
        b.className = "scene";
        b.dataset.key = name;
        const lbl = document.createElement("div");
        lbl.className = "lbl";
        lbl.textContent = name;
        const dots = document.createElement("div");
        dots.className = "dots";
        const N = 22;
        for (let i = 0; i < N; i++) {
          const d = document.createElement("i");
          const t = i / (N - 1);
          const s = 5 + Math.sin(t * Math.PI) * 4;   // a onda de tamanhos do app
          d.style.width = d.style.height = `${s.toFixed(1)}px`;
          d.style.setProperty("--c", rgbs(sample(pal, t)));
          dots.appendChild(d);
        }
        b.appendChild(lbl); b.appendChild(dots);
        b.addEventListener("click", () => this._call("turn_on", { effect: name }));
        this._sc.appendChild(b);
      });
    }

    _set(prop, val) {
      const v = val === null || val === undefined ? "" : String(val);
      if (this._props[prop] === v) return;
      this._props[prop] = v;
      if (v === "") this.style.removeProperty(prop);
      else this.style.setProperty(prop, v);
    }

    _animOf(attrs, on) {
      const c = this._cfg;
      if (c.animation !== "auto") return c.animation || "none";
      if (!on) return "none";
      const eff = attrs.effect;
      if (!eff || NO_EFFECT.test(String(eff))) return c.animation_idle;
      const map = c.effect_map || {};
      if (map[eff]) return map[eff];
      const hit = EFFECT_RULES.find(([re]) => re.test(String(eff)));
      return hit ? hit[1] : c.animation_other;
    }

    /* --------------------------------------------------------- update */
    _update() {
      const c = this._cfg;
      if (!c || !this._hass) return;
      if (!this._built) { this._build(); this._syncTabs(); }

      const st = this._st;
      const attrs = (st && st.attributes) || {};
      const raw = st && st.state;
      const bad = !st || raw === "unavailable" || raw === "unknown";
      const on = !bad && raw === "on";

      const fb = toRgb(c.color_fallback) || [255, 200, 120];
      const forced = c.color_on ? toRgb(c.color_on) : null;
      const rgb = on ? (forced || (c.use_light_color ? (lightRgb(attrs) || fb) : fb)) : null;

      if (bad) this.setAttribute("mw-bad", ""); else this.removeAttribute("mw-bad");

      const bri = attrs.brightness != null ? Math.round(attrs.brightness / 2.55) : null;
      const lit = bad ? 0.75 : !on ? 1
        : c.dim_by_brightness && bri !== null ? 0.35 + 0.65 * (bri / 100) : 1;

      // ---- cena ativa: a fita usa a paleta da cena, não uma cor só ----
      const eff = on ? attrs.effect : null;
      const pal = (c.scene_gradient && eff && !NO_EFFECT.test(String(eff)))
        ? paletteOf(eff, c.effect_palettes) : null;

      if (this._grad) {
        const want = pal ? pal.map(rgbs).join("|") : "";
        if (this._gradKey !== want) {
          this._gradKey = want;
          this._grad.innerHTML = "";
          if (pal) {
            const NS = "http://www.w3.org/2000/svg";
            pal.forEach((col, i) => {
              const s = document.createElementNS(NS, "stop");
              s.setAttribute("offset", `${(i / (pal.length - 1) * 100).toFixed(1)}%`);
              s.setAttribute("stop-color", rgbs(col));
              this._grad.appendChild(s);
            });
          }
        }
      }

      const stroke = bad ? c.color_unavailable
        : !on ? c.color_off
          : pal ? "url(#mwgrad)" : rgbs(rgb);

      // o halo segue a cor média da cena — degradê não tem "uma" cor
      const glowRgb = pal ? sample(pal, 0.5) : rgb;
      const ga = (a) => Math.max(0, Math.min(1, a * c.glow_opacity * (0.4 + 0.6 * lit)));
      const gp = (px) => `${(px * c.glow_scale).toFixed(1)}px`;
      let glow = "none";
      if (c.glow && on && glowRgb) {
        glow = `drop-shadow(0 0 ${gp(6)} ${rgba(glowRgb, ga(0.85))})`
          + ` drop-shadow(0 0 ${gp(18)} ${rgba(glowRgb, ga(0.5))})`;
      } else if (c.glow && bad) {
        glow = `drop-shadow(0 0 ${gp(5)} rgba(255, 60, 60, 0.28))`;
      }

      const px = Math.max(0, Math.round(c.pixels) || 0);
      const dash = px > 1 ? `${(100 / px * 0.74).toFixed(2)} ${(100 / px * 0.26).toFixed(2)}` : "none";

      this._set("--mw-stroke", stroke);
      this._set("--mw-glow", glow);
      this._set("--mw-w", `${c.thickness}px`);
      this._set("--mw-dash", dash);
      this._set("--mw-lit", lit.toFixed(3));
      this._set("--mw-cap", c.round ? "round" : "butt");
      this._set("--mw-spark", c.spark_color);
      this._set("--mw-stage", `${c.strip_height}px`);

      // o card inteiro respira a cor da luz (fundo, ícone, aba, slider)
      this._set("--mw-ink", on ? "#fff" : "");
      this._set("--mw-chip", on && glowRgb ? rgba(glowRgb, 0.22) : "");
      this._set("--mw-line", on && glowRgb ? rgba(glowRgb, 0.55) : "");
      this._set("--mw-chip-glow", on && glowRgb
        ? `0 0 10px 0 ${rgba(glowRgb, 0.45)}` : "");
      this._set("--mw-wash", on && glowRgb ? rgba(glowRgb, 0.13) : "");
      this._set("--mw-fill", on && glowRgb
        ? `linear-gradient(90deg,${rgba(glowRgb, 0.35)},${rgba(glowRgb, 0.85)})` : "");

      // ---- cabeçalho ----
      if (this._icon) {
        const ic = c.icon || attrs.icon || "mdi:led-strip-variant";
        if (this._icon.getAttribute("icon") !== ic) this._icon.setAttribute("icon", ic);
      }
      if (this._name) {
        const nm = c.name || attrs.friendly_name || c.entity;
        if (this._name.textContent !== nm) this._name.textContent = nm;
      }
      if (this._sub) {
        const sub = bad ? "Indisponível"
          : !on ? "Apagada"
            : [eff && !NO_EFFECT.test(String(eff)) ? eff : null,
               bri !== null ? `${bri}%` : null].filter(Boolean).join(" · ") || "Ligada";
        if (this._sub.textContent !== sub) this._sub.textContent = sub;
      }

      // ---- brilho ----
      if (this._fill && !this._drag) {
        const p = on && bri !== null ? bri : 0;
        this._fill.style.width = `${p}%`;
        this._val.textContent = on ? `${p}%` : "—";
      }

      // ---- pastilhas ----
      if (this._sw) {
        this._fillSwatches(attrs);
        const cur = on && !pal && rgb ? rgb.join(",") : null;
        const ck = on && attrs.color_mode === "color_temp" && attrs.color_temp_kelvin
          ? `k${attrs.color_temp_kelvin}` : null;
        this._sw.querySelectorAll(".sw").forEach((b) => {
          const hit = b.dataset.key === cur || b.dataset.key === ck;
          if (hit) b.setAttribute("on", ""); else b.removeAttribute("on");
        });
      }
      if (this._sc) {
        this._fillScenes(attrs);
        this._sc.querySelectorAll(".scene").forEach((b) => {
          if (on && b.dataset.key === eff) b.setAttribute("on", ""); else b.removeAttribute("on");
        });
      }

      // ---- efeito ----
      const anim = this._animOf(attrs, on);
      const use = anim && anim !== "none" && on ? anim : "none";
      if (this.getAttribute("anim") !== use) this.setAttribute("anim", use);
      const base = ANIM_DUR[use];
      this._set("--mw-dur", base ? `${(base / (c.animation_speed || 1)).toFixed(2)}s` : "");
    }
  }

  /* ---------------------------------------------------------- editor */
  const LABELS = {
    entity: "Entidade", name: "Nome", icon: "Ícone",
    shape: "Desenho da fita", rows: "Voltas da serpentina",
    points: "Pontos (x y, x y)", pixels: "LEDs desenhados (0 = contínua)",
    thickness: "Espessura (px)", strip_height: "Altura da fita (px)",
    round: "Pontas arredondadas",
    use_light_color: "Usar a cor da luz", color_on: "Cor fixa",
    color_fallback: "Cor de reserva", color_off: "Cor apagada",
    color_unavailable: "Cor indisponível", scene_gradient: "Degradê da cena na fita",
    glow: "Halo", glow_scale: "Tamanho do halo", glow_opacity: "Força do halo",
    dim_by_brightness: "Fita obedece o brilho",
    animation: "Efeito", animation_speed: "Velocidade",
    animation_idle: "Sem efeito ativo", animation_other: "Efeito desconhecido",
    effect_map: "Mapa de efeitos", effect_palettes: "Paletas das cenas",
    spark_color: "Cor do brilho corrido",
    show_header: "Cabeçalho", show_state: "Linha de estado", show_power: "Botão liga",
    show_brightness: "Brilho", show_colors: "Cores", show_effects: "Cenas",
    show_strip: "Fita", collapsed: "Só a fita (sem comandos)",
    default_tab: "Aba inicial",
    effects_max: "Máximo de cenas", color_presets: "Cores da paleta",
    kelvin_presets: "Brancos (K)", tap_action: "Toque na fita",
    hold_action: "Toque longo na fita", haptic: "Vibração",
  };

  const ANIM_OPTIONS = [
    { value: "auto", label: "Automático (segue a cena da luz)" },
    { value: "none", label: "Nenhum" },
    { value: "breathe", label: "Respiração" },
    { value: "pulse", label: "Pulso" },
    { value: "wave", label: "Onda" },
    { value: "flicker", label: "Tremulação" },
    { value: "fire", label: "Fogo" },
    { value: "strobe", label: "Estrobo" },
    { value: "rainbow", label: "Arco-íris" },
    { value: "chase", label: "Corrida" },
    { value: "comet", label: "Cometa" },
    { value: "scan", label: "Vaivém" },
    { value: "twinkle", label: "Cintilar" },
  ];
  const IDLE = ANIM_OPTIONS.filter((o) => o.value !== "auto");
  const sel = (opts) => ({ select: { mode: "dropdown", options: opts } });
  const num = (min, max, step) => ({ number: { min, max, step, mode: "box" } });

  const SCHEMA = [
    { name: "entity", required: true, selector: { entity: { domain: ["light", "switch", "input_boolean"] } } },
    {
      type: "grid", name: "", schema: [
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
      ],
    },
    {
      type: "grid", name: "", schema: [
        {
          name: "shape", selector: sel([
            { value: "serpentine", label: "Serpentina" },
            { value: "line", label: "Linha" },
            { value: "wave", label: "Onda" },
            { value: "custom", label: "Pontos próprios" },
          ]),
        },
        { name: "rows", selector: num(1, 12, 1) },
        { name: "pixels", selector: num(0, 120, 1) },
        { name: "thickness", selector: num(2, 40, 1) },
      ],
    },
    { name: "points", selector: { text: {} } },
    {
      type: "grid", name: "", schema: [
        { name: "animation", selector: sel(ANIM_OPTIONS) },
        { name: "animation_speed", selector: num(0.1, 5, 0.1) },
      ],
    },
    {
      type: "grid", name: "", schema: [
        { name: "show_strip", selector: { boolean: {} } },
        { name: "show_header", selector: { boolean: {} } },
        { name: "show_power", selector: { boolean: {} } },
        { name: "show_state", selector: { boolean: {} } },
        { name: "show_brightness", selector: { boolean: {} } },
        { name: "show_colors", selector: { boolean: {} } },
        { name: "show_effects", selector: { boolean: {} } },
        { name: "collapsed", selector: { boolean: {} } },
      ],
    },
    {
      name: "default_tab", selector: sel([
        { value: "color", label: "Abrir em Cores" },
        { value: "scene", label: "Abrir em Cenas" },
      ]),
    },
    {
      type: "expandable", name: "", title: "Cor e brilho", schema: [
        {
          type: "grid", name: "", schema: [
            { name: "use_light_color", selector: { boolean: {} } },
            { name: "scene_gradient", selector: { boolean: {} } },
            { name: "glow", selector: { boolean: {} } },
            { name: "dim_by_brightness", selector: { boolean: {} } },
            { name: "round", selector: { boolean: {} } },
            { name: "haptic", selector: { boolean: {} } },
          ],
        },
        {
          type: "grid", name: "", schema: [
            { name: "color_on", selector: { text: {} } },
            { name: "color_fallback", selector: { text: {} } },
            { name: "color_off", selector: { text: {} } },
            { name: "color_unavailable", selector: { text: {} } },
            { name: "glow_scale", selector: num(0, 4, 0.05) },
            { name: "glow_opacity", selector: num(0, 2, 0.05) },
            { name: "strip_height", selector: num(60, 420, 5) },
            { name: "effects_max", selector: num(4, 200, 1) },
          ],
        },
      ],
    },
    {
      type: "expandable", name: "", title: "Cenas e paletas", schema: [
        {
          type: "grid", name: "", schema: [
            { name: "animation_idle", selector: sel(IDLE) },
            { name: "animation_other", selector: sel(IDLE) },
          ],
        },
        { name: "effect_palettes", selector: { object: {} } },
        { name: "effect_map", selector: { object: {} } },
        { name: "color_presets", selector: { object: {} } },
        { name: "kelvin_presets", selector: { object: {} } },
      ],
    },
    {
      type: "expandable", name: "", title: "Ações", schema: [
        {
          type: "grid", name: "", schema: [
            {
              name: "tap_action", selector: sel([
                { value: "toggle", label: "Ligar / desligar" },
                { value: "more-info", label: "Abrir detalhes" },
                { value: "none", label: "Nada" },
              ]),
            },
            {
              name: "hold_action", selector: sel([
                { value: "more-info", label: "Abrir detalhes" },
                { value: "toggle", label: "Ligar / desligar" },
                { value: "none", label: "Nada" },
              ]),
            },
          ],
        },
      ],
    },
  ];

  class MwLedLineCardEditor extends HTMLElement {
    setConfig(config) { this._config = config || {}; this._render(); }
    set hass(hass) { this._hass = hass; this._render(); }

    _render() {
      if (!this._config || !this._hass) return;
      if (!this._form) {
        const f = document.createElement("ha-form");
        f.computeLabel = (s) => LABELS[s.name] || s.name;
        f.addEventListener("value-changed", (ev) => {
          ev.stopPropagation();
          const next = { type: `custom:${CARD}`, ...ev.detail.value };
          Object.keys(next).forEach((k) => {
            if (next[k] === "" || next[k] === null || next[k] === undefined) delete next[k];
          });
          fire(this, "config-changed", { config: next });
        });
        this.appendChild(f);
        this._form = f;
      }
      this._form.hass = this._hass;
      this._form.schema = SCHEMA;
      const data = { ...this._config };
      ["shape", "rows", "pixels", "thickness", "strip_height", "animation",
        "animation_speed", "show_strip", "show_header", "show_power", "show_state",
        "show_brightness", "show_colors", "show_effects", "use_light_color",
        "scene_gradient", "glow", "dim_by_brightness", "round",
        "tap_action", "hold_action"].forEach((k) => {
          if (data[k] === undefined) data[k] = DEFAULTS[k];
        });
      this._form.data = data;
    }
  }

  if (!customElements.get(CARD)) customElements.define(CARD, MwLedLineCard);
  if (!customElements.get(CARD + "-editor")) {
    customElements.define(CARD + "-editor", MwLedLineCardEditor);
  }

  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === CARD)) {
    window.customCards.push({
      type: CARD,
      name: "MW LED Line Card",
      description: "A fita LED desenhada de verdade, com brilho, cores e cenas.",
      preview: true,
      documentationURL: "https://github.com/visaodeempresa/mw-ha-led-line-card",
    });
  }

  console.info(
    `%c MW-LED-LINE-CARD %c ${VERSION} `,
    "color:#0b1021;background:#7cf",
    "color:#7cf;background:#0b1021"
  );
})();

# MW LED Line Card

`custom:mw-led-line-card` — a **fita LED como card**: a serpentina desenhada de
verdade, acesa com a cor real da lâmpada, e os comandos que faltam no card de
luz comum — brilho, cores e **cenas com paleta**.

```yaml
type: custom:mw-led-line-card
entity: light.led_da_cama_da_suite
```

![Nove cards: cena ativa com degradê, branco 2700 K, lista de cenas, variações
de desenho e os estados apagada e indisponível](docs/galeria.png)

Irmão de tela do
[MW LED Line Element](https://github.com/visaodeempresa/mw-ha-led-line-element),
que desenha a mesma fita dentro do `picture-elements`. O motor de cor, o mapa
de efeito → animação e as regras de desempenho são os mesmos.

## A cena tem cor

O Home Assistant entrega apenas o **nome** do efeito (`Iceland blue`,
`Fireworks at sea`, `Candle light`) — nunca as cores. Então o card tira a cor
do nome:

1. por palavra-chave — gelo, mar, fogo, festa, floresta, arco-íris, neon,
   noite, romance, cinema, outono… em português e em inglês;
2. quando o nome não diz nada, por **hash estável** dele: a mesma cena tem
   sempre a mesma paleta, em qualquer tela e em qualquer dia;
3. duas cenas da mesma família giram a paleta em posições diferentes, então
   `Iceland blue` e `Glacier express` são parentes, não gêmeas;
4. e `effect_palettes` manda em tudo, quando você quiser escolher a dedo.

Essa paleta aparece nas bolinhas de cada cena **e pinta a fita em degradê**
enquanto a cena estiver ativa (`scene_gradient`).

```yaml
type: custom:mw-led-line-card
entity: light.led_da_sala
default_tab: scene
effect_palettes:
  Festa da Cris: ["#ff2d95", "#ffd200", "#00e5ff"]
  Modo Cinema: ["#3a1c71", "#d76d77", "#ffaf7b"]
```

## O desenho da fita

| `shape` | o que desenha |
|---|---|
| `serpentine` (padrão) | a serpentina do app, com `rows` voltas |
| `line` | um traço reto |
| `wave` | uma onda |
| `custom` | os seus pontos: `points: "10 80, 10 25, 90 25"` (% da área) |

`pixels` é quantos LEDs desenhar (`0` = fita contínua), `thickness` a espessura
em px e `strip_height` a altura da área da fita. A fita acende com a cor real
da luz — `rgb_color`, `rgbw_color`, `rgbww_color`, `hs_color` ou a temperatura
(Kelvin/mireds por aproximação de corpo negro, então 2700 K sai âmbar de
verdade) — e escurece junto com o `brightness`.

```yaml
# a fita da cabeceira, fininha, sem comandos: só o desenho e o cabeçalho
type: custom:mw-led-line-card
entity: light.led_da_cama_da_suite
shape: line
collapsed: true
strip_height: 80
```

## Efeitos

Como no elemento de planta: `animation: auto` lê o `effect` da luz e escolhe o
desenho — `rainbow`, `chase`, `comet`, `scan`, `twinkle`, `strobe`, `fire`,
`flicker`, `wave`, `pulse`, `breathe`. `effect_map` ensina os nomes do seu
driver; `animation: none` deixa a fita quieta. Tudo anima só `opacity`,
`filter` e `stroke-dashoffset`, e `prefers-reduced-motion` desliga.

## Opções

| chave | padrão | o que faz |
|---|---|---|
| `entity` | — | obrigatória (light, switch, input_boolean) |
| `name` / `icon` | | vazio = os da entidade |
| `shape` | `serpentine` | `serpentine` · `line` · `wave` · `custom` |
| `rows` | `4` | voltas da serpentina |
| `points` | | traçado do `shape: custom` |
| `pixels` | `30` | LEDs desenhados (`0` = contínua) |
| `thickness` | `14` | espessura da fita, em px |
| `strip_height` | `150` | altura da área da fita, em px |
| `round` | `true` | pontas arredondadas |
| `use_light_color` | `true` | usar a cor real da luz |
| `color_on` | | cor fixa (fita branca ou RGB de cor única) |
| `color_fallback` | `255, 200, 120` | quando a luz não informa cor |
| `color_off` / `color_unavailable` | | cores dos outros estados |
| `scene_gradient` | `true` | pintar a fita com a paleta da cena ativa |
| `glow` / `glow_scale` / `glow_opacity` | `true` / `1` / `1` | halo |
| `dim_by_brightness` | `true` | a fita escurece junto com o brilho |
| `animation` | `auto` | efeito (veja acima) |
| `animation_speed` | `1` | velocidade |
| `animation_idle` / `animation_other` | `none` / `breathe` | sem efeito / efeito desconhecido |
| `effect_map` | | nome do efeito → animação |
| `effect_palettes` | | nome da cena → cores |
| `show_strip` / `show_header` / `show_state` / `show_power` | `true` | partes do card |
| `show_brightness` / `show_colors` / `show_effects` | `true` | comandos |
| `collapsed` | `false` | só a fita e o cabeçalho |
| `default_tab` | `color` | aba aberta ao carregar (`color` · `scene`) |
| `effects_max` | `80` | teto da lista de cenas |
| `color_presets` | 10 cores | pastilhas de cor |
| `kelvin_presets` | `2200…6500` | pastilhas de branco (só se a luz aceitar) |
| `tap_action` / `hold_action` | `toggle` / `more-info` | toque na fita |
| `haptic` | `true` | vibração |

As pastilhas se ajustam à luz: só aparecem as cores se ela aceitar cor, só
aparecem os brancos se ela aceitar `color_temp`, e a cena/cor em uso fica
marcada. Luz indisponível esmaece o card inteiro e não responde ao toque.

## Editor visual

Formulário completo por `getConfigElement()` — entidade, desenho, efeito, quais
comandos mostrar, cores, halo, paletas das cenas e ações. O card também aparece
no seletor "Adicionar cartão" com pré-visualização.

## Instalação

HACS → Repositórios personalizados → `visaodeempresa/mw-ha-led-line-card`,
categoria **Lovelace**. Ou copie `dist/mw-led-line-card.js` para `/config/www/`
e adicione o recurso como módulo JavaScript.

## Desempenho

DOM montado uma vez, folha de estilo compartilhada por `adoptedStyleSheets` e
`set hass` que sai em O(1) quando a mudança foi de outra entidade — o Home
Assistant empurra o objeto `hass` a **cada** mudança de **qualquer** entidade.
A lista de cenas só é reconstruída quando o `effect_list` muda.

## Bancada

`tools/preview.html` abre no navegador, sem Home Assistant: traz stubs de
`ha-card` e `ha-icon`, um `hass` de bolso e os nove cards da imagem acima.

## Licença

MIT · MAYCON WILLIAN OLIVEIRA

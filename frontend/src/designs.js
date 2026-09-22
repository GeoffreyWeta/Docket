/* The four front pages.

   The landing page has one argument and four ways of making it. This module
   holds the four, and nothing else in the frontend decides which is used: the
   server sends `landing` with auth/config/ and the page wears it. The keys here
   must match LANDING_DESIGNS in backend/core/views.py — that tuple is the
   allow-list, this file is the paint.

   TWO AXES, NOT ONE. The design belongs to the deployment and is set once in
   the administration console. Light and dark stay the reader's, exactly as
   before. So every design below is written twice: a block for light, a block
   under :root[data-theme="dark"] for dark. There is no fallback between them —
   a design that forgets its dark half inherits the light one and glares after
   six in the evening. Write both.

   WHY TOKENS AND NOT FOUR STYLESHEETS. Everything in LANDING_CSS reads --lp-*,
   never --card or --brand directly. A design is therefore a list of about
   eighteen values plus, at most, a handful of structural flags. `drawn` is the
   house page and its tokens simply alias the app's own, so it renders today's
   page to the pixel and stays in step if the app's palette moves.

   THE ACCENT IS TWO COLOURS, ON PURPOSE. --lp-accent is the step that may
   carry text; --lp-accent-2 is the loud one and may only ever be a fill, with
   --lp-on-accent riding on it. The reference material for `bold` set lime type
   on white, and for `night` set mid-grey body copy on navy; both fail contrast
   outright. Splitting the accent in two is what stops the same mistake being
   made here by whoever next reaches for the prettier value. */

import { BP } from "./breakpoints";

/* The catalogue. `note` is what the administration console shows beside each
   one, so it says what the reader will see rather than naming a mood.

   `swatch` is four literal colours — page, panel, accent, band — for the
   console's preview chips. They are duplicated from the light block below
   rather than read out of it, because the console does not load LANDING_CSS
   and should not have to: a tab that had to mount the whole front page to
   show four squares would be the tail wagging the dog. Change a design's
   light block and change its swatch in the same edit. */
export const DESIGNS = [
  {
    key: "drawn",
    swatch: ["#FFFFFF", "#F2F6F3", "#00803E", "#0B3D24"],
    label: "Drawn",
    note: "The house page. Drawings, plenty of air, one green, and nothing moving that is not making a point.",
    flags: {},
  },
  {
    key: "bold",
    swatch: ["#FFFFFF", "#F3F7EA", "#3F6212", "#C6F24E"],
    label: "Bold",
    note: "Louder. A lime accent over deep forest, the lifecycle running as a marquee, four figures in a row.",
    flags: { marquee: true, figures: true },
  },
  {
    key: "night",
    swatch: ["#F7F9F8", "#FFFFFF", "#0F6F66", "#101D1A"],
    label: "Night",
    note: "One held frame. The hero stays dark in either mode, the accent appears three times, and a rail of facts sits under it.",
    flags: { darkHero: true, rail: true },
  },
  {
    key: "paper",
    swatch: ["#E7EFEB", "#FFFDF9", "#9C5418", "#3C4F47"],
    label: "Paper",
    note: "Muted sage and warm apricot. Every panel is a document with a torn edge — the seal, drawn as stationery.",
    flags: { ticket: true, rail: true },
  },
];

export const DESIGN_KEYS = DESIGNS.map((d) => d.key);
export const DEFAULT_DESIGN = "drawn";

/** Always a real design. A workspace that stored one since removed, or a
    config fetch that failed, gets the house page rather than an unstyled one. */
export function designOf(key) {
  return DESIGNS.find((d) => d.key === key) || DESIGNS[0];
}

export const DESIGN_CSS = `
/* ---------------------------------------------------------------- 1. drawn
   Aliases, not values: if the app's green moves, this moves with it. That is
   the whole reason the house page is expressed as tokens rather than left as
   the hard-coded default it used to be. Its dark half is the app's own dark
   theme, which is why it needs no second block. */
.lp[data-design="drawn"]{
  --lp-bg:var(--card); --lp-bg2:var(--paper); --lp-surface:var(--card); --lp-sunk:var(--sunk);
  --lp-ink:var(--ink); --lp-muted:var(--muted); --lp-faint:var(--faint);
  --lp-line:var(--line); --lp-line2:var(--line2);
  --lp-accent:var(--brand); --lp-accent-2:var(--brand-2); --lp-accent-tint:var(--brand-tint);
  --lp-on-accent:var(--on-brand);
  --lp-band:var(--engo-band); --lp-on-band:#FFFFFF; --lp-on-band-muted:#BDD6C7;
  --lp-radius:18px; --lp-radius-sm:14px;
  --lp-h1-track:-.032em; --lp-sec:var(--s6); --lp-cap-track:.08em;
  --pl-0:#0B1410; --pl-1:#E4EBE6; --pl-2:#FFFFFF; --pl-hi:var(--engo); --pl-cap:#FFFFFF;
}

/* ----------------------------------------------------------------- 2. bold
   Deep forest and an acid lime. The lime is a FILL ONLY — on white it measures
   about 1.6:1, and the template it comes from used it for body text anyway.
   --lp-accent is the olive step at 7.1:1 on white, and that is the one
   headings, links and the marquee rule get. */
.lp[data-design="bold"]{
  --lp-bg:#FFFFFF; --lp-bg2:#F3F7EA; --lp-surface:#FFFFFF; --lp-sunk:#F7FAF0;
  --lp-ink:#101F16; --lp-muted:#485A4D; --lp-faint:#68796D;
  --lp-line:#DCE6CF; --lp-line2:#C2D2AF;
  --lp-accent:#3F6212; --lp-accent-2:#C6F24E; --lp-accent-tint:#EDF9D2;
  --lp-accent-deep:#9FCE2C;
  --lp-on-accent:#16250A;
  --lp-band:#14351F; --lp-on-band:#F2F8E8; --lp-on-band-muted:#B9CFA9;
  --lp-radius:14px; --lp-radius-sm:10px;
  /* Type and density. Bold is a brochure: bigger display, tighter tracking,
     tighter vertical rhythm, more sections in the same scroll. */
  --t1:clamp(42px,9.2vw,78px); --t2:clamp(27px,4.8vw,42px);
  --lp-h1-track:-.04em; --lp-sec:var(--s6); --lp-cap-track:.1em;
  /* Plates: greyscale, one lime spot. The reference's photography was
     black-and-white with a single accent, and that is the whole effect. */
  --pl-0:#0D1912; --pl-1:#DCE3DA; --pl-2:#F3F6F0; --pl-hi:#C6F24E; --pl-cap:#FFFFFF;
}
:root[data-theme="dark"] .lp[data-design="bold"]{
  --lp-bg:#0C1511; --lp-bg2:#101C15; --lp-surface:#13211A; --lp-sunk:#16271E;
  --lp-ink:#E9F2E4; --lp-muted:#A8B8A6; --lp-faint:#82927F;
  --lp-line:#22362A; --lp-line2:#2E4736;
  --lp-accent:#C6F24E; --lp-accent-2:#C6F24E; --lp-accent-tint:rgba(198,242,78,.14);
  --lp-accent-deep:#9FCE2C;
  --lp-on-accent:#16250A;
  --lp-band:#0F2A18; --lp-on-band:#EAF5DC; --lp-on-band-muted:#AEC79C;
  --pl-0:#040806; --pl-1:#18231C; --pl-2:#2B382F; --pl-hi:#C6F24E; --pl-cap:#EAF5DC;
}

/* ---------------------------------------------------------------- 3. night
   One held frame. The hero is a dark field in BOTH modes — that is the design,
   not the theme — so its copy is written against --lp-band and has to clear
   contrast there rather than on the page. The reference set mid-grey on navy
   at about 3:1; --lp-on-band-muted here is 9.4:1 on the same field. */
.lp[data-design="night"]{
  --lp-bg:#F7F9F8; --lp-bg2:#EDF2EF; --lp-surface:#FFFFFF; --lp-sunk:#F2F6F4;
  --lp-ink:#0E1A15; --lp-muted:#45554E; --lp-faint:#647468;
  --lp-line:#DBE4E0; --lp-line2:#C3D0CA;
  --lp-accent:#0F6F66; --lp-accent-2:#2FD6C3; --lp-accent-tint:#E2F6F3;
  --lp-accent-deep:#1BA997;
  --lp-on-accent:#04231F;
  --lp-band:#101D1A; --lp-on-band:#F1F7F5; --lp-on-band-muted:#AFC3BD;
  --lp-radius:16px; --lp-radius-sm:12px;
  /* Night is one held frame: the largest display on the site, the most air
     around it, and the fewest things on screen at once. */
  --t1:clamp(44px,10vw,88px); --t2:clamp(26px,4.4vw,40px);
  --lp-h1-track:-.045em; --lp-sec:var(--s7); --lp-cap-track:.14em;
  /* Plates stay a dark teal duotone in BOTH modes, like the hero they sit in. */
  --pl-0:#03100E; --pl-1:#122422; --pl-2:#27403D; --pl-hi:#2FD6C3; --pl-cap:#F1F7F5;
}
:root[data-theme="dark"] .lp[data-design="night"]{
  --lp-bg:#0A1210; --lp-bg2:#0E1613; --lp-surface:#121C19; --lp-sunk:#152120;
  --lp-ink:#E8F1EE; --lp-muted:#A2B3AE; --lp-faint:#7C8D88;
  --lp-line:#1E2C28; --lp-line2:#2A3B36;
  --lp-accent:#2FD6C3; --lp-accent-2:#2FD6C3; --lp-accent-tint:rgba(47,214,195,.13);
  --lp-accent-deep:#1BA997;
  --lp-on-accent:#04231F;
  --lp-band:#0E1917; --lp-on-band:#F1F7F5; --lp-on-band-muted:#AFC3BD;
}

/* ---------------------------------------------------------------- 4. paper
   Sage, cream and a warm apricot. The apricot is the fill; #9C5418 is the step
   that may carry text, at 5.6:1 on the cream surface and 4.9:1 on the sage page
   behind it. The dark panels are the same slate green the reference used for
   its cards, and the tear line further down is drawn against them. */
.lp[data-design="paper"]{
  --lp-bg:#E7EFEB; --lp-bg2:#DCE8E2; --lp-surface:#FFFDF9; --lp-sunk:#F3F0E8;
  --lp-ink:#22302B; --lp-muted:#51625B; --lp-faint:#6F807A;
  --lp-line:#CBD9D3; --lp-line2:#B2C4BC;
  --lp-accent:#9C5418; --lp-accent-2:#F0B384; --lp-accent-tint:#FBEADC;
  --lp-accent-deep:#D08B52;
  --lp-on-accent:#2B1708;
  --lp-band:#3C4F47; --lp-on-band:#F4F1E9; --lp-on-band-muted:#BCC9C3;
  --lp-radius:20px; --lp-radius-sm:16px;
  /* Paper is stationery: a smaller, calmer display, letter-spaced small caps
     doing the labelling, and the most generous gutters of the four. */
  --t1:clamp(34px,7vw,58px); --t2:clamp(23px,3.8vw,34px);
  --lp-h1-track:-.022em; --lp-sec:var(--s6); --lp-cap-track:.16em;
  /* Plates in sepia, so the pictures read as documents rather than photographs. */
  --pl-0:#2A1B0F; --pl-1:#D9D0C1; --pl-2:#F3EBDE; --pl-hi:#E09A5E; --pl-cap:#FDF8F1;
}
:root[data-theme="dark"] .lp[data-design="paper"]{
  --lp-bg:#141A18; --lp-bg2:#101615; --lp-surface:#1C2522; --lp-sunk:#222B27;
  --lp-ink:#E9EFEB; --lp-muted:#A6B4AE; --lp-faint:#82908A;
  --lp-line:#2A3531; --lp-line2:#38453F;
  --lp-accent:#F0B384; --lp-accent-2:#F0B384; --lp-accent-tint:rgba(240,179,132,.14);
  --lp-accent-deep:#D08B52;
  --lp-on-accent:#2B1708;
  --lp-band:#2A3833; --lp-on-band:#F4F1E9; --lp-on-band-muted:#BCC9C3;
  --pl-0:#130C06; --pl-1:#29231B; --pl-2:#3D352A; --pl-hi:#E09A5E; --pl-cap:#F4F1E9;
}

/* ------------------------------------------- what the page inherits from the app
   The buttons and the drawings are app components rendered inside the landing
   page, and they read app tokens — so without this block the most important
   element on the page, the call to action, stayed house-green in all four
   designs while everything around it changed. Rebinding those tokens inside
   .lp is how a design reaches them without touching the signed-in workspace.

   "drawn" is deliberately absent: it inherits the app's own --pri-* and --il-*
   untouched, which is what keeps the house page identical to what shipped
   rather than a re-derivation of it that is nearly the same.

   The filled button is FLAT here, not the app's gradient. Three of these
   accents are light — lime, teal, apricot — and carry --lp-on-accent as a dark
   label; running a light-to-dark gradient under dark text is how you get a
   label that is legible at the top and gone at the bottom. */
.lp[data-design="bold"],
.lp[data-design="night"],
.lp[data-design="paper"]{
  --pri-from:var(--lp-accent-2); --pri-to:var(--lp-accent-2);
  --pri-from-h:var(--lp-accent-deep); --pri-to-h:var(--lp-accent-deep);
  --pri-line:var(--lp-accent-deep); --on-brand:var(--lp-on-accent);
  --pri-glow:var(--lp-accent-tint);
}

/* The drawings. These have to be set ON .illus and not inherited down to it:
   ILLUS_CSS declares the whole --il-* palette on .illus itself, so a value put
   on an ancestor never reaches the drawing. Scoping to
   .lp[data-design] .illus matches its specificity and wins on order. */
.lp[data-design="bold"] .illus,
.lp[data-design="night"] .illus,
.lp[data-design="paper"] .illus{
  --il-tint:color-mix(in srgb,var(--lp-accent) 10%,transparent);
  --il-ink:var(--lp-accent); --il-ink-2:var(--lp-accent-deep);
  --il-paper:var(--lp-surface); --il-line:var(--lp-line2);
  --il-cool:var(--lp-accent-2); --il-warm:var(--lp-accent);
}
/* Dark keeps the neutrals ILLUS_CSS chose and takes only the two accents.
   That file spells out why, and it is worth not relearning: on a dark ground
   the figure has to be the brightest neutral, and setting --il-ink to the
   accent makes the figure and the seal it is reaching for the same colour. */
:root[data-theme="dark"] .lp[data-design="bold"] .illus,
:root[data-theme="dark"] .lp[data-design="night"] .illus,
:root[data-theme="dark"] .lp[data-design="paper"] .illus{
  --il-tint:color-mix(in srgb,var(--lp-accent) 18%,transparent);
  --il-ink:var(--lp-ink); --il-ink-2:var(--lp-faint);
  --il-paper:var(--lp-surface); --il-line:var(--lp-muted);
  --il-cool:var(--lp-accent-2); --il-warm:var(--lp-accent-deep);
}

/* ================================================================ the bands
   Four pieces the designs switch on. Each is inert unless its design asks for
   it, so nothing below costs the house page anything. */

/* --------------------------------------------------- the marquee (bold)
   The lifecycle as vocabulary, scrolling. It earns its place by naming what
   the product does without a paragraph — and it stops dead for anyone who has
   asked for less motion, because a page that ignores that setting is making a
   decoration more important than a person. */
.lpmarq{background:var(--lp-band);color:var(--lp-on-band);overflow:hidden;
  border-block:1px solid var(--lp-band);
  padding-block:var(--s3);display:flex;gap:0;white-space:nowrap;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.lpmarq ul{display:flex;align-items:center;gap:var(--s5);list-style:none;margin:0;
  padding:0 calc(var(--s5) / 2);flex:0 0 auto}
.lpmarq li{display:flex;align-items:center;gap:var(--s5);font-size:var(--t3);
  font-weight:600;letter-spacing:-.015em}
.lpmarq li::after{content:"";width:9px;height:9px;border-radius:50%;
  background:var(--lp-accent-2);flex:0 0 auto}
@media(prefers-reduced-motion:no-preference){
  .lpmarq ul{animation:lpmarq 32s linear infinite}
  .lpmarq:hover ul{animation-play-state:paused}
}
@keyframes lpmarq{from{transform:translateX(0)}to{transform:translateX(-100%)}}

/* ----------------------------------------------------- the figures (bold)
   Four numbers, and every one of them is a fact about the software rather than
   a claim about a customer. The template this comes from showed "3k+ projects"
   and a slider labelled 85%; inventing either would be the front page lying
   about the one thing the product sells, which is that it does not. */
.lpfigs{display:grid;gap:1px;background:var(--lp-line);border-block:1px solid var(--lp-line)}
.lpfigs > div{background:var(--lp-bg);padding:var(--s4) var(--s3);text-align:center}
.lpfigs b{display:block;font-size:var(--t2);font-weight:700;letter-spacing:-.03em;
  line-height:1.05;color:var(--lp-accent);font-variant-numeric:tabular-nums}
.lpfigs span{display:block;margin-top:var(--s2);font-size:var(--t5);color:var(--lp-muted);
  line-height:1.4;text-wrap:balance}

/* ------------------------------------------- the rail (night and paper)
   Hard facts pinned under the hero, no headings and no cards. Four things that
   are true, in the order they happen to a bid. */
.lprail{display:grid;gap:var(--s3);border-top:1px solid var(--lp-line);
  padding-top:var(--s4);margin-top:var(--s5)}
.lprail div{display:grid;gap:2px;min-width:0}
.lprail b{font-size:var(--t5);font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--lp-accent)}
.lprail span{font-size:var(--t5);color:var(--lp-muted);line-height:1.45}
/* Inside the dark hero the rail is on the band, not on the page. */
.lphero.onband .lprail{border-top-color:rgba(255,255,255,.16)}
.lphero.onband .lprail span{color:var(--lp-on-band-muted)}

/* ------------------------------------------------ the dark hero (night)
   A dark field in both modes. Everything inside it is written against the
   band, which is why the rules below are scoped rather than left to the
   design's page tokens. */
.lphero.onband{background:var(--lp-band);color:var(--lp-on-band);
  border-bottom:1px solid var(--lp-band)}
.lphero.onband h1{color:var(--lp-on-band)}
.lphero.onband h1 em{color:var(--lp-accent-2)}
.lphero.onband .lead{color:var(--lp-on-band-muted)}
.lphero.onband .fig{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.14)}
.lphero.onband .figstage{background:rgba(0,0,0,.18)}
.lphero.onband .fenv{color:var(--lp-accent-2)}
.lphero.onband .fe-body{fill:var(--lp-band)}
.lphero.onband .fenv i,.lphero.onband .fig figcaption span{color:var(--lp-on-band-muted)}
.lphero.onband .fig figcaption{border-top-color:rgba(255,255,255,.14);color:var(--lp-on-band)}
.lphero.onband .fig figcaption em i{background:rgba(255,255,255,.22)}
.lphero.onband .fig figcaption em i.on{background:var(--lp-accent-2)}
.lphero.onband .btn:not(.pri){background:transparent;color:var(--lp-on-band);
  border-color:rgba(255,255,255,.34)}
.lphero.onband .btn:not(.pri):hover{background:rgba(255,255,255,.08)}

/* ------------------------------------------------------- the bar (night)
   The bar has to join the hero, not sit above it. Left alone it rendered as a
   light strip directly on top of a dark hero — a hard seam across the top of
   the page and the first thing the eye landed on. It stays dark after the
   hero scrolls away, which is consistent rather than a bug: in this design the
   bar is part of the frame, not part of the page. */
.lp[data-design="night"] .lpbar{
  background:color-mix(in srgb,var(--lp-band) 92%,transparent);
  border-bottom-color:transparent;color:var(--lp-on-band)}
.lp[data-design="night"] .lpbar .lplink{color:var(--lp-on-band-muted)}
.lp[data-design="night"] .lpbar .lplink:hover{color:var(--lp-on-band)}
/* The wordmark sets its own colour on .dkword, so putting a colour on the bar
   never reached it and DOCKET rendered near-black on the near-black band. */
.lp[data-design="night"] .lpbar .dkword{color:var(--lp-on-band)}
.lp[data-design="night"] .lpbar .dkmark .dkm-paper{fill:var(--lp-band)}

/* --------------------------------------------------- the tear line (paper)
   A perforation across a panel, the way a boarding pass is perforated. It is
   the one borrowed flourish that is also an argument: the product's whole
   claim is a document that cannot be opened before its time, and this is what
   that looks like as stationery. Two notches and a dashed rule, drawn with
   backgrounds so it costs no markup. */
.lp[data-design="paper"] .fig,
.lp[data-design="paper"] .rung,
.lp[data-design="paper"] .lpfaq{position:relative}
/* The perforation is the caption's own top border, and the two pseudo-elements
   are the notches punched out of the card's edges. Drawing the dashes with a
   repeating gradient and both notches with one box-shadow offset was a knot
   that produced a dashed line and no notches; a dashed border and two circles
   is the same picture and can be read. The notches are filled with the page
   behind the card, which is what makes them look punched rather than drawn. */
.lp[data-design="paper"] .fig figcaption{position:relative;
  border-top:2px dashed var(--lp-line2)}
.lp[data-design="paper"] .fig figcaption::before,
.lp[data-design="paper"] .fig figcaption::after{content:"";position:absolute;
  top:-11px;width:20px;height:20px;border-radius:50%;background:var(--lp-bg)}
.lp[data-design="paper"] .fig figcaption::before{left:-11px}
.lp[data-design="paper"] .fig figcaption::after{right:-11px}
.lp[data-design="paper"] .figstage{background:var(--lp-band)}
.lp[data-design="paper"] .fenv{color:var(--lp-accent-2)}
.lp[data-design="paper"] .fe-body{fill:var(--lp-band)}
.lp[data-design="paper"] .fenv i{color:var(--lp-on-band-muted)}
/* Small caps labels, the one type move the reference makes that travels. */
.lp[data-design="paper"] .lpsteps b{letter-spacing:.06em}
.lp[data-design="paper"] .rung i{letter-spacing:.06em;text-transform:uppercase;font-size:11.5px}

@media(min-width:${BP.sm}px){
  .lprail{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s3) var(--s4)}
  .lpfigs{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(min-width:${BP.tab}px){
  .lprail{grid-template-columns:repeat(4,minmax(0,1fr))}
  .lpfigs{grid-template-columns:repeat(4,minmax(0,1fr))}
}
`;

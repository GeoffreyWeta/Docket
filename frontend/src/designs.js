/* Deployment appearance catalogue. Forest, Slate, Graphite and Ink are
   front-page palettes. Studio is an alternate front-page and workspace layout
   whose scoped styling lives in studio.js. Light/dark remains reader-owned. */

import { BP } from "./breakpoints";

/* The catalogue. `note` is what the console shows beside each one: what the
   reader will see, not what the colour is called. `swatch` is page, panel,
   action, band — duplicated from the light block below because the console
   does not load this stylesheet and should not have to. */
export const DESIGNS = [
  {
    key: "studio",
    label: "Studio",
    swatch: ["#F5F5F7", "#FFFFFF", "#0066CC", "#1D1D1F"],
    note: "An Apple-inspired layout. Larger type, focused product stories and a calm, silver workspace. Applies to the front page and app.",
  },
  {
    key: "forest",
    label: "Forest",
    swatch: ["#FFFFFF", "#F3F8F5", "#0F6B45", "#06301F"],
    note: "The EatnGo lineage, grown up. A deep green that reads as audit rather than agriculture.",
  },
  {
    key: "slate",
    label: "Slate",
    swatch: ["#FFFFFF", "#F4F7FB", "#1D63C4", "#0B2A5B"],
    note: "Institutional blue on white. The register, the bank, the regulator — what an enterprise buyer expects to see.",
  },
  {
    key: "graphite",
    label: "Graphite",
    swatch: ["#FFFFFF", "#F5F6F7", "#1D63C4", "#131417"],
    note: "Near-black and one blue. The most restrained of the four; colour appears only where it carries meaning.",
  },
  {
    key: "ink",
    label: "Ink",
    swatch: ["#F6F3EC", "#EFEBE1", "#B4261A", "#141312"],
    note: "Ink on paper with a red seal — the registry look, matched to the signed-in screens.",
  },
];

export const DESIGN_KEYS = DESIGNS.map((d) => d.key);
/* Studio, so a workspace that has never been to the appearance console wears
   the house look rather than a palette somebody has to go and choose. That is
   most of them: the demo had never stored a design at all, so it was showing
   this constant, and the two deployments ended up looking like two products
   because only the real one had been set by hand. Kept in step with
   DEFAULT_LANDING in backend/core/views.py, which answers the same question
   for a visitor whose config has already arrived. */
export const DEFAULT_DESIGN = "studio";

/** Always a real palette. A workspace holding one since removed, or a config
    fetch that failed, gets the default rather than an unstyled page.

    The fallback looks DEFAULT_DESIGN up by key rather than taking DESIGNS[0].
    By position it only worked while the default happened to be listed first,
    and the front page asks for a palette on its very first paint, before the
    config has landed — so getting that fallback wrong means every visitor
    sees the wrong colour for a moment. */
export function designOf(key) {
  return DESIGNS.find((d) => d.key === key)
      || DESIGNS.find((d) => d.key === DEFAULT_DESIGN)
      || DESIGNS[0];
}

export const DESIGN_CSS = `
/* ------------------------------------------------------------ 1. slate
   Blue 600 for action, 700 for links and headings on light, 900 for the band.
   The neutrals are slate-blue rather than pure grey, which is most of what
   separates an enterprise page from a template. */
.lp[data-design="slate"]{
  --lp-bg:#FFFFFF; --lp-paper:#F4F7FB; --lp-card:#FFFFFF;
  --lp-ink:#16202E; --lp-ink-2:#2C3A4E; --lp-muted:#53627A; --lp-faint:#78869C;
  --lp-line:#D7DEE8; --lp-line-2:#BCC7D6;
  --lp-pri:#1D63C4; --lp-pri-deep:#17509F; --lp-pri-dark:#0B2A5B; --lp-pri-tint:#E8F0FC;
  --lp-on-pri:#FFFFFF;
  --lp-on-band:#FFFFFF; --lp-on-band-muted:#C9D8F2; --lp-on-band-accent:#9FBCEA;
  --lp-ok:#0B6E4F; --lp-warn:#8A5200; --lp-crit:#B02418;
  --lp-radius:3px;
}
:root[data-theme="dark"] .lp[data-design="slate"]{
  --lp-bg:#0C131C; --lp-paper:#101926; --lp-card:#14202F;
  --lp-ink:#E8EEF6; --lp-ink-2:#C7D2E2; --lp-muted:#9FAEC4; --lp-faint:#7F8EA6;
  --lp-line:#22303F; --lp-line-2:#31435A;
  --lp-pri:#5A9BF0; --lp-pri-deep:#8BB9F5; --lp-pri-dark:#091524; --lp-pri-tint:rgba(90,155,240,.15);
  --lp-on-pri:#06162B;
  --lp-on-band:#E8EEF6; --lp-on-band-muted:#AEC0D8; --lp-on-band-accent:#8BB9F5;
  --lp-ok:#3FAE84; --lp-warn:#D79A3A; --lp-crit:#E47366;
}

/* ----------------------------------------------------------- 2. forest */
.lp[data-design="forest"]{
  --lp-bg:#FFFFFF; --lp-paper:#F3F8F5; --lp-card:#FFFFFF;
  --lp-ink:#16231D; --lp-ink-2:#2A3C33; --lp-muted:#4F6259; --lp-faint:#74877C;
  --lp-line:#D5E0DA; --lp-line-2:#B8C9C0;
  --lp-pri:#0F6B45; --lp-pri-deep:#0A5235; --lp-pri-dark:#06301F; --lp-pri-tint:#E6F2EC;
  --lp-on-pri:#FFFFFF;
  --lp-on-band:#FFFFFF; --lp-on-band-muted:#BFD8CB; --lp-on-band-accent:#8FC4AB;
  --lp-ok:#0B6E4F; --lp-warn:#8A5200; --lp-crit:#B02418;
  --lp-radius:3px;
}
:root[data-theme="dark"] .lp[data-design="forest"]{
  --lp-bg:#0B1310; --lp-paper:#0F1A15; --lp-card:#13211B;
  --lp-ink:#E6EFEA; --lp-ink-2:#C4D4CB; --lp-muted:#9FB2A8; --lp-faint:#7F9289;
  --lp-line:#21332B; --lp-line-2:#2F463A;
  --lp-pri:#3FAE84; --lp-pri-deep:#6BC7A4; --lp-pri-dark:#081A12; --lp-pri-tint:rgba(63,174,132,.15);
  --lp-on-pri:#04231A;
  --lp-on-band:#E6EFEA; --lp-on-band-muted:#A8C2B5; --lp-on-band-accent:#6BC7A4;
  --lp-ok:#3FAE84; --lp-warn:#D79A3A; --lp-crit:#E47366;
}

/* --------------------------------------------------------- 3. graphite */
.lp[data-design="graphite"]{
  --lp-bg:#FFFFFF; --lp-paper:#F5F6F7; --lp-card:#FFFFFF;
  --lp-ink:#131417; --lp-ink-2:#2B2E33; --lp-muted:#585C64; --lp-faint:#7C818A;
  --lp-line:#DCDEE2; --lp-line-2:#C1C5CB;
  --lp-pri:#1D63C4; --lp-pri-deep:#17509F; --lp-pri-dark:#131417; --lp-pri-tint:#E8F0FC;
  --lp-on-pri:#FFFFFF;
  --lp-on-band:#FFFFFF; --lp-on-band-muted:#C4C7CC; --lp-on-band-accent:#7FAEF0;
  --lp-ok:#0B6E4F; --lp-warn:#8A5200; --lp-crit:#B02418;
  --lp-radius:2px;
}
:root[data-theme="dark"] .lp[data-design="graphite"]{
  --lp-bg:#0D0E10; --lp-paper:#131417; --lp-card:#17191D;
  --lp-ink:#ECEDEF; --lp-ink-2:#CCCFD4; --lp-muted:#9BA0A8; --lp-faint:#7E838B;
  --lp-line:#26282D; --lp-line-2:#35383E;
  --lp-pri:#5A9BF0; --lp-pri-deep:#8BB9F5; --lp-pri-dark:#0A0B0D; --lp-pri-tint:rgba(90,155,240,.15);
  --lp-on-pri:#06162B;
  --lp-on-band:#ECEDEF; --lp-on-band-muted:#A9ADB5; --lp-on-band-accent:#8BB9F5;
  --lp-ok:#3FAE84; --lp-warn:#D79A3A; --lp-crit:#E47366;
}

/* -------------------------------------------------------------- 4. ink */
.lp[data-design="ink"]{
  --lp-bg:#F6F3EC; --lp-paper:#EFEBE1; --lp-card:#FFFFFF;
  --lp-ink:#141312; --lp-ink-2:#332F2A; --lp-muted:#5C574D; --lp-faint:#7D776B;
  --lp-line:#DDD7C9; --lp-line-2:#C4BCA9;
  --lp-pri:#B4261A; --lp-pri-deep:#8E1A11; --lp-pri-dark:#141312; --lp-pri-tint:#FAE9E6;
  --lp-on-pri:#FFFFFF;
  --lp-on-band:#F6F3EC; --lp-on-band-muted:#BDB6A7; --lp-on-band-accent:#E8857A;
  --lp-ok:#1F6B3F; --lp-warn:#8A5200; --lp-crit:#B4261A;
  --lp-radius:0px;
}
:root[data-theme="dark"] .lp[data-design="ink"]{
  --lp-bg:#131211; --lp-paper:#191715; --lp-card:#1E1B19;
  --lp-ink:#F1EDE4; --lp-ink-2:#D3CCC0; --lp-muted:#A79F91; --lp-faint:#8A8275;
  --lp-line:#2C2926; --lp-line-2:#3D3934;
  --lp-pri:#E06A5C; --lp-pri-deep:#EC8C80; --lp-pri-dark:#0E0D0C; --lp-pri-tint:rgba(224,106,92,.15);
  --lp-on-pri:#2A0B07;
  --lp-on-band:#F1EDE4; --lp-on-band-muted:#B0A89A; --lp-on-band-accent:#EC8C80;
  --lp-ok:#4FA771; --lp-warn:#D79A3A; --lp-crit:#E06A5C;
}

/* --------------------------------------- what the page inherits from the app
   The filled button and the drawings are app components rendered inside the
   landing page and they read app tokens, so without this the call to action
   keeps the house green whatever the palette says. Declared on .lp, an
   ancestor of both, so the values are INHERITED. Putting them on the element
   itself is what broke this the first time: a declaration on an element beats
   a value inherited from an ancestor whatever the specificities are. */
.lp{
  --pri-from:var(--lp-pri); --pri-to:var(--lp-pri);
  --pri-from-h:var(--lp-pri-deep); --pri-to-h:var(--lp-pri-deep);
  --pri-line:var(--lp-pri-deep); --on-brand:var(--lp-on-pri);
  --pri-glow:var(--lp-pri-tint);
  --brand:var(--lp-pri); --brand-2:var(--lp-pri); --brand-tint:var(--lp-pri-tint);
  --brand-deep:var(--lp-pri-deep); --green-2:var(--lp-ok);
}
/* ILLUS_CSS declares the whole --il-* palette on .illus itself, so an ancestor
   never reaches it. Matched at the element instead. */
.lp .illus{
  --il-tint:var(--lp-pri-tint); --il-ink:var(--lp-pri); --il-ink-2:var(--lp-pri-deep);
  --il-paper:var(--lp-card); --il-line:var(--lp-line-2);
  --il-cool:var(--lp-pri); --il-warm:var(--lp-warn);
}
/* Dark keeps the neutrals ILLUS_CSS chose and takes only the accents: on a
   dark ground the figure has to be the brightest thing, and making --il-ink
   the accent turns the figure and the seal it reaches for into one colour. */
:root[data-theme="dark"] .lp .illus{
  --il-ink:var(--lp-ink); --il-ink-2:var(--lp-faint); --il-line:var(--lp-muted);
}

/* The charts on the page are the product's own components, so they keep the
   app's eight-slot series palette, which is validated for colour-blindness in
   tools/palette-check.mjs and must not be re-derived here. Only the first slot
   is pinned, so the lead series and the buttons agree. */
.lp .fig, .lp .cols, .lp .meter2, .lp .bars2{ --s1:var(--lp-pri); }

@media(min-width:${BP.tab}px){
  .lp{ --lp-gutter:48px; }
}
`;

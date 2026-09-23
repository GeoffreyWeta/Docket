/* The front page's pictures.

   WHY THIS FILE EXISTS WHEN illus.jsx ALREADY DRAWS. illus.jsx serves the
   signed-in app: 220x150 scenes, sized to sit above one sentence in an empty
   table, coloured from the app's --il-* tokens. The front page wants
   something else — larger scenes that own a card rather than apologise for an
   empty one, coloured from the landing palette (--lp-*), and a few of them
   moving. Pointing illus.jsx at both jobs would mean one drawing set serving
   two palettes at two sizes, which is how a set stops being a set.

   THE RULES ARE illus.jsx's RULES, because they are what let one drawing
   survive four palettes times two themes:

     1. NO LITERAL COLOURS. Every fill is an --a-* variable, and every --a-*
        resolves from a --lp-* token in LPART_CSS below. A scene drawn with
        #0B2A5B is invisible the moment a reader switches to dark or an
        administrator switches the palette to Ink.

     2. NO FACES, NO SKIN. Figures are single-colour silhouettes. A drawing
        that picks a skin tone for the buyer at the desk has made a decision
        this product has no business making, and a face does not read at
        120px anyway.

     3. DECORATIVE BY DEFAULT. Every scene is aria-hidden and carries no text
        of its own, so nothing here is information a screen reader can miss.
        Whatever the picture says, the paragraph beside it says too.

   And one rule of this file's own:

     4. THE DRAWING IS THE PRODUCT'S OWN VOCABULARY. Seals, envelopes,
        ledgers, ballots, gavels, registers. No abstract blobs, no isometric
        cityscape, no three people high-fiving around a laptop. A page whose
        claim is "your record survives an audit" cannot illustrate itself with
        stock cheerfulness.

   Geometry: every scene draws into a 240x160 box with the ground line at
   y=142, so two scenes side by side stand on the same floor. */
import React from "react";

/* ------------------------------------------------------------- the scenes */

const SCENES = {
  /* SEALED BIDDING. A stack of envelopes with the top flap shut — the shut
     flap is the entire product — and a clock rather than a key beside it,
     because sealing here is a property of time, not of a permission somebody
     is holding. The amount is drawn as ciphertext dashes, not as blur: blur
     says "we hid it from you", dashes say "there is nothing here to read
     yet". */
  sealed: (
    <>
      <circle cx="132" cy="60" r="54" fill="var(--a-tint)" />
      <ellipse cx="118" cy="142" rx="84" ry="6" fill="var(--a-shade)" />

      {/* The two underneath are WIDER than the top one and outlined like it,
          so they peek at the sides as well as the foot. Filled slabs would
          read as a plinth the envelope is standing on, not as more mail. */}
      <rect x="38" y="108" width="162" height="22" rx="5" fill="var(--a-paper)" stroke="var(--a-line)" strokeWidth="2.4" />
      <rect x="45" y="99" width="148" height="22" rx="5" fill="var(--a-paper)" stroke="var(--a-line)" strokeWidth="2.4" />
      <rect x="52" y="38" width="134" height="74" rx="6" fill="var(--a-paper)" stroke="var(--a-line)" strokeWidth="2.4" />
      <path d="M52 44l67 42 67-42" fill="none" stroke="var(--a-line)" strokeWidth="2.4" strokeLinejoin="round" />

      {/* where the amount would be, if the deadline had passed */}
      <path d="M68 60h15M89 60h9M104 60h22" stroke="var(--a-line)" strokeWidth="4.5"
            strokeLinecap="round" opacity=".75" />

      <circle cx="119" cy="82" r="19" fill="var(--a-accent)" />
      <circle cx="119" cy="82" r="11" fill="none" stroke="var(--a-paper)" strokeWidth="2.4" opacity=".85" />
      <circle cx="112" cy="75" r="3.2" fill="var(--a-paper)" opacity=".55" />
      {/* Drawn after the seal so it expands out of it rather than out from
          under it. It is the only looping thing in the set and it is on the
          one object that is doing something. */}
      <circle className="a-ring" cx="119" cy="82" r="19" fill="none"
              stroke="var(--a-accent)" strokeWidth="2.5" />

      <circle cx="197" cy="40" r="21" fill="var(--a-paper)" stroke="var(--a-line)" strokeWidth="2.4" />
      <path d="M197 28v12.5l8.5 5.5" fill="none" stroke="var(--a-ink)" strokeWidth="3.4"
            strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),

  /* THE HASH CHAIN. Three records, each carrying the fingerprint of the one
     before it, with the link line running behind them and marching forward.
     The head of the chain carries the tick, not every block: what verifies is
     the chain, and a tick on all three would say each record was checked on
     its own, which is the opposite of the claim. */
  chain: (
    <>
      <circle cx="118" cy="58" r="52" fill="var(--a-tint)" />
      <ellipse cx="120" cy="142" rx="80" ry="6" fill="var(--a-shade)" />

      <path className="a-flow" d="M44 86h152" fill="none" stroke="var(--a-accent)" strokeWidth="3"
            strokeLinecap="round" strokeDasharray="9 9" />

      {[16, 91, 166].map((x) => (
        <g key={x}>
          <rect x={x} y="58" width="58" height="54" rx="7" fill="var(--a-paper)"
                stroke="var(--a-line)" strokeWidth="2.4" />
          <path d={`M${x + 13} 74h32M${x + 13} 85h22`} stroke="var(--a-line)" strokeWidth="3.4" strokeLinecap="round" />
          {/* the fingerprint line, in the accent: the one field that is not
              the record's own content but the record before it */}
          <path d={`M${x + 13} 97h16`} stroke="var(--a-accent)" strokeWidth="3.4" strokeLinecap="round" />
        </g>
      ))}

      <circle cx="199" cy="50" r="15" fill="var(--a-accent)" />
      <path d="M192 50.5l5 5 9-10.5" fill="none" stroke="var(--a-paper)" strokeWidth="3.2"
            strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),

  /* BLIND EVALUATION. Three scorecards and no names on any of them: the
     panel scores what was offered, not who offered it. The dotted row at the
     head of each card is the withheld identity, and the lock sits between
     the cards rather than on one of them because what is locked is the panel,
     not a document. */
  score: (
    <>
      <circle cx="120" cy="58" r="52" fill="var(--a-tint)" />
      <ellipse cx="120" cy="142" rx="80" ry="6" fill="var(--a-shade)" />

      {[[22, 40], [90, 32], [158, 40]].map(([x, y]) => (
        <g key={x}>
          <rect x={x} y={y} width="60" height={130 - y} rx="6" fill="var(--a-paper)"
                stroke="var(--a-line)" strokeWidth="2.4" />
          <path d={`M${x + 12} ${y + 16}h9M${x + 26} ${y + 16}h9M${x + 40} ${y + 16}h6`}
                stroke="var(--a-line)" strokeWidth="4" strokeLinecap="round" opacity=".8" />
          <path d={`M${x + 12} ${y + 30}h36`} stroke="var(--a-line)" strokeWidth="2.4" strokeLinecap="round" opacity=".5" />
        </g>
      ))}

      {/* the scores themselves: three weights per card, the middle card's
          winning one in the accent */}
      {[[34, 18, 26, 12], [102, 24, 34, 20], [170, 14, 22, 30]].map(([x, a, b, c], i) => (
        <g key={x}>
          <rect x={x} y={120 - a} width="10" height={a} rx="3" fill="var(--a-line)" />
          <rect x={x + 14} y={120 - b} width="10" height={b} rx="3" fill={i === 1 ? "var(--a-accent)" : "var(--a-line)"} />
          <rect x={x + 28} y={120 - c} width="10" height={c} rx="3" fill="var(--a-line)" />
        </g>
      ))}

      <circle cx="120" cy="96" r="20" fill="var(--a-ink)" />
      <rect x="112" y="94" width="16" height="13" rx="3" fill="var(--a-paper)" />
      <path d="M115 94v-4a5 5 0 0 1 10 0v4" fill="none" stroke="var(--a-paper)" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),

  /* THE REVERSE AUCTION. Bars that step DOWN left to right, because the
     number falling is the point, with the winning bar in the accent and the
     gavel waiting above it. The dashed line over the tops is the price
     travelling, drawn marching so the one picture on the page that shows a
     live event actually moves. */
  auction: (
    <>
      <circle cx="116" cy="56" r="52" fill="var(--a-tint)" />
      <ellipse cx="120" cy="142" rx="80" ry="6" fill="var(--a-shade)" />

      <path d="M32 26v104h176" fill="none" stroke="var(--a-ink-2)" strokeWidth="3.2"
            strokeLinecap="round" strokeLinejoin="round" opacity=".55" />

      {[[48, 44], [82, 60], [116, 76], [150, 96]].map(([x, top], i) => (
        <rect key={x} x={x} y={top} width="26" height={130 - top} rx="4"
              fill={i === 3 ? "var(--a-accent)" : "var(--a-line)"} />
      ))}

      <path className="a-flow" d="M61 44l34 16 34 16 34 20" fill="none" stroke="var(--a-warm)"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="7 7" />

      <g transform="rotate(-22 190 52)">
        <rect x="172" y="36" width="36" height="15" rx="4" fill="var(--a-ink)" />
        <rect x="186" y="49" width="8" height="34" rx="4" fill="var(--a-ink-2)" />
      </g>
      <rect x="160" y="118" width="52" height="8" rx="4" fill="var(--a-ink-2)" opacity=".45" />
    </>
  ),

  /* THE VENDOR REGISTER. Three rows of a register rather than three portrait
     cards: what a buyer gets is a list they can search, not a gallery. Two
     rows verified, the third still waiting on a document — a register in
     which everything is already green is a register nobody needs. */
  register: (
    <>
      <circle cx="120" cy="58" r="52" fill="var(--a-tint)" />
      <ellipse cx="120" cy="142" rx="80" ry="6" fill="var(--a-shade)" />

      {[34, 74, 114].map((y, i) => (
        <g key={y}>
          <rect x="26" y={y} width="188" height="32" rx="6" fill="var(--a-paper)"
                stroke="var(--a-line)" strokeWidth="2.4" />
          <circle cx="48" cy={y + 12} r="6.5" fill="var(--a-ink-2)" />
          <path d={`M40 ${y + 26}a8 8 0 0 1 16 0`} fill="var(--a-ink-2)" />
          <path d={`M68 ${y + 12}h66`} stroke="var(--a-line)" strokeWidth="4.5" strokeLinecap="round" />
          <path d={`M68 ${y + 22}h40`} stroke="var(--a-line)" strokeWidth="4" strokeLinecap="round" opacity=".6" />
          {i < 2 ? (
            <>
              <circle cx="192" cy={y + 16} r="10" fill="var(--a-accent)" />
              <path d={`M187 ${y + 16.5}l3.6 3.6 6.4 -7.2`} fill="none" stroke="var(--a-paper)"
                    strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : (
            <circle cx="192" cy={y + 16} r="10" fill="none" stroke="var(--a-warm)"
                    strokeWidth="2.4" strokeDasharray="4 4" />
          )}
        </g>
      ))}
    </>
  ),

  /* AUDIT. A ledger under a glass, with the trend drawn on the page rather
     than floating beside it: the chart and the record are the same document,
     which is most of what this product is arguing. */
  audit: (
    <>
      <circle cx="108" cy="58" r="50" fill="var(--a-tint)" />
      <ellipse cx="116" cy="142" rx="76" ry="6" fill="var(--a-shade)" />

      <rect x="40" y="24" width="118" height="110" rx="6" fill="var(--a-paper)"
            stroke="var(--a-line)" strokeWidth="2.4" />
      <path d="M56 44h86M56 58h86M56 72h86M56 86h86M56 100h56" stroke="var(--a-line)"
            strokeWidth="2" strokeLinecap="round" opacity=".55" />
      <path d="M58 96l22-18 20 10 24-30 18 8" fill="none" stroke="var(--a-accent)" strokeWidth="3.4"
            strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="142" cy="66" r="4.5" fill="var(--a-accent)" />

      <circle cx="162" cy="92" r="30" fill="var(--a-paper)" opacity=".5" />
      <circle cx="162" cy="92" r="30" fill="none" stroke="var(--a-accent)" strokeWidth="5.5" />
      <path d="M184 114l16 16" stroke="var(--a-ink)" strokeWidth="8" strokeLinecap="round" />
    </>
  ),

  /* A WRITTEN GUIDE. An open book with a ribbon and a seal on the recto: the
     resources section's covers are drawings rather than photographs of
     laptops, which is the usual filler in this slot and says nothing. */
  book: (
    <>
      <circle cx="120" cy="60" r="50" fill="var(--a-tint)" />
      <ellipse cx="120" cy="142" rx="78" ry="6" fill="var(--a-shade)" />

      <path d="M120 44c-14-10-34-13-52-11v78c18-2 38 1 52 11Z" fill="var(--a-paper)"
            stroke="var(--a-line)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M120 44c14-10 34-13 52-11v78c-18-2-38 1-52 11Z" fill="var(--a-paper)"
            stroke="var(--a-line)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M120 44v78" stroke="var(--a-line)" strokeWidth="2.6" />
      <path d="M82 60h26M82 72h22M136 60h26M136 72h26M136 84h18" stroke="var(--a-line)"
            strokeWidth="3" strokeLinecap="round" opacity=".6" />
      <path d="M150 33v42l-9-8-9 8V36" fill="var(--a-warm)" opacity=".85" />
      <circle cx="96" cy="96" r="13" fill="var(--a-accent)" />
      <circle cx="96" cy="96" r="7" fill="none" stroke="var(--a-paper)" strokeWidth="2" opacity=".8" />
    </>
  ),

  /* A TEMPLATE. A matrix — levels down one side, categories across the top —
     because the thing being offered is a grid somebody fills in, and drawing
     it as a grid is the shortest way to say so. */
  grid: (
    <>
      <circle cx="122" cy="58" r="50" fill="var(--a-tint)" />
      <ellipse cx="120" cy="142" rx="78" ry="6" fill="var(--a-shade)" />

      <rect x="34" y="30" width="172" height="102" rx="6" fill="var(--a-paper)"
            stroke="var(--a-line)" strokeWidth="2.4" />
      <path d="M34 54h172" stroke="var(--a-line)" strokeWidth="2.4" />
      <path d="M78 30v102" stroke="var(--a-line)" strokeWidth="2.4" />
      <rect x="34" y="30" width="172" height="24" rx="6" fill="var(--a-accent)" opacity=".16" />
      <path d="M92 42h22M128 42h22M164 42h22" stroke="var(--a-accent)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M46 68h20M46 94h20M46 118h20" stroke="var(--a-line)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M78 80h128M78 106h128" stroke="var(--a-line)" strokeWidth="2" opacity=".55" />
      <path d="M122 30v102M166 30v102" stroke="var(--a-line)" strokeWidth="2" opacity=".55" />
      {/* one cell filled in, so the grid reads as a thing in use */}
      <rect x="126" y="84" width="34" height="18" rx="4" fill="var(--a-accent)" />
      <path d="M134 93l4 4 8-9" fill="none" stroke="var(--a-paper)" strokeWidth="2.6"
            strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),

  /* THE HERO ORNAMENT, and the only scene here drawn to be CROPPED. The
     others are still lifes that need their whole frame: crop an envelope
     with a product panel and what is left over the edges is three grey pipes
     and nobody can tell what it was. A seal is radially symmetric, so any
     crop of it is still a seal — which is why the thing hanging off the
     corner of the fold is this and not a picture of something.

     It draws to its own square box rather than the set's 240x160, because it
     has no ground line to stand on and nothing to line up with. */
  ring: (
    <>
      <circle cx="120" cy="120" r="112" fill="none" stroke="var(--a-line)" strokeWidth="2" strokeDasharray="3 7" />
      <circle cx="120" cy="120" r="94" fill="none" stroke="var(--a-line)" strokeWidth="2" />
      <circle cx="120" cy="120" r="76" fill="var(--a-tint)" />
      <circle cx="120" cy="120" r="76" fill="none" stroke="var(--a-accent)" strokeWidth="2.5" opacity=".55" />
      {/* the graduation, every 15°: a seal's rim, and the thing that makes
          any crop of this read as an instrument rather than as a circle */}
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * Math.PI) / 12;
        const long = i % 2 === 0;
        const r1 = long ? 82 : 86;
        return (
          <path key={i} strokeWidth={long ? 2.6 : 1.8} stroke="var(--a-line)" strokeLinecap="round"
                d={`M${120 + r1 * Math.cos(a)} ${120 + r1 * Math.sin(a)}L${120 + 92 * Math.cos(a)} ${120 + 92 * Math.sin(a)}`} />
        );
      })}
      <circle cx="120" cy="120" r="46" fill="var(--a-accent)" opacity=".92" />
      <circle cx="120" cy="120" r="30" fill="none" stroke="var(--a-paper)" strokeWidth="3" opacity=".8" />
      <path d="M104 121l11 11 22-24" fill="none" stroke="var(--a-paper)" strokeWidth="5"
            strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),

  /* AN AREA HELD OPEN. Corner marks, a dashed frame and a blank seal: the
     drawing-office convention for a space reserved on purpose, as against
     square brackets, which read as a page that shipped before its images
     did. This one is used wherever the page is waiting on a customer or an
     outside name, and it should keep looking deliberate for as long as that
     takes. */
  reserved: (
    <>
      <rect x="18" y="18" width="204" height="114" rx="4" fill="none" stroke="var(--a-line)"
            strokeWidth="2" strokeDasharray="7 6" />
      <path d="M18 40V18h22M200 18h22v22M222 110v22h-22M40 132H18v-22"
            fill="none" stroke="var(--a-ink-2)" strokeWidth="3" strokeLinecap="round" opacity=".7" />
      <circle cx="120" cy="75" r="24" fill="none" stroke="var(--a-line)" strokeWidth="2.4" strokeDasharray="5 5" />
      <circle cx="120" cy="75" r="11" fill="none" stroke="var(--a-line)" strokeWidth="2.4" />
      <path d="M120 40v-8M120 118v-8M172 75h8M60 75h8" stroke="var(--a-line)" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
};

export const ART_NAMES = Object.keys(SCENES);

/* Every scene draws into 240x160 except the ones listed here, which say why
   in their own comment. Keeping the exception in one map rather than beside
   each drawing is what stops the box quietly becoming a per-scene decision. */
const BOX = { ring: "0 0 240 240" };

/** A decorative scene. `n` is a key of SCENES; `w` caps its rendered width. */
export function Art({ n, w, className = "" }) {
  const art = SCENES[n];
  if (!art) return null;
  return (
    <svg className={"lpart " + className} viewBox={BOX[n] || "0 0 240 160"} role="presentation"
         aria-hidden="true" focusable="false" style={w ? { maxWidth: w } : undefined}>
      {art}
    </svg>
  );
}

export const LPART_CSS = `
/* THE PALETTE, resolved once on the svg itself rather than inherited from an
   ancestor. The landing page sets --lp-* on .lp, but these drawings are also
   rendered inside the dark band, where paper and line have to change without
   the rest of the page changing with them — and a rule matching .lpart beats
   an inherited value whatever the ancestor said.

     --a-tint    the backdrop disc: a wash, never a shape you read
     --a-ink     the heaviest objects and the figures
     --a-ink-2   the step behind --a-ink: furniture, second-plane objects
     --a-paper   sheets, envelopes, screens: whatever should read as paper
     --a-line    outlines on paper, and the "nothing here yet" grey
     --a-accent  the one saturated colour: seals, the winning bar, the tick
     --a-warm    the second accent, used sparingly: pending, falling prices
     --a-shade   the ground shadow every scene stands on                    */
.lpart{display:block;width:100%;height:auto;
  --a-tint:color-mix(in srgb,var(--lp-pri) 11%,transparent);
  --a-ink:var(--lp-pri-deep);
  --a-ink-2:color-mix(in srgb,var(--lp-pri-deep) 62%,var(--lp-muted));
  --a-paper:var(--lp-card);
  --a-line:var(--lp-line-2);
  --a-accent:var(--lp-pri);
  --a-warm:var(--lp-warn);
  --a-shade:color-mix(in srgb,var(--lp-ink) 9%,transparent)}

/* Dark. The neutrals climb rather than fall — on a dark ground the paper has
   to be the surface that is genuinely raised, and --lp-card is the only token
   that always is. --a-ink stops being the primary for the same reason
   ILLUS_CSS drops it: dark palettes brighten --lp-pri until the object and
   the accent it is reaching for are the same colour. */
:root[data-theme="dark"] .lpart{
  --a-tint:color-mix(in srgb,var(--lp-pri) 20%,transparent);
  --a-ink:var(--lp-ink-2);
  --a-ink-2:var(--lp-muted);
  --a-paper:var(--lp-card);
  --a-line:var(--lp-muted);
  --a-shade:color-mix(in srgb,#000 32%,transparent)}

/* On the dark band the drawing is sitting on --lp-pri-dark in BOTH themes, so
   it takes the dark treatment in both. Without this the light theme draws a
   white-paper scene onto a navy band, which is not wrong so much as loud. */
.lpsec.dark .lpart{
  --a-tint:color-mix(in srgb,var(--lp-on-band) 10%,transparent);
  --a-ink:var(--lp-on-band);
  --a-ink-2:var(--lp-on-band-muted);
  --a-paper:color-mix(in srgb,var(--lp-on-band) 12%,transparent);
  --a-line:color-mix(in srgb,var(--lp-on-band) 40%,transparent);
  --a-accent:var(--lp-on-band-accent);
  --a-shade:transparent}

/* THE TWO THINGS THAT MOVE, and they are both on objects that are genuinely
   doing something: the ring pushing out of a seal as it lands, and the dashes
   travelling along a chain link or a falling price. Everything else in the
   set is a still life and stays one. */
.a-ring{transform-box:fill-box;transform-origin:center;animation:a-ring 2.8s var(--ease) infinite}
@keyframes a-ring{
  0%{transform:scale(1);opacity:.55}
  70%{transform:scale(1.55);opacity:0}
  100%{transform:scale(1.55);opacity:0}
}
.a-flow{animation:a-flow 1.6s linear infinite}
@keyframes a-flow{to{stroke-dashoffset:-18}}
@media(prefers-reduced-motion:reduce){
  .a-ring{animation:none;opacity:.35}
  .a-flow{animation:none}
}
`;

/* DOCKET illustration set: inline SVG scenes, no asset files, no CDN.

   Same rules as icons.jsx, one size up. An icon is a 20x20 glyph that rides
   next to text; a scene here is a 220x150 picture that owns the middle of an
   empty card. Both are drawn rather than shipped, so there is nothing to
   optimise, nothing to lazy-load, and nothing that goes stale at a CDN.

   THREE RULES, and they are what let one drawing survive both themes:

   1. NO LITERAL COLOURS. Every fill is one of the six --il-* variables below,
      which resolve from theme tokens. A scene drawn with #0B3D24 would be
      invisible on dark. The only exception is opacity on a themed colour,
      which is safe because it composites against whatever is behind it.

   2. NO FACES, NO SKIN. Figures are single-colour silhouettes. That is a
      style decision and a scope one: a procurement console has no business
      picking a skin tone for the person at the desk, and a silhouette reads
      at 180px where a face does not.

   3. DECORATIVE BY DEFAULT. Every scene is aria-hidden and carries no text of
      its own. The empty state's sentence is the accessible content; the
      picture is mood. Never put information in here that is not also written
      out underneath, because a screen reader will never reach it.

   The vocabulary is the same as the icon set's: seals, envelopes, ledgers,
   trays, desks. Procurement stationery, not generic SaaS confetti.

   Usage:  <Illus n="desk" />              in a hero panel
           <Illus n="clear" w={150} />     smaller, inside an empty state
           <Empty art="sealed">…</Empty>   the usual route (see atoms.jsx)  */
import React from "react";

/* Each scene draws into a 220x150 box with the ground line at y=128, so two
   scenes shown side by side sit on the same floor. */
const S = {
  /* THE HERO. Someone at a desk with a laptop, reaching toward a seal that
     hangs in the air: the one scene with a figure in it, and the one that
     carries the whole look. Layered back to front — backdrop, plant, chair,
     figure, desk, laptop, seal — because SVG has no z-index and paint order
     is the only depth there is. */
  desk: (
    <>
      <circle cx="122" cy="60" r="48" fill="var(--il-tint)" />
      <ellipse cx="112" cy="129" rx="76" ry="5" fill="var(--il-ink)" opacity=".09" />

      {/* the plant, because every one of these has a plant */}
      <path d="M19 111h17l-2.2 13a2 2 0 0 1-2 1.7h-8.6a2 2 0 0 1-2-1.7Z" fill="var(--il-warm)" />
      <path d="M27.5 111V93" stroke="var(--il-cool)" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="20" cy="93" rx="7.5" ry="4.6" transform="rotate(-30 20 93)" fill="var(--il-cool)" />
      <ellipse cx="35" cy="87" rx="8" ry="5" transform="rotate(26 35 87)" fill="var(--il-cool)" />
      <ellipse cx="27.5" cy="79" rx="5.4" ry="8.4" fill="var(--il-cool)" opacity=".72" />

      {/* chair: back panel, then the post and star base under the seat */}
      <rect x="56" y="56" width="23" height="50" rx="10" fill="var(--il-ink-2)" />
      <path d="M84 116v9" stroke="var(--il-ink-2)" strokeWidth="4" strokeLinecap="round" />
      <path d="M74 127h20" stroke="var(--il-ink-2)" strokeWidth="4" strokeLinecap="round" />

      {/* the figure, seated and leaning in */}
      <circle cx="87" cy="50" r="11.5" fill="var(--il-ink)" />
      <path d="M75 98V73a12 12 0 0 1 24 0v25Z" fill="var(--il-ink)" />
      {/* one warm band at the cuff, so the silhouette is not a single blob */}
      <path d="M96 76c9 2.4 15.6 6 20 10.5" stroke="var(--il-ink)" strokeWidth="8" strokeLinecap="round" fill="none" />
      <path d="M112 83.5c1.6 1 3 2 4.2 3" stroke="var(--il-warm)" strokeWidth="8" strokeLinecap="round" fill="none" />
      <rect x="75" y="97" width="35" height="13" rx="6.5" fill="var(--il-ink)" />
      <rect x="99" y="105" width="11" height="21" rx="5.5" fill="var(--il-ink-2)" />

      {/* Desk, drawn AFTER the figure so its edge occludes the legs, and in the
          warm tone rather than the ink: at this height the top rail sits exactly
          where the thigh does, and in the same navy the two fused into one bar
          that read as the leg being the desk. */}
      <rect x="102" y="99" width="98" height="7" rx="3.5" fill="var(--il-warm)" />
      <rect x="102" y="105" width="98" height="3" rx="1.5" fill="var(--il-ink-2)" opacity=".35" />
      <rect x="187" y="106" width="5.5" height="21" rx="2.7" fill="var(--il-ink-2)" />

      {/* laptop, resting on the desk surface at y=99 */}
      <rect x="120" y="69" width="37" height="25" rx="3" fill="var(--il-paper)" stroke="var(--il-line)" strokeWidth="2" />
      <path d="M126 77h21M126 84h13" stroke="var(--il-line)" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="113" y="93.5" width="51" height="5.5" rx="2.7" fill="var(--il-paper)" stroke="var(--il-line)" strokeWidth="2" />

      {/* the seal in the air: the same three moves the real seal mark makes —
          a disc, an inner ring, one off-centre specular */}
      <circle cx="178" cy="45" r="17" fill="var(--il-cool)" />
      <circle cx="178" cy="45" r="8.4" fill="none" stroke="var(--il-paper)" strokeWidth="2.2" opacity=".85" />
      <circle cx="172" cy="39" r="2.7" fill="var(--il-paper)" opacity=".6" />
      <circle cx="155" cy="26" r="3" fill="var(--il-cool)" opacity=".5" />
      <circle cx="199" cy="70" r="2.2" fill="var(--il-cool)" opacity=".4" />
    </>
  ),

  /* Nothing in the queue: a squared-up stack of paper with the work signed
     off. This was an in-tray with a seal hovering over it, which at 190px read
     as a dish with a floating orb above it — two trapezoids are not enough to
     say "tray". A stack of sheets plus a tick is unmistakable at any size.

     Calm rather than celebratory on purpose: a clear queue is the NORMAL state
     most of the time, and confetti every time you look wears out by Tuesday. */
  clear: (
    <>
      <circle cx="106" cy="62" r="46" fill="var(--il-tint)" />
      <ellipse cx="108" cy="127" rx="58" ry="5" fill="var(--il-ink)" opacity=".09" />
      {/* two sheets peeking from under the top one, squared up */}
      <rect x="74" y="30" width="76" height="72" rx="5" fill="var(--il-paper)" stroke="var(--il-line)" strokeWidth="2.4" opacity=".5" />
      <rect x="66" y="38" width="86" height="72" rx="5" fill="var(--il-paper)" stroke="var(--il-line)" strokeWidth="2.4" opacity=".75" />
      <rect x="56" y="46" width="98" height="72" rx="5" fill="var(--il-paper)" stroke="var(--il-line)" strokeWidth="2.4" />
      <path d="M70 66h58M70 80h44" stroke="var(--il-line)" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M70 94h28" stroke="var(--il-warm)" strokeWidth="3.2" strokeLinecap="round" />
      {/* signed off */}
      <circle cx="150" cy="96" r="21" fill="var(--il-cool)" />
      <path d="M141 96.5l6.4 6.4L160 90" fill="none" stroke="var(--il-paper)" strokeWidth="4.4"
            strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),

  /* Bids are in and still sealed: a stack of envelopes, the top one stamped.
     The flap on the top envelope stays shut, which is the whole point of the
     product and the one detail worth getting right in this drawing. */
  sealed: (
    <>
      <circle cx="110" cy="66" r="46" fill="var(--il-tint)" />
      <ellipse cx="110" cy="127" rx="62" ry="5" fill="var(--il-ink)" opacity=".09" />
      {/* The two underneath are WIDER than the top one and outlined like it, so
          they peek at the sides as well as the foot. Filled slabs in the ink
          tone read as a plinth the envelope is standing on, not as more mail. */}
      <rect x="44" y="98" width="132" height="20" rx="4" fill="var(--il-paper)" stroke="var(--il-line)" strokeWidth="2.4" />
      <rect x="49" y="90" width="122" height="20" rx="4" fill="var(--il-paper)" stroke="var(--il-line)" strokeWidth="2.4" />
      <rect x="54" y="46" width="112" height="58" rx="5" fill="var(--il-paper)" stroke="var(--il-line)" strokeWidth="2.4" />
      {/* the flap stays shut: that is the entire product */}
      <path d="M54 51l56 34 56-34" fill="none" stroke="var(--il-line)" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="110" cy="76" r="16" fill="var(--il-cool)" />
      <circle cx="110" cy="76" r="7.8" fill="none" stroke="var(--il-paper)" strokeWidth="2.2" opacity=".85" />
      <circle cx="104.5" cy="70.5" r="2.5" fill="var(--il-paper)" opacity=".6" />
    </>
  ),

  /* Nothing matched the filter: a ledger page under a glass. The page keeps
     its ruled lines so it reads as a register rather than a blank sheet. */
  search: (
    <>
      <circle cx="106" cy="64" r="45" fill="var(--il-tint)" />
      <ellipse cx="110" cy="127" rx="56" ry="5" fill="var(--il-ink)" opacity=".09" />
      <rect x="62" y="34" width="86" height="88" rx="5" fill="var(--il-paper)" stroke="var(--il-line)" strokeWidth="2.4" />
      <path d="M74 54h44M74 68h62M74 82h34" stroke="var(--il-line)" strokeWidth="3" strokeLinecap="round" />
      <path d="M74 96h24" stroke="var(--il-warm)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="128" cy="86" r="25" fill="var(--il-paper)" opacity=".55" />
      <circle cx="128" cy="86" r="25" fill="none" stroke="var(--il-cool)" strokeWidth="5" />
      <path d="M146 104l14 14" stroke="var(--il-ink)" strokeWidth="7" strokeLinecap="round" />
    </>
  ),

  /* Nothing to plot yet: an axis pair with the bars not grown in. The ghost
     bars are the empty state — they show where data will land rather than
     leaving a blank rectangle that looks like a loading failure. */
  chart: (
    <>
      <circle cx="110" cy="64" r="45" fill="var(--il-tint)" />
      <ellipse cx="110" cy="127" rx="58" ry="5" fill="var(--il-ink)" opacity=".09" />
      <path d="M60 32v82h104" fill="none" stroke="var(--il-ink-2)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="74" y="88" width="16" height="22" rx="3" fill="var(--il-line)" />
      <rect x="98" y="76" width="16" height="34" rx="3" fill="var(--il-line)" />
      <rect x="122" y="62" width="16" height="48" rx="3" fill="var(--il-cool)" />
      <rect x="146" y="84" width="16" height="26" rx="3" fill="var(--il-line)" />
      <path d="M74 56l24-12 24 10 24-22" fill="none" stroke="var(--il-warm)" strokeWidth="3.4"
            strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 6" />
      <circle cx="146" cy="32" r="5" fill="var(--il-warm)" />
    </>
  ),

  /* A DRAFT WAITING FOR ITS SEAL, and the one scene here that is not a still
     life: the seal is a separate group so the New tender panel can stamp it
     down when the draft becomes complete (see DRAFT_CSS in buyer.jsx). Three
     parts carry class names for that reason and only that reason:

       .il-spot   the empty ring, dashed, marching while something is missing
       .il-shock  the ring that pushes out from under the seal as it lands
       .il-seal   the seal itself, which drops in from above and overshoots

     Everything else follows the file's rules: no literal colours, no faces,
     ground line at y=128, and a plant, because every one of these has a plant. */
  draft: (
    <>
      <circle cx="124" cy="56" r="46" fill="var(--il-tint)" />
      <ellipse cx="112" cy="133" rx="72" ry="5" fill="var(--il-ink)" opacity=".09" />

      <path d="M17 112h18l-2.3 13.6a2 2 0 0 1-2 1.7h-9.4a2 2 0 0 1-2-1.7Z" fill="var(--il-warm)" />
      <path d="M26 112V95" stroke="var(--il-cool)" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="18.5" cy="95" rx="7" ry="4.4" transform="rotate(-30 18.5 95)" fill="var(--il-cool)" />
      <ellipse cx="33.5" cy="89" rx="7.5" ry="4.7" transform="rotate(26 33.5 89)" fill="var(--il-cool)" />
      <ellipse cx="26" cy="82" rx="5" ry="7.8" fill="var(--il-cool)" opacity=".72" />

      <g className="il-sheet">
        <rect x="64" y="34" width="98" height="94" rx="6" fill="var(--il-paper)"
              stroke="var(--il-line)" strokeWidth="2" />
        <rect x="78" y="50" width="70" height="5" rx="2.5" fill="var(--il-line)" />
        <rect x="78" y="63" width="70" height="5" rx="2.5" fill="var(--il-line)" />
        <rect x="78" y="76" width="46" height="5" rx="2.5" fill="var(--il-line)" />

        <circle className="il-spot" cx="130" cy="103" r="15" fill="none"
                stroke="var(--il-line)" strokeWidth="2" strokeDasharray="5 5" />

        <g className="il-shock">
          <circle cx="130" cy="103" r="15" fill="none" stroke="var(--il-cool)" strokeWidth="2.5" />
        </g>

        <g className="il-seal">
          <path d="M118 112l-5 16 10-4 7 4 7-4 10 4-5-16Z" fill="var(--il-cool)" opacity=".55" />
          <circle cx="130" cy="103" r="15" fill="var(--il-cool)" />
          <circle cx="130" cy="103" r="10.5" fill="none" stroke="var(--il-paper)"
                  strokeWidth="2" opacity=".85" />
          <path d="M124.5 103.5l4 4 7.5-8" fill="none" stroke="var(--il-paper)"
                strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>

      <g className="il-pen">
        <g transform="rotate(24 186 96)">
          <rect x="181" y="58" width="10" height="52" rx="5" fill="var(--il-warm)" />
          <rect x="181" y="58" width="10" height="10" rx="5" fill="var(--il-ink-2)" opacity=".55" />
          <path d="M181 110h10l-5 11Z" fill="var(--il-ink-2)" />
        </g>
      </g>
    </>
  ),

  /* NOTHING SENT YET: an envelope that is still only an outline, over the tray
     it would land in. The dashes are the whole point, so this scene is wrong
     the moment anything HAS been sent. */
  tray: (
    <>
      <circle cx="112" cy="60" r="44" fill="var(--il-tint)" />
      <ellipse cx="110" cy="133" rx="70" ry="5" fill="var(--il-ink)" opacity=".09" />
      <rect x="76" y="36" width="70" height="46" rx="4" fill="none"
            stroke="var(--il-line)" strokeWidth="2" strokeDasharray="6 5" />
      <path d="M78 40l33 24 33-24" fill="none" stroke="var(--il-line)"
            strokeWidth="2" strokeDasharray="6 5" strokeLinecap="round" />
      <path d="M56 100h108l-12 24H68Z" fill="var(--il-ink-2)" opacity=".5" />
      <rect x="52" y="94" width="116" height="9" rx="4.5" fill="var(--il-ink)" />
      <path d="M110 70v18" stroke="var(--il-cool)" strokeWidth="2.5"
            strokeLinecap="round" strokeDasharray="3 5" />
    </>
  ),
};

export const ILLUS_NAMES = Object.keys(S);

/** A decorative scene. `n` is a key of S; `w` caps its rendered width. */
export function Illus({ n, w = 200, className = "" }) {
  const art = S[n];
  if (!art) return null;
  return (
    <svg className={"illus " + className} viewBox="0 0 220 150" role="presentation" aria-hidden="true"
         focusable="false" style={{ maxWidth: w }}>
      {art}
    </svg>
  );
}

/* The palette. Six variables, resolved from theme tokens, so a scene drawn
   once renders in all seven themes.

     --il-tint    the backdrop disc: a wash, never a shape you read
     --il-ink     figures and the heaviest objects
     --il-ink-2   the step behind --il-ink: furniture, second-plane objects
     --il-paper   sheets, screens, envelopes: whatever should read as paper
     --il-line    outlines on paper, and the "no data yet" grey
     --il-cool    the one saturated accent: seals, the live bar, the glass
     --il-warm    the second accent, used sparingly: a cuff, a highlight

   The defaults below work on any light theme. The dark themes need --il-paper
   and --il-line lifted off the page or every sheet turns into a hole, which
   is what the two override blocks do. */
export const ILLUS_CSS = `
.illus{display:block;width:100%;height:auto;margin:0 auto;
  --il-tint:color-mix(in srgb,var(--brand) 9%,transparent);
  --il-ink:var(--brand);
  --il-ink-2:var(--brand-deep);
  --il-paper:var(--card);
  --il-line:var(--line2);
  --il-cool:var(--green-2);
  --il-warm:var(--brass)}

/* Dark. Three things change here and none of them are optional:

   1. --il-paper takes --card, NOT --paper-2. On dark, --paper-2 (#081009) is
      DARKER than the page it sits on, so every sheet in every scene became a
      hole punched in the card. --card is the surface that is genuinely raised.
   2. The neutrals climb rather than fall: the figure is the brightest neutral,
      furniture a step back, outlines between the two. On a dark ground the
      silhouette has to be light or there is no silhouette.
   3. --il-ink stops being the brand. Dark sets --brand to its green, so
      --il-ink and --il-cool resolved to the SAME colour and the figure and the
      seal it is reaching for were indistinguishable. The accent has to be the
      only saturated thing in the picture. */
:root[data-theme="dark"] .illus{
  --il-tint:color-mix(in srgb,var(--brand) 18%,transparent);
  --il-paper:var(--card);
  --il-ink:var(--ink);
  --il-ink-2:var(--faint);
  --il-line:var(--muted);
  --il-cool:var(--green-2);
  --il-warm:var(--brass)}

/* In an empty state the scene replaces the icon, so it takes the icon's
   bottom margin and a width that leaves the sentence room to breathe. */
.empty .illus{margin-bottom:10px;max-width:190px}
.empty.hasart{padding-top:22px}
`;

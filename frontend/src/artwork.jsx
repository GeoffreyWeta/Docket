/* The plates.

   The front page needed imagery and DOCKET has no photographs. The reference
   material leans on black-and-white stock — offices, laptops, people mid-
   handshake — and that was never going to arrive here: it has to be licensed,
   it has to be hosted, it dates in about eighteen months, and a procurement
   product illustrated with strangers in a boardroom is making a claim about
   itself that it cannot support.

   So these are drawn, and drawn to be photographed rather than illustrated.
   That distinction is the whole module:

     THE SCENES IN illus.jsx ARE DIAGRAMS. Line work, a figure, an object,
     read at 168px beside a heading. They explain.

     THE PLATES HERE ARE PICTURES. Big flat tonal fields, perspective, a
     halftone screen over the top, one lit thing in a dark composition. They
     are meant to be looked at, at 400-600px, and they carry a mood rather
     than a meaning. Nothing in them is load-bearing: every plate is
     aria-hidden and every page still reads with all four turned off.

   FOUR TONES AND A SPOT. Each plate is painted from --pl-0 (deepest) through
   --pl-2 (lightest) with --pl-hi for the one thing that is lit. A design sets
   those four and the same drawing comes back greyscale with a lime spot, or
   teal duotone, or sepia. That is what makes one set of plates serve four
   pages instead of four sets serving one each.

   THE HALFTONE IS THE POINT. A flat vector field reads as a diagram no matter
   what colour it is; the dot screen is what makes it read as a reproduction of
   something. It is one <pattern> reused by every plate, scaled per plate so
   the dots stay the same size on screen whatever the viewBox. */
import React from "react";

/* One screen, defined once. `k` keys the ids so two plates on a page cannot
   collide — SVG ids are document-global and a duplicate silently repoints the
   first plate's fill at the second plate's pattern. */
function Screens({ k }) {
  return (
    <defs>
      {/* the halftone: a dot lattice, two rows offset, over the mid tones */}
      <pattern id={`ht-${k}`} width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="1.15" fill="var(--pl-0)" opacity=".5" />
        <circle cx="4.5" cy="4.5" r="1.15" fill="var(--pl-0)" opacity=".5" />
      </pattern>
      {/* a coarser screen for the large near fields, so texture reads at size */}
      <pattern id={`htc-${k}`} width="10" height="10" patternUnits="userSpaceOnUse">
        <circle cx="2.5" cy="2.5" r="1.7" fill="var(--pl-0)" opacity=".42" />
        <circle cx="7.5" cy="7.5" r="1.7" fill="var(--pl-0)" opacity=".42" />
      </pattern>
      {/* the light falling on the one lit object */}
      <linearGradient id={`lit-${k}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--pl-hi)" stopOpacity=".95" />
        <stop offset="1" stopColor="var(--pl-hi)" stopOpacity=".55" />
      </linearGradient>
      {/* the vignette that makes a flat field read as a photographed one */}
      <linearGradient id={`vig-${k}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--pl-0)" stopOpacity=".5" />
        <stop offset=".45" stopColor="var(--pl-0)" stopOpacity="0" />
        <stop offset="1" stopColor="var(--pl-0)" stopOpacity=".62" />
      </linearGradient>
    </defs>
  );
}

/* ------------------------------------------------------------------- vault
   A wall of numbered slots receding to the right, every one shut, one lit.
   The product's first claim as a picture: the bids are all in there and none
   of them is open, including the one somebody wants. */
function Vault({ k }) {
  const rows = [0, 1, 2, 3];
  const cols = [0, 1, 2, 3, 4, 5];
  return (
    <>
      <rect width="600" height="420" fill="var(--pl-1)" />
      {/* the far wall, in perspective: each column a little shorter and darker */}
      {cols.map((c) => (
        <g key={c} opacity={1 - c * 0.07}>
          {rows.map((r) => {
            const x = 34 + c * 92;
            const y = 52 + r * 84 + c * 5;
            const h = 66 - c * 2.5;
            const lit = c === 1 && r === 2;
            return (
              <g key={r}>
                <rect x={x} y={y} width="74" height={h} rx="4"
                      fill={lit ? `url(#lit-${k})` : "var(--pl-2)"} />
                <rect x={x} y={y} width="74" height={h} rx="4"
                      fill={lit ? "none" : `url(#ht-${k})`} />
                {/* the flap, shut */}
                <path d={`M${x} ${y + 5} L${x + 37} ${y + h * 0.52} L${x + 74} ${y + 5}`}
                      fill="none" stroke="var(--pl-0)" strokeOpacity={lit ? ".5" : ".34"}
                      strokeWidth="2" />
                {/* the seal */}
                <circle cx={x + 37} cy={y + h * 0.52 + 7} r="4.4"
                        fill={lit ? "var(--pl-0)" : "var(--pl-0)"} opacity={lit ? ".72" : ".3"} />
              </g>
            );
          })}
        </g>
      ))}
      {/* the floor, catching the light from the one lit slot */}
      <path d="M0 400 L600 372 L600 420 L0 420Z" fill="var(--pl-0)" opacity=".28" />
      <ellipse cx="163" cy="404" rx="96" ry="14" fill="var(--pl-hi)" opacity=".18" />
      <rect width="600" height="420" fill={`url(#vig-${k})`} />
    </>
  );
}

/* ------------------------------------------------------------------- stack
   A tall stack of paper seen from the side, slightly askew, with a seal on
   the top sheet. The stationery reading of the same claim, and the plate
   `paper` leads with. */
function Stack({ k }) {
  const sheets = Array.from({ length: 16 }, (_, i) => i);
  return (
    <>
      <rect width="600" height="420" fill="var(--pl-1)" />
      <ellipse cx="300" cy="372" rx="200" ry="26" fill="var(--pl-0)" opacity=".22" />
      {sheets.map((i) => {
        const y = 348 - i * 15;
        const skew = (i % 3 - 1) * 7 + (i % 5 - 2) * 2.5;
        return (
          <g key={i}>
            <rect x={168 + skew} y={y} width="268" height="15" rx="2"
                  fill={i % 2 ? "var(--pl-2)" : "var(--pl-2)"} opacity={0.62 + i * 0.022} />
            <rect x={168 + skew} y={y + 11} width="268" height="4"
                  fill="var(--pl-0)" opacity=".13" />
          </g>
        );
      })}
      {/* the top sheet, lit, with a wax seal and a signature rule */}
      <rect x="176" y="86" width="262" height="30" rx="3" fill={`url(#lit-${k})`} />
      <rect x="196" y="96" width="140" height="4" rx="2" fill="var(--pl-0)" opacity=".42" />
      <rect x="196" y="105" width="96" height="3" rx="1.5" fill="var(--pl-0)" opacity=".28" />
      <circle cx="404" cy="101" r="13" fill="var(--pl-0)" opacity=".62" />
      <circle cx="404" cy="101" r="7.5" fill="var(--pl-hi)" opacity=".55" />
      {/* the torn edge along the stack's right side */}
      <path d="M436 100 l6 6 -6 6 6 6 -6 6 6 6 -6 6 6 6 -6 6 6 6 -6 6 6 6 -6 6"
            fill="none" stroke="var(--pl-0)" strokeOpacity=".2" strokeWidth="2" />
      <rect width="600" height="420" fill={`url(#htc-${k})`} opacity=".5" />
      <rect width="600" height="420" fill={`url(#vig-${k})`} />
    </>
  );
}

/* ------------------------------------------------------------------ ladder
   Platforms climbing to the right, each one higher and each one holding a
   smaller silhouette, the top one lit. The approval chain as a picture: a
   request going up until somebody's limit covers it. */
function Ladder({ k }) {
  const steps = [0, 1, 2, 3];
  return (
    <>
      <rect width="600" height="420" fill="var(--pl-1)" />
      {steps.map((i) => {
        const x = 52 + i * 132;
        const h = 92 + i * 62;
        const y = 356 - h;
        const top = i === 3;
        return (
          <g key={i}>
            <rect x={x} y={y} width="104" height={h} rx="5"
                  fill={top ? `url(#lit-${k})` : "var(--pl-2)"}
                  opacity={top ? 1 : 0.5 + i * 0.13} />
            <rect x={x} y={y} width="104" height={h} rx="5" fill={`url(#ht-${k})`}
                  opacity={top ? ".25" : ".7"} />
            {/* the figure standing on it */}
            <circle cx={x + 52} cy={y - 26} r="11" fill="var(--pl-0)" opacity={top ? ".8" : ".46"} />
            <path d={`M${x + 36} ${y - 4} a16 16 0 0 1 32 0Z`}
                  fill="var(--pl-0)" opacity={top ? ".8" : ".46"} />
            {/* the request passing along */}
            {i < 3 && (
              <path d={`M${x + 112} ${y + 14} h14 l-5 -5 m5 5 -5 5`}
                    fill="none" stroke="var(--pl-0)" strokeOpacity=".4" strokeWidth="2.4"
                    strokeLinecap="round" strokeLinejoin="round" />
            )}
          </g>
        );
      })}
      <path d="M0 356 L600 356 L600 420 L0 420Z" fill="var(--pl-0)" opacity=".2" />
      <rect width="600" height="420" fill={`url(#vig-${k})`} />
    </>
  );
}

/* ------------------------------------------------------------------- chain
   Linked blocks running off both edges, each one carrying a short rule of
   "text", one lit. The hash chain: every record tied to the one before it. */
function Chain({ k }) {
  const links = [0, 1, 2, 3, 4];
  return (
    <>
      <rect width="600" height="420" fill="var(--pl-1)" />
      {links.map((i) => {
        const x = -28 + i * 136;
        const y = 132 + (i % 2 ? 26 : 0);
        const lit = i === 2;
        return (
          <g key={i}>
            {i > 0 && (
              <path d={`M${x - 32} ${y + 78} C${x - 14} ${y + 78} ${x - 18} ${y + 52} ${x} ${y + 52}`}
                    fill="none" stroke="var(--pl-0)" strokeOpacity=".38" strokeWidth="3"
                    strokeLinecap="round" />
            )}
            <rect x={x} y={y} width="112" height="156" rx="7"
                  fill={lit ? `url(#lit-${k})` : "var(--pl-2)"} opacity={lit ? 1 : ".72"} />
            <rect x={x} y={y} width="112" height="156" rx="7" fill={`url(#ht-${k})`}
                  opacity={lit ? ".2" : ".75"} />
            {[0, 1, 2, 3].map((n) => (
              <rect key={n} x={x + 16} y={y + 26 + n * 22} width={n === 3 ? 44 : 80} height="6"
                    rx="3" fill="var(--pl-0)" opacity={lit ? ".5" : ".3"} />
            ))}
            <circle cx={x + 90} cy={y + 130} r="8" fill="var(--pl-0)"
                    opacity={lit ? ".62" : ".26"} />
          </g>
        );
      })}
      <rect width="600" height="420" fill={`url(#vig-${k})`} />
    </>
  );
}

const PLATES = { vault: Vault, stack: Stack, ladder: Ladder, chain: Chain };

/** One plate. `n` is the drawing, `tall` crops it to a portrait frame for the
    designs that want a column rather than a landscape block. */
export function Plate({ n, tall, className = "" }) {
  const Art = PLATES[n] || Vault;
  const k = React.useId().replace(/:/g, "");
  return (
    <svg className={"plate " + (tall ? "tall " : "") + className}
         viewBox={tall ? "90 0 420 420" : "0 0 600 420"}
         preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <Screens k={k} />
      <Art k={k} />
    </svg>
  );
}

export const PLATE_CSS = `
/* The frame. A plate is a picture, so it fills its box and crops rather than
   letterboxing — preserveAspectRatio on the element does the cropping and this
   just gives it something to crop to. */
.plate{display:block;width:100%;height:100%;border-radius:inherit}
/* The default tones, on :root and NOT on .plate.

   This is the whole trick and it is worth stating, because the obvious two
   placements are both wrong. Put on .plate they sit on the element itself, and
   a declaration on an element beats a value INHERITED from an ancestor no
   matter what the specificities are — so the design's .lp[data-design="x"]
   block never reached the drawing and every plate came back in fallback grey
   with a house-green spot. Lowering that rule to :where(.plate) changes
   nothing, because specificity is only consulted between rules matching the
   SAME element, and inheritance is not in that contest at all.

   On :root they are genuinely inherited, so .lp[data-design="x"] — a
   descendant — overrides them for its own subtree, which is what was wanted.
   They exist only so a plate dropped outside .lp still draws something
   rather than four unresolved var()s, which paint black on black. */
:root{--pl-0:#0B1410; --pl-1:#E7ECE9; --pl-2:#FFFFFF; --pl-hi:#00A651}
.plateframe{position:relative;overflow:hidden;background:var(--pl-1);
  border-radius:var(--lp-radius);aspect-ratio:3 / 2}
.plateframe.tall{aspect-ratio:3 / 4}
.plateframe.wide{aspect-ratio:16 / 9}
.plate.tall{}

/* The caption that rides on a plate. Sits on the vignette, which is why it can
   be light type with no panel behind it: the gradient at the bottom of every
   plate is doing the contrast work. */
.platecap{position:absolute;left:0;right:0;bottom:0;padding:var(--s4);
  display:flex;align-items:baseline;gap:var(--s3);
  font-size:var(--t5);letter-spacing:.08em;text-transform:uppercase;font-weight:650;
  color:var(--pl-cap,#fff)}
/* Full strength, not the .8 it started at. Dimmed, the meta measured 4.40 on
   paper's vignette and 4.48 on drawn's — under AA for 13px text, by enough to
   matter and not enough to notice by eye. It is already told apart from the
   label by being mono, lowercase and right-aligned, so the opacity was buying
   nothing and costing the one thing it could not afford. */
.platecap i{font-style:normal;margin-left:auto;font-family:var(--font-mono);
  letter-spacing:.02em;text-transform:none}
`;

/* DOCKET icon set: inline SVG, no icon font, no CDN, no dependency.

   Drawn to the same rules as the rest of the system: a 20×20 box, 1.6 stroke,
   round caps and joins, currentColor only, geometry snapped to the half-pixel
   grid so 16px renders crisply. The vocabulary is deliberately stationery and
   procurement (seals, envelopes, ledgers, stamps, scales), not generic SaaS.

   Usage:  <Icon n="seal" />            inline, inherits colour + 1em sizing
           <Icon n="ledger" s={18} />   explicit pixel size
           <Icon n="tender" s={30} className="faint" />   empty states  */
import React from "react";

const P = {
  /* --- navigation --- */
  dashboard: <><rect x="3" y="3" width="6.5" height="6.5" rx="1.2" /><rect x="10.5" y="3" width="6.5" height="4" rx="1.2" /><rect x="3" y="10.5" width="6.5" height="6.5" rx="1.2" /><rect x="10.5" y="8" width="6.5" height="9" rx="1.2" /></>,
  tender: <><path d="M5 2.5h7l3.5 3.5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" /><path d="M11.5 2.5V6H15" /><path d="M6.5 10.5h7M6.5 13.5h4.5" /></>,
  suppliers: <><circle cx="7" cy="6.5" r="2.6" /><path d="M2.5 16.5c0-2.6 2-4.2 4.5-4.2s4.5 1.6 4.5 4.2" /><path d="M13 4.4a2.6 2.6 0 0 1 0 4.9" /><path d="M14.2 12.6c1.9.4 3.3 1.8 3.3 3.9" /></>,
  team: <><circle cx="10" cy="5.5" r="2.7" /><path d="M4.5 17c0-3.2 2.5-5.2 5.5-5.2s5.5 2 5.5 5.2" /><path d="M4 8.5 2 7l2-1.5M16 8.5 18 7l-2-1.5" /></>,
  analytics: <><path d="M3 16.5V9M7.5 16.5V4.5M12 16.5v-5M16.5 16.5V7" /><path d="M2 18.2h16" /></>,
  audit: <><path d="M4 3.5h9.5l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z" /><path d="M6.5 8h7M6.5 11h7M6.5 14h4" /></>,
  portal: <><path d="M3 8.5 10 3l7 5.5" /><path d="M4.5 8v8.5a.9.9 0 0 0 .9.9h9.2a.9.9 0 0 0 .9-.9V8" /><path d="M8 17.4v-5h4v5" /></>,

  /* --- the sealed-bid vocabulary --- */
  seal: <><circle cx="10" cy="10" r="6.2" /><circle cx="10" cy="10" r="2.6" /><path d="M10 3.8v-1.4M10 17.6v-1.4M3.8 10H2.4M17.6 10h-1.4" /></>,
  envelope: <><rect x="2.5" y="4.5" width="15" height="11" rx="1.2" /><path d="M2.5 6 10 11l7.5-5" /></>,
  envelopeOpen: <><path d="M2.5 9 10 3.5 17.5 9v6.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V9Z" /><path d="M2.5 9 10 14l7.5-5" /></>,
  stamp: <><path d="M6 8.5c0-1.6.6-2.3.6-3.4A3.4 3.4 0 0 1 10 2a3.4 3.4 0 0 1 3.4 3.1c0 1.1.6 1.8.6 3.4" /><path d="M3.5 12.5h13v2.2a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-2.2Z" /><path d="M5 12.5c0-1.2 1-2 2.2-2h5.6c1.2 0 2.2.8 2.2 2" /><path d="M4 18.2h12" /></>,
  scales: <><path d="M10 3v14M6 17.5h8" /><path d="M3 7h14M10 3.5 3 7l2.4 4.2A3 3 0 0 0 3 7M10 3.5 17 7l-2.4 4.2A3 3 0 0 1 17 7" /></>,
  gavel: <><rect x="9.5" y="1.8" width="7" height="4.6" rx="1" transform="rotate(45 13 4)" /><path d="M10.4 6.2 5.6 11M3 17h7" /><path d="M4.2 12.4 7 15.2" /></>,

  /* --- state + feedback --- */
  check: <><path d="M4 10.5 8 14.5 16 5.5" /></>,
  alert: <><path d="M10 3.2 18 16.8H2L10 3.2Z" /><path d="M10 8v4M10 14.6v.1" /></>,
  info: <><circle cx="10" cy="10" r="7.2" /><path d="M10 9v5M10 6.4v.1" /></>,
  clock: <><circle cx="10" cy="10" r="7.2" /><path d="M10 5.8V10l3 2" /></>,
  hourglass: <><path d="M6 2.5h8M6 17.5h8" /><path d="M6.5 2.5v3.2c0 1.4 3.5 2.8 3.5 4.3s-3.5 2.9-3.5 4.3v3.2M13.5 2.5v3.2c0 1.4-3.5 2.8-3.5 4.3s3.5 2.9 3.5 4.3v3.2" /></>,
  bell: <><path d="M5.5 8.5a4.5 4.5 0 0 1 9 0c0 3.4 1.2 4.6 1.2 4.6H4.3s1.2-1.2 1.2-4.6Z" /><path d="M8.2 16a2 2 0 0 0 3.6 0" /></>,
  lock: <><rect x="4" y="8.8" width="12" height="8.4" rx="1.4" /><path d="M7 8.8V6.5a3 3 0 0 1 6 0v2.3" /><path d="M10 12v2.4" /></>,
  shield: <><path d="M10 2.5 16.5 5v5c0 4-3.1 6.6-6.5 7.7C6.6 16.6 3.5 14 3.5 10V5L10 2.5Z" /><path d="M7.3 10 9.5 12.2 13 8.2" /></>,
  up: <><path d="M10 16V4.5M5 9.5 10 4.4l5 5.1" /></>,
  down: <><path d="M10 4v11.5M5 10.5 10 15.6l5-5.1" /></>,
  trophy: <><path d="M6 3.5h8v4a4 4 0 0 1-8 0v-4Z" /><path d="M6 4.8H3.8v1.4A2.8 2.8 0 0 0 6 8.9M14 4.8h2.2v1.4A2.8 2.8 0 0 1 14 8.9" /><path d="M10 11.5v3M7 17h6M8.5 14.5h3" /></>,

  /* --- objects + actions --- */
  file: <><path d="M5 2.5h6.5L16 7v10.5H5V2.5Z" /><path d="M11.2 2.5V7H16" /></>,
  upload: <><path d="M10 13.5V4M6.2 7.8 10 4l3.8 3.8" /><path d="M3.5 13v3.5h13V13" /></>,
  download: <><path d="M10 4v9.5M6.2 9.7 10 13.5l3.8-3.8" /><path d="M3.5 13v3.5h13V13" /></>,
  search: <><circle cx="8.8" cy="8.8" r="5.3" /><path d="M12.8 12.8 17 17" /></>,
  question: <><circle cx="10" cy="10" r="7.2" /><path d="M7.9 7.8a2.1 2.1 0 1 1 3 1.9c-.6.4-.9.8-.9 1.6M10 14.6v.1" /></>,
  plus: <><path d="M10 4.2v11.6M4.2 10h11.6" /></>,
  close: <><path d="M5 5l10 10M15 5 5 15" /></>,
  chev: <><path d="M5.5 8 10 12.4 14.5 8" /></>,
  /* the drawer handle: three rules, same 1.6 stroke as everything else */
  menu: <><path d="M3 5.5h14M3 10h14M3 14.5h14" /></>,
  mail: <><rect x="2.5" y="4.5" width="15" height="11" rx="1.2" /><path d="M2.5 6 10 11l7.5-5" /></>,
  refresh: <><path d="M16.5 10a6.5 6.5 0 1 1-2.1-4.8" /><path d="M16.8 3.6v3.2h-3.2" /></>,
  exit: <><path d="M12 5.5V3.6H4v12.8h8v-1.9" /><path d="M8.6 10h8.4M14.2 7.4 16.8 10l-2.6 2.6" /></>,
  sound: <><path d="M4 8h2.4L10 4.8v10.4L6.4 12H4V8Z" /><path d="M13 7.6a3.4 3.4 0 0 1 0 4.8M15.3 5.4a6.6 6.6 0 0 1 0 9.2" /></>,
  mute: <><path d="M4 8h2.4L10 4.8v10.4L6.4 12H4V8Z" /><path d="M13.2 8.4l3.6 3.2M16.8 8.4l-3.6 3.2" /></>,
};

export const ICON_NAMES = Object.keys(P);

export function Icon({ n, s, className = "", style, title }) {
  const body = P[n];
  if (!body) return null;
  return (
    <svg className={"ic " + className} viewBox="0 0 20 20" width={s || "1em"} height={s || "1em"}
         fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined} aria-label={title}
         style={style}>
      {body}
    </svg>
  );
}

/** The seal: the one filled mark in the set, so it reads as an object rather
    than an outline. It is the product's mark and its state glyph at once, used
    in the wordmark, on the login screen and against every sealed bid.

    Restyled with the studio palette. Three changes from the original:

    * a rim, drawn in --seal-crack at 40%. The old mark was a gradient disc with
      no edge, so it dissolved into a white card at 13px; the rim gives it a
      contour at every size and on every surface.
    * the specular moved off-centre and tightened (a wax bead catches light in
      one place), instead of a full concentric ring.
    * geometry snapped to the half-pixel grid like the rest of the set, so the
      13px wordmark instance renders crisp rather than soft.

    Colour still comes entirely from --seal-hi / --seal-core / --seal-crack, so
    it is rose in studio, wax red in paper and warm in night without a branch. */
export function SealMark({ s = 15, cracked = false, className = "", style }) {
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" className={className} style={style} aria-hidden="true">
      <defs>
        <radialGradient id="dk-wax" cx="33%" cy="30%" r="78%">
          <stop offset="0%" stopColor="var(--seal-hi)" />
          <stop offset="62%" stopColor="var(--seal-core)" />
          <stop offset="100%" stopColor="var(--seal-core)" />
        </radialGradient>
      </defs>
      <circle cx="10" cy="10" r="8.5" fill="url(#dk-wax)" />
      <circle cx="10" cy="10" r="8.5" fill="none" strokeWidth="1"
              stroke="color-mix(in srgb,var(--seal-crack) 40%,transparent)" />
      {cracked
        ? <path d="M10 1.6 8.4 7 11.4 9.6 8 12l1.6 6.4" stroke="var(--seal-crack)" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
        : <><circle cx="10" cy="10" r="4.4" fill="none" strokeWidth="1"
                    stroke="color-mix(in srgb,#fff 26%,transparent)" />
            {/* the specular sits between the ring's outer edge (4.9) and the
                rim's inner edge (8.0), clear of both: overlapping the ring
                reads as a notch cut out of it */}
            <circle cx="5.6" cy="5.6" r="1.2" fill="color-mix(in srgb,#fff 40%,transparent)" /></>}
    </svg>
  );
}

export const ICON_CSS = `
.ic{display:inline-block;vertical-align:-.14em;flex-shrink:0}
.btn .ic,.navi .ic,.chip .ic,.doclink .ic,.tab .ic{margin-right:6px}
.btn.iconly .ic,.navi .ic:only-child{margin-right:0}
.navi .ic{opacity:.72;transition:opacity var(--t) var(--ease)}
.navi:hover .ic,.navi.on .ic{opacity:1}
.chead .ic{color:var(--faint);margin-right:7px}
.empty .ic{display:block;margin:0 auto 10px;color:var(--line2)}
.stamp .ic,.chip .ic{width:1em;height:1em}
`;

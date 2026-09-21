/* The DOCKET mark, and the company's own.

   The mark is a wax seal over a folded document corner: the two objects the
   product is actually about. Drawn rather than lettered, so it reads at 20px in
   a sidebar and at 96px on a landing page without a second asset, and built
   from currentColor plus one accent so it inherits the theme instead of
   fighting it.

   `<Mark/>`     the symbol alone — favicons, avatars, tight chrome
   `<Wordmark/>` symbol + DOCKET, the signature lockup
   `<OrgMark/>`  the *customer's* logo where they have uploaded one, falling
                 back to their initials on a tinted tile, falling back to ours.

   OrgMark is the reason this file exists. A workspace that has been set up is
   somebody's company, and showing them our seal on every screen of it is a
   small, constant claim that the software is the point. Their mark goes in the
   chrome; ours stays on the door. */
import React from "react";

/** The seal-over-document symbol. `s` is the box in px. */
export function Mark({ s = 28, className = "", animate = false }) {
  return (
    <svg className={"dkmark" + (animate ? " spin" : "") + (className ? " " + className : "")}
         width={s} height={s} viewBox="0 0 40 40" role="presentation" aria-hidden="true"
         focusable="false">
      {/* the document, folded corner top-right */}
      <path d="M9 4.5h15.5L32 12v22a1.6 1.6 0 0 1-1.6 1.6H9A1.6 1.6 0 0 1 7.4 34V6.1A1.6 1.6 0 0 1 9 4.5Z"
            className="dkm-paper" />
      <path d="M24.5 4.5V12H32" className="dkm-fold" />
      {/* two ruled lines: this is a document with terms on it */}
      <path d="M12.5 17h9M12.5 21.5h6" className="dkm-rule" />
      {/* the seal, struck low-right where a signature block sits */}
      <circle cx="26" cy="27" r="8.2" className="dkm-seal" />
      <circle cx="26" cy="27" r="3.6" className="dkm-sealin" />
      <path d="M26 16.6v2.2M26 35.2V33M15.6 27h2.2M36.4 27h-2.2M18.6 19.6l1.6 1.6M33.4 34.4l-1.6-1.6M33.4 19.6l-1.6 1.6M18.6 34.4l1.6-1.6"
            className="dkm-rays" />
    </svg>
  );
}

/** Symbol plus name. `tone="band"` is the version that sits on the dark rail. */
export function Wordmark({ s = 26, className = "", animate = false, tag }) {
  return (
    <span className={"dkword" + (className ? " " + className : "")}>
      <Mark s={s} animate={animate} />
      <b style={{ fontSize: Math.round(s * 0.58) }}>DOCKET</b>
      {tag && <i className="dkwordtag">{tag}</i>}
    </span>
  );
}

/** Initials from a company name: two words give two letters, one gives two
    from the same word. "The" and other articles are dropped, because "TK" for
    "The Kestrel Group" is not what anybody would write on a napkin. */
export function initialsOf(name) {
  const skip = new Set(["the", "a", "an", "of", "and", "plc", "ltd", "limited", "nig", "nigeria"]);
  const words = String(name || "")
    .split(/[\s\-–—/&,.]+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter((w) => w && !skip.has(w.toLowerCase()));
  if (!words.length) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** The workspace's own mark. Three states, in order of what the org has given
    us: an uploaded image, their initials, or the DOCKET seal while the
    workspace has no identity of its own yet. */
export function OrgMark({ org, s = 28, className = "", withName = false }) {
  const logo = org && org.logo;
  const name = (org && org.name) || "";
  const box = { width: s, height: s };
  let art;
  if (logo) {
    art = <img className="orglogo" src={logo} alt="" style={box} />;
  } else if (name) {
    art = (
      <span className="orginit" style={{ ...box, fontSize: Math.round(s * 0.4) }} aria-hidden="true">
        {initialsOf(name)}
      </span>
    );
  } else {
    art = <Mark s={s} />;
  }
  return (
    <span className={"orgmark" + (className ? " " + className : "")}>
      {art}
      {withName && <b className="orgname">{name || "DOCKET"}</b>}
    </span>
  );
}

export const LOGO_CSS = `
.dkmark{display:block;flex-shrink:0}
.dkmark .dkm-paper{fill:var(--card);stroke:currentColor;stroke-width:2.1;
  stroke-linejoin:round}
.dkmark .dkm-fold{fill:none;stroke:currentColor;stroke-width:2.1;
  stroke-linecap:round;stroke-linejoin:round}
.dkmark .dkm-rule{fill:none;stroke:currentColor;stroke-width:1.9;
  stroke-linecap:round;opacity:.42}
.dkmark .dkm-seal{fill:var(--brand-2);stroke:var(--card);stroke-width:2.2}
.dkmark .dkm-sealin{fill:none;stroke:var(--card);stroke-width:1.9}
.dkmark .dkm-rays{fill:none;stroke:var(--brand-2);stroke-width:1.9;
  stroke-linecap:round;opacity:.5}

/* The seal turns once on arrival — a stamp being set down, not a spinner.
   620ms is the ceremony duration from motion.js; anything quicker reads as a
   loading state and anything slower reads as decoration. */
@media(prefers-reduced-motion:no-preference){
  .dkmark.spin .dkm-seal,.dkmark.spin .dkm-sealin,.dkmark.spin .dkm-rays{
    transform-origin:26px 27px;animation:dkseal 620ms cubic-bezier(.34,1.56,.64,1) both}
  .dkmark.spin .dkm-rays{animation-delay:90ms}
}
@keyframes dkseal{
  from{transform:rotate(-38deg) scale(.5);opacity:0}
  to{transform:none;opacity:1}
}

.dkword{display:inline-flex;align-items:center;gap:9px;color:var(--ink)}
.dkword b{font-weight:700;letter-spacing:.14em;line-height:1}
.dkwordtag{font-style:normal;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;
  color:var(--brand);background:var(--brand-tint);border:1px solid var(--green-2);
  border-radius:999px;padding:2px 7px;font-weight:650;align-self:center}

.orgmark{display:inline-flex;align-items:center;gap:9px;min-width:0}
.orgmark .orglogo{object-fit:contain;border-radius:6px;display:block;
  background:var(--card)}
.orgmark .orginit{display:inline-flex;align-items:center;justify-content:center;
  border-radius:8px;background:var(--brand-tint);color:var(--brand);
  font-weight:700;letter-spacing:.02em;border:1px solid var(--green-2);flex-shrink:0}
.orgmark .orgname{font-weight:650;letter-spacing:-.01em;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;min-width:0}

/* On the navigation rail. That rail is the one dark field in the interface in
   every theme, so the page-surface tokens this file otherwise uses would put a
   near-white tile and near-black type on a near-black band. The side tokens
   are the ones that know what is underneath, and the initials tile is mixed
   from them rather than given a literal, so it follows a re-themed rail. */
.wordmark .orgmark{flex:1 1 auto;min-width:0}
.wordmark .orgname{font-family:var(--wordmark-font);font-weight:var(--wordmark-weight);
  font-size:16px;letter-spacing:var(--wordmark-ls);color:var(--wordmark-ink)}
.wordmark .orginit{background:color-mix(in srgb,var(--side-ink) 15%,transparent);
  color:var(--side-ink);
  border-color:color-mix(in srgb,var(--side-ink) 28%,transparent)}
.wordmark .orglogo{background:transparent}
.wordmark .dkmark .dkm-paper{fill:none;stroke:var(--side-ink)}
.wordmark .dkmark .dkm-fold,.wordmark .dkmark .dkm-rule{stroke:var(--side-ink)}
.wordmark .dkmark .dkm-seal,.wordmark .dkmark .dkm-sealin{stroke:var(--side-from)}

/* In the top bar the mark sits beside the breadcrumb on phones, where the
   hamburger has already taken the leading slot. */
.topbar > .orgmark{flex-shrink:0}
`;

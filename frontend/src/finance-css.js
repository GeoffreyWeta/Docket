export const FINANCE_CSS = `
.ledgerbar{display:flex;align-items:flex-start;gap:11px;padding:12px 15px;margin-bottom:16px;
  background:var(--card);border:1px solid var(--line);border-left-width:3px;border-radius:10px;
  font-size:12.5px;line-height:1.55}
.ldform{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;align-items:end}
.ldform .lbl{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--muted)}
.ldpreview{margin-top:12px;padding:10px 12px;border-radius:8px;background:color-mix(in srgb,var(--muted) 8%,transparent);font-size:13px}
.lvl-withheld,.lvl-unknown{background:color-mix(in srgb,var(--muted) 12%,transparent);color:var(--muted)}
.ledgerbar>svg{flex:0 0 auto;margin-top:1px;color:var(--muted)}
.lbmain{flex:1;min-width:0}
.lbcount{flex:0 0 auto;font-size:11px;white-space:nowrap}

.tabcount{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;
  padding:0 4px;border-radius:8px;background:var(--wax);color:#fff;font-size:10px;font-weight:700;
  font-variant-numeric:tabular-nums;margin-left:2px}

.dimbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:14px}
.dimlbl{font-size:11px;color:var(--faint);letter-spacing:.04em;text-transform:uppercase;
  margin-right:2px}

/* A headline that is a sentence, for the places where one number needs a clause
   after it to mean anything - an FX movement, an avoidance total. */
.bigfig{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:2px 0 14px}
.bigfig b{font-size:26px;font-weight:600;letter-spacing:-.01em}
.bigfig span{font-size:12.5px;color:var(--muted);flex:1;min-width:180px;line-height:1.5}

/* ---- risk register ---- */
.risktab{width:100%;border-collapse:collapse;font-size:13px}
.risktab th{text-align:left;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;
  color:var(--faint);font-weight:500;padding:0 10px 8px 0;border-bottom:1px solid var(--hair)}
.risktab th.num,.risktab td.num{text-align:right;padding-right:0}
.risktab td{padding:11px 10px 11px 0;border-bottom:1px solid var(--hair);vertical-align:top}
.risktab tr:last-child td{border-bottom:0}
.risktab td.muted{font-size:12.5px;line-height:1.5}
/* Icon + word, so the level never depends on colour alone. */
.lvl{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;
  font-size:11.5px;font-weight:600;white-space:nowrap}
.lvl-high{background:var(--wax-tint);color:var(--wax)}
.lvl-medium{background:color-mix(in srgb,var(--s4) 14%,transparent);color:var(--s4)}
.lvl-low{background:color-mix(in srgb,var(--green) 12%,transparent);color:var(--green)}

/* ---- fraud indicators ---- */
.fraudgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.fraudcell{display:flex;flex-direction:column;align-items:flex-start;gap:2px;
  padding:12px 13px;border:1px solid var(--line);border-radius:10px;background:var(--sunk);
  font:inherit;text-align:left;cursor:pointer;transition:border-color .15s,background .15s}
.fraudcell:hover{border-color:var(--line2);background:var(--card)}
.fraudcell:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.fraudcell>svg{color:var(--muted);margin-bottom:2px}
.fraudcell b{font-size:21px;font-weight:600;line-height:1.1}
.fraudcell span{font-size:11.5px;color:var(--muted);line-height:1.35}

.exrow{display:flex;align-items:flex-start;gap:11px;padding:11px 4px;
  border-bottom:1px solid var(--hair)}
.exrow:last-child{border-bottom:0}
.exdot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:var(--s4);margin-top:5px}
.exrow.warn .exdot{background:var(--wax)}
.exright{display:flex;align-items:center;gap:8px;flex:0 0 auto;flex-wrap:wrap;justify-content:flex-end}

.refreshing{opacity:.72;transition:opacity .2s}
.stat.skel{height:86px;background:var(--sunk);border-radius:10px;animation:skelpulse 1.4s ease-in-out infinite}
@keyframes skelpulse{0%,100%{opacity:.55}50%{opacity:.85}}

@media(max-width:720px){
  .ledgerbar{flex-wrap:wrap}
  .lbcount{width:100%}
  .exright{width:100%;justify-content:flex-start;padding-left:18px}
  .bigfig b{font-size:22px}
  /* The register drops its basis column rather than scrolling sideways: the
     level and the risk are what a phone is being asked, and the reasoning is
     one tap away in the table views. */
  .risktab th:nth-child(3),.risktab td:nth-child(3){display:none}
  .fraudgrid{grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}
}
@media(prefers-reduced-motion:reduce){
  .stat.skel{animation:none}
}
`;

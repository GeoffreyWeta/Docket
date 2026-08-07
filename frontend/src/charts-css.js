/* Chart styling.

   Every colour here is a token. Nothing in this file names a hue, because a
   chart has to survive five themes and two of them are dark; the series slots
   (--s1..--s8) and the surface tokens do that work in styles.js.

   Two specs run through all of it, and they are the reason the charts read as
   one system rather than eight widgets:

   * 2px of *surface* separates touching marks — stacked segments, adjacent
     bars, the ring around a dot that crosses a line. Never a border: a stroke
     adds ink that isn't data.
   * Grid and axis furniture is one step off the surface and hairline. The data
     is the only thing allowed to be loud.
*/
export const CHART_CSS = `
/* ---------------- figure chrome ---------------- */
.fig .chead{gap:10px;flex-wrap:wrap}
.fig .figsub{margin-left:auto;font-size:11px}
.figtools{display:flex;gap:6px;align-items:center;margin-left:auto}
.fig .figsub + .figtools{margin-left:0}
.figbody{padding-top:12px;position:relative}
.figbody.tall{min-height:240px}

.btn.xs{padding:3px 8px;font-size:11.5px;gap:4px;line-height:1.5}
.btn.ghost{background:transparent;border-color:var(--line)}
.btn.ghost[aria-pressed=true]{background:var(--sunk);border-color:var(--line2);color:var(--ink)}

.legend{display:flex;flex-wrap:wrap;gap:4px 16px;list-style:none;margin:0;
  padding:0 16px 2px;font-size:11.5px;color:var(--muted)}
.legend li{display:flex;align-items:center;gap:6px}
.lgd{width:10px;height:10px;border-radius:3px;flex:0 0 auto}
.lgd.ring{background:transparent;border:2px solid var(--line2);border-radius:50%}

/* One tooltip for every chart. Pointer-events off so it can never sit between
   the cursor and the mark it describes and flicker. */
.charttip{position:absolute;transform:translate(-50%,calc(-100% - 12px));pointer-events:none;
  background:var(--tip-bg);color:var(--tip-ink);padding:7px 10px;border-radius:8px;
  font-size:11.5px;line-height:1.45;white-space:nowrap;z-index:6;
  box-shadow:0 6px 20px rgba(0,0,0,.22)}
.charttip b{font-weight:600}
.charttip .faint{color:color-mix(in srgb,var(--tip-ink) 62%,transparent)}

/* ---------------- bars ---------------- */
.bars2{display:flex;flex-direction:column;gap:10px;position:relative}
.bar2{display:flex;align-items:center;gap:10px;border-radius:6px;padding:1px 2px;margin:-1px -2px}
.bar2.click{cursor:pointer}
.bar2.click:hover{background:var(--sunk)}
.bar2.click:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.b2l{flex:0 0 132px;font-size:12px;color:var(--muted);text-align:right;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.b2t{flex:1;height:18px;background:var(--sunk);border-radius:4px;min-width:0;position:relative}
/* Square at the baseline, 4px rounded at the data end — the end that means
   something is the end that gets the radius. */
.b2f{display:block;height:100%;border-radius:0 4px 4px 0;transition:width .5s cubic-bezier(.22,.61,.36,1)}
.b2t.stack{display:flex;background:transparent;gap:2px;overflow:visible}
.b2t.stack>span:first-child{border-radius:4px 0 0 4px}
.b2t.stack>span:last-child{border-radius:0 4px 4px 0}
.b2t.stack>span:only-child{border-radius:4px}
.b2v{flex:0 0 auto;min-width:62px;text-align:right;font-family:var(--font-mono);
  font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--ink)}

/* The threshold tick. Sits above the fill and carries a 2px surface outline on
   each side, so it stays legible whether the bar has reached it or run past it. */
.b2lim{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--ink);
  transform:translateX(-1px);border-radius:1px;
  box-shadow:0 0 0 2px var(--card)}

/* ---------------- columns (a time axis) ---------------- */
.cols{position:relative;padding-top:6px}
.colgrid{position:absolute;left:0;right:0;top:6px;height:var(--colh);pointer-events:none}
.colgrid span{position:absolute;left:0;right:0;height:1px;background:var(--line)}
.coltrack{display:flex;align-items:flex-end;gap:2px;height:var(--colh);position:relative}
.colw{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:flex-end;
  border-radius:4px 4px 0 0;position:relative}
.colw.click{cursor:pointer}
.colw:hover .colstack{filter:brightness(1.06)}
.colw.click:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
/* 4px rounded at the data end, square at the baseline — the same rule the
   horizontal bars follow, turned through ninety degrees. */
.colstack{display:flex;flex-direction:column-reverse;gap:2px;min-height:2px;
  border-radius:4px 4px 0 0;overflow:hidden;
  transition:height .5s cubic-bezier(.22,.61,.36,1)}
.colstack>span{display:block;width:100%}
/* Overflow is visible on purpose. The label is centred on a column that can be
   twenty pixels wide, and only every Nth column carries one — so "Aug 25" is
   allowed to spill across its blank neighbours. Clipping it instead produced
   "Aug 2", which is not a shortened label, it is a wrong one. */
.collbl{position:absolute;top:100%;left:50%;transform:translateX(-50%);
  padding-top:6px;text-align:center;font-size:10px;color:var(--faint);
  white-space:nowrap;font-variant-numeric:tabular-nums;pointer-events:none}
.cols{padding-bottom:22px}

/* ---------------- dumbbell ---------------- */
.dumb{display:flex;flex-direction:column;gap:12px;position:relative}
.dbr{display:flex;align-items:center;gap:10px}
.dbt{flex:1;height:18px;position:relative;min-width:0}
.dbt::before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:var(--line)}
.dbrule{position:absolute;top:50%;transform:translateY(-50%);height:3px;border-radius:2px;min-width:2px}
.dbdot{position:absolute;top:50%;width:11px;height:11px;border-radius:50%;
  transform:translate(-50%,-50%);
  /* the 2px surface ring: keeps the two dots readable where they nearly meet */
  box-shadow:0 0 0 2px var(--card)}
.dbdot.from{background:var(--card);border:2px solid var(--line2)}

/* ---------------- donut ---------------- */
.donutwrap{display:flex;justify-content:center;position:relative;padding:4px 0}
.donut{max-width:100%;height:auto}
.donut circle{transition:stroke-dashoffset .6s cubic-bezier(.22,.61,.36,1)}
.donut:hover circle{opacity:.55}
.donut circle:hover{opacity:1}
.dnum{font-family:var(--font-sans);font-size:19px;font-weight:600;fill:var(--ink);
  /* proportional figures: a large standalone number looks loose in tabular */
  font-variant-numeric:normal}
.dlbl{font-size:10.5px;fill:var(--faint);letter-spacing:.04em;text-transform:uppercase}

/* ---------------- time chart ---------------- */
.tchart{position:relative;padding-right:52px}
.tchart svg{display:block;overflow:visible}
.grid{stroke:var(--line);stroke-width:1}
.crosshair{stroke:var(--line2);stroke-width:1}
.tticks{position:absolute;right:0;top:0;bottom:0;width:50px;pointer-events:none}
.tticks span{position:absolute;right:0;font-family:var(--font-mono);font-size:10px;
  color:var(--faint);font-variant-numeric:tabular-nums;transform:translateY(50%)}

/* ---------------- heatmap ---------------- */
.heat{position:relative;overflow-x:auto}
.heatgrid{display:grid;gap:2px;min-width:520px}
.hcol{font-size:10.5px;color:var(--faint);text-align:center;padding-bottom:4px;
  letter-spacing:.03em;text-transform:uppercase}
.hrow{font-size:12px;color:var(--muted);padding-right:8px;text-align:right;
  align-self:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hcell{height:34px;border-radius:4px;display:flex;align-items:center;justify-content:center;
  font-family:var(--font-mono);font-size:10.5px;font-variant-numeric:tabular-nums;
  color:var(--muted);cursor:default}
/* Inside a saturated fill the label switches to the on-brand ink so it always
   clears contrast — the one place text may sit on a series colour. */
.hcell .on{color:var(--on-brand);font-weight:600}

/* ---------------- meter ---------------- */
/* meter2, not meter: styles.js owns .meter as a bare 6px rail (supplier.jsx
   uses it). Sharing the name gave this component that fixed height and
   collapsed it — label, track and all — everywhere it appeared. */
.meter2{display:flex;flex-direction:column;gap:6px}
.mlab{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;color:var(--muted);gap:12px}
.mlab b{font-family:var(--font-mono);font-size:12px;color:var(--ink);font-variant-numeric:tabular-nums}
.mtrack{height:8px;border-radius:5px;background:var(--sunk);overflow:hidden}
.mtrack>span{display:block;height:100%;border-radius:5px;transition:width .5s cubic-bezier(.22,.61,.36,1)}

.spark2{display:block;overflow:visible}

/* ---------------- analytics chrome ---------------- */
.anbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.antabs{display:flex;gap:2px;background:var(--sunk);padding:3px;border-radius:10px;
  border:1px solid var(--line);overflow-x:auto;max-width:100%}
.antab{display:flex;align-items:center;gap:6px;padding:7px 13px;border:0;background:transparent;
  border-radius:7px;font:inherit;font-size:12.5px;color:var(--muted);cursor:pointer;
  white-space:nowrap;transition:background .16s,color .16s}
.antab:hover{color:var(--ink)}
.antab.on{background:var(--card);color:var(--ink);font-weight:600;
  box-shadow:0 1px 2px rgba(0,0,0,.06)}
.antab:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.anrange{display:flex;gap:6px;margin-left:auto}
.anrange .btn.on{background:var(--sunk);border-color:var(--line2);color:var(--ink);font-weight:600}

/* ---------------- org chart ---------------- */
.orgtree{display:flex;flex-direction:column;gap:1px}
.orgrow{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;position:relative}
.orgrow.me{background:var(--sunk)}
.orgrow:hover{background:var(--sunk)}
.orgtick{position:absolute;left:-2px;width:12px;height:1px;background:var(--line2);
  margin-left:-14px;transform:translateX(var(--d,0))}
.orgmain{flex:1;min-width:0}
.orgmain b{display:inline-flex;align-items:center;gap:7px}
.chip.sm{font-size:9.5px;padding:1px 6px}

/* ---------------- my desk ---------------- */
.desk .chead{gap:12px;flex-wrap:wrap}
.deskcount{margin-left:auto;font-size:11px}
.segmented{display:flex;background:var(--sunk);border:1px solid var(--line);
  border-radius:9px;padding:2px;gap:2px}
.segmented button{border:0;background:transparent;font:inherit;font-size:12px;color:var(--muted);
  padding:5px 11px;border-radius:7px;cursor:pointer}
.segmented button.on{background:var(--card);color:var(--ink);font-weight:600;
  box-shadow:0 1px 2px rgba(0,0,0,.06)}
.segmented button:focus-visible{outline:2px solid var(--brand);outline-offset:1px}

.deskfilters{display:flex;align-items:center;gap:7px;flex-wrap:wrap;
  padding:0 16px 10px;border-bottom:1px solid var(--hair)}
.deskchip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);
  background:var(--card);border-radius:999px;padding:5px 12px;font:inherit;font-size:12px;
  color:var(--muted);cursor:pointer;transition:border-color .15s,color .15s}
.deskchip b{font-family:var(--font-mono);font-size:11px;color:var(--ink);
  font-variant-numeric:tabular-nums}
.deskchip:hover{border-color:var(--line2);color:var(--ink)}
.deskchip.on{border-color:var(--brand);background:var(--brand-tint);color:var(--ink);font-weight:600}
.deskchip.on b{color:var(--brand-deep)}
.deskchip:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.deskq{margin-left:auto;max-width:200px;padding:5px 10px;font-size:12px}

.desklist{display:flex;flex-direction:column}
.deskrow{display:flex;align-items:center;gap:12px;padding:11px 6px;cursor:pointer;
  border-bottom:1px solid var(--hair);border-radius:6px;transition:background .14s}
.deskrow:last-child{border-bottom:0}
.deskrow:hover{background:var(--sunk)}
.deskrow:focus-visible{outline:2px solid var(--brand);outline-offset:-2px}
.dkmain{flex:1;min-width:0}
.dktitle{font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dkmeta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:11.5px;
  color:var(--faint);margin-top:2px}
.dkowner{display:inline-flex;align-items:center;gap:4px;color:var(--muted)}
.dkright{display:flex;align-items:center;gap:10px;flex:0 0 auto}

.deskteam{border-top:1px solid var(--line);padding:12px 16px 14px;
  display:flex;flex-direction:column;gap:12px;background:var(--sunk)}
.tmrow{display:flex;align-items:center;gap:14px}
.tmname{flex:0 0 158px;min-width:0;display:flex;flex-direction:column}
.tmname b{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tmname span{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tmbars{flex:1;min-width:0}
.tmsav{flex:0 0 auto;min-width:64px;text-align:right;font-size:12px;
  color:var(--green);font-variant-numeric:tabular-nums}

/* ---------------- reporting-line editor ---------------- */
.orgedit{margin-top:20px;padding-top:16px;border-top:1px solid var(--line)}
.orgeditrow{display:flex;align-items:center;gap:10px;padding:7px 0;flex-wrap:wrap}
.oename{flex:0 0 190px;min-width:0;display:flex;flex-direction:column;line-height:1.35}
.oename b{font-size:13px}
.oename span{font-size:11.5px}
.oearrow{font-size:11.5px;color:var(--faint);flex:0 0 auto}
.orgeditrow .in{flex:1;min-width:180px;padding:6px 10px;font-size:12.5px}

@media(max-width:720px){
  .oename{flex:0 0 100%}
  .oearrow{display:none}
  .b2l{flex:0 0 92px;font-size:11px}
  .b2v{min-width:52px;font-size:11px}
  .tchart{padding-right:44px}
  .anrange{margin-left:0;width:100%}
  .deskq{margin-left:0;max-width:none;width:100%}
  .deskcount{width:100%;margin-left:0}
  .tmname{flex:0 0 108px}
  .dkright{flex-direction:column;align-items:flex-end;gap:4px}
}
@media(prefers-reduced-motion:reduce){
  .b2f,.mtrack>span,.donut circle{transition:none}
}
`;

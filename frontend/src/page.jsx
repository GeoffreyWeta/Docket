/* The page pattern every screen follows.

   New tender was rebuilt around one idea: the screen tells you what it is for
   and what to do next, and hides everything else until you ask. It read well
   enough to be approved as the direction for the whole product, so the shape
   of it is factored out here and every other page is built from these four
   pieces rather than from a table with a title.

     <Page>    two columns from the desktop rung: the work on the left, a
               <Guide> on the right that stays put while the left scrolls. On
               a phone the guide leads, because what needs you is the reason
               you opened the page.

     <Guide>   the right-hand panel. A scene, a headline that is a count or a
               state ("Three things need you", "Nothing to score"), one line
               saying so in plain words, then an optional list of things you
               can act on - each one a button that takes you there - and an
               optional primary action. It is the readiness panel from New
               tender, generalised: the panel always answers "what is this
               page and what do I do", never "here are some statistics".

     <Rows>    the list that replaces a table. One record per row, one line of
               meta under the title, status on the right, and at most one
               action. Columns that only sometimes matter (paperwork, a rate,
               an owner) appear as a chip when they are worth attention and
               not otherwise. It is the desk row from mydesk.jsx, promoted.

     <More>    a disclosure. Everything on a page that the previous version
               showed all at once and most visits never needed - import tools,
               spend totals, the org chart, a compliance detail - goes behind
               one of these with a sentence saying what is inside. Nothing is
               removed; it stops being the first thing you read.

   THE RULE FOR WHAT GOES WHERE: if you cannot act on it from this page, it is
   not in the guide. If most visits do not need it, it is behind <More>. What
   remains is the page. */
import React from "react";

import { BP } from "./breakpoints";
import { Icon } from "./icons";
import { Illus } from "./illus";

/** Two columns from the desktop rung; the guide first on a phone. */
export function Page({ children, guide, wide }) {
  return (
    <div className={"pg" + (wide ? " wide" : "")}>
      <div className="pgmain">{children}</div>
      {guide && <aside className="guide">{guide}</aside>}
    </div>
  );
}

/** The right-hand panel. `items` are things the reader can act on: each gets
    a button that runs `onPick`. `done` items sink below `todo` ones and lose
    their button, so the list reads as what is left. */
export function Guide({ art, headline, why, items, action, children, tone }) {
  const list = items || [];
  const todo = list.filter((i) => !i.done);
  const done = list.filter((i) => i.done);
  return (
    <div className={"guidebox" + (tone ? " " + tone : "")}>
      <div className="guidetop">
        {art && <Illus n={art} w={148} />}
        <div className="guidehl">{headline}</div>
        {why && <div className="guidewhy">{why}</div>}
      </div>
      {list.length > 0 && (
        <ul className="readylist">
          {[...todo, ...done].map((i) => (
            <li key={i.key} className={i.done ? "ok" : "todo"}>
              <button type="button" tabIndex={i.done || !i.onPick ? -1 : 0}
                      onClick={() => { if (!i.done && i.onPick) i.onPick(); }}
                      style={!i.onPick ? { cursor: "default" } : undefined}>
                <span className="readytick" aria-hidden="true"><Icon n="check" s={11} /></span>
                <span>
                  {i.label}
                  {i.note && <em>{i.note}</em>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(action || children) && (
        <div className="guidefoot">
          {action}
          {children}
        </div>
      )}
    </div>
  );
}

/** A small figure with its label. Calm on purpose: the number is the point,
    and the old tile's sub-line explained a metric nobody had asked about. */
export function Quiet({ n, label, tone, onClick }) {
  const body = (
    <>
      <span className="quietn" style={tone ? { color: tone } : undefined}>{n}</span>
      <span className="quietl">{label}</span>
    </>
  );
  return onClick
    ? <button type="button" className="quiet quietgo" onClick={onClick}>{body}</button>
    : <div className="quiet">{body}</div>;
}

/** A row of Quiet figures. */
export function Figures({ children }) {
  return <div className="figures">{children}</div>;
}

/** The list that replaces a table. */
export function Rows({ children, empty }) {
  const kids = React.Children.toArray(children).filter(Boolean);
  if (!kids.length) return empty || null;
  return <div className="lrows">{kids}</div>;
}

/** One record. `meta` is one line under the title; `right` is status and at
    most one action; `onOpen` makes the whole row the way in. */
export function Row({ title, meta, right, onOpen, tone, children }) {
  const open = onOpen ? { onClick: onOpen, tabIndex: 0, role: "button",
                          onKeyDown: (e) => e.key === "Enter" && onOpen() } : {};
  return (
    <div className={"lrow" + (onOpen ? " click" : "") + (tone ? " " + tone : "")} {...open}>
      <div className="lrmain">
        <div className="lrtitle">{title}</div>
        {meta && <div className="lrmeta">{meta}</div>}
        {children}
      </div>
      {right && <div className="lrright" onClick={(e) => e.stopPropagation()}>{right}</div>}
    </div>
  );
}

/** Everything a page shows that most visits do not need. `summary` says what
    is inside in a sentence, so nobody has to open it to find out. */
export function More({ title, summary, open, children }) {
  return (
    <details className="adv more" open={open}>
      <summary>
        <Icon n="chev" s={13} className="advcaret" />
        {title}
        {summary && <span className="advtag">{summary}</span>}
      </summary>
      <div className="cbody">{children}</div>
    </details>
  );
}

export const PAGE_CSS = `
/* ---- the page: two columns from the desktop rung, guide first on a phone ---- */
.pg{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
.pgmain{min-width:0}
.pg > .guide{order:-1}

/* ---- the guide ---- */
.guidebox{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;
  box-shadow:var(--sh-2);transition:border-color var(--t) var(--ease)}
.guidebox.good{border-color:var(--green-2)}
/* The counterpart tone, for a guide whose headline is bad news. Only the audit
   trail uses it today — a broken hash chain is the one state in the product
   that has to stop somebody, and reporting it in the same calm grey as "42
   entries recorded" would be the interface lying about what it found. */
.guidebox.bad{border-color:var(--wax)}
.guidetop{padding:16px 16px 14px;border-bottom:1px solid var(--line)}
.guidebox.good .guidetop{background:var(--green-tint);border-bottom-color:var(--green-2)}
.guidebox.bad .guidetop{background:var(--wax-tint);border-bottom-color:var(--wax)}
.guidetop .illus{max-width:148px;margin:0 auto 10px}
.guidehl{font-size:17px;font-weight:700;letter-spacing:-.018em;line-height:1.25;text-wrap:balance}
.guidebox.good .guidehl{color:var(--green)}
.guidebox.bad .guidehl{color:var(--wax)}
.guidewhy{font-size:13px;color:var(--muted);margin-top:6px;line-height:1.5}
.guidefoot{padding:12px 14px 14px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:9px}
.guidefoot .btn{width:100%;justify-content:center}
.guidefoot .in{width:100%}
/* the readiness list is shared with the two forms (see DRAFT_CSS); in a guide
   an item with nothing to run is information, so it does not light up */
.guidebox .readylist li.todo button[style*="default"]:hover{background:transparent}

/* ---- quiet figures ---- */
.figures{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--line);
  border-top:1px solid var(--line)}
.quiet{display:flex;flex-direction:column;gap:2px;padding:12px 14px;background:var(--card);min-width:0;
  font:inherit;text-align:left;border:0;color:inherit}
.quietgo{cursor:pointer;transition:background var(--t) var(--ease)}
.quietgo:hover{background:var(--sunk)}
.quietn{font-size:22px;font-weight:700;letter-spacing:-.02em;line-height:1.1;font-variant-numeric:tabular-nums}
.quietl{font-size:12px;color:var(--muted);line-height:1.35}

/* ---- rows: the list that replaces a table ---- */
.lrows{display:flex;flex-direction:column}
.lrow{display:flex;align-items:center;gap:14px;padding:13px 16px;border-bottom:1px solid var(--line)}
.lrow:last-child{border-bottom:0}
.lrow.click{cursor:pointer;transition:background var(--t) var(--ease)}
.lrow.click:hover,.lrow.click:focus-visible{background:var(--sunk);outline:0}
.lrow.wax{box-shadow:inset 3px 0 0 var(--wax)}
.lrow.brass{box-shadow:inset 3px 0 0 var(--brass)}
.lrmain{flex:1;min-width:0}
.lrtitle{font-weight:600;font-size:14px;line-height:1.35;overflow-wrap:break-word}
.lrmeta{font-size:12.5px;color:var(--muted);margin-top:3px;line-height:1.45;display:flex;flex-wrap:wrap;gap:2px 8px}
.lrmeta .mono{font-size:12px}
.lrright{display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.card > .lrows{padding:0}

/* ---- more: the disclosure that holds the rest ---- */
.more{margin-top:14px}
.more summary .advtag{max-width:60%;white-space:normal;line-height:1.35}

@media(min-width:${BP.tab}px){
  .figures{grid-template-columns:repeat(4,minmax(0,1fr))}
}
@media(min-width:${BP.desk}px){
  .pg{grid-template-columns:minmax(0,1fr) 316px;gap:20px}
  .pg.wide{grid-template-columns:minmax(0,1fr) 360px}
  .pg > .guide{order:0;position:sticky;top:16px}
  .figures{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:${BP.tab - 1}px){
  .lrow{align-items:flex-start;flex-wrap:wrap}
  .lrright{width:100%;justify-content:flex-start}
}
`;

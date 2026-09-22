import React from "react";
import { createRoot } from "react-dom/client";

/* Self-hosted typefaces, bundled with the app: no webfont CDN at runtime.
   Source Serif 4 is the weight-only axis: its optical-size cut is worth 130 kB
   more across the latin subsets, which buys little over our 14–29px range.
   Subsets are unicode-range gated, so only what the page renders is fetched:
   note that ₦ (U+20A6) lives in latin-ext, so money figures pull that one. */
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
/* Source Serif 4 was here and is not any more. It cost 181 KB across six
   woff2 files and was used in exactly two places — a dialog heading and the
   auction's rolling digits — neither of which needed a second typeface to
   work. Two families is the floor worth having: a sans for everything, and a
   mono for money, references and timestamps, where a figure has to line up
   under the one above it. A third was decoration. */

import App from "./App";
import SuperAdmin from "./superadmin";

/* /superadmin is the administration console: accounts, roles and permissions.
   It is a separate application with a separate sign-in and a separate token, and
   nothing in the workspace links to it. The server does not trust this decision —
   every endpoint behind it re-checks that the caller is an administrator. */
const admin = /^\/superadmin\/?$/i.test(window.location.pathname);

createRoot(document.getElementById("root")).render(admin ? <SuperAdmin /> : <App />);

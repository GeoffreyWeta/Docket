import React from "react";
import { createRoot } from "react-dom/client";

/* Self-hosted typefaces, bundled with the app: no webfont CDN at runtime.
   Source Serif 4 is the weight-only axis: its optical-size cut is worth 130 kB
   more across the latin subsets, which buys little over our 14–29px range.
   Subsets are unicode-range gated, so only what the page renders is fetched:
   note that ₦ (U+20A6) lives in latin-ext, so money figures pull that one. */
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/source-serif-4/wght.css";

import App from "./App";

createRoot(document.getElementById("root")).render(<App />);

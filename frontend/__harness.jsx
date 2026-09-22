/* Throwaway: mounts the landing page once per design so the four can be looked
   at without a server. Not part of the build; deleted after the screenshots. */
import React from "react";
import { createRoot } from "react-dom/client";
import { Landing } from "./src/landing";
import { DESIGN_CSS, DESIGNS } from "./src/designs";
import { LANDING_CSS } from "./src/landing";
import { LOGO_CSS } from "./src/logo";
import { ILLUS_CSS } from "./src/illus";
import { ICON_CSS } from "./src/icons";
import { MOTION_CSS } from "./src/motion";
import { CSS, EXTRA_CSS, THEME_CSS } from "./src/styles";

const which = new URLSearchParams(location.search).get("d") || "drawn";
const cfg = { demoLogin: true, landing: which, orgName: "Demo" };

createRoot(document.getElementById("root")).render(
  <>
    <style>{CSS + EXTRA_CSS + THEME_CSS + MOTION_CSS + ICON_CSS + ILLUS_CSS
            + LANDING_CSS + DESIGN_CSS + LOGO_CSS}</style>
    <Landing cfg={cfg} onScreen={() => {}} />
  </>
);

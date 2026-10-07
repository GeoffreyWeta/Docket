import { useEffect, useRef, useState } from "react";
import { apiBase, getUsername } from "./api";

// Never restore an unscoped draft: prices belong to one account and backend.
export const draftKeyFor = (user, kind, id) =>
  `docket.draft.v2.${encodeURIComponent(apiBase())}.${encodeURIComponent(user.supplierId || user.id || getUsername())}.${kind}.${id}`;

export function readDraft(key) {
  try {
    const draft = JSON.parse(localStorage.getItem(key) || "null");
    return draft?.version === 1 && Date.now() - draft.savedAt < 30 * 86400000 ? draft.value : null;
  } catch { return null; }
}

/** Batch disk writes, but flush the latest edit on blur, hiding, or unmount. */
export function useDraftStorage(key, value, enabled) {
  const [status, setStatus] = useState("");
  const latest = useRef(null);
  const cleared = useRef(null);
  const json = JSON.stringify(value);
  latest.current = { key, json, enabled };
  const flush = (announce = true) => {
    const next = latest.current;
    if (!next?.enabled || cleared.current === next.json) return;
    try {
      localStorage.setItem(next.key, JSON.stringify({ version: 1, savedAt: Date.now(), value: JSON.parse(next.json) }));
      if (announce) setStatus("Saved on this device");
    } catch {
      if (announce) setStatus("Could not save on this device. Keep this page open and try again.");
    }
  };
  useEffect(() => {
    if (!enabled) {
      try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ }
      setStatus(""); return undefined;
    }
    setStatus("Saving on this device...");
    const timer = setTimeout(() => flush(), 350);
    return () => clearTimeout(timer);
  }, [key, json, enabled]);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === "hidden") flush(false); };
    const blur = () => flush();
    const leaving = () => flush(false);
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("focusout", blur);
    window.addEventListener("pagehide", leaving);
    window.addEventListener("beforeunload", leaving);
    return () => {
      flush(false);
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("focusout", blur);
      window.removeEventListener("pagehide", leaving);
      window.removeEventListener("beforeunload", leaving);
    };
  }, [key]);
  const clear = () => {
    cleared.current = latest.current.json;
    try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ }
    setStatus("");
  };
  return { status, clear };
}

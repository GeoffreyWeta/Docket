/** Run against an isolated, seeded local server: UX_BASE_URL=http://127.0.0.1:8765 npm run test:ux */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.UX_BASE_URL || "http://127.0.0.1:8765";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error("Use an isolated local demo server for this test.");
const browser = await chromium.launch();
let checks = 0;
const errors = [];
const check = (condition, message) => { assert.ok(condition, message); checks++; console.log(`PASS ${message}`); };
try {
  const context = await browser.newContext({ timezoneId: "America/New_York", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const login = async (username, mode = "main") => {
    const response = await page.request.post(`${base}/api/auth/demo/`, { data: { username } });
    const auth = await response.json();
    assert.ok(auth.token, `Demo login failed for ${username}`);
    await page.goto(`${base}/signin`);
    await page.evaluate(({ auth, username, mode }) => {
      sessionStorage.setItem("docket_demo", mode === "demo" ? "1" : "0");
      localStorage.setItem(`docket.auth.${mode}`, JSON.stringify({ token: auth.token, username }));
    }, { auth, username, mode });
    return auth.token;
  };
  const dismissGuide = async () => {
    const guide = page.getByRole("dialog", { name: "Getting started guide" });
    if (await guide.count()) await guide.getByRole("button", { name: "Close", exact: true }).click();
  };
  const ready = async (selector) => { await page.locator(selector).first().waitFor(); await page.waitForTimeout(150); await dismissGuide(); };
  const token = await login("amara");
  await page.goto(`${base}/app/new`); await ready("#nt-title");
  await page.locator("#nt-title").fill("Recovered UX regression draft");
  await page.reload(); await ready("#nt-title");
  check(await page.locator("#nt-title").inputValue() === "Recovered UX regression draft", "Tender draft survives immediate reload");
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Vendor picker stays within phone width");
  await page.locator("#nt-deadline").fill("2026-12-15");
  check((await page.locator("#nt-deadline").locator("..").innerText()).includes("Africa/Lagos"), "Closing time identifies the workspace zone in a different browser zone");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => { document.querySelector(".dk > .main").scrollTop = 650; });
  await page.locator('[data-nav="tenders"]').click(); await ready(".lrows");
  check(await page.evaluate(() => document.querySelector(".dk > .main").scrollTop) === 0, "Internal navigation starts at the top of the pane");
  await page.goBack(); await ready("#nt-title");
  check(await page.evaluate(() => document.querySelector(".dk > .main").scrollTop) === 650, "Back restores the previous pane position");
  await page.locator('[data-nav="tenders"]').click(); await ready(".lrows");
  const listScan = await new AxeBuilder({ page }).withRules(["nested-interactive"]).analyze();
  check(listScan.violations.length === 0, "Tender list has no nested interactive controls");
  await page.goto(`${base}/app/finance`); await ready('[role="tab"]');
  await page.getByRole("tab", { name: "Spend", exact: true }).click();
  const dimension = page.locator('.dimbar button').last();
  await dimension.click();
  await page.getByRole("button", { name: "2025", exact: true }).click();
  const view = page.url(); await page.reload(); await ready('[role="tab"]');
  check(page.url() === view && await page.getByRole("tab", { name: "Spend", exact: true }).getAttribute("aria-selected") === "true", "Finance restores its tab, year and dimension after reload");
  let bootstrapRequests = 0, financeRequests = 0;
  const requests = (request) => { if (request.url().endsWith("/bootstrap/")) bootstrapRequests++; if (/\/api\/finance\//.test(request.url())) financeRequests++; };
  page.on("request", requests); await page.waitForTimeout(5500);
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await page.waitForTimeout(1200);
  check(bootstrapRequests > 0 && financeRequests > 0, "Wake refresh updates finance as well as bootstrap");
  page.off("request", requests);
  await page.route("**/api/finance/**", (route) => route.fulfill({ status: 503, json: { error: "Test refresh outage" } }));
  await page.waitForTimeout(5500); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await page.waitForTimeout(900);
  check(await page.getByRole("tab", { name: "Spend", exact: true }).count() === 1 && (await page.getByRole("alert").innerText()).includes("last successful view"), "Finance retains usable data and offers retry on refresh failure");
  await page.unroute("**/api/finance/**");
  await page.goto(`${base}/app/new`); await ready("#nt-title");
  await page.locator("#nt-title").evaluate((input) => { input.focus(); input.setSelectionRange(2, 8); window.uxInput = input; });
  await page.waitForTimeout(5500); const refreshed = page.waitForResponse((r) => r.url().endsWith("/bootstrap/"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await refreshed;
  check(await page.locator("#nt-title").evaluate((input) => input === window.uxInput && document.activeElement === input && input.selectionStart === 2 && input.selectionEnd === 8), "Background refresh preserves the input node, focus and selection");
  await page.goto(`${base}/forgot`); await page.locator("#recovery-email").fill("ux@example.com");
  await context.setOffline(true); await page.getByRole("button", { name: "Send reset link" }).click(); await page.getByRole("alert").waitFor();
  check(!(await page.locator("body").innerText()).includes("a reset link is on its way"), "Offline password recovery reports a failure rather than success");
  check(await page.getByRole("textbox", { name: "Your account email" }).count() === 1, "Recovery email has an accessible label");
  await context.setOffline(false);
  await login("coldline");
  await page.goto(`${base}/app/bidroom/t2`); await ready('input[aria-label^="Unit rate"]');
  const rate = page.locator('input[aria-label^="Unit rate"]').first();
  await rate.fill("1250.75");
  check(await rate.inputValue() === "1250.75" && await rate.getAttribute("aria-invalid") === "true", "Fractional unit rates are preserved and clearly rejected");
  await rate.fill("-1250");
  check(await rate.inputValue() === "-1250" && await rate.getAttribute("aria-invalid") === "true", "Negative rates do not silently become positive");
  await rate.fill("1,250"); await page.waitForTimeout(450);
  check(await rate.getAttribute("aria-invalid") === "false", "Grouped positive whole amounts are accepted");
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload(); await ready('input[aria-label^="Unit rate"]');
  check(await rate.inputValue() === "1,250", "Supplier draft survives reload");
  await page.route("**/api/bootstrap/", async (route) => {
    const response = await route.fetch(); const data = await response.json();
    data.tenders = data.tenders.map((t) => t.id === "t2" ? { ...t, lines: [] } : t);
    await route.fulfill({ response, json: data });
  });
  await page.reload(); await ready("#bid-amt");
  await page.locator("#bid-amt").fill("1250.75");
  check(await page.locator("#bid-amt").inputValue() === "1250.75" && await page.locator("#bid-amt").getAttribute("aria-invalid") === "true", "Lump-sum decimal paste cannot become a different bid");
  await page.locator("#bid-amt").fill("-1250");
  check(await page.locator("#bid-amt").inputValue() === "-1250" && await page.locator("#bid-amt").getAttribute("aria-invalid") === "true", "Lump-sum negative paste cannot become positive");
  await page.unroute("**/api/bootstrap/");
  await page.route("**/api/bootstrap/", async (route) => {
    const response = await route.fetch(); const data = await response.json();
    // A shared tender fixture lets the second supplier visit the same room.
    if (data.me?.supplierId === "s3" && !data.tenders.some((t) => t.id === "t2")) {
      const buyer = await page.request.get(`${base}/api/bootstrap/`, { headers: { Authorization: `Bearer ${token}` } });
      const tender = (await buyer.json()).tenders.find((t) => t.id === "t2");
      data.tenders.push({ ...tender, invited: [...tender.invited, "s3"] });
    }
    await route.fulfill({ response, json: data });
  });
  await login("harmattan"); await page.goto(`${base}/app/bidroom/t2`); await ready('input[aria-label^="Unit rate"]');
  check(await rate.inputValue() === "", "Second supplier cannot inherit the first supplier's prices");
  await page.unroute("**/api/bootstrap/");
  await login("amara", "demo"); await page.goto(`${base}/app/new`); await ready("#nt-title");
  check(await page.locator("#nt-title").inputValue() === "", "Demo drafts are isolated from real-workspace drafts");
  check(await page.evaluate(() => !!JSON.parse(localStorage.getItem("docket.auth.main"))?.token && !!JSON.parse(localStorage.getItem("docket.auth.demo"))?.token), "Real and demo tokens occupy separate storage records");
  const mainPage = await context.newPage();
  await mainPage.goto(`${base}/app/portal`);
  await mainPage.locator(".portaltabs").waitFor();
  const next = await (await mainPage.request.post(`${base}/api/auth/demo/`, { data: { username: "mark" } })).json();
  await mainPage.evaluate((auth) => localStorage.setItem("docket.auth.main", JSON.stringify({ token: auth.token, username: "mark" })), next);
  await mainPage.reload(); await mainPage.locator('[data-nav="approvals"]').waitFor();
  check(await page.locator("#nt-title").count() === 1, "Changing the real account in another tab does not disrupt a demo draft");
  await mainPage.close();
  check(errors.length === 0, `No uncaught browser errors (${errors.join(", ")})`);
  await context.close();
  console.log(`${checks} UX regression checks passed.`);
} finally { await browser.close(); }

import { expect, test } from "@playwright/test";
import { evalScript } from "../setup/eval-script";
import { gotoTestSession } from "../setup/session";
import { NAV_ORIGIN_A } from "../setup/navigation-origins";

const navigationWorker = `
(() => {
  const docRef = document;
  docRef.body.setAttribute("data-eval", "ready");
  docRef.body.setAttribute("data-fetch", String(typeof fetch === "function"));

  const parseHtml = (doc, html) => {
    const parsed = doc.implementation.createHTMLDocument("");
    parsed.documentElement.innerHTML = html;
    return parsed;
  };

  const updateDocument = (doc, parsed) => {
    if (doc.head && parsed.head) {
      doc.head.innerHTML = parsed.head.innerHTML;
    }
    if (doc.body && parsed.body) {
      doc.body.innerHTML = parsed.body.innerHTML;
    }
    if (parsed.title) {
      doc.title = parsed.title;
    }
  };

  const applyHtml = async (url) => {
    docRef.body.innerHTML = "<div id=\\"nav-page\\" data-page=\\"boot\\">boot</div>";
    let response;
    try {
      response = await fetch(url);
    } catch {
      docRef.body.innerHTML = "<div id=\\"nav-page\\" data-page=\\"error\\">fetch failed</div>";
      return;
    }
    if (!response.ok) {
      docRef.body.innerHTML = "<div id=\\"nav-page\\" data-page=\\"error\\">bad response</div>";
      return;
    }
    const html = await response.text();
    const parsed = parseHtml(docRef, html);
    updateDocument(docRef, parsed);
  };

  const navigate = async (url) => {
    await applyHtml(url);
  };

  docRef.addEventListener("syncui:navigate", (event) => {
    const detail = event.detail;
    const url = typeof detail === "string" ? detail : detail?.url;
    if (!url) {
      return;
    }
    void navigate(url).finally(() => {
      detail?.resolve?.();
    });
  });
})();
`;

test("navigates across two origins via link click", async ({ page }) => {
  const response = await fetch(`${NAV_ORIGIN_A}/`);
  expect(response.ok).toBe(true);

  await gotoTestSession(page);
  await evalScript(page, navigationWorker);

  await page.waitForSelector('body[data-eval="ready"]', { state: "attached" });
  await page.waitForSelector('body[data-fetch="true"]', { state: "attached" });

  await page.evaluate(
    ({ origin }) => {
      window.syncuiTestBridge?.client?.navigate?.(origin);
    },
    { origin: `${NAV_ORIGIN_A}/` }
  );
  await page.waitForSelector('#nav-page[data-page="a"]', { state: "attached" });

  await page.evaluate(() => {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const link = target.closest("a");
        if (!link) {
          return;
        }
        event.preventDefault();
        const client = window.syncuiTestBridge?.client;
        client?.navigate?.(link.href);
      },
      true
    );
  });

  await page.click("#nav-link");
  await expect(page.locator("#nav-page")).toHaveAttribute("data-page", "b");
  await expect(page).toHaveTitle("Origin B");
});

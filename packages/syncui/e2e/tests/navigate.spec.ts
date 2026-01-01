import { expect, test } from "@playwright/test";
import { gotoTestSession } from "../setup/session";
import { importScript } from "../setup/import-script";

const script = `
  const link = document.createElement("a");
  link.id = "nav-link";
  link.href = "https://example.com/next";
  link.textContent = "Go";
  document.body.appendChild(link);

  document.addEventListener("syncui:navigate", (event) => {
    const detail = event.detail;
    const url = typeof detail === "string" ? detail : detail?.url;
    if (!url) {
      return;
    }
    document.title = "NAV:" + url;
    document.body.innerHTML = "<div id=\\"nav-output\\">" + url + "</div>";
    detail?.resolve?.();
  });
`;

test("clicking a link triggers navigate and resync", async ({ page }) => {
  await gotoTestSession(page);
  await importScript(page, script);

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
        const client = (
          window as {
            syncuiTestBridge?: {
              client?: { navigate?: (url: string) => void };
            };
          }
        ).syncuiTestBridge?.client;
        client?.navigate?.(link.href);
      },
      true
    );
  });

  await page.click("#nav-link");
  await expect(page.locator("#nav-output")).toHaveText(
    "https://example.com/next"
  );
  await expect(page).toHaveTitle("NAV:https://example.com/next");
});

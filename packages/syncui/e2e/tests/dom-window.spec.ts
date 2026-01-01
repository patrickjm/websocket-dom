import { expect, test } from "@playwright/test";
import { gotoTestSession } from "../setup/session";
import { importScript } from "../setup/import-script";

const script = `
  document.addEventListener("syncui:navigate", (event) => {
    const detail = event.detail;
    const url = typeof detail === "string" ? detail : detail?.url;
    if (!url) {
      return;
    }
    document.title = "WINDOW:" + url;
    document.body.innerHTML = "<div id=\\"window-output\\">" + url + "</div>";
    detail?.resolve?.();
  });
`;

test("server window navigate triggers resync", async ({ page }) => {
  await gotoTestSession(page);
  await importScript(page, script);

  await page.evaluate(() => {
    const client = (
      window as {
        syncuiTestBridge?: {
          client?: { transport?: { send: (payload: string) => void } };
        };
      }
    ).syncuiTestBridge?.client;
    client?.transport?.send(
      JSON.stringify({
        type: "e2e-navigate",
        url: "https://example.com/window",
      })
    );
  });

  await expect(page.locator("#window-output")).toHaveText(
    "https://example.com/window"
  );
  await expect(page).toHaveTitle("WINDOW:https://example.com/window");
});

import type { Page } from "@playwright/test";
import crypto from "crypto";

function withSession(pathname: string, sessionId: string): string {
  if (pathname.includes("session=")) {
    return pathname;
  }
  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}session=${encodeURIComponent(sessionId)}`;
}

export async function gotoTestSession(
  page: Page,
  pathname: string = "/"
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const url = withSession(pathname, sessionId);
  await page.goto(url);
  return sessionId;
}

import { test, expect } from "@playwright/test";
import { importScript } from "../setup/import-script";
import { gotoTestSession } from "../setup/session";

const script = `
const input = document.createElement('input');
input.id = 'event-input';
document.body.appendChild(input);

const form = document.createElement('form');
const submitButton = document.createElement('button');
submitButton.type = 'submit';
submitButton.id = 'submit-button';
submitButton.textContent = 'Submit';
form.appendChild(submitButton);
document.body.appendChild(form);

const mouseArea = document.createElement('div');
mouseArea.id = 'mouse-area';
mouseArea.setAttribute('style', 'position:absolute;left:100px;top:100px;width:100px;height:100px;background:rgba(0,0,0,0.1);');
document.body.appendChild(mouseArea);

const output = document.createElement('div');
output.id = 'events';
output.textContent = 'ready';
output.dataset.events = '';
document.body.appendChild(output);

function record(event) {
  const existing = output.getAttribute('data-events') || '';
  const next = existing ? existing + ',' + event.type : event.type;
  output.setAttribute('data-events', next);
  output.textContent = event.type;
}

const inputEvents = [
  'focus',
  'blur',
  'focusin',
  'focusout',
  'input',
  'change',
  'keydown',
  'keyup',
  'keypress',
  'beforeinput',
  'compositionstart',
  'compositionupdate',
  'compositionend',
  'paste',
  'copy',
  'cut',
  'reset',
  'invalid',
];
inputEvents.forEach((type) => input.addEventListener(type, record));
form.addEventListener('submit', (event) => {
  event.preventDefault();
  record(event);
});
form.addEventListener('reset', record);
input.addEventListener('invalid', record);
submitButton.addEventListener('click', record);

const mouseEvents = [
  'mouseenter',
  'mouseleave',
  'mousemove',
  'mouseout',
  'mouseover',
  'mousedown',
  'mouseup',
  'dblclick',
  'contextmenu',
  'wheel',
];
mouseEvents.forEach((type) => mouseArea.addEventListener(type, record));

const dragEvents = [
  'dragstart',
  'drag',
  'dragend',
  'dragenter',
  'dragover',
  'dragleave',
  'drop',
];
dragEvents.forEach((type) => mouseArea.addEventListener(type, record));

const pointerEvents = [
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointerenter',
  'pointerleave',
  'pointerover',
  'pointerout',
  'pointercancel',
];
pointerEvents.forEach((type) => mouseArea.addEventListener(type, record));

const touchEvents = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
touchEvents.forEach((type) => mouseArea.addEventListener(type, record));

document.addEventListener('selectionchange', record);
window.addEventListener('scroll', record);
window.addEventListener('resize', record);
`;

test("should dispatch supported event types", async ({ page }) => {
  await gotoTestSession(page);
  await importScript(page, script);

  const input = page.locator("#event-input");

  await input.focus();
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)focusin(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)focus(,|$)/
  );

  await input.fill("a");
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)input(,|$)/
  );

  await input.press("b");
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)keydown(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)keypress(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)keyup(,|$)/
  );

  await input.evaluate((el: HTMLInputElement) => el.blur());
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)focusout(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)blur(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)change(,|$)/
  );

  await page.click("#submit-button");
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)submit(,|$)/
  );

  await page.evaluate(() => {
    const input = document.querySelector("#event-input") as HTMLInputElement;
    input.dispatchEvent(
      new Event("beforeinput", { bubbles: true, cancelable: true })
    );
    input.dispatchEvent(
      new CompositionEvent("compositionstart", {
        bubbles: true,
        cancelable: true,
      })
    );
    input.dispatchEvent(
      new CompositionEvent("compositionupdate", {
        bubbles: true,
        cancelable: true,
      })
    );
    input.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        cancelable: true,
      })
    );
    input.dispatchEvent(new Event("copy", { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event("cut", { bubbles: true, cancelable: true }));
    input.dispatchEvent(
      new Event("paste", { bubbles: true, cancelable: true })
    );
    const form = document.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    input.dispatchEvent(
      new Event("invalid", { bubbles: true, cancelable: true })
    );
    document.dispatchEvent(new Event("selectionchange"));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
  });

  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)beforeinput(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)compositionstart(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)compositionupdate(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)compositionend(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)copy(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)cut(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)paste(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)reset(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)invalid(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)selectionchange(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)scroll(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)resize(,|$)/
  );

  await page.mouse.move(150, 150);
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)mouseenter(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)mouseover(,|$)/
  );
  await page.mouse.move(160, 160);
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)mousemove(,|$)/
  );
  await page.mouse.move(10, 10);
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)mouseout(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)mouseleave(,|$)/
  );

  await page.evaluate(() => {
    const area = document.querySelector("#mouse-area") as HTMLElement;
    area.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );
    if (typeof (window as any).WheelEvent === "function") {
      area.dispatchEvent(
        new (window as any).WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaY: 10,
        })
      );
    } else {
      area.dispatchEvent(
        new Event("wheel", { bubbles: true, cancelable: true })
      );
    }
  });
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)mousedown(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)mouseup(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)dblclick(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)contextmenu(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)wheel(,|$)/
  );

  await page.evaluate(() => {
    const area = document.querySelector("#mouse-area") as HTMLElement;
    const dragEvents = [
      "dragstart",
      "drag",
      "dragenter",
      "dragover",
      "dragleave",
      "drop",
      "dragend",
    ];
    dragEvents.forEach((type) => {
      if (typeof (window as any).DragEvent === "function") {
        area.dispatchEvent(
          new (window as any).DragEvent(type, {
            bubbles: true,
            cancelable: true,
          })
        );
      } else {
        area.dispatchEvent(
          new Event(type, { bubbles: true, cancelable: true })
        );
      }
    });
  });
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)dragstart(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)drag(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)dragenter(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)dragover(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)dragleave(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)drop(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)dragend(,|$)/
  );

  await page.evaluate(() => {
    const area = document.querySelector("#mouse-area") as HTMLElement;
    area.dispatchEvent(
      new Event("pointerdown", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new Event("pointerup", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new Event("pointermove", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new Event("pointerenter", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new Event("pointerleave", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new Event("pointerover", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new Event("pointerout", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new Event("pointercancel", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new Event("touchstart", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new Event("touchmove", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new Event("touchend", { bubbles: true, cancelable: true })
    );
    area.dispatchEvent(
      new Event("touchcancel", { bubbles: true, cancelable: true })
    );
  });

  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)pointerdown(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)pointerup(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)pointermove(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)pointerenter(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)pointerleave(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)pointerover(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)pointerout(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)pointercancel(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)touchstart(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)touchmove(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)touchend(,|$)/
  );
  await expect(page.locator("#events")).toHaveAttribute(
    "data-events",
    /(^|,)touchcancel(,|$)/
  );
});

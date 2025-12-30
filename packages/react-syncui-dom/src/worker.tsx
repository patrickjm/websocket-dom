import type { MessageToWorker } from "./shared-utils";

addEventListener("message", (event: MessageEvent<MessageToWorker>) => {
  if (event.data.type === "_react_event") {
    if (event.data.event.type === "input" && event.data.event.target) {
      const target = document.evaluate(
        event.data.event.target,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;
      // Simulate.change(target as Element, { target: target ?? undefined });
      // fireEvent.input(target as Element, { target: target ?? undefined });
      if (target) {
        console.log("react event", (target as HTMLElement).onchange);
        const event = new Event("change", { bubbles: true });
        target.dispatchEvent(event);
      }
    }
  }
});

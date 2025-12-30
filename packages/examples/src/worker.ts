type NavigateMessage = {
  type: "navigate";
  url: string;
};

type GlobalDocumentScope = {
  document?: Document;
  window?: { document?: Document };
};

const getDocument = (): Document | null => {
  if (typeof document !== "undefined") {
    return document;
  }
  const scope = globalThis as unknown as GlobalDocumentScope;
  return scope.document ?? scope.window?.document ?? null;
};

const parseHtml = (doc: Document, html: string) => {
  const parsed = doc.implementation.createHTMLDocument("");
  parsed.documentElement.innerHTML = html;
  return parsed;
};

const updateDocument = (doc: Document, parsed: Document) => {
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

const fetchHtml = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  return response.text();
};

const applyHtml = async (url: string) => {
  const doc = getDocument();
  if (!doc) {
    return;
  }
  const html = await fetchHtml(url);
  if (!html) {
    return;
  }
  const parsed = parseHtml(doc, html);
  updateDocument(doc, parsed);
};

const navigate = async (url: string) => {
  await applyHtml(url);
};

const registerNavigateListener = () => {
  const doc = getDocument();
  if (!doc) {
    return;
  }
  doc.addEventListener("syncui:navigate", (event) => {
    const detail = (event as CustomEvent<string>).detail;
    if (detail) {
      void navigate(detail);
    }
  });
};

const registerWorkerListener = () => {
  if (typeof self === "undefined" || !("addEventListener" in self)) {
    return;
  }
  self.addEventListener("message", (event: MessageEvent) => {
    const payload = event.data as NavigateMessage;
    if (payload?.type === "navigate" && payload.url) {
      void navigate(payload.url);
    }
  });
};

registerNavigateListener();
registerWorkerListener();

await applyHtml("https://news.ycombinator.com/");

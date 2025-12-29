const response = await fetch("https://news.ycombinator.com/");
const html = await response.text();

const parsed = document.implementation.createHTMLDocument("");
parsed.documentElement.innerHTML = html;

for (const node of Array.from(parsed.querySelectorAll("link,script"))) {
  node.remove();
}

if (document.head && parsed.head) {
  document.head.innerHTML = parsed.head.innerHTML;
}
if (document.body && parsed.body) {
  document.body.innerHTML = parsed.body.innerHTML;
}
if (parsed.title) {
  document.title = parsed.title;
}

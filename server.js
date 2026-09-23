import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/deck.js", ["deck.js", "text/javascript; charset=utf-8"]],
  ["/game.js", ["game.js", "text/javascript; charset=utf-8"]],
  ["/ui.js", ["ui.js", "text/javascript; charset=utf-8"]],
  ["/storage.js", ["storage.js", "text/javascript; charset=utf-8"]]
]);
const root = new URL("./", import.meta.url);
const port = Number(process.env.PORT) || 8000;

createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const entry = files.get(pathname);
  if (!entry) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const [name, type] = entry;
    const content = await readFile(fileURLToPath(new URL(name, root)));
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(content);
  } catch {
    response.writeHead(500).end("Could not read file");
  }
}).listen(port, () => console.log(`Blackjack: http://localhost:${port}`));

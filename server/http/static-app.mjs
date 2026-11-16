import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SECURITY_HEADERS } from "./security-headers.mjs";

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
});

function text(status, body) {
  return new Response(body, { status, headers: { ...SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" } });
}

export function createStaticAppHandler({ root }) {
  const rootPath = resolve(root instanceof URL ? fileURLToPath(root) : root);
  return async function handle(request) {
    if (!["GET", "HEAD"].includes(request.method)) return text(405, "Method not allowed");
    let pathname;
    try {
      const rawPath = new URL(request.url).pathname;
      if (/%(?:2e|2f|5c)|%25(?:2e|2f|5c)/i.test(rawPath)) return text(403, "Forbidden");
      pathname = decodeURIComponent(rawPath);
    }
    catch { return text(400, "Invalid path"); }
    const relative = pathname.replace(/^[/\\]+/, "") || "index.html";
    const filePath = resolve(rootPath, relative);
    if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${sep}`)) return text(403, "Forbidden");
    let info;
    try { info = await stat(filePath); }
    catch { return text(404, "Not found"); }
    if (!info.isFile()) return text(404, "Not found");
    const headers = { ...SECURITY_HEADERS, "content-type": MIME_TYPES[extname(filePath)] || "application/octet-stream" };
    if (request.method === "HEAD") return new Response(null, { status: 200, headers });
    return new Response(await readFile(filePath), { status: 200, headers });
  };
}

const path = require("node:path");
const fs = require("node:fs/promises");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".wasm": "application/wasm", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff",
  ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".webm": "video/webm",
};

async function readLocalContent(root, requestUrl) {
  const url = new URL(requestUrl);
  if (url.protocol !== "studiocut:" || url.hostname !== "app") {
    return { status: 403, body: "Forbidden", type: "text/plain" };
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return { status: 400, body: "Invalid URL", type: "text/plain" }; }
  if (pathname.includes("\0") || pathname.includes("\\")) {
    return { status: 403, body: "Forbidden", type: "text/plain" };
  }
  const candidate = path.resolve(root, "." + pathname);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { status: 403, body: "Forbidden", type: "text/plain" };
  }
  const isRoute = pathname === "/" || pathname === "/projects" || /^\/editor\/[^/]+\/?$/.test(pathname);
  const file = isRoute ? path.join(root, "desktop.html") : candidate;
  try {
    const body = await fs.readFile(file);
    return { status: 200, body, type: MIME[path.extname(file)] || "application/octet-stream" };
  } catch {
    return { status: 404, body: "Not found", type: "text/plain" };
  }
}

module.exports = { readLocalContent };

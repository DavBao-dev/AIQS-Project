import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../dist/_worker.js";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const memory = new Map();
globalThis.caches = {
  default: {
    async match(request) {
      const e = memory.get(request.url);
      return e && e.expires > Date.now() ? e.response.clone() : undefined;
    },
    async put(request, response) {
      memory.set(request.url, {
        response: response.clone(),
        expires: Date.now() + 900000,
      });
    },
  },
};
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const env = {
  ASSETS: {
    async fetch(request) {
      const url = new URL(
        typeof request === "string" || request instanceof URL
          ? request
          : request.url,
      );
      const file = path.resolve(
        root,
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/index.html" : url.pathname,
          ),
      );
      if (!file.startsWith(root))
        return new Response("Forbidden", { status: 403 });
      try {
        return new Response(await readFile(file), {
          headers: {
            "Content-Type":
              mime[path.extname(file)] || "application/octet-stream",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  },
};
http
  .createServer(async (req, res) => {
    try {
      const result = await worker.fetch(
        new Request("http://127.0.0.1:4173" + req.url, { method: req.method }),
        env,
        { waitUntil: (p) => p.catch(() => {}) },
      );
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end("Preview error");
    }
  })
  .listen(4173, "127.0.0.1", () =>
    console.log("AIQS preview: http://127.0.0.1:4173/"),
  );

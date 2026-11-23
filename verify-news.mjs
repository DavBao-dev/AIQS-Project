import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import worker, {
  plain,
  parseFeed,
  collectNews,
  SOURCES,
} from "./dist/_worker.js";
assert.equal(plain('&lt;img src="x"&gt; A &amp; B'), "A & B");
assert.equal(plain("<![CDATA[<p>Hello</p>]]>"), "Hello");
assert.equal(plain("&lt;script&gt;bad()&lt;/script&gt; Good"), "Good");
const source = { id: "test", name: "Test", host: "example.com" };
const rss = (host = "example.com") =>
  `<rss><channel><item><title>A &amp; B</title><link>https://${host}/story</link><pubDate>2026-01-01T00:00:00Z</pubDate><description>&lt;img src="x"&gt; Read this.</description></item></channel></rss>`;
const parsed = parseFeed(rss(), source);
assert.equal(parsed.length, 1);
assert.equal(parsed[0].title, "A & B");
assert.equal(parsed[0].excerpt, "Read this.");
assert.equal(parseFeed(rss("evil.test"), source).length, 0);
assert.equal(
  parseFeed(rss().replace("2026-01-01", "2099-01-01"), source).length,
  0,
);
const atom =
  '<feed><entry><title>Atom</title><link href="https://example.com/atom"/><updated>2026-01-02T00:00:00Z</updated><summary>Short</summary></entry></feed>';
assert.equal(parseFeed(atom, source)[0].url, "https://example.com/atom");
let calls = 0;
const fetcher = async (url) => {
  calls++;
  const s = SOURCES.find((s) => s.url === url);
  return new Response(rss(s.host));
};
const news = await collectNews(fetcher);
assert.equal(news.items.length, 3);
assert.ok(news.sources.every((s) => s.ok));
const savedFetch = globalThis.fetch;
globalThis.fetch = fetcher;
const memory = new Map();
globalThis.caches = {
  default: {
    async match(r) {
      return memory.get(r.url)?.clone();
    },
    async put(r, v) {
      memory.set(r.url, v.clone());
    },
  },
};
const env = {
  ASSETS: {
    async fetch() {
      return Response.json({ updatedAt: "2026-01-01", items: parsed });
    },
  },
};
const ctx = {
  waitUntil(p) {
    return p;
  },
};
calls = 0;
assert.equal(
  (await worker.fetch(new Request("https://test.local/api/news"), env, ctx))
    .status,
  200,
);
assert.equal(calls, 3);
await worker.fetch(new Request("https://test.local/api/news"), env, ctx);
assert.equal(calls, 3);
assert.equal(
  (
    await worker.fetch(
      new Request("https://test.local/api/news", { method: "POST" }),
      env,
      ctx,
    )
  ).status,
  405,
);
memory.clear();
globalThis.fetch = async () => {
  throw new Error("offline");
};
assert.equal(
  (
    await (
      await worker.fetch(new Request("https://test.local/api/news"), env, ctx)
    ).json()
  ).stale,
  true,
);
globalThis.fetch = savedFetch;
// Sanitize the previously fetched snapshot without changing its fetch timestamp.
const snapshot = JSON.parse(await readFile("dist/news-snapshot.json", "utf8"));
for (const item of snapshot.items) item.excerpt = plain(item.excerpt);
await writeFile("dist/news-snapshot.json", JSON.stringify(snapshot, null, 2));
console.log(
  "News checks passed: RSS/Atom parsing, HTML/entities, source allowlist, future dates, partial collection, edge cache, HTTP method, offline snapshot.",
);

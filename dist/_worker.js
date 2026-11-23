// Pages Advanced Mode: public RSS only; user data is never sent to publishers.
export const SOURCES = [
  {
    id: "openai",
    name: "OpenAI",
    url: "https://openai.com/news/rss.xml",
    host: "openai.com",
  },
  {
    id: "google",
    name: "Google AI",
    url: "https://blog.google/technology/ai/rss/",
    host: "blog.google",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    url: "https://huggingface.co/blog/feed.xml",
    host: "huggingface.co",
  },
];
export function plain(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([\da-f]+);/gi, (_, n) => {
      const cp = parseInt(n, 16);
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#(\d+);/g, (_, n) => {
      const cp = Number(n);
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/g,
      (_, n) =>
        ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[n],
    )
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tag(xml, name) {
  return (
    xml.match(
      new RegExp(
        "<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + name + ">",
        "i",
      ),
    )?.[1] || ""
  );
}
export function parseFeed(xml, source) {
  const blocks =
    xml.match(/<item\b[\s\S]*?<\/item>/gi) ||
    xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ||
    [];
  return blocks.slice(0, 16).flatMap((block) => {
    const title = plain(tag(block, "title")).slice(0, 240);
    const rawUrl =
      plain(tag(block, "link")) ||
      block.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1] ||
      "";
    let link;
    try {
      link = new URL(rawUrl);
      if (
        link.protocol !== "https:" ||
        (link.hostname !== source.host &&
          !link.hostname.endsWith("." + source.host))
      )
        return [];
    } catch {
      return [];
    }
    const stamp = Date.parse(
      plain(
        tag(block, "pubDate") ||
          tag(block, "published") ||
          tag(block, "updated"),
      ),
    );
    if (!title || !Number.isFinite(stamp) || stamp > Date.now() + 300000)
      return [];
    const excerpt = plain(
      tag(block, "description") ||
        tag(block, "summary") ||
        tag(block, "content:encoded") ||
        tag(block, "content"),
    ).slice(0, 280);
    return [
      {
        id: source.id + "-" + encodeURIComponent(link.pathname).slice(0, 180),
        title,
        url: link.href,
        excerpt,
        publishedAt: new Date(stamp).toISOString(),
        source: source.name,
        sourceId: source.id,
      },
    ];
  });
}
export async function collectNews(fetcher = fetch) {
  const results = await Promise.all(
    SOURCES.map(async (source) => {
      try {
        const response = await fetcher(source.url, {
          headers: {
            Accept:
              "application/rss+xml, application/atom+xml, application/xml, text/xml",
            "User-Agent": "AIQSProject/1.0 RSS Reader",
          },
          signal: AbortSignal.timeout(7000),
          cf: { cacheTtl: 900, cacheEverything: true },
        });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const xml = await response.text();
        if (xml.length > 4000000) throw new Error("Feed too large");
        const items = parseFeed(xml, source);
        if (!items.length) throw new Error("No readable entries");
        return { source: source.id, items, ok: true };
      } catch {
        return { source: source.id, items: [], ok: false };
      }
    }),
  );
  const seen = new Set();
  const items = results
    .flatMap((r) => r.items)
    .filter((x) => {
      if (seen.has(x.url)) return false;
      seen.add(x.url);
      return true;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 36);
  return {
    updatedAt: new Date().toISOString(),
    sources: results.map((r) => ({ id: r.source, ok: r.ok })),
    items,
  };
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/news") return env.ASSETS.fetch(request);
    if (request.method !== "GET")
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET" },
      });
    const key = new Request(url.origin + "/api/news");
    const cache = caches.default;
    const cached = await cache.match(key);
    if (cached) return cached;
    const news = await collectNews();
    if (!news.items.length) {
      const fallback = await env.ASSETS.fetch(
        new URL("/news-snapshot.json", url.origin),
      );
      if (fallback.ok) {
        const data = await fallback.json();
        return Response.json(
          { ...data, stale: true },
          {
            headers: {
              "Cache-Control": "public, max-age=60",
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      }
      return Response.json(
        { error: "News sources are temporarily unavailable" },
        { status: 503 },
      );
    }
    const response = Response.json(news, {
      headers: {
        "Cache-Control": "public, max-age=900",
        "X-Content-Type-Options": "nosniff",
      },
    });
    ctx.waitUntil(cache.put(key, response.clone()));
    return response;
  },
};

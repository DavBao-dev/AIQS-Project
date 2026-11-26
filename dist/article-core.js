/* Pure Markdown configuration, shared by editor and reader. */
const ArticleCore = (() => {
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const localPattern = /^local-image:([0-9a-f-]{36})$/i;
  const storagePattern =
    /^supabase-image:([0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:webp|png|jpg))$/i;
  function safeURL(raw) {
    try {
      const u = new URL(raw);
      return u.protocol === "https:" && !u.username && !u.password
        ? u.href
        : null;
    } catch {
      return null;
    }
  }
  function createParser(Marked) {
    return new Marked({
      gfm: true,
      breaks: false,
      renderer: {
        html(token) {
          return escape(token.text);
        },
        image(token) {
          const alt = escape(token.text || ""),
            caption = escape(token.title || token.text || ""),
            local = token.href.match(localPattern),
            stored = token.href.match(storagePattern),
            url = safeURL(token.href);
          if (!local && !stored && !url)
            return '<span class="media-message">[Ảnh cần đường dẫn HTTPS hợp lệ]</span>';
          const attrs = local
            ? `data-local-image="${local[1]}"`
            : stored
              ? `data-storage-image="${stored[1]}"`
              : `src="${escape(url)}"`;
          return `<span class="article-media"><img ${attrs} alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="image-caption">${caption}</span></span>`;
        },
        link(token) {
          const href = token.href.startsWith("#")
            ? token.href
            : safeURL(token.href);
          const text = this.parser.parseInline(token.tokens);
          if (!href) return text;
          // In-page anchors stay in the same tab; only external links open a new one.
          if (href.startsWith("#"))
            return `<a href="${escape(href)}">${text}</a>`;
          return `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        },
      },
      extensions: [
        {
          name: "mathBlock",
          level: "block",
          start(src) {
            const a = src.indexOf("$$"),
              b = src.indexOf("\\[");
            return a < 0 ? b : b < 0 ? a : Math.min(a, b);
          },
          tokenizer(src) {
            const m =
              /^\$\$[ \t]*\n?([\s\S]+?)\n?\$\$(?:[ \t]*(?:\n|$))/.exec(src) ||
              /^\\\[([\s\S]+?)\\\](?:[ \t]*(?:\n|$))/.exec(src);
            if (m) return { type: "mathBlock", raw: m[0], text: m[1].trim() };
          },
          renderer(token) {
            return `<div class="math-source math-block" data-display="true">${escape(token.text)}</div>`;
          },
        },
        {
          name: "mathInline",
          level: "inline",
          start(src) {
            const a = src.indexOf("$"),
              b = src.indexOf("\\(");
            return a < 0 ? b : b < 0 ? a : Math.min(a, b);
          },
          tokenizer(src) {
            const dollar = /^\$(?!\$)((?:\\.|[^$\\\n])+?)\$(?!\$)/.exec(src);
            // Same rule as Pandoc, so prices such as "$5 và $10" stay plain text:
            // no space inside the delimiters and no digit right after the closing $.
            if (
              dollar &&
              !/^\s|\s$/.test(dollar[1]) &&
              !/\d/.test(src.charAt(dollar[0].length))
            )
              return { type: "mathInline", raw: dollar[0], text: dollar[1] };
            const paren = /^\\\(([\s\S]+?)\\\)/.exec(src);
            if (paren)
              return { type: "mathInline", raw: paren[0], text: paren[1] };
          },
          renderer(token) {
            return `<span class="math-source" data-display="false">${escape(token.text)}</span>`;
          },
        },
      ],
    });
  }
  return { escape, safeURL, createParser, localPattern, storagePattern };
})();

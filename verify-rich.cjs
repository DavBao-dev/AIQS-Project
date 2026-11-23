const assert = require("assert/strict"),
  fs = require("fs"),
  vm = require("vm");
const marked = require("./dist/vendor/marked/marked.umd.js");
const ctx = vm.createContext({ URL, marked });
vm.runInContext(fs.readFileSync("dist/article-core.js", "utf8"), ctx);
vm.runInContext("var parser=ArticleCore.createParser(marked.Marked)", ctx);
const parse = (s) =>
  vm.runInContext("parser.parse(" + JSON.stringify(s) + ")", ctx);
assert.match(
  parse("Trong dòng $E=mc^2$."),
  /class="math-source" data-display="false">E=mc\^2/,
);
assert.match(parse("$$\n\\frac{a}{b}\n$$\n"), /math-block/);
assert.match(parse("\\(x+1\\)"), /math-source/);
assert.match(parse("\\[x+1\\]\n"), /math-block/);
assert.doesNotMatch(parse("`$E=mc^2$`"), /math-source/);
assert.doesNotMatch(parse("```tex\n$$x$$\n```"), /math-source/);
assert.match(
  parse("**Đậm** và *nghiêng*"),
  /<strong>Đậm<\/strong> và <em>nghiêng<\/em>/,
);
assert.match(
  parse("![Sơ đồ](https://example.com/figure.png)"),
  /src="https:\/\/example.com\/figure.png"/,
);
assert.doesNotMatch(parse("![x](javascript:alert)"), /src=/);
assert.doesNotMatch(parse("<script>alert(1)</script>"), /<script>/);
assert.doesNotMatch(parse("[x](javascript:alert)"), /href=/);
assert.equal(
  vm.runInContext(
    "ArticleCore.safeURL('https://user:pass@example.com/x')",
    ctx,
  ),
  null,
);
assert.match(
  parse("![x](local-image:00000000-0000-0000-0000-000000000001)"),
  /data-local-image/,
);
assert.match(
  parse(
    "![x](supabase-image:00000000-0000-0000-0000-000000000001\/00000000-0000-0000-0000-000000000002.webp)",
  ),
  /data-storage-image/,
);
assert.match(parse("| Cột |\n| --- |\n| Nội dung |"), /<table>/);
console.log(
  "Rich article checks passed: 4 math delimiters, code exclusions, formatting, image schemes, URL validation, raw HTML escaping and tables.",
);

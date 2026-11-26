const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert/strict");
function boot(hash = "") {
  const nodes = new Map(),
    replaced = [];
  const el = (key) => {
    if (!nodes.has(key))
      nodes.set(key, {
        innerHTML: "",
        value: "",
        classList: {
          add() {},
          remove() {},
          contains() {
            return false;
          },
          toggle() {},
        },
        addEventListener() {},
        focus() {},
        setSelectionRange() {},
      });
    return nodes.get(key);
  };
  const ctx = vm.createContext({
    console,
    URL,
    Blob,
    crypto: require("crypto").webcrypto,
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    document: {
      body: { classList: el("body").classList },
      querySelector(selector) {
        // Only the reader's loading placeholder is state-dependent.
        if (selector === ".reader-loading")
          return /reader-loading/.test(el("#app").innerHTML)
            ? el(selector)
            : null;
        return el(selector);
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {},
    },
    window: { addEventListener() {}, scrollTo() {} },
    history: {
      replaceState(_s, _t, url) {
        replaced.push(url);
        ctx.location.hash = String(url).includes("#")
          ? String(url).slice(String(url).indexOf("#"))
          : "";
      },
    },
    location: { hash, pathname: "/" },
    setTimeout: (...args) => setTimeout(...args).unref(),
    clearTimeout,
  });
  vm.runInContext(fs.readFileSync("dist/app.js", "utf8"), ctx);
  return {
    el,
    ctx,
    replaced,
    run: (code) => vm.runInContext(code, ctx),
    html: () => el("#app").innerHTML,
  };
}
const { run, html, el } = boot();
assert.equal((html().match(/class="feed-card"/g) || []).length, 5);
run("state.type='Video';render()");
assert.equal((html().match(/class="feed-card"/g) || []).length, 2);
run("state.type='Tất cả';state.query='Linear Regression';render()");
assert.equal((html().match(/class="feed-card"/g) || []).length, 1);
run("saved.push('world');go('saved')");
assert.equal((html().match(/class="feed-card"/g) || []).length, 1);
run("openItem('world')");
assert.ok(html().includes('id="reading-content"'));
assert.ok(html().includes("Kết nối ý tưởng"));
run(
  "notes.push({key:'test',id:'world',quote:'Một câu đáng nhớ',text:'Ghi chú của tôi'});go('notes')",
);
assert.ok(html().includes("Một câu đáng nhớ"));
assert.ok(html().includes("Ghi chú của tôi"));
assert.equal(run("esc('<script>')"), "&lt;script&gt;");
run("var writerOpened = false; function showWriter() { writerOpened = true; }");
el("#add").onclick();
assert.equal(run("writerOpened"), true, "Viết bài opens the current writer");
assert.equal(run("readRouteId('#read/%E0%A4%A')"), null);
assert.equal(run("readRouteId('#read/a%20b')"), "a b");
assert.equal(run("readRouteId('#news')"), null);

// Shared links to content that loads later (community posts, news) must survive
// the first paint: loading state first, the article once it arrives.
{
  const t = boot("#read/news-openai-%252Findex%252Fexample");
  assert.match(t.html(), /reader-loading/, "deep link shows a loading state");
  assert.equal(t.run("state.view"), "reader");
  assert.equal(t.replaced.length, 0, "deep link hash is kept while loading");
  t.run(
    "newsItems=[{id:'news-openai-%2Findex%2Fexample',type:'News',topic:topics[0],isNews:true,sourceId:'openai',publishedAt:'2026-11-20T00:00:00Z',timestamp:1,title:'Tin thử',desc:'Mô tả',author:'OpenAI',initial:'O',date:'20/11/2026',read:'Bản tin nguồn',duration:'',likes:0,views:'',tags:['AI News'],art:null,url:'https://openai.com/x',sections:[],takeaway:'Mô tả'}];" +
      "items=[...newsItems,...items];markSettled('posts');markSettled('news')",
  );
  assert.ok(t.html().includes("Tin thử"), "article renders once loaded");
  assert.equal(
    t.run("state.view"),
    "reader",
    "the link opens the reader, not a matching feed card",
  );
  assert.ok(t.html().includes('id="reading-content"'));
  assert.ok(!/reader-loading/.test(t.html()));
  // A link that stays unknown after loading ends on the feed.
  const u = boot("#read/post-missing");
  assert.match(u.html(), /reader-loading/);
  u.run("markSettled('posts');markSettled('news')");
  assert.equal(u.run("state.view"), "feed");
  assert.ok(!/reader-loading/.test(u.html()));
}
// Feed card byline has a single separator; topic counts match what the feed lists.
assert.ok(!html().includes("<span>· "), "no doubled separator in byline");
run(
  "newsItems=Array.from({length:6},(_,i)=>({id:'n'+i}));items=[...Array.from({length:6},(_,i)=>({id:'n'+i,isNews:true,topic:topics[0],tags:[],title:'t',desc:'d'})),...items];render()",
);
assert.equal(
  run("items.filter((x)=>x.topic===topics[0]&&feedVisible(x)).length"),
  run("items.filter((x)=>x.topic===topics[0]&&!x.isNews).length") + 3,
);
// Calendar files: end time matches the 21:30 finish shown for the second seminar.
{
  const ics = fs.readFileSync("dist/app.js", "utf8");
  assert.match(ics, /start: "20261130T130000Z"/);
  assert.match(ics, /end: "20261130T143000Z"/);
  assert.match(ics, /END:VCALENDAR\\r\\n`/);
}
// New projects (schema.sql) and upgraded ones (migration 004) must get the same rules.
const migration = fs.readFileSync(
  "supabase/migrations/004_moderation_and_trust.sql",
  "utf8",
);
assert.ok(
  fs.readFileSync("supabase/schema.sql", "utf8").includes(migration),
  "schema.sql must include migrations/004 verbatim",
);
// Static pages ship a CSP; the Supabase SDK is local, never a CDN import.
const headers = fs.readFileSync("dist/_headers", "utf8");
assert.match(headers, /Content-Security-Policy:.*script-src 'self';/);
assert.ok(!fs.readFileSync("dist/account.js", "utf8").includes("esm.sh"));
assert.ok(fs.existsSync("dist/vendor/supabase/supabase.js"));
console.log(
  "Feed checks passed: filters, search, saved library, reader/related, notes, escaping, malformed read routes, schema/migration sync and CSP.",
);

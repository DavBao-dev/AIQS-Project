const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert/strict");
const nodes = new Map();
function el(key) {
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
}
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
    querySelector: el,
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
  },
  window: { addEventListener() {}, scrollTo() {} },
  history: { replaceState() {} },
  location: { hash: "", pathname: "/" },
  setTimeout,
  clearTimeout,
});
vm.runInContext(fs.readFileSync("dist/app.js", "utf8"), ctx);
const run = (s) => vm.runInContext(s, ctx),
  html = () => el("#app").innerHTML;
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

const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert/strict");
const nodes = new Map(),
  storage = new Map();
function node(key) {
  if (!nodes.has(key)) {
    const x = {
      innerHTML: "",
      value: "",
      open: false,
      dataset: {},
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
      append() {},
      prepend() {},
      remove() {},
      setAttribute() {},
      showModal() {
        this.open = true;
      },
      close() {
        this.open = false;
      },
      reportValidity() {
        return true;
      },
      querySelector(s) {
        return node(key + " " + s);
      },
      querySelectorAll() {
        return [];
      },
    };
    nodes.set(key, x);
  }
  return nodes.get(key);
}
let writes = [],
  posts = [],
  rows = [],
  postPayload = null,
  failWrites = false,
  pendingPost = null,
  adminMock = false;
const profiles = new Map();
const fakeSupa = {
  rpc(name) {
    return Promise.resolve({
      data: name === "luma_is_admin" && adminMock,
      error: null,
    });
  },
  from(table) {
    const q = {
      select() {
        return q;
      },
      eq() {
        return q;
      },
      order() {
        return q;
      },
      limit() {
        return Promise.resolve({ data: posts, error: null });
      },
      upsert(data) {
        if (table === "luma_profiles") {
          profiles.set(data.user_id, data.display_name);
          return Promise.resolve({ error: null });
        }
        writes.push(data);
        return Promise.resolve({
          error: failWrites ? new Error("offline") : null,
        });
      },
      insert(data) {
        postPayload = data;
        return q;
      },
      update(data) {
        postPayload = data;
        return q;
      },
      single() {
        if (pendingPost) return pendingPost;
        // Mirrors the luma_posts_guard trigger: server-set name, date and status.
        return Promise.resolve({
          data: {
            id: "00000000-0000-0000-0000-000000000099",
            ...postPayload,
            status:
              postPayload.status === "published" && !adminMock
                ? "pending"
                : postPayload.status,
            author_name: profiles.get(postPayload.author_id) || "",
            created_at: "2026-11-23T00:00:00Z",
          },
          error: null,
        });
      },
      then(resolve, reject) {
        return Promise.resolve({ data: rows, error: null }).then(
          resolve,
          reject,
        );
      },
    };
    return q;
  },
};
const sandbox = {
  console,
  URL,
  Blob,
  crypto: require("crypto").webcrypto,
  localStorage: {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  },
  MutationObserver: class {
    observe() {}
  },
  document: {
    body: { classList: node("body").classList, append() {} },
    createElement: () => node("created"),
    querySelector: node,
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
  },
  window: { LUMA_SUPABASE: {}, addEventListener() {}, scrollTo() {} },
  history: { replaceState() {} },
  location: { hash: "", pathname: "/", origin: "http://localhost", search: "" },
  setTimeout: () => 0,
  clearTimeout() {},
  fakeSupa,
};
const ctx = vm.createContext(sandbox),
  run = (s) => vm.runInContext(s, ctx);
run(fs.readFileSync("dist/app.js", "utf8"));
run(fs.readFileSync("dist/account.js", "utf8"));
run(fs.readFileSync("dist/workspace.js", "utf8"));
run("supa=fakeSupa");
(async () => {
  rows = [
    { key: "saved", value: ["world"] },
    {
      key: "notes",
      value: [{ key: "n1", id: "world", text: "Private A", quote: "" }],
    },
  ];
  await run(
    "refreshSession({id:'user-a',email:'a@example.com',user_metadata:{display_name:'Alice'}},true)",
  );
  assert.equal(run("account.ready"), true);
  assert.equal(run("saved[0]"), "world");
  run("persist('saved',['world','crisis'])");
  await run("writeQueue");
  assert.equal(writes.at(-1).user_id, "user-a");
  assert.equal(writes.at(-1).key, "saved");
  failWrites = true;
  run("persist('liked',['world'])");
  await run("writeQueue");
  assert.equal(run("pendingWrites.size"), 1);
  failWrites = false;
  run("retryWrites()");
  await run("writeQueue");
  assert.equal(run("pendingWrites.size"), 0);
  rows = [];
  await run(
    "refreshSession({id:'user-b',email:'b@example.com',user_metadata:{}},true)",
  );
  assert.equal(run("notes.length"), 0);
  assert.equal(run("saved.length"), 0);
  run(
    "editorData=()=>({title:'A new post',summary:'An idea',body:'## Main idea\\nFull article',type:'Seminar',topic:topics[0],source_url:'',tags:['AI']})",
  );
  await run("savePost('published')");
  assert.equal(postPayload.author_id, "user-b");
  assert.equal(postPayload.status, "published");
  // The client never sends fields the database owns.
  assert.equal("author_name" in postPayload, false);
  assert.equal("created_at" in postPayload, false);
  assert.equal(profiles.get("user-b"), "b");
  // A non-admin post waits for review and stays off the feed.
  assert.equal(run("postRows[0].status"), "pending");
  assert.equal(run("communityItems.length"), 0);
  assert.notEqual(run("state.view"), "reader");
  assert.ok(node("#posts-dialog").innerHTML.includes("Chờ duyệt"));
  assert.ok(!node("#posts-dialog").innerHTML.includes("Bài chờ duyệt"));
  // Admins publish directly and see the review queue.
  adminMock = true;
  await run(
    "refreshSession({id:'user-b',email:'b@example.com',user_metadata:{}},true)",
  );
  assert.equal(run("isAdmin"), true);
  run(
    "postRows=[{id:'queued',author_id:'user-z',author_name:'<b>Z</b>',title:'Queued',summary:'S',body:'B',type:'Seminar',topic:topics[0],source_url:'',tags:[],status:'pending',created_at:'2026-11-23T00:00:00Z'}];rebuildItems();showMyPosts()",
  );
  assert.equal(run("communityItems.length"), 0);
  assert.ok(node("#posts-dialog").innerHTML.includes('data-approve="queued"'));
  assert.ok(node("#posts-dialog").innerHTML.includes("&lt;b&gt;Z"));
  run("postRows=[]");
  await run("savePost('published')");
  assert.equal(run("state.view"), "reader");
  assert.equal(run("communityItems.length"), 1);
  run("postRows.push({...postRows[0],id:'foreign',author_id:'user-a'})");
  assert.equal(run("!!isOwnPost('post-foreign')"), false);
  assert.equal(
    run("!!isOwnPost('post-00000000-0000-0000-0000-000000000099')"),
    true,
  );
  adminMock = false;
  await run("refreshSession(null,true)");
  assert.equal(run("account.user"), null);
  assert.equal(run("isAdmin"), false);
  assert.equal(run("notes.length"), 0);
  assert.equal(run("draftKey()"), "luma-writer-guest");
  assert.equal(
    run("bodySections('Intro\\n\\n## Heading\\nBody')[1][0]"),
    "Heading",
  );
  assert.ok(run("esc('<img onerror=alert(1)>')").startsWith("&lt;"));
  run("chooseShelf('world','reading');state.shelf='reading';go('saved')");
  assert.ok(node("#app").innerHTML.includes("World Models:"));
  run("chooseShelf('world','completed');state.shelf='completed';render()");
  assert.equal(run("shelfFor('world')"), "completed");
  assert.equal(run("entryFor('world').progress"), 100);
  assert.equal(
    run(
      "newsToItem({id:'test',sourceId:'openai',source:'OpenAI',title:'News',excerpt:'<img src=x>Good',publishedAt:'2026-01-01',url:'https://openai.com/test'}).desc",
    ),
    "Good",
  );
  run(
    "putLibrary('archived-news',{shelf:'want',snapshot:{...seed[0],id:'archived-news',isNews:true,title:'Archived news'}});rebuildItems()",
  );
  assert.ok(run("items.some(x=>x.id==='archived-news')"));
  // Only news needs a snapshot. Other content must not be copied into the library
  // row or brought back after it is unpublished.
  run(
    "putLibrary('gone-post',{shelf:'want',snapshot:{...seed[0],id:'gone-post',isCommunity:true}});rebuildItems()",
  );
  assert.equal(run("entryFor('gone-post').snapshot"), undefined);
  assert.ok(!run("items.some(x=>x.id==='gone-post')"));
  rows = [];
  await run(
    "refreshSession({id:'user-c',email:'c@example.com',user_metadata:{}},true)",
  );
  assert.equal(run("libraryState.length"), 0);
  // Sync progress only updates the status text. A full render() here used to wipe
  // the note or search box the reader was typing in.
  run(
    "var __renders=0; var __render=render; render=function(){__renders++; return __render()}",
  );
  run("account.sync('saved',['world'])");
  await run("writeQueue");
  assert.equal(run("__renders"), 0, "sync must not rebuild the page");
  run("render=__render");
  assert.equal(run("initialsOf('Đạt Nguyễn',2)"), "ĐẠ");
  assert.equal(run("initialsOf('😀 Nam',1)"), "😀");
  assert.equal(run("initialsOf('A\\u0301nh',1)"), "Á");
  assert.equal(run("initialsOf('👩‍💻 An',1)"), "👩‍💻");
  // A save rejected after switching accounts must not copy the old article
  // into the new actor's local draft.
  let rejectPost;
  pendingPost = new Promise((_, reject) => (rejectPost = reject));
  // The save may stop at the session check before it reaches the query.
  pendingPost.catch(() => {});
  const oldSave = run("savePost('published')");
  await run("refreshSession(null,true)");
  storage.set("luma-writer-guest", "guest draft stays private");
  rejectPost(new Error("delayed network failure"));
  await oldSave;
  assert.equal(storage.get("luma-writer-guest"), "guest draft stays private");
  pendingPost = null;
  console.log(
    "Account checks passed: hydration, owner-bound sync, failed-write recovery, account isolation, post creation, moderation queue, server-owned post fields, library state, escaping and stale-save draft isolation. Mock tests; live Supabase/RLS still needs project configuration.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

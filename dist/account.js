/* Supabase owns authentication; database RLS authorizes every cloud request. */
let supa = null,
  authMode = "login",
  cloudStatus = "",
  sessionGeneration = 0,
  writeQueue = Promise.resolve(),
  pendingWrites = new Map(),
  postRows = [],
  editorId = null,
  editorDirty = false,
  isAdmin = false,
  profileError = "";
const statusLabels = {
  published: "Đã đăng",
  pending: "Chờ duyệt",
  draft: "Bản nháp",
};
const dataKeys = ["saved", "liked", "notes", "custom", "rsvp", "library"];
const ui = document.createElement("div");
ui.id = "account-ui";
ui.innerHTML =
  '<dialog id="auth-dialog"></dialog><dialog id="writer-dialog" class="writer-dialog"></dialog><dialog id="posts-dialog"></dialog>';
document.body.append(ui);
const authDialog = document.querySelector("#auth-dialog"),
  writerDialog = document.querySelector("#writer-dialog"),
  postsDialog = document.querySelector("#posts-dialog");
function accountName() {
  return (
    account.user?.user_metadata?.display_name ||
    account.user?.email?.split("@")[0] ||
    "Bạn"
  );
}
// The database takes the author name from luma_profiles, never from the post payload.
async function ensureProfile(name = accountName()) {
  const display_name = String(name).trim().slice(0, 80);
  const { error } = await supa
    .from("luma_profiles")
    .upsert(
      { user_id: account.user.id, display_name },
      { onConflict: "user_id" },
    );
  if (error) {
    profileError =
      error.code === "23505"
        ? `Tên hiển thị “${display_name}” đã có người dùng. Đổi tên trong mục Tài khoản.`
        : "Chưa lưu được hồ sơ tác giả. Vui lòng thử lại.";
    return false;
  }
  profileError = "";
  return true;
}
function decorateAccount() {
  const top = document.querySelector(".topright");
  if (!top || top.querySelector("#account-button")) return;
  const button = document.createElement("button");
  button.id = "account-button";
  button.className = "account-button";
  button.textContent = account.user ? accountName() : "Đăng nhập";
  button.onclick = () => showAuth();
  top.prepend(button);
  const add = document.querySelector("#add");
  add.innerHTML = svg("plus") + "Viết bài";
  add.onclick = () => showWriter();
  const profile = document.querySelector(".profile");
  if (profile) {
    profile.innerHTML = `<span class="avatar">${esc(initialsOf(accountName(), 1))}</span><div><strong>${esc(account.user ? accountName() : "Không gian của bạn")}</strong><small>${esc(account.user ? cloudStatus || "Đồng bộ cùng tài khoản" : "Chế độ khách · Lưu trên thiết bị")}</small><button class="account-link" id="my-posts">Bài viết & bản nháp</button></div>`;
    profile.querySelector("button").onclick = () => showMyPosts();
  }
  addCloudBanners();
}
function addCloudBanners() {
  const main = document.querySelector("main");
  if (!main) return;
  if (account.user && !account.ready) {
    const info = document.createElement("div");
    info.className = "cloud-banner";
    info.textContent = cloudStatus || "Đang tải dữ liệu tài khoản…";
    if (!account.loading) {
      const retry = document.createElement("button");
      retry.textContent = "Thử tải lại";
      retry.onclick = () => refreshSession(account.user, true);
      info.append(retry);
    }
    main.prepend(info);
  }
  if (pendingWrites.size) {
    const warning = document.createElement("button");
    warning.className = "cloud-banner";
    warning.textContent = "Có thay đổi chưa đồng bộ · Thử lại";
    warning.onclick = retryWrites;
    main.prepend(warning);
  }
}
// Sync progress must not rebuild the page: a full render() here wiped whatever the
// reader was typing (notes, search) every time a scroll-progress save finished.
function updateCloudUI() {
  document.querySelectorAll(".profile small").forEach((el) => {
    el.textContent = account.user
      ? cloudStatus || "Đồng bộ cùng tài khoản"
      : "Chế độ khách · Lưu trên thiết bị";
  });
  document
    .querySelectorAll("main > .cloud-banner")
    .forEach((el) => el.remove());
  addCloudBanners();
}
const accountObserver = new MutationObserver(() => decorateAccount());
accountObserver.observe(document.querySelector("#app"), { childList: true });
decorateAccount();
function showAuth(mode = "login") {
  authMode = mode;
  authDialog.innerHTML = "";
  const configured = !!supa;
  if (account.user && mode !== "recovery") {
    authDialog.innerHTML = `<div class="modal-head"><h2>Tài khoản của bạn</h2><button class="icon" data-close>✕</button></div><p>${esc(accountName())}<br>${esc(account.user.email)}</p><p role="status">${esc(cloudStatus || "Thư viện, highlights và ghi chú được lưu trong tài khoản.")}</p><form id="profile-form" class="profile-form"><label>Tên hiển thị trên bài viết<input name="name" required maxlength="80" autocomplete="nickname" value="${esc(accountName())}"></label><button class="chip" type="submit">Lưu tên</button></form><div class="auth-actions"><button class="primary" id="manage-posts">Bài viết của tôi</button><button class="chip" id="logout">Đăng xuất</button></div><p id="auth-message" role="status"></p>`;
    authDialog.querySelector("#manage-posts").onclick = () => {
      authDialog.close();
      showMyPosts();
    };
    if (profileError) authMessage(profileError);
    authDialog.querySelector("#profile-form").onsubmit = async (e) => {
      e.preventDefault();
      const button = e.target.querySelector("[type=submit]"),
        name = String(new FormData(e.target).get("name") || "").trim();
      if (!name) return;
      button.disabled = true;
      authMessage("Đang lưu tên…");
      try {
        // Claim the name first: the unique index decides whether it is free.
        if (!(await ensureProfile(name))) throw new Error(profileError);
        const { error } = await supa.auth.updateUser({
          data: { display_name: name },
        });
        if (error) throw error;
        authMessage("Đã lưu tên hiển thị.");
      } catch (err) {
        authMessage(err.message || "Chưa lưu được tên. Vui lòng thử lại.");
      } finally {
        button.disabled = false;
      }
    };
    authDialog.querySelector("#logout").onclick = async (e) => {
      e.target.disabled = true;
      try {
        if (pendingWrites.size)
          throw new Error(
            "Còn thay đổi chưa đồng bộ. Hãy thử đồng bộ lại trước khi đăng xuất.",
          );
        await writeQueue;
        const { error } = await supa.auth.signOut();
        if (error) throw error;
        authDialog.close();
        toast("Đã đăng xuất");
      } catch (err) {
        authMessage(err.message);
        e.target.disabled = false;
      }
    };
  } else if (!configured) {
    authDialog.innerHTML =
      '<div class="modal-head"><h2>Giữ lại những ý tưởng hay</h2><button class="icon" data-close>✕</button></div><p>Dịch vụ tài khoản chưa được kết nối. Bạn vẫn có thể khám phá, ghi chú và soạn bản nháp trên thiết bị này.</p><button class="primary" id="guest-write">Tiếp tục viết nháp</button>';
    authDialog.querySelector("#guest-write").onclick = () => {
      authDialog.close();
      showWriter();
    };
  } else {
    const signup = mode === "signup",
      reset = mode === "reset",
      recovery = mode === "recovery";
    authDialog.innerHTML = `<form id="auth-form"><div class="modal-head"><h2>${recovery ? "Đặt mật khẩu mới" : reset ? "Lấy lại mật khẩu" : signup ? "Tạo tài khoản AIQS Project" : "Chào mừng trở lại"}</h2><button type="button" class="icon" data-close aria-label="Đóng">✕</button></div><p>${signup ? "Một không gian riêng cho thư viện và những ý tưởng của bạn." : reset ? "Nhập email để nhận liên kết đặt lại mật khẩu." : "Tiếp tục khám phá và chia sẻ tri thức."}</p>${signup ? '<label>Tên hiển thị<input name="name" required maxlength="80" autocomplete="nickname"></label>' : ""}${!recovery ? '<label>Email<input name="email" type="email" required autocomplete="email" maxlength="254"></label>' : ""}${!reset ? `<label>${recovery ? "Mật khẩu mới" : "Mật khẩu"}<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="${signup || recovery ? "new-password" : "current-password"}"></label>` : ""}<p id="auth-message" role="status" aria-live="polite"></p><button class="primary" type="submit">${recovery ? "Lưu mật khẩu mới" : reset ? "Gửi liên kết" : signup ? "Tạo tài khoản" : "Đăng nhập"}</button>${!recovery ? `<div class="auth-switch"><button type="button" data-mode="${signup ? "login" : "signup"}">${signup ? "Đã có tài khoản? Đăng nhập" : "Chưa có tài khoản? Đăng ký"}</button>${!reset ? '<button type="button" data-mode="reset">Quên mật khẩu?</button>' : ""}</div>` : ""}</form>`;
    authDialog
      .querySelectorAll("[data-mode]")
      .forEach((b) => (b.onclick = () => showAuth(b.dataset.mode)));
    authDialog.querySelector("form").onsubmit = submitAuth;
  }
  authDialog.querySelector("[data-close]").onclick = () => authDialog.close();
  if (!authDialog.open) authDialog.showModal();
}
function authMessage(message) {
  const e = document.querySelector("#auth-message");
  if (e) e.textContent = message;
}
async function submitAuth(event) {
  event.preventDefault();
  const form = event.target,
    button = form.querySelector("[type=submit]"),
    f = new FormData(form);
  button.disabled = true;
  authMessage("Đang xử lý…");
  try {
    let response;
    const redirect = location.origin + location.pathname;
    if (authMode === "signup")
      response = await supa.auth.signUp({
        email: f.get("email").trim(),
        password: f.get("password"),
        options: {
          emailRedirectTo: redirect,
          data: { display_name: f.get("name").trim() },
        },
      });
    else if (authMode === "reset")
      response = await supa.auth.resetPasswordForEmail(f.get("email").trim(), {
        redirectTo: redirect,
      });
    else if (authMode === "recovery")
      response = await supa.auth.updateUser({ password: f.get("password") });
    else
      response = await supa.auth.signInWithPassword({
        email: f.get("email").trim(),
        password: f.get("password"),
      });
    if (response.error) throw response.error;
    form.querySelector("[name=password]")?.setAttribute("value", "");
    if (form.elements.password) form.elements.password.value = "";
    if (authMode === "reset") {
      authMessage(
        "Nếu email hợp lệ, bạn sẽ nhận được liên kết đặt lại mật khẩu.",
      );
      return;
    }
    if (authMode === "signup" && !response.data.session) {
      authMessage(
        "Kiểm tra hộp thư để xác nhận đăng ký, sau đó quay lại đăng nhập.",
      );
      return;
    }
    authDialog.close();
    toast(
      authMode === "recovery"
        ? "Đã cập nhật mật khẩu"
        : authMode === "signup"
          ? "Đã tạo tài khoản"
          : "Đăng nhập thành công",
    );
  } catch (err) {
    authMessage(
      err.message === "Invalid login credentials"
        ? "Email hoặc mật khẩu chưa đúng."
        : err.message || "Không thể kết nối. Vui lòng thử lại.",
    );
  } finally {
    button.disabled = false;
  }
}
function applyUserData(values) {
  saved = values.saved || [];
  liked = values.liked || [];
  notes = values.notes || [];
  custom = values.custom || [];
  rsvp = values.rsvp || [];
  libraryState = values.library || [];
  rebuildItems();
}
function rebuildItems() {
  const published = postRows.filter((p) => p.status === "published");
  communityItems = published.map(postToItem);
  items = [...communityItems, ...custom, ...seed];
}
function bodySections(body) {
  return String(body)
    .split(/^##\s+/m)
    .filter((s) => s.trim())
    .map((part, index) => {
      if (index === 0 && !body.startsWith("## "))
        return ["Nội dung", part.trim()];
      const [heading, ...rest] = part.split("\n");
      return [heading.trim(), rest.join("\n").trim()];
    });
}
function postToItem(p) {
  const sections = bodySections(p.body);
  return {
    id: "post-" + p.id,
    postId: p.id,
    type: p.type,
    topic: p.topic,
    title: p.title,
    body: p.body,
    desc: p.summary,
    takeaway: p.summary,
    author: p.author_name,
    initial: initialsOf(p.author_name, 2),
    date: new Date(p.created_at).toLocaleDateString("vi-VN"),
    timestamp: Date.parse(p.created_at),
    read:
      Math.max(1, Math.ceil(p.body.split(/\s+/).length / 220)) + " phút đọc",
    duration: "",
    likes: 0,
    views: "",
    art: null,
    url: p.source_url || "",
    tags: p.tags || [],
    sections,
    isCommunity: true,
    authorId: p.author_id,
  };
}
function isOwnPost(id) {
  const p = postRows.find((p) => "post-" + p.id === id);
  return p?.author_id === account.user?.id ? p : null;
}
function setupPostReader() {
  if (state.view !== "reader") return;
  const x = items.find((x) => x.id === state.id);
  if (!x?.isCommunity) return;
  const source = document.querySelector(".reader-toolbar a");
  if (!x.url) source?.remove();
  const hints = document.querySelectorAll(".reader .hint");
  if (hints.length > 1)
    hints[hints.length - 1].textContent =
      "Bài viết do " + x.author + " chia sẻ. Các nhận định thuộc về tác giả.";
  if (isOwnPost(x.id)) {
    const edit = document.createElement("button");
    edit.textContent = "Chỉnh sửa bài";
    edit.onclick = () => showWriter(isOwnPost(x.id));
    document.querySelector(".reader-toolbar").append(edit);
  } else if (isAdmin) {
    const takeDown = document.createElement("button");
    takeDown.textContent = "Gỡ bài (BĐH)";
    takeDown.onclick = () =>
      changeStatus(takeDown, x.postId, "draft", "Đã gỡ bài khỏi feed.");
    document.querySelector(".reader-toolbar").append(takeDown);
  }
}
const originalRender = render;
render = function () {
  if (state.view !== "reader" && location.hash.startsWith("#read/"))
    history.replaceState(null, "", location.pathname);
  originalRender();
  decorateAccount();
  setupPostReader();
};
async function readPosts() {
  const { data, error } = await supa
    .from("luma_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data || [];
}
async function refreshSession(user, force = false) {
  if (user?.id === account.user?.id && account.ready && !force) return;
  const generation = ++sessionGeneration;
  writerDialog.close();
  postsDialog.close();
  pendingWrites.clear();
  isAdmin = false;
  profileError = "";
  account.user = user;
  account.ready = false;
  account.loading = !!user;
  cloudStatus = user ? "Đang tải dữ liệu…" : "";
  postRows = [];
  applyUserData(
    user ? {} : Object.fromEntries(dataKeys.map((k) => [k, load(k, [])])),
  );
  // Do not leave the reader here: a shared #read/post-... link must survive the
  // first session restore. render() shows a loading state while the posts are
  // fetched, then falls back to the feed only if the post is really gone.
  settled.posts = false;
  render();
  if (!user) {
    try {
      const publicRows = await readPosts();
      if (generation !== sessionGeneration) return;
      postRows = publicRows;
      rebuildItems();
    } catch {
      if (generation !== sessionGeneration) return;
      toast("Chưa tải được bài viết cộng đồng.");
    }
    settled.posts = true;
    render();
    return;
  }
  try {
    const [rows, posts, admin] = await Promise.all([
      supa.from("luma_user_data").select("key,value").eq("user_id", user.id),
      readPosts(),
      // Only changes which buttons are shown; RLS still checks every write.
      supa.rpc("luma_is_admin").then(
        (r) => !r.error && r.data === true,
        () => false,
      ),
    ]);
    if (generation !== sessionGeneration) return;
    if (rows.error) throw rows.error;
    postRows = posts;
    isAdmin = admin;
    applyUserData(
      Object.fromEntries((rows.data || []).map((r) => [r.key, r.value])),
    );
    account.ready = true;
    cloudStatus = "Đã đồng bộ";
    await ensureProfile().catch(() => false);
    if (generation !== sessionGeneration) return;
  } catch (err) {
    if (generation !== sessionGeneration) return;
    cloudStatus = "Chưa tải được dữ liệu. Vui lòng thử lại.";
    toast("Chưa kết nối được database. Kiểm tra project và file SQL.");
  } finally {
    if (generation === sessionGeneration) {
      account.loading = false;
      settled.posts = true;
      render();
    }
  }
}
account.sync = (key, value) => {
  const userId = account.user?.id;
  if (!userId || !account.ready) return;
  const snapshot = JSON.parse(JSON.stringify(value));
  const generation = sessionGeneration;
  pendingWrites.set(key, snapshot);
  writeQueue = writeQueue
    .then(async () => {
      if (generation !== sessionGeneration) return;
      cloudStatus = "Đang đồng bộ…";
      updateCloudUI();
      const { error } = await supa
        .from("luma_user_data")
        .upsert(
          { user_id: userId, key, value: snapshot },
          { onConflict: "user_id,key" },
        );
      if (generation !== sessionGeneration) return;
      if (error) throw error;
      if (pendingWrites.get(key) === snapshot) pendingWrites.delete(key);
      cloudStatus = pendingWrites.size ? "Đang đồng bộ…" : "Đã đồng bộ";
      updateCloudUI();
    })
    .catch(() => {
      if (generation === sessionGeneration) {
        cloudStatus = "Có thay đổi chưa đồng bộ";
        updateCloudUI();
        toast("Chưa đồng bộ được. Nhấn Thử lại để lưu lên tài khoản.");
      }
    });
};
function retryWrites() {
  for (const [k, v] of [...pendingWrites]) account.sync(k, v);
}
// Prevent account writes before hydration, and never accept guest edits while auth is restoring.
document.addEventListener(
  "click",
  (event) => {
    if (!(account.loading || (account.user && !account.ready))) return;
    const node = event.target.closest(
      "[data-save],[data-like],[data-delete],[data-rsvp],#save-note",
    );
    if (node) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toast("Chờ tải dữ liệu tài khoản trước khi chỉnh sửa.");
    }
  },
  true,
);
document.addEventListener(
  "mouseup",
  (event) => {
    if (
      (account.loading || (account.user && !account.ready)) &&
      state.view === "reader"
    ) {
      event.stopImmediatePropagation();
      toast("Chờ tải dữ liệu tài khoản trước khi highlight.");
    }
  },
  true,
);
function draftKey() {
  return "luma-writer-" + (account.user?.id || "guest");
}
function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(draftKey()));
  } catch {
    return null;
  }
}
function storeDraft(data) {
  try {
    localStorage.setItem(draftKey(), JSON.stringify(data));
    return true;
  } catch {
    toast("Không lưu được bản nháp trên thiết bị.");
    return false;
  }
}
function editorData() {
  const f = new FormData(writerDialog.querySelector("form"));
  return {
    title: String(f.get("title") || "").trim(),
    summary: String(f.get("summary") || "").trim(),
    body: String(f.get("body") || "").trim(),
    type: f.get("type"),
    topic: f.get("topic"),
    source_url: String(f.get("url") || "").trim(),
    tags: String(f.get("tags") || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8),
  };
}
function showWriter(row = null) {
  if (account.loading) {
    toast("Đang khôi phục tài khoản. Vui lòng chờ.");
    return;
  }
  editorId = row?.id || null;
  editorDirty = false;
  const draft = row || readDraft() || {};
  writerDialog.innerHTML = `<form id="writer-form"><div class="modal-head"><div><span class="eyebrow">CHIA SẺ MỘT GÓC NHÌN</span><h2>${row ? "Chỉnh sửa bài viết" : "Ý tưởng của bạn xứng đáng được đọc."}</h2></div><button type="button" class="icon" id="close-writer" aria-label="Đóng trình soạn thảo">✕</button></div><p>Tóm tắt một video, ghi lại một seminar, hoặc viết góc nhìn của riêng bạn.</p><div class="writer-tabs"><button type="button" class="chip active" id="write-tab">Viết</button><button type="button" class="chip" id="preview-tab">Xem trước</button><span id="word-count"></span></div><div id="write-fields"><label>Tiêu đề<input name="title" required maxlength="180" placeholder="Đặt tên cho góc nhìn của bạn" value="${esc(draft.title || "")}"></label><div class="form-row"><label>Định dạng<select name="type">${["Seminar", "Video", "News"].map((t) => `<option ${draft.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></label><label>Chủ đề<select name="topic">${topics.map((t) => `<option ${draft.topic === t ? "selected" : ""}>${t}</option>`).join("")}</select></label></div><label>Tóm tắt ngắn<textarea name="summary" required maxlength="600" rows="2" placeholder="Người đọc sẽ thấy đoạn này trên feed.">${esc(draft.summary || "")}</textarea></label><label>Nội dung<textarea name="body" class="article-input" required maxlength="60000" placeholder="Bắt đầu từ một ý tưởng...&#10;&#10;Dùng ## Tiêu đề để tạo các mục trong bài viết.">${esc(draft.body || "")}</textarea></label><div class="form-row"><label>Đường dẫn nguồn (nếu có)<input type="url" name="url" placeholder="https://..." value="${esc(draft.source_url || "")}"></label><label>Tags, ngăn cách bằng dấu phẩy<input name="tags" maxlength="300" placeholder="World Models, Learning" value="${esc((draft.tags || []).join(", "))}"></label></div></div><div id="article-preview" class="article-preview" hidden></div><p id="writer-message" role="status" aria-live="polite"></p><div class="writer-footer"><span>${account.user ? "Tác giả: " + esc(accountName()) + (isAdmin ? "" : " · Bài lên feed sau khi BĐH duyệt.") : "Bản nháp lưu riêng trên thiết bị. Đăng nhập để đăng bài."}</span><button type="button" class="chip" id="save-draft">Lưu bản nháp</button><button type="submit" class="primary">${isAdmin ? (row?.status === "published" ? "Cập nhật bài đăng" : "Đăng lên feed") : row?.status === "published" ? "Gửi duyệt bản sửa" : "Gửi duyệt"}</button></div></form>`;
  writerDialog.querySelector("#close-writer").onclick = () => closeWriter();
  writerDialog.oncancel = (e) => {
    if (editorDirty) {
      e.preventDefault();
      closeWriter();
    }
  };
  const form = writerDialog.querySelector("form");
  form.oninput = () => {
    editorDirty = true;
    wordCount();
  };
  wordCount();
  const toggle = (preview) => {
    writerDialog.querySelector("#write-fields").hidden = preview;
    writerDialog.querySelector("#article-preview").hidden = !preview;
    writerDialog
      .querySelector("#write-tab")
      .classList.toggle("active", !preview);
    writerDialog
      .querySelector("#preview-tab")
      .classList.toggle("active", preview);
    if (preview) {
      const d = editorData();
      writerDialog.querySelector("#article-preview").innerHTML =
        `<span class="eyebrow">${esc(d.type)} · ${esc(d.topic)}</span><h1>${esc(d.title || "Tiêu đề bài viết")}</h1><p class="preview-summary">${esc(d.summary)}</p>${bodySections(
          d.body,
        )
          .map(([h, t]) => `<h2>${esc(h)}</h2><p>${esc(t)}</p>`)
          .join("")}`;
    }
  };
  writerDialog.querySelector("#write-tab").onclick = () => toggle(false);
  writerDialog.querySelector("#preview-tab").onclick = () => toggle(true);
  writerDialog.querySelector("#save-draft").onclick = () => savePost("draft");
  form.onsubmit = (e) => {
    e.preventDefault();
    savePost("published");
  };
  if (!writerDialog.open) writerDialog.showModal();
}
function closeWriter() {
  if (editorDirty) {
    if (!storeDraft(editorData())) return;
    toast("Đã giữ bản đang viết trên thiết bị.");
  }
  writerDialog.close();
}
function wordCount() {
  const count = writerDialog
    .querySelector("[name=body]")
    .value.trim()
    .split(/\s+/)
    .filter(Boolean).length;
  writerDialog.querySelector("#word-count").textContent =
    count + " từ · " + Math.max(1, Math.ceil(count / 220)) + " phút đọc";
}
async function savePost(status) {
  const d = editorData(),
    message = writerDialog.querySelector("#writer-message");
  if (status === "draft" && !account.user) {
    if (storeDraft(d)) {
      editorDirty = false;
      message.textContent = "Đã lưu bản nháp trên thiết bị này.";
    }
    return;
  }
  if (!account.user) {
    storeDraft(d);
    message.textContent = "Bản nháp đã được giữ lại. Đăng nhập để đăng bài.";
    showAuth();
    return;
  }
  if (!account.ready) {
    message.textContent = "Chờ kết nối database trước khi đăng bài.";
    return;
  }
  const form = writerDialog.querySelector("form");
  if (!form.reportValidity()) return;
  if (d.source_url && !/^https?:\/\//i.test(d.source_url)) {
    message.textContent = "Nguồn cần bắt đầu bằng https:// hoặc http://";
    return;
  }
  const actor = account.user.id,
    generation = sessionGeneration;
  const buttons = [...writerDialog.querySelectorAll("button")];
  buttons.forEach((b) => (b.disabled = true));
  message.textContent = "Đang lưu…";
  try {
    if (!(await ensureProfile())) {
      if (generation !== sessionGeneration) return;
      message.textContent = profileError;
      storeDraft(d);
      return;
    }
    if (generation !== sessionGeneration) return;
    // author_name, created_at and the final status are set by the database.
    const payload = { ...d, status, author_id: actor };
    let query = supa.from("luma_posts");
    query = editorId
      ? query.update(payload).eq("id", editorId).eq("author_id", actor)
      : query.insert(payload);
    const { data, error } = await query.select().single();
    if (error) throw error;
    if (generation !== sessionGeneration) return;
    postRows = [data, ...postRows.filter((p) => p.id !== data.id)];
    rebuildItems();
    if (form !== writerDialog.querySelector("form")) return;
    editorDirty = false;
    localStorage.removeItem(draftKey());
    writerDialog.close();
    if (data.status === "published") {
      openItem("post-" + data.id);
      toast("Bài viết đã được đăng lên feed");
    } else if (data.status === "pending") {
      render();
      toast("Đã gửi bài. Bài sẽ lên feed sau khi BĐH duyệt.");
      showMyPosts();
    } else {
      render();
      toast("Đã lưu bản nháp trong tài khoản");
      showMyPosts();
    }
  } catch (err) {
    if (
      generation !== sessionGeneration ||
      form !== writerDialog.querySelector("form")
    )
      return;
    message.textContent =
      "Chưa lưu được bài. " + (err.message || "Vui lòng thử lại.");
    storeDraft(d);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}
// Authors move their own posts back to draft; admins (RLS "Moderate posts") can change any post.
async function changeStatus(button, id, status, done) {
  button.disabled = true;
  const generation = sessionGeneration;
  try {
    let query = supa.from("luma_posts").update({ status }).eq("id", id);
    if (!isAdmin) query = query.eq("author_id", account.user.id);
    const { data, error } = await query.select().single();
    if (error) throw error;
    if (generation !== sessionGeneration) return;
    postRows = postRows.map((p) => (p.id === data.id ? data : p));
    rebuildItems();
    if (state.id === "post-" + data.id && data.status !== "published")
      go("feed");
    else render();
    if (postsDialog.open) showMyPosts();
    toast(done);
  } catch {
    toast("Chưa cập nhật được bài. Hãy thử lại.");
    button.disabled = false;
  }
}
function showMyPosts() {
  const mine = postRows.filter((p) => p.author_id === account.user?.id);
  const queue = isAdmin ? postRows.filter((p) => p.status === "pending") : [];
  const local = readDraft();
  const review = queue.length
    ? `<h3 class="moderation-title">Bài chờ duyệt (${queue.length})</h3>${queue.map((p) => `<div class="post-management moderation-item"><span class="tag">${esc(p.type)} · ${esc(p.topic)}</span><h3>${esc(p.title)}</h3><small>Tác giả: ${esc(p.author_name)}</small><details><summary>Xem nội dung</summary><p>${esc(p.summary)}</p>${p.source_url ? `<p>Nguồn: ${esc(p.source_url)}</p>` : ""}<pre class="moderation-body">${esc(p.body)}</pre></details><button class="primary" data-approve="${esc(p.id)}">Duyệt</button><button class="chip" data-reject="${esc(p.id)}">Trả về bản nháp</button></div>`).join("")}`
    : isAdmin
      ? '<p class="moderation-title">Không có bài nào chờ duyệt.</p>'
      : "";
  postsDialog.innerHTML = `<div class="modal-head"><h2>Bài viết & bản nháp</h2><button class="icon" id="close-posts" aria-label="Đóng">✕</button></div><p>${account.user ? "Quản lý bài đăng và những ý tưởng còn đang viết." : "Đăng nhập để lưu bản nháp trong tài khoản và đăng lên feed."}</p>${profileError ? `<p role="status">${esc(profileError)}</p>` : ""}<button class="primary" id="new-post">Viết bài mới</button>${review}${local ? `<div class="post-management"><span class="tag">Bản trên thiết bị</span><h3>${esc(local.title || "Bản nháp chưa có tên")}</h3><button class="chip" id="local-draft">Tiếp tục viết</button></div>` : ""}${mine.map((p) => `<div class="post-management"><span class="tag">${statusLabels[p.status] || "Bản nháp"}</span><h3>${esc(p.title)}</h3><button class="chip" data-edit-post="${esc(p.id)}">Chỉnh sửa</button>${p.status === "published" ? `<button class="chip" data-unpublish="${esc(p.id)}">Gỡ về bản nháp</button>` : p.status === "pending" ? `<button class="chip" data-unpublish="${esc(p.id)}">Rút về bản nháp</button>` : ""}</div>`).join("")}${!mine.length && !local ? "<p>Chưa có bài viết. Bắt đầu bằng một ý tưởng nhỏ.</p>" : ""}`;
  postsDialog.querySelector("#close-posts").onclick = () => postsDialog.close();
  postsDialog.querySelector("#new-post").onclick = () => {
    postsDialog.close();
    showWriter();
  };
  postsDialog.querySelector("#local-draft")?.addEventListener("click", () => {
    postsDialog.close();
    showWriter();
  });
  postsDialog.querySelectorAll("[data-edit-post]").forEach(
    (b) =>
      (b.onclick = () => {
        const p = mine.find((p) => p.id === b.dataset.editPost);
        postsDialog.close();
        showWriter(p);
      }),
  );
  postsDialog
    .querySelectorAll("[data-unpublish]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          changeStatus(
            b,
            b.dataset.unpublish,
            "draft",
            "Đã chuyển bài về bản nháp; nội dung vẫn được giữ lại.",
          )),
    );
  postsDialog
    .querySelectorAll("[data-approve]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          changeStatus(
            b,
            b.dataset.approve,
            "published",
            "Đã duyệt bài lên feed.",
          )),
    );
  postsDialog
    .querySelectorAll("[data-reject]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          changeStatus(
            b,
            b.dataset.reject,
            "draft",
            "Đã trả bài về bản nháp cho tác giả.",
          )),
    );
  if (!postsDialog.open) postsDialog.showModal();
}
async function initSupabase() {
  const config = window.LUMA_SUPABASE;
  if (!config?.url || !config.publishableKey) {
    markSettled("posts");
    return;
  }
  try {
    if (
      !/^https:\/\//.test(config.url) ||
      config.publishableKey.startsWith("sb_secret_")
    )
      throw new Error("Invalid public configuration");
    if (config.publishableKey.startsWith("eyJ")) {
      const payload = JSON.parse(
        atob(
          config.publishableKey
            .split(".")[1]
            .replace(/-/g, "+")
            .replace(/_/g, "/"),
        ),
      );
      if (payload.role !== "anon")
        throw new Error("Only anon keys are allowed");
    }
    account.loading = true;
    // Served from dist/vendor (integrity-checked by tools/vendor-rich.py), not a CDN.
    if (!window.supabase?.createClient)
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/vendor/supabase/supabase.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Supabase SDK failed to load"));
        document.head.append(script);
      });
    supa = window.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
    let initialized = false,
      recovering = false;
    supa.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") recovering = true;
      setTimeout(() => {
        if (!initialized) return;
        if (event === "PASSWORD_RECOVERY") showAuth("recovery");
        if (
          event === "SIGNED_OUT" ||
          session?.user?.id !== account.user?.id ||
          event === "USER_UPDATED"
        )
          refreshSession(session?.user || null, event === "USER_UPDATED");
      }, 0);
    });
    const { data, error } = await supa.auth.getSession();
    if (error) throw error;
    await refreshSession(data.session?.user || null, true);
    initialized = true;
    if (recovering) showAuth("recovery");
    if (location.search.includes("code=") && data.session) {
      history.replaceState(null, "", location.pathname);
    }
    if (data.session && location.hash.includes("type=recovery"))
      showAuth("recovery");
  } catch {
    account.loading = false;
    cloudStatus = "Chưa kết nối được dịch vụ tài khoản";
    toast(cloudStatus);
    settled.posts = true;
    render();
  }
}
window.addEventListener("beforeunload", (event) => {
  if (editorDirty || pendingWrites.size) {
    event.preventDefault();
    event.returnValue = "";
  }
});
initSupabase();

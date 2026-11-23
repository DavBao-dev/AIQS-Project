let richEnginePromise = null,
  articleParser = null,
  richSaveBusy = false;
const imageObjectURLs = new Map();
function loadRichScript(src, globalName) {
  if (window[globalName]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error("Không tải được công cụ định dạng. Hãy tải lại trang."));
    };
    document.head.append(script);
  });
}
async function ensureRichEngine() {
  if (!richEnginePromise) {
    richEnginePromise = (async () => {
      if (!document.querySelector("#katex-style")) {
        const css = document.createElement("link");
        css.id = "katex-style";
        css.rel = "stylesheet";
        css.href = "/vendor/katex/katex.min.css";
        document.head.append(css);
      }
      await Promise.all([
        loadRichScript("/vendor/marked/marked.umd.js", "marked"),
        loadRichScript("/vendor/dompurify/purify.min.js", "DOMPurify"),
        loadRichScript("/vendor/katex/katex.min.js", "katex"),
      ]);
      articleParser = ArticleCore.createParser(window.marked.Marked);
    })().catch((error) => {
      richEnginePromise = null;
      throw error;
    });
  }
  return richEnginePromise;
}
function articleHTML(body) {
  if (!articleParser || !window.DOMPurify)
    throw new Error("Công cụ định dạng chưa sẵn sàng.");
  return window.DOMPurify.sanitize(articleParser.parse(String(body)), {
    ALLOWED_TAGS: [
      "p",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "strong",
      "em",
      "del",
      "a",
      "img",
      "span",
      "div",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "hr",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "input",
    ],
    ALLOWED_ATTR: [
      "href",
      "src",
      "alt",
      "title",
      "class",
      "data-display",
      "data-local-image",
      "data-storage-image",
      "start",
      "checked",
      "disabled",
      "type",
      "loading",
      "decoding",
      "referrerpolicy",
      "target",
      "rel",
      "align",
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ADD_URI_SAFE_ATTR: [
      "data-display",
      "data-local-image",
      "data-storage-image",
      "loading",
      "decoding",
      "referrerpolicy",
      "target",
      "rel",
      "type",
      "start",
      "checked",
      "disabled",
      "align",
    ],
    ALLOWED_URI_REGEXP: /^(?:https:\/\/|#)/i,
  });
}
function renderMath(root) {
  for (const node of root.querySelectorAll(".math-source")) {
    const tex = node.textContent;
    try {
      window.katex.render(tex, node, {
        displayMode: node.dataset.display === "true",
        throwOnError: true,
        trust: false,
        strict: "warn",
        maxExpand: 1000,
        maxSize: 20,
        output: "htmlAndMathml",
      });
      node.classList.add("math-rendered");
      node.setAttribute("aria-label", tex);
    } catch {
      node.classList.add("math-error");
      node.textContent =
        (node.dataset.display === "true" ? "$$" : "$") +
        tex +
        (node.dataset.display === "true" ? "$$" : "$");
      node.title = "Công thức chưa hợp lệ hoặc chưa được hỗ trợ.";
    }
  }
}
function openImageDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("aiqs-article-media", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("images", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Trình duyệt chưa cho phép lưu ảnh trên thiết bị."));
  });
}
async function imageDB(method, value) {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
        "images",
        method === "get" ? "readonly" : "readwrite",
      ),
      request = transaction.objectStore("images")[method](value);
    let result;
    request.onsuccess = () => {
      result = request.result;
    };
    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(
        new Error("Không lưu được ảnh. Bộ nhớ trình duyệt có thể đã đầy."),
      );
    };
  });
}
async function getLocalImage(id) {
  const record = await imageDB("get", id);
  const actor = account.user?.id || "guest";
  if (!record || !["guest", actor].includes(record.ownerId))
    throw new Error(
      "Ảnh không có trên thiết bị hoặc không thuộc tài khoản này.",
    );
  return record;
}
async function hydrateArticleImages(root) {
  // Install before assigning sources: cached/fast failures may fire immediately.
  const failImage = (image, text) => {
    image.hidden = true;
    if (!image.parentElement?.querySelector(".media-message")) {
      const message = document.createElement("span");
      message.className = "media-message";
      message.textContent = text;
      image.after(message);
    }
  };
  for (const image of root.querySelectorAll("img")) {
    const fail = () =>
      failImage(
        image,
        "Không tải được ảnh. Kiểm tra lại đường dẫn hoặc kết nối.",
      );
    image.addEventListener("error", fail, { once: true });
    if (image.complete && !image.naturalWidth && image.getAttribute("src"))
      fail();
  }
  await Promise.all(
    [
      ...root.querySelectorAll("img[data-local-image],img[data-storage-image]"),
    ].map(async (image) => {
      try {
        if (image.dataset.localImage) {
          const key =
            (account.user?.id || "guest") + ":" + image.dataset.localImage;
          const record = await getLocalImage(image.dataset.localImage);
          if (!imageObjectURLs.has(key))
            imageObjectURLs.set(key, URL.createObjectURL(record.blob));
          image.src = imageObjectURLs.get(key);
        } else {
          if (!supa) throw new Error("Cần kết nối tài khoản để tải ảnh này.");
          const { data, error } = await supa.storage
            .from("post-images")
            .createSignedUrl(image.dataset.storageImage, 3600);
          if (error || !data?.signedUrl)
            throw error || new Error("Ảnh chưa khả dụng");
          image.src = data.signedUrl;
        }
      } catch (error) {
        failImage(image, error.message || "Chưa tải được ảnh.");
      }
    }),
  );
}
async function compressArticleImage(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Chọn ảnh PNG, JPG hoặc WebP.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Ảnh tối đa 5 MB. Hãy chọn ảnh nhỏ hơn.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40000000)
      throw new Error("Ảnh có độ phân giải quá lớn.");
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob || blob.size > 2 * 1024 * 1024)
      throw new Error("Ảnh sau tối ưu vẫn quá lớn. Hãy chọn ảnh nhỏ hơn.");
    return blob;
  } finally {
    bitmap.close();
  }
}
function insertIntoBody(text, selection = null) {
  const textarea = writerDialog.querySelector("[name=body]");
  if (!textarea || textarea.readOnly) return;
  const start = selection?.start ?? textarea.selectionStart,
    end = selection?.end ?? textarea.selectionEnd;
  if (textarea.value.length - (end - start) + text.length > 60000) {
    toast("Nội dung tối đa 60.000 ký tự.");
    return;
  }
  textarea.setRangeText(text, start, end, "end");
  textarea.focus();
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  editorDirty = true;
  wordCount();
}
async function addImageFiles(files, selection) {
  const message = writerDialog.querySelector("#writer-message");
  if (!files?.length) return;
  if (files.length > 6) {
    message.textContent = "Thêm tối đa 6 ảnh mỗi lần.";
    return;
  }
  const uploadTarget = writerDialog.querySelector("[name=body]");
  const generation = sessionGeneration;
  message.textContent = "Đang tối ưu và lưu ảnh…";
  try {
    let inserted = "";
    for (const file of [...files].slice(0, 6)) {
      const blob = await compressArticleImage(file);
      if (
        generation !== sessionGeneration ||
        !writerDialog.open ||
        uploadTarget !== writerDialog.querySelector("[name=body]")
      )
        throw new Error(
          "Trình soạn thảo đã thay đổi. Hãy mở lại bản nháp để thêm ảnh.",
        );
      const id = crypto.randomUUID();
      await imageDB("put", {
        id,
        blob,
        ownerId: account.user?.id || "guest",
        name: file.name,
        createdAt: new Date().toISOString(),
      });
      const alt = file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[\[\]\\\r\n]/g, " ")
        .slice(0, 100);
      inserted += "\n\n![" + alt + "](local-image:" + id + ")\n\n";
    }
    if (
      !writerDialog.open ||
      uploadTarget !== writerDialog.querySelector("[name=body]")
    )
      throw new Error("Trình soạn thảo đã thay đổi.");
    insertIntoBody(inserted, selection);
    message.textContent = account.user
      ? "Ảnh đã sẵn sàng. Khi lưu bài, ảnh sẽ đồng bộ vào tài khoản."
      : "Ảnh đã lưu trên thiết bị này cùng bản nháp.";
  } catch (error) {
    message.textContent = error.message || "Không thêm được ảnh.";
  }
}
function writerSelection() {
  const t = writerDialog.querySelector("[name=body]");
  return { start: t.selectionStart, end: t.selectionEnd };
}
async function renderWriterPreview() {
  const target = writerDialog.querySelector("#article-preview");
  if (!target) return;
  const d = editorData(),
    generation = sessionGeneration;
  target.innerHTML =
    '<p class="render-loading">Đang chuẩn bị công thức và nội dung…</p>';
  try {
    await ensureRichEngine();
    if (!target.isConnected || generation !== sessionGeneration) return;
    target.innerHTML = `<span class="eyebrow">${esc(d.type)} · ${esc(d.topic)}</span><h1>${esc(d.title || "Tiêu đề bài viết")}</h1><p class="preview-summary">${esc(d.summary)}</p><div class="rich-article">${articleHTML(d.body)}</div>`;
    renderMath(target);
    await hydrateArticleImages(target);
  } catch (error) {
    target.textContent = error.message;
  }
}
const showWriterBeforeRich = showWriter;
showWriter = function (row = null) {
  showWriterBeforeRich(row);
  const textarea = writerDialog.querySelector("[name=body]");
  if (!textarea || account.loading) return;
  textarea.id = "article-body";
  textarea.setAttribute("aria-label", "Nội dung bài viết");
  textarea.closest("label").htmlFor = "article-body";
  ensureRichEngine().catch(() => {});
  textarea.placeholder =
    "Viết bằng Markdown…\n\n## Một ý tưởng mới\nCông thức trong dòng: $E=mc^2$\n\nCông thức riêng:\n$$\n\\hat{y} = \\beta_0 + \\beta_1 x\n$$";
  const toolbar = document.createElement("div");
  toolbar.className = "editor-formatbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Định dạng nội dung");
  toolbar.innerHTML = `<button type="button" data-format="bold" title="In đậm" aria-label="In đậm"><strong>B</strong></button><button type="button" data-format="italic" title="In nghiêng" aria-label="In nghiêng"><em>I</em></button><button type="button" data-format="heading" title="Tiêu đề mục" aria-label="Tiêu đề mục">H₂</button><span class="format-divider"></span><button type="button" data-format="inline-math" title="Công thức trong dòng">$x$</button><button type="button" data-format="block-math" title="Công thức riêng một dòng">∑ Công thức</button><span class="format-divider"></span><button type="button" id="insert-image-url">${svg("plus")}Ảnh từ URL</button><button type="button" id="upload-image">${svg("plus")}Tải ảnh lên</button><input id="article-image-files" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden>`;
  textarea.before(toolbar);
  const imagePanel = document.createElement("div");
  imagePanel.className = "image-insert-panel";
  imagePanel.hidden = true;
  imagePanel.innerHTML =
    '<label>Đường dẫn ảnh HTTPS<input id="article-image-url" inputmode="url" placeholder="https://example.com/hinh-anh.png"></label><label>Chú thích ảnh<input id="article-image-alt" maxlength="150" placeholder="Mô tả ngắn về hình ảnh"></label><div><button type="button" class="primary" id="confirm-image-url">Chèn ảnh</button><button type="button" class="chip" id="cancel-image-url">Hủy</button></div><p id="image-url-message" role="status"></p>';
  toolbar.after(imagePanel);
  let imageSelection = null;
  toolbar.querySelector("#insert-image-url").onclick = () => {
    imageSelection = writerSelection();
    imagePanel.hidden = !imagePanel.hidden;
    if (!imagePanel.hidden) imagePanel.querySelector("input").focus();
  };
  imagePanel.querySelector("#cancel-image-url").onclick = () => {
    imagePanel.hidden = true;
  };
  imagePanel.querySelector("#confirm-image-url").onclick = () => {
    const url = ArticleCore.safeURL(
        imagePanel.querySelector("#article-image-url").value.trim(),
      ),
      alt = imagePanel
        .querySelector("#article-image-alt")
        .value.replace(/[\[\]\\\r\n]/g, " ")
        .trim();
    if (!url) {
      imagePanel.querySelector("#image-url-message").textContent =
        "Nhập đường dẫn ảnh bắt đầu bằng https://";
      return;
    }
    insertIntoBody(
      "\n\n![" +
        (alt || "Hình minh họa") +
        "](" +
        url.replace(/[()]/g, (c) => (c === "(" ? "%28" : "%29")) +
        ")\n\n",
      imageSelection,
    );
    imagePanel.hidden = true;
    imagePanel.querySelectorAll("input").forEach((i) => (i.value = ""));
    imagePanel.querySelector("#image-url-message").textContent = "";
  };
  const imageInput = toolbar.querySelector("#article-image-files");
  toolbar.querySelector("#upload-image").onclick = () => {
    imageSelection = writerSelection();
    imageInput.click();
  };
  imageInput.onchange = async () => {
    await addImageFiles(imageInput.files, imageSelection);
    imageInput.value = "";
  };
  toolbar.querySelectorAll("[data-format]").forEach(
    (button) =>
      (button.onclick = () => {
        const selectedText = textarea.value.slice(
          textarea.selectionStart,
          textarea.selectionEnd,
        );
        const formats = {
          bold: "**" + (selectedText || "Văn bản in đậm") + "**",
          italic: "*" + (selectedText || "Văn bản in nghiêng") + "*",
          heading: "\n\n## " + (selectedText || "Tiêu đề mục") + "\n",
          "inline-math": "$" + (selectedText || "E=mc^2") + "$",
          "block-math":
            "\n\n$$\n" +
            (selectedText || "\\hat{y} = \\beta_0 + \\beta_1 x") +
            "\n$$\n\n",
        };
        insertIntoBody(formats[button.dataset.format]);
      }),
  );
  textarea.addEventListener("paste", (event) => {
    const images = [...(event.clipboardData?.items || [])]
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (images.length) {
      event.preventDefault();
      addImageFiles(images, writerSelection());
    }
  });
  textarea.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types.includes("Files")) {
      event.preventDefault();
      textarea.classList.add("image-drop-active");
    }
  });
  textarea.addEventListener("dragleave", () =>
    textarea.classList.remove("image-drop-active"),
  );
  textarea.addEventListener("drop", (event) => {
    textarea.classList.remove("image-drop-active");
    if (event.dataTransfer?.files.length) {
      event.preventDefault();
      addImageFiles(event.dataTransfer.files, writerSelection());
    }
  });
  const hint = document.createElement("div");
  hint.className = "editor-markdown-hint";
  hint.innerHTML =
    '<span>Markdown + LaTeX · PNG, JPG, WebP tối đa 5 MB</span><button type="button" id="syntax-help">Cú pháp nhanh</button>';
  textarea.after(hint);
  hint.querySelector("button").onclick = () => {
    const help = writerDialog.querySelector(".syntax-help");
    if (help) {
      help.remove();
      return;
    }
    const box = document.createElement("div");
    box.className = "syntax-help";
    box.innerHTML =
      "<strong>Viết rõ ý, định dạng gọn.</strong><p><code>## Tiêu đề</code> · <code>**In đậm**</code> · <code>- Danh sách</code></p><p>Trong dòng: <code>$E=mc^2$</code></p><p>Riêng một khối: <code>$$\\sum_{i=1}^{n} x_i$$</code></p><p>Ảnh: <code>![Chú thích](https://...)</code></p><p>Dán ảnh từ clipboard hoặc kéo thả ảnh vào ô nội dung.</p>";
    hint.after(box);
  };
  const preview = writerDialog.querySelector("#preview-tab"),
    beforePreview = preview.onclick;
  preview.onclick = () => {
    beforePreview();
    renderWriterPreview();
  };
};
const savePostBeforeRich = savePost;
savePost = async function (status) {
  if (richSaveBusy) return;
  if (!account.user || !account.ready || !supa)
    return savePostBeforeRich(status);
  const textarea = writerDialog.querySelector("[name=body]");
  if (!textarea) return;
  const matches = [
    ...new Set(
      [...textarea.value.matchAll(/local-image:([0-9a-f-]{36})/gi)].map(
        (m) => m[1],
      ),
    ),
  ];
  if (!matches.length) return savePostBeforeRich(status);
  richSaveBusy = true;
  const generation = sessionGeneration,
    actor = account.user.id,
    buttons = [...writerDialog.querySelectorAll("button")];
  textarea.readOnly = true;
  buttons.forEach((b) => (b.disabled = true));
  const message = writerDialog.querySelector("#writer-message");
  message.textContent = "Đang đồng bộ ảnh trước khi lưu bài…";
  try {
    let body = textarea.value;
    for (const id of matches) {
      const image = await getLocalImage(id),
        ext =
          image.blob.type === "image/webp"
            ? "webp"
            : image.blob.type === "image/png"
              ? "png"
              : "jpg",
        path = actor + "/" + crypto.randomUUID() + "." + ext;
      const { error } = await supa.storage
        .from("post-images")
        .upload(path, image.blob, {
          contentType: image.blob.type,
          cacheControl: "3600",
          upsert: false,
        });
      if (error) throw error;
      if (
        generation !== sessionGeneration ||
        !writerDialog.open ||
        textarea !== writerDialog.querySelector("[name=body]")
      )
        throw new Error("Tài khoản đã thay đổi. Hãy mở lại bản nháp.");
      body = body.replaceAll("local-image:" + id, "supabase-image:" + path);
    }
    textarea.value = body;
    editorDirty = true;
    await savePostBeforeRich(status);
  } catch (error) {
    if (
      generation !== sessionGeneration ||
      textarea !== writerDialog.querySelector("[name=body]")
    )
      return;
    message.textContent =
      "Chưa lưu được ảnh: " + (error.message || "Vui lòng thử lại.");
    storeDraft(editorData());
  } finally {
    richSaveBusy = false;
    textarea.readOnly = false;
    buttons.forEach((b) => (b.disabled = false));
  }
};
const upgradeReaderBeforeRich = upgradeReader;
upgradeReader = function () {
  const x = items.find((x) => x.id === state.id);
  if (!x?.body) {
    upgradeReaderBeforeRich();
    return;
  }
  const id = x.id,
    container = document.querySelector("#reading-content");
  if (!container) return;
  if (!articleParser) {
    upgradeReaderBeforeRich();
    ensureRichEngine()
      .then(() => {
        if (state.view === "reader" && state.id === id) upgradeReader();
      })
      .catch(() =>
        toast("Chưa tải được công cụ công thức. Hãy thử tải lại trang."),
      );
    return;
  }
  if (!container.dataset.richRendered) {
    container.classList.add("rich-article");
    container.innerHTML = articleHTML(x.body);
    container.dataset.richRendered = "true";
    container
      .querySelectorAll("p")
      .forEach((p, i) => (p.dataset.par = "md-" + i));
    renderMath(container);
    const headings = [...container.querySelectorAll("h1,h2,h3")];
    headings.forEach((h, i) => (h.id = "rich-heading-" + i));
    const contents = document.querySelector(".reader-rail .rail-section");
    if (contents)
      contents.innerHTML =
        '<div class="rail-head"><h3>Trong nội dung này</h3></div>' +
        headings
          .map(
            (h) =>
              `<a class="related" href="#${h.id}">${esc(h.textContent)}</a>`,
          )
          .join("");
    hydrateArticleImages(container);
  }
  upgradeReaderBeforeRich();
};
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  for (const url of imageObjectURLs.values()) URL.revokeObjectURL(url);
  imageObjectURLs.clear();
});
if (state.view === "reader") upgradeReader();

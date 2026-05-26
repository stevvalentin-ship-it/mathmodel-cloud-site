(function () {
  const cfg = window.MATHMODEL_CLOUD_CONFIG || {};
  const rawCatalog = (window.MATHMODEL_DATA && window.MATHMODEL_DATA.items) || [];
  const summary = (window.MATHMODEL_DATA && window.MATHMODEL_DATA.summary) || {};
  const bucket = cfg.STORAGE_BUCKET || "mathmodel-files";
  const hasSupabaseConfig = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const client = hasSupabaseConfig ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const fixedPassword = "123123123123";
  const fixedUsers = [
    { name: "杨乐然", role: "代码手" },
    { name: "邢凯轶", role: "论文手" },
    { name: "保竣然", role: "建模手" }
  ];

  const state = {
    currentView: "library",
    year: "all",
    source: "all",
    type: "all",
    search: "",
    bonusOnly: false,
    user: null,
    profile: null,
    cloudCatalog: [],
    posts: [],
    resources: []
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const store = {
    get(key, fallback) {
      try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  function toast(message) {
    const box = $("#toast");
    box.textContent = message;
    box.classList.remove("hidden");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => box.classList.add("hidden"), 3200);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function normalizePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  }

  function basename(path) {
    return normalizePath(path).split("/").filter(Boolean).pop() || "未命名文件";
  }

  function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function fileExt(name) {
    const clean = basename(name);
    const dot = clean.lastIndexOf(".");
    return dot > -1 ? clean.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, "") : "";
  }

  function safeStoragePath(prefix, relativePath, file) {
    const cleanPrefix = normalizePath(prefix).replace(/[^a-zA-Z0-9/_-]/g, "_");
    const base = basename(relativePath).replace(/\.[^.]+$/, "");
    const safeName = base
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "file";
    const hash = hashText(`${relativePath}:${file.name}:${file.size}:${file.lastModified}`);
    return `${cleanPrefix}/${hash}-${safeName}${fileExt(file.name)}`;
  }

  function formatSize(size) {
    const num = Number(size || 0);
    if (!num) return "未知大小";
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    if (num < 1024 * 1024 * 1024) return `${(num / 1024 / 1024).toFixed(1)} MB`;
    return `${(num / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  function getFileRelativePath(file) {
    return normalizePath(file.webkitRelativePath || file.name);
  }

  function guessSourceFromPath(path, fallback) {
    const clean = normalizePath(path).toLowerCase();
    if (fallback && fallback !== "auto") return fallback;
    if (clean.includes("problem_files") || clean.includes("赛题")) return "problem";
    if (clean.includes("paper_output") || clean.includes("论文")) return "paper";
    return "problem";
  }

  function findCatalogMatch(relativePath) {
    const clean = normalizePath(relativePath);
    const direct = rawCatalog.find((item) => normalizePath(item.path) === clean);
    if (direct) return direct;
    const name = basename(clean);
    return rawCatalog.find((item) => basename(item.path) === name);
  }

  function roleClass(role) {
    if (role === "代码手") return "code";
    if (role === "建模手") return "model";
    return "paper";
  }

  async function init() {
    $("#teamName").textContent = cfg.TEAM_NAME || "数学建模小队";
    bindEvents();
    renderYears();
    renderCatalog();
    await loadSession();
    await refreshAll();
    updateMetrics();
  }

  function bindEvents() {
    $$(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    const searchInput = $("#searchInput");
    searchInput.addEventListener("input", (event) => {
      state.search = event.target.value.trim();
      renderCatalog();
    });
    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      state.search = event.currentTarget.value.trim();
      switchView("library");
      renderCatalog();
      $("#catalogList").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("#sourceFilter").addEventListener("change", (event) => {
      state.source = event.target.value;
      renderCatalog();
    });
    $("#typeFilter").addEventListener("change", (event) => {
      state.type = event.target.value;
      renderCatalog();
    });
    $("#bonusFilter").addEventListener("change", (event) => {
      state.bonusOnly = event.target.checked;
      renderCatalog();
    });
    $("#resetFilter").addEventListener("click", resetFilters);

    $("#loginOpen").addEventListener("click", () => $("#loginDialog").showModal());
    $("#logoutBtn").addEventListener("click", logout);
    $("#signinBtn").addEventListener("click", signin);

    $("#postForm").addEventListener("submit", createPost);
    $("#resourceForm").addEventListener("submit", createResource);
    $("#catalogUploadForm").addEventListener("submit", uploadCatalogFolder);
    $("#refreshPosts").addEventListener("click", refreshPosts);
    $("#refreshResources").addEventListener("click", refreshResources);

    bindFileHint("#postFiles", "#postFileHint");
    bindFileHint("#resourceFiles", "#resourceFileHint");
    bindFileHint("#catalogFiles", "#catalogFileHint");
  }

  function bindFileHint(inputSelector, hintSelector) {
    $(inputSelector).addEventListener("change", (event) => {
      const files = Array.from(event.target.files || []);
      const folders = new Set(files.map((file) => getFileRelativePath(file).split("/")[0]).filter(Boolean));
      $(hintSelector).textContent = files.length
        ? `已选择 ${files.length} 个文件，${folders.size || 1} 个顶层文件夹`
        : "可一次选择文件夹，保持原来的层级";
    });
  }

  function switchView(view) {
    state.currentView = view;
    $$(".nav-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
    $$(".view").forEach((section) => section.classList.toggle("active", section.id === view));
  }

  function updateCloudStatus() {
    const status = $("#cloudStatus");
    const hint = $("#cloudHint");
    if (hasSupabaseConfig) {
      status.textContent = state.user ? "云端已连接" : "云端待登录";
      hint.textContent = state.user ? "笔记和文件会同步给队友" : "登录后才能查看和上传团队内容";
      return;
    }
    status.textContent = "本地演示模式";
    hint.textContent = "还没填写 Supabase 配置，当前内容只保存在这台电脑的浏览器里";
  }

  async function loadSession() {
    const fixedUser = store.get("mathmodel_fixed_user", null);
    if (fixedUser) {
      setFixedUser(fixedUser);
      syncRoleSelect();
    }
    updateUserBox();
    updateCloudStatus();
  }

  async function loadProfile() {
    if (!hasSupabaseConfig || !state.user) return;
    const { data } = await client
      .from("team_members")
      .select("display_name, role, is_admin")
      .eq("user_id", state.user.id)
      .maybeSingle();
    state.profile = data || null;
  }

  function updateUserBox() {
    const name = state.profile?.display_name || state.user?.user_metadata?.display_name || state.user?.email || "未登录";
    $("#userName").textContent = state.user ? name : "未登录";
    $("#loginOpen").classList.toggle("hidden", Boolean(state.user));
    $("#logoutBtn").classList.toggle("hidden", !state.user);
  }

  async function signin() {
    const form = $("#loginForm");
    const loginName = form.login_name.value.trim();
    const password = form.password.value;
    const profile = fixedUsers.find((user) => user.name === loginName);
    if (!profile) {
      $("#loginMsg").textContent = "请选择正确的队员姓名。";
      return;
    }
    if (password !== fixedPassword) {
      $("#loginMsg").textContent = "密码不对。";
      return;
    }
    store.set("mathmodel_fixed_user", profile);
    setFixedUser(profile);
    syncRoleSelect();
    updateUserBox();
    updateCloudStatus();
    $("#loginDialog").close();
    await refreshAll();
    toast("登录成功");
  }

  function setFixedUser(profile) {
    state.user = {
      id: null,
      email: `${profile.name}@fixed.local`,
      user_metadata: { display_name: profile.name }
    };
    state.profile = { display_name: profile.name, role: profile.role, is_admin: profile.name === "杨乐然" };
  }

  function syncRoleSelect() {
    const roleSelect = $("#postForm [name='role']");
    if (roleSelect && state.profile?.role) roleSelect.value = state.profile.role;
  }

  async function logout() {
    store.set("mathmodel_fixed_user", null);
    state.user = null;
    state.profile = null;
    updateUserBox();
    updateCloudStatus();
    await refreshAll();
  }

  function resetFilters() {
    state.year = "all";
    state.source = "all";
    state.type = "all";
    state.search = "";
    state.bonusOnly = false;
    $("#searchInput").value = "";
    $("#sourceFilter").value = "all";
    $("#typeFilter").value = "all";
    $("#bonusFilter").checked = false;
    renderYears();
    renderCatalog();
  }

  function renderYears() {
    const catalog = allCatalogItems();
    const years = Array.from(new Set(catalog.map((item) => item.year).filter(Boolean))).sort((a, b) => b - a);
    const counts = catalog.reduce((acc, item) => {
      const year = item.year;
      if (!year) return acc;
      acc[year] = (acc[year] || 0) + 1;
      return acc;
    }, {});
    $("#yearList").innerHTML = [
      `<button class="year-btn ${state.year === "all" ? "active" : ""}" data-year="all" type="button"><span>全部</span><small>${catalog.length}</small></button>`,
      ...years.map((year) => {
        const count = counts[year] || 0;
        return `<button class="year-btn ${String(state.year) === String(year) ? "active" : ""}" data-year="${year}" type="button"><span>${year}</span><small>${count}</small></button>`;
      })
    ].join("");
    $$(".year-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.year = btn.dataset.year;
        renderYears();
        renderCatalog();
      });
    });
  }

  function cloudRowToCatalogItem(row) {
    const path = normalizePath(row.relative_path || row.storage_path || row.name || row.title);
    const match = findCatalogMatch(path) || {};
    return {
      ...match,
      path: normalizePath(match.path || path),
      source: row.source || match.source || guessSourceFromPath(path, "auto"),
      collection: row.collection || match.collection || "team upload",
      year: row.year || match.year || null,
      types: row.problem_types || match.types || [],
      title: row.title || match.title || row.name || basename(path),
      name: row.name || match.name || basename(path),
      folder: row.folder || match.folder || "",
      ext: row.ext || match.ext || "",
      kind: row.kind || match.kind || "file",
      size: row.size || match.size || 0,
      bonus: Boolean(row.bonus || match.bonus),
      cloudOnly: !match.path
    };
  }

  function allCatalogItems() {
    const map = new Map(rawCatalog.map((item) => [normalizePath(item.path), item]));
    state.cloudCatalog.forEach((row) => {
      const key = normalizePath(row.relative_path || row.storage_path || row.name || row.title);
      if (!key || map.has(key)) return;
      map.set(key, cloudRowToCatalogItem(row));
    });
    return Array.from(map.values());
  }

  function filteredCatalog() {
    const term = state.search.toLowerCase();
    return allCatalogItems()
      .filter((item) => state.year === "all" || String(item.year) === String(state.year))
      .filter((item) => state.source === "all" || item.source === state.source)
      .filter((item) => state.type === "all" || (item.types || []).includes(state.type))
      .filter((item) => !state.bonusOnly || item.bonus)
      .filter((item) => {
        if (!term) return true;
        return [item.title, item.name, item.path, item.collection, item.year, (item.types || []).join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => (b.year || 0) - (a.year || 0) || String(a.title).localeCompare(String(b.title), "zh-CN"));
  }

  function renderCatalog() {
    const items = filteredCatalog();
    const cloudMap = new Map(state.cloudCatalog.map((item) => [normalizePath(item.relative_path), item]));
    const titleParts = [];
    if (state.year !== "all") titleParts.push(`${state.year} 年`);
    if (state.source !== "all") titleParts.push(state.source === "problem" ? "赛题" : "优秀论文");
    if (state.type !== "all") titleParts.push(`${state.type} 题`);
    if (state.bonusOnly) titleParts.push("附赠资料");
    $("#resultTitle").textContent = titleParts.join(" · ") || "全部资料";
    $("#catalogList").innerHTML = items.slice(0, 160).map((item) => {
      const path = normalizePath(item.path);
      const uploaded = cloudMap.get(path);
      const canOpen = uploaded && hasSupabaseConfig && state.user;
      const sourceText = item.source === "problem" ? "赛题" : "论文";
      const types = (item.types || []).map((type) => `<span class="pill">${escapeHtml(type)}</span>`).join("");
      const linkText = uploaded ? (canOpen ? "打开" : "登录打开") : "待上传";
      return `
        <article class="catalog-item">
          <div class="catalog-row">
            <div>
              <div class="catalog-title">${escapeHtml(item.title || item.name)}</div>
              <div class="meta">
                <span>${escapeHtml(item.year || "未知年份")}</span>
                <span>${sourceText}</span>
                <span>${escapeHtml(item.kind || item.ext || "文件")}</span>
                <span>${formatSize(item.size)}</span>
                ${types}
                ${item.bonus ? `<span class="pill hot">附赠</span>` : ""}
                ${uploaded ? `<span class="pill">已上云</span>` : `<span class="pill warn">待导入</span>`}
              </div>
            </div>
            <a class="open-link" href="#" data-path="${escapeHtml(uploaded?.storage_path || "")}" data-enabled="${canOpen ? "yes" : "no"}">${linkText}</a>
          </div>
          <div class="meta">${escapeHtml(path)}</div>
        </article>
      `;
    }).join("") || `<div class="catalog-item">没有找到匹配资料。</div>`;

    $$(".open-link").forEach((link) => {
      link.addEventListener("click", async (event) => {
        event.preventDefault();
        if (link.dataset.enabled !== "yes") {
          toast(hasSupabaseConfig ? "这份资料还没有导入云端" : "先填写 Supabase 配置并导入资料，队友才能在线打开");
          return;
        }
        await openStoragePath(link.dataset.path);
      });
    });
  }

  async function openStoragePath(path) {
    if (!hasSupabaseConfig || !path) return;
    const popup = window.open("about:blank", "_blank");
    if (popup) {
      try {
        popup.document.title = "Opening file";
        popup.document.body.innerHTML = '<p style="font:16px system-ui;padding:24px;">文件正在打开...</p>';
      } catch {}
    }
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60 * 10);
    if (error) {
      if (popup) popup.close();
      toast(error.message);
      return;
    }
    const signedUrl = data.signedUrl || data.signedURL;
    if (!signedUrl) {
      if (popup) popup.close();
      toast("没有拿到文件打开链接");
      return;
    }
    const absoluteUrl = signedUrl.startsWith("http") ? signedUrl : `${cfg.SUPABASE_URL}/storage/v1${signedUrl}`;
    if (popup && !popup.closed) {
      try {
        popup.document.body.innerHTML = `<p style="font:16px system-ui;padding:24px;">文件正在打开。如果没有自动跳转，<a href="${escapeHtml(absoluteUrl)}">点这里打开</a>。</p>`;
      } catch {}
      popup.location.replace(absoluteUrl);
    } else {
      window.location.href = absoluteUrl;
    }
  }

  async function refreshAll() {
    await Promise.all([refreshCloudCatalog(), refreshPosts(), refreshResources()]);
    updateMetrics();
    renderCatalog();
  }

  async function refreshCloudCatalog() {
    if (!hasSupabaseConfig) {
      state.cloudCatalog = store.get("mathmodel_demo_catalog", []);
      return;
    }
    const { data, error } = await client
      .from("catalog_files")
      .select("*")
      .order("year", { ascending: false, nullsFirst: false })
      .limit(5000);
    if (error) {
      toast(error.message);
      return;
    }
    state.cloudCatalog = data || [];
  }

  async function refreshPosts() {
    if (!hasSupabaseConfig || !state.user) {
      state.posts = store.get("mathmodel_demo_posts", []);
      renderPosts();
      return;
    }
    const { data, error } = await client
      .from("posts")
      .select("*, post_files(*)")
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) {
      toast(error.message);
      return;
    }
    state.posts = data || [];
    renderPosts();
  }

  async function refreshResources() {
    if (!hasSupabaseConfig || !state.user) {
      state.resources = store.get("mathmodel_demo_resources", []);
      renderResources();
      return;
    }
    const { data, error } = await client
      .from("team_resources")
      .select("*, resource_files(*)")
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) {
      toast(error.message);
      return;
    }
    state.resources = data || [];
    renderResources();
  }

  function renderPosts() {
    $("#postList").innerHTML = state.posts.map((post) => {
      const files = post.post_files || post.files || [];
      return `
        <article class="post-item">
          <div class="catalog-row">
            <div>
              <div class="post-title">${escapeHtml(post.title)}</div>
              <div class="meta">
                <span class="pill ${roleClass(post.role)}">${escapeHtml(post.role || "队友")}</span>
                <span>${escapeHtml(post.author_name || "匿名")}</span>
                <span>${escapeHtml(post.year || "")}${post.year ? " 年" : ""}</span>
                <span>${escapeHtml(post.problem_type || "")}</span>
              </div>
            </div>
            <button class="danger" type="button" data-delete-post="${escapeHtml(post.id)}">删除</button>
          </div>
          <p class="post-body">${escapeHtml(post.body)}</p>
          ${post.tags ? `<div class="meta">${escapeHtml(post.tags)}</div>` : ""}
          ${renderFileLinks(files)}
        </article>
      `;
    }).join("") || `<div class="post-item">还没有协作内容。登录后先发一条 2023B 的想法吧。</div>`;
    updateMetrics();
  }

  function renderResources() {
    $("#resourceList").innerHTML = state.resources.map((item) => {
      const files = item.resource_files || item.files || [];
      return `
        <article class="resource-item">
          <div class="catalog-row">
            <div class="resource-title">${escapeHtml(item.title)}</div>
            <button class="danger" type="button" data-delete-resource="${escapeHtml(item.id)}">删除</button>
          </div>
          <div class="meta">
            <span>${escapeHtml(item.owner_name || "队友")}</span>
            <span>${new Date(item.created_at || Date.now()).toLocaleString("zh-CN")}</span>
          </div>
          ${item.note ? `<p class="resource-note">${escapeHtml(item.note)}</p>` : ""}
          ${renderFileLinks(files)}
        </article>
      `;
    }).join("") || `<div class="resource-item">公共文件柜还没有资料。</div>`;
    updateMetrics();
  }

  function renderFileLinks(files) {
    if (!files.length) return `<div class="file-list empty-files">这条记录没有附件，请删除后重新上传文件夹。</div>`;
    return `<div class="file-list">${files.map((file) => {
      const path = file.storage_path || "";
      const enabled = hasSupabaseConfig && state.user && path;
      return `<a class="file-link" href="#" data-storage="${escapeHtml(path)}" data-enabled="${enabled ? "yes" : "no"}">${escapeHtml(file.name || basename(file.relative_path))}</a>`;
    }).join("")}</div>`;
  }

  document.addEventListener("click", async (event) => {
    const deletePostBtn = event.target.closest("[data-delete-post]");
    if (deletePostBtn) {
      event.preventDefault();
      await deletePost(deletePostBtn.dataset.deletePost);
      return;
    }

    const deleteResourceBtn = event.target.closest("[data-delete-resource]");
    if (deleteResourceBtn) {
      event.preventDefault();
      await deleteResource(deleteResourceBtn.dataset.deleteResource);
      return;
    }

    const link = event.target.closest(".file-link");
    if (!link) return;
    event.preventDefault();
    if (link.dataset.enabled !== "yes") {
      toast("演示模式只保存文件名；上云后可在线打开附件");
      return;
    }
    await openStoragePath(link.dataset.storage);
  });

  function requireLogin() {
    if (state.user) return true;
    $("#loginDialog").showModal();
    toast("请先登录或进入本地演示模式");
    return false;
  }

  async function createPost(event) {
    event.preventDefault();
    if (!requireLogin()) return;
    const form = event.currentTarget;
    const files = Array.from($("#postFiles").files || []);
    const post = {
      author_id: state.user.id,
      author_name: state.profile?.display_name || state.user.user_metadata?.display_name || state.user.email,
      role: state.profile?.role || form.role.value,
      year: Number(form.year.value) || null,
      problem_type: form.problem_type.value,
      title: form.title.value.trim(),
      body: form.body.value.trim(),
      tags: form.tags.value.trim()
    };

    if (!hasSupabaseConfig) {
      const demoPost = {
        ...post,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        files: files.map((file) => ({ name: file.name, relative_path: getFileRelativePath(file), size: file.size }))
      };
      const posts = [demoPost, ...store.get("mathmodel_demo_posts", [])];
      store.set("mathmodel_demo_posts", posts);
      form.reset();
      await refreshPosts();
      toast("已保存到本地演示协作区");
      return;
    }

    const { data, error } = await client.from("posts").insert(post).select().single();
    if (error) {
      toast(error.message);
      return;
    }
    try {
      await uploadRelatedFiles(files, `posts/${data.id}`, "post_files", { post_id: data.id });
    } catch (error) {
      await client.from("posts").delete().eq("id", data.id);
      toast(error.message || "附件上传失败");
      return;
    }
    form.reset();
    await refreshPosts();
    toast("已发布到云端协作区");
  }

  async function createResource(event) {
    event.preventDefault();
    if (!requireLogin()) return;
    const form = event.currentTarget;
    const files = Array.from($("#resourceFiles").files || []);
    if (!files.length) {
      toast("请选择要上传的文件或文件夹");
      return;
    }
    const resource = {
      owner_id: state.user.id,
      owner_name: state.profile?.display_name || state.user.user_metadata?.display_name || state.user.email,
      title: form.title.value.trim(),
      note: form.note.value.trim()
    };

    if (!hasSupabaseConfig) {
      const demoResource = {
        ...resource,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        files: files.map((file) => ({ name: file.name, relative_path: getFileRelativePath(file), size: file.size }))
      };
      const resources = [demoResource, ...store.get("mathmodel_demo_resources", [])];
      store.set("mathmodel_demo_resources", resources);
      form.reset();
      await refreshResources();
      toast("已保存到本地演示文件柜");
      return;
    }

    const { data, error } = await client.from("team_resources").insert(resource).select().single();
    if (error) {
      toast(error.message);
      return;
    }
    try {
      await uploadRelatedFiles(files, `resources/${data.id}`, "resource_files", { resource_id: data.id });
    } catch (error) {
      await client.from("team_resources").delete().eq("id", data.id);
      toast(error.message || "文件上传失败");
      return;
    }
    form.reset();
    await refreshResources();
    toast("已上传到团队资料");
  }

  async function uploadRelatedFiles(files, prefix, table, extraRow) {
    for (const file of files) {
      const relativePath = getFileRelativePath(file);
      const storagePath = safeStoragePath(prefix, relativePath, file);
      const { error: uploadError } = await client.storage.from(bucket).upload(storagePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const row = {
        ...extraRow,
        name: file.name,
        relative_path: relativePath,
        storage_path: storagePath,
        size: file.size,
        ext: file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : ""
      };
      const { error } = await client.from(table).insert(row);
      if (error) throw error;
    }
  }

  async function removeStorageObjects(paths) {
    const cleanPaths = paths.filter(Boolean);
    if (!cleanPaths.length || !hasSupabaseConfig) return;
    await client.storage.from(bucket).remove(cleanPaths);
  }

  async function deletePost(postId) {
    if (!postId || !requireLogin()) return;
    if (!window.confirm("确定删除这条协作内容吗？")) return;
    if (!hasSupabaseConfig) {
      const posts = store.get("mathmodel_demo_posts", []).filter((post) => post.id !== postId);
      store.set("mathmodel_demo_posts", posts);
      await refreshPosts();
      return;
    }
    const { data: files } = await client.from("post_files").select("storage_path").eq("post_id", postId);
    await removeStorageObjects((files || []).map((file) => file.storage_path));
    const { error } = await client.from("posts").delete().eq("id", postId);
    if (error) {
      toast(error.message);
      return;
    }
    await refreshPosts();
    toast("已删除");
  }

  async function deleteResource(resourceId) {
    if (!resourceId || !requireLogin()) return;
    if (!window.confirm("确定删除这份团队资料吗？")) return;
    if (!hasSupabaseConfig) {
      const resources = store.get("mathmodel_demo_resources", []).filter((item) => item.id !== resourceId);
      store.set("mathmodel_demo_resources", resources);
      await refreshResources();
      return;
    }
    const { data: files } = await client.from("resource_files").select("storage_path").eq("resource_id", resourceId);
    await removeStorageObjects((files || []).map((file) => file.storage_path));
    const { error } = await client.from("team_resources").delete().eq("id", resourceId);
    if (error) {
      toast(error.message);
      return;
    }
    await refreshResources();
    toast("已删除");
  }

  async function uploadCatalogFolder(event) {
    event.preventDefault();
    if (!requireLogin()) return;
    const files = Array.from($("#catalogFiles").files || []);
    if (!files.length) {
      toast("请选择整个资料文件夹");
      return;
    }

    if (!hasSupabaseConfig) {
      const source = event.currentTarget.source.value;
      const demoRows = files.map((file) => {
        const relativePath = getFileRelativePath(file);
        const match = findCatalogMatch(relativePath) || {};
        return {
          relative_path: normalizePath(match.path || relativePath),
          source: match.source || guessSourceFromPath(relativePath, source),
          collection: match.collection || "手动导入",
          year: match.year || null,
          problem_types: match.types || [],
          title: match.title || file.name,
          name: file.name,
          folder: match.folder || "",
          ext: match.ext || (file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : ""),
          kind: match.kind || "文件",
          size: file.size,
          storage_path: `catalog/${relativePath}`
        };
      });
      store.set("mathmodel_demo_catalog", mergeByPath(store.get("mathmodel_demo_catalog", []), demoRows));
      await refreshCloudCatalog();
      renderCatalog();
      toast("演示模式已记录导入状态；真正上云后文件才会传给队友");
      return;
    }

    $("#uploadProgress").classList.remove("hidden");
    const bar = $("#uploadBar");
    const source = event.currentTarget.source.value;
    const rows = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const relativePath = getFileRelativePath(file);
      const match = findCatalogMatch(relativePath) || {};
      const storagePath = safeStoragePath("catalog/manual", relativePath, file);
      const { error: uploadError } = await client.storage.from(bucket).upload(storagePath, file, { upsert: true });
      if (uploadError) {
        toast(uploadError.message);
        break;
      }
      rows.push({
        relative_path: normalizePath(match.path || relativePath),
        source: match.source || guessSourceFromPath(relativePath, source),
        collection: match.collection || "手动导入",
        year: match.year || null,
        problem_types: match.types || [],
        title: match.title || file.name,
        name: file.name,
        folder: match.folder || "",
        ext: match.ext || (file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : ""),
        kind: match.kind || "文件",
        size: file.size,
        storage_path: storagePath,
        uploaded_by: state.user.id
      });
      bar.style.width = `${Math.round(((index + 1) / files.length) * 100)}%`;
    }

    if (rows.length) {
      const { error } = await client.from("catalog_files").upsert(rows, { onConflict: "relative_path" });
      if (error) {
        toast(error.message);
        return;
      }
    }
    await refreshCloudCatalog();
    renderCatalog();
    toast(`已导入 ${rows.length} 个资料文件`);
  }

  function mergeByPath(oldRows, newRows) {
    const map = new Map(oldRows.map((row) => [normalizePath(row.relative_path), row]));
    newRows.forEach((row) => map.set(normalizePath(row.relative_path), row));
    return Array.from(map.values());
  }

  function updateMetrics() {
    const catalog = allCatalogItems();
    const years = new Set(catalog.map((item) => item.year).filter(Boolean));
    $("#metricTotal").textContent = catalog.length.toLocaleString("zh-CN");
    $("#metricYears").textContent = years.size.toLocaleString("zh-CN");
    $("#metricPosts").textContent = state.posts.length.toLocaleString("zh-CN");
    $("#metricUploads").textContent = (state.resources.length + state.cloudCatalog.length).toLocaleString("zh-CN");
  }

  init().catch((error) => {
    console.error(error);
    toast(error.message || "页面初始化失败");
  });
})();

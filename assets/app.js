(function () {
  const cfg = window.MATHMODEL_CLOUD_CONFIG || {};
  const rawCatalog = (window.MATHMODEL_DATA && window.MATHMODEL_DATA.items) || [];
  const summary = (window.MATHMODEL_DATA && window.MATHMODEL_DATA.summary) || {};
  const bucket = cfg.STORAGE_BUCKET || "mathmodel-files";
  const hasSupabaseConfig = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const client = hasSupabaseConfig ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

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

    $("#searchInput").addEventListener("input", (event) => {
      state.search = event.target.value.trim();
      renderCatalog();
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
    $("#signupBtn").addEventListener("click", signup);
    $("#demoLogin").addEventListener("click", demoLogin);

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
    if (!hasSupabaseConfig) {
      const demoUser = store.get("mathmodel_demo_user", null);
      if (demoUser) {
        state.user = demoUser;
        state.profile = { display_name: demoUser.user_metadata.display_name, role: "队友" };
      }
      updateUserBox();
      updateCloudStatus();
      return;
    }

    const { data } = await client.auth.getSession();
    state.user = data.session && data.session.user;
    if (state.user) await loadProfile();
    client.auth.onAuthStateChange(async (_event, session) => {
      state.user = session && session.user;
      if (state.user) await loadProfile();
      updateUserBox();
      updateCloudStatus();
      await refreshAll();
    });
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
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!hasSupabaseConfig) {
      demoLogin();
      return;
    }
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      $("#loginMsg").textContent = error.message;
      return;
    }
    $("#loginDialog").close();
    toast("登录成功");
  }

  async function signup() {
    const form = $("#loginForm");
    const email = form.email.value.trim();
    const password = form.password.value;
    const displayName = form.display_name.value.trim() || email.split("@")[0];
    if (!hasSupabaseConfig) {
      demoLogin();
      return;
    }
    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`
      }
    });
    if (error) {
      $("#loginMsg").textContent = error.message;
      return;
    }
    $("#loginMsg").textContent = "注册成功。如果 Supabase 开启了邮箱确认，请先去邮箱点确认链接。";
  }

  function demoLogin() {
    const form = $("#loginForm");
    const displayName = form.display_name.value.trim() || "本地演示队友";
    state.user = {
      id: "demo-user",
      email: "demo@local",
      user_metadata: { display_name: displayName }
    };
    state.profile = { display_name: displayName, role: "演示" };
    store.set("mathmodel_demo_user", state.user);
    updateUserBox();
    updateCloudStatus();
    $("#loginDialog").close();
    refreshAll();
    toast("已进入本地演示模式");
  }

  async function logout() {
    if (hasSupabaseConfig) await client.auth.signOut();
    store.set("mathmodel_demo_user", null);
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
    const years = Array.from(new Set(rawCatalog.map((item) => item.year).filter(Boolean))).sort((a, b) => b - a);
    const counts = summary.byYear || {};
    $("#yearList").innerHTML = [
      `<button class="year-btn ${state.year === "all" ? "active" : ""}" data-year="all" type="button"><span>全部</span><small>${rawCatalog.length}</small></button>`,
      ...years.map((year) => {
        const row = counts[year] || {};
        const count = (row.problem || 0) + (row.paper || 0) + (row.bonus || 0);
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

  function filteredCatalog() {
    const term = state.search.toLowerCase();
    return rawCatalog
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
            <a class="open-link" href="#" data-path="${escapeHtml(uploaded?.storage_path || "")}" data-enabled="${canOpen ? "yes" : "no"}">${canOpen ? "打开" : "待上传"}</a>
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
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60 * 10);
    if (error) {
      toast(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function refreshAll() {
    await Promise.all([refreshCloudCatalog(), refreshPosts(), refreshResources()]);
    updateMetrics();
    renderCatalog();
  }

  async function refreshCloudCatalog() {
    if (!hasSupabaseConfig || !state.user) {
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
          <div class="resource-title">${escapeHtml(item.title)}</div>
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
    if (!files.length) return "";
    return `<div class="file-list">${files.map((file) => {
      const path = file.storage_path || "";
      const enabled = hasSupabaseConfig && state.user && path;
      return `<a class="file-link" href="#" data-storage="${escapeHtml(path)}" data-enabled="${enabled ? "yes" : "no"}">${escapeHtml(file.name || basename(file.relative_path))}</a>`;
    }).join("")}</div>`;
  }

  document.addEventListener("click", async (event) => {
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
      role: form.role.value,
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
    await uploadRelatedFiles(files, `posts/${data.id}`, "post_files", { post_id: data.id });
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
    await uploadRelatedFiles(files, `resources/${data.id}`, "resource_files", { resource_id: data.id });
    form.reset();
    await refreshResources();
    toast("已上传到团队资料");
  }

  async function uploadRelatedFiles(files, prefix, table, extraRow) {
    for (const file of files) {
      const relativePath = getFileRelativePath(file);
      const storagePath = `${prefix}/${relativePath}`;
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
      const storagePath = `catalog/${relativePath}`;
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
    const years = new Set(rawCatalog.map((item) => item.year).filter(Boolean));
    $("#metricTotal").textContent = rawCatalog.length.toLocaleString("zh-CN");
    $("#metricYears").textContent = years.size.toLocaleString("zh-CN");
    $("#metricPosts").textContent = state.posts.length.toLocaleString("zh-CN");
    $("#metricUploads").textContent = (state.resources.length + state.cloudCatalog.length).toLocaleString("zh-CN");
  }

  init().catch((error) => {
    console.error(error);
    toast(error.message || "页面初始化失败");
  });
})();

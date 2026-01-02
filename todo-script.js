/**
 * FocusFlow - Page3（日程视图）
 * V0.1+ 改进点：
 * 1) 任务真源统一使用 localStorage["ff_tasks"]
 * 2) 支持 3 种状态：active / pending / completed
 * 3) 跨 Tab 联动：监听 storage 事件自动刷新
 * 4) 新增：Page3 直接删除 task（同时从 tasks + notes 删除，避免复活）
 * 5) 修复：drop target 事件避免重复绑定（render 多次不会叠加监听）
 */

(function () {
  const LS_NOTES = "notes";
  const LS_TASKS = "ff_tasks";

  const tpl = document.getElementById("taskItemTpl");

  const lists = {
    inbox: document.querySelector('.task-ul[data-accepts="inbox"]') || null,
    q1: document.querySelector('.task-ul[data-accepts="q1"]') || null,
    q2: document.querySelector('.task-ul[data-accepts="q2"]') || null,
    q34: document.querySelector('.task-ul[data-accepts="q34"]') || null,
    pending: document.getElementById("pendingList") || null,
    completed: document.getElementById("completedList") || null,
  };

  const remapBtn = document.getElementById("remapBtn");
  const todayLabel = document.getElementById("todayLabel");

  // --- utils ---
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function ensureTaskShape(t) {
    if (!t.id) t.id = crypto.randomUUID();
    if (!t.createdAt) t.createdAt = new Date().toISOString();

    // 老字段兼容：completed boolean -> status
    if (!t.status) {
      t.status = t.completed ? "completed" : "active";
      delete t.completed;
    }

    // slotOverride 默认缺省即可
    return t;
  }

  // 把旧 notes 升级为 tasks（只在 tasks 为空时执行）
  function migrateNotesToTasksIfNeeded() {
    const tasks = loadJSON(LS_TASKS, []);
    if (Array.isArray(tasks) && tasks.length > 0) return;

    const notes = loadJSON(LS_NOTES, []);
    if (!Array.isArray(notes) || notes.length === 0) {
      saveJSON(LS_TASKS, []);
      return;
    }

    const nowISO = new Date().toISOString();
    const migrated = notes.map((n) => ({
      id: n.id || crypto.randomUUID(),
      content: n.content || "(未命名任务)",
      importance: n.importance ?? null,
      urgency: n.urgency ?? null,
      createdAt: n.createdAt || nowISO,
      status: "active",
    }));

    // 同步回 notes（补 id）
    const notesWithId = notes.map((n, i) => ({ ...n, id: migrated[i].id }));
    saveJSON(LS_NOTES, notesWithId);
    saveJSON(LS_TASKS, migrated);
  }

  function loadTasks() {
    migrateNotesToTasksIfNeeded();
    const tasks = loadJSON(LS_TASKS, []);
    if (!Array.isArray(tasks)) return [];

    let changed = false;
    for (const t of tasks) {
      const before = JSON.stringify(t);
      ensureTaskShape(t);
      if (JSON.stringify(t) !== before) changed = true;
    }
    if (changed) saveJSON(LS_TASKS, tasks);
    return tasks;
  }

  function saveTasks(tasks) {
    saveJSON(LS_TASKS, tasks);

    // 兼容：同步一份 notes（给其他页面用）
    const notes = tasks.map((t) => ({
      id: t.id,
      content: t.content,
      importance: t.importance ?? "",
      urgency: t.urgency ?? "",
      createdAt: t.createdAt,
    }));
    saveJSON(LS_NOTES, notes);
  }

  // 把 notes 合并进 tasks（避免只在 index 写 notes 时丢任务）
  function syncNotesIntoTasks(tasks) {
    const notes = loadJSON(LS_NOTES, []);
    if (!Array.isArray(notes) || notes.length === 0) return tasks;

    const idxById = new Map(tasks.map((t) => [t.id, t]));
    const nowISO = new Date().toISOString();

    let changed = false;
    for (const n of notes) {
      const nid = n.id || null;
      if (nid && idxById.has(nid)) {
        const t = idxById.get(nid);
        if (t.importance == null) {
          t.importance = n.importance ?? null;
          changed = true;
        }
        if (t.urgency == null) {
          t.urgency = n.urgency ?? null;
          changed = true;
        }
        continue;
      }

      // 无 id 的旧 note：新建 task，并回写 id 到 note
      const createdId = crypto.randomUUID();
      n.id = createdId;

      const task = {
        id: createdId,
        content: n.content || "(未命名任务)",
        importance: n.importance ?? null,
        urgency: n.urgency ?? null,
        createdAt: n.createdAt || nowISO,
        status: "active",
      };

      tasks.push(task);
      idxById.set(createdId, task);
      changed = true;
    }

    if (changed) {
      saveJSON(LS_NOTES, notes);
      saveTasks(tasks);
    }
    return tasks;
  }

  // --- scheduling logic ---
  function deriveQuadrant(t) {
    const imp = t.importance;
    const urg = t.urgency;
    if (imp === "high" && urg === "high") return "q1";
    if (imp === "high" && urg === "low") return "q2";
    if (imp === "low" && urg === "high") return "q3";
    return "q4";
  }

  function mapToSlot(t) {
    if (t.slotOverride) return t.slotOverride;
    const q = deriveQuadrant(t);
    if (q === "q1") return "q1";
    if (q === "q2") return "q2";
    if (q === "q3" || q === "q4") return "q34";
    return "inbox";
  }

  function sortByCreatedAt(a, b) {
    return new Date(a.createdAt) - new Date(b.createdAt);
  }

  // --- state updates ---
  function setStatus(taskId, status) {
    const tasks = loadTasks();
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;

    t.status = status;

    // pending/completed 不占用日程位置
    if (status !== "active") delete t.slotOverride;

    saveTasks(tasks);
    render();
  }

  function toggleDone(taskId, checked) {
    setStatus(taskId, checked ? "completed" : "active");
  }

  function togglePending(taskId) {
    const tasks = loadTasks();
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    const next = t.status === "pending" ? "active" : "pending";
    setStatus(taskId, next);
  }

  // --- NEW: delete ---
  function deleteTask(taskId) {
    const tasks = loadTasks();
    const t = tasks.find((x) => x.id === taskId);
    const nextTasks = tasks.filter((x) => x.id !== taskId);
    saveTasks(nextTasks);

    // 同时从 notes 删除：优先按 id 精准匹配
    const notes = loadJSON(LS_NOTES, []);
    if (Array.isArray(notes)) {
      const filteredNotes = notes.filter((n) => n?.id !== taskId);
      saveJSON(LS_NOTES, filteredNotes);
    }

    // 双保险：如果历史里有“无 id 的旧 note”（理论上 V0.1 后很少了）
    // 用 content+createdAt 做一次兜底过滤
    if (t) {
      const notes2 = loadJSON(LS_NOTES, []);
      if (Array.isArray(notes2)) {
        const time = String(t.createdAt ?? "");
        const filtered2 = notes2.filter((n) => {
          const sameContent = (n?.content || "") === (t.content || "");
          const sameTime = String(n?.createdAt ?? "") === time;
          return !(sameContent && sameTime);
        });
        saveJSON(LS_NOTES, filtered2);
      }
    }

    render();
  }

  // --- render ---
  function render() {
    // 顶部日期
    if (todayLabel) {
      const d = new Date();
      todayLabel.textContent = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    // 清空
    Object.values(lists).forEach((ul) => {
      if (ul) ul.innerHTML = "";
    });

    // 加载 + 同步
    let tasks = loadTasks();
    tasks = syncNotesIntoTasks(tasks);

    const active = tasks.filter((t) => t.status === "active");
    const pending = tasks.filter((t) => t.status === "pending");
    const completed = tasks.filter((t) => t.status === "completed");

    // bucket active tasks into slots
    const bucket = { inbox: [], q1: [], q2: [], q34: [] };
    for (const t of active) {
      const key = mapToSlot(t);
      if (bucket[key]) bucket[key].push(t);
    }

    // q34 内部：先紧急后不紧急、再按创建时间
    bucket.q34.sort((a, b) => {
      const au = a.urgency === "high" ? 0 : 1;
      const bu = b.urgency === "high" ? 0 : 1;
      if (au !== bu) return au - bu;
      return sortByCreatedAt(a, b);
    });

    // 其他按创建时间
    bucket.inbox.sort(sortByCreatedAt);
    bucket.q1.sort(sortByCreatedAt);
    bucket.q2.sort(sortByCreatedAt);

    // render active slots
    for (const [slot, arr] of Object.entries(bucket)) {
      const ul = lists[slot];
      if (!ul) continue;
      arr.forEach((t) => ul.appendChild(createTaskLI(t, "active")));
    }

    // render pending / completed
    if (lists.pending) {
      pending.sort(sortByCreatedAt).forEach((t) => lists.pending.appendChild(createTaskLI(t, "pending")));
    }
    if (lists.completed) {
      completed.sort(sortByCreatedAt).forEach((t) => lists.completed.appendChild(createTaskLI(t, "completed")));
    }

    // 只绑定一次 drop targets
    attachDropTargetsOnce();
  }

  function buildFallbackLI() {
    const li = document.createElement("li");
    li.className = "task-li";
    li.draggable = true;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "task-done";

    const text = document.createElement("span");
    text.className = "task-text";

    const chip = document.createElement("span");
    chip.className = "task-chip";

    // 删除按钮（fallback）
    const del = document.createElement("button");
    del.className = "task-del";
    del.type = "button";
    del.title = "删除";
    del.textContent = "✕";

    li.appendChild(cb);
    li.appendChild(text);
    li.appendChild(chip);
    li.appendChild(del);
    return li;
  }

  function ensureDeleteButton(li) {
    // 如果模板里已经有 .task-del，就直接用
    let delEl = li.querySelector(".task-del");

    // 如果模板没有，就动态补一个
    if (!delEl) {
      delEl = document.createElement("button");
      delEl.className = "task-del";
      delEl.type = "button";
      delEl.title = "删除";
      delEl.textContent = "✕";
      li.appendChild(delEl);
    }
    return delEl;
  }

  function createTaskLI(task, context) {
    const li =
      tpl && tpl.content
        ? tpl.content.firstElementChild.cloneNode(true)
        : buildFallbackLI();

    li.dataset.id = task.id;

    const textEl = li.querySelector(".task-text") || li.querySelector(".text") || li;
    const doneEl = li.querySelector(".task-done");
    const chipEl = li.querySelector(".task-chip");

    textEl.textContent = task.content || "(未命名任务)";
    if (chipEl) {
      const q = deriveQuadrant(task);
      chipEl.textContent = q.toUpperCase();
      chipEl.title = `四象限：${q}`;
    }

    // 状态样式
    if (context === "completed") {
      li.style.opacity = "0.7";
      textEl.style.textDecoration = "line-through";
    }
    if (context === "pending") {
      li.style.opacity = "0.85";
      textEl.textContent = `⏸ ${textEl.textContent}`;
    }

    if (doneEl) {
      doneEl.checked = task.status === "completed";
      doneEl.addEventListener("change", (e) => {
        toggleDone(task.id, e.target.checked);
      });
    }

    // actions: Pending / 恢复 + 撤销完成
    const actions = document.createElement("span");
    actions.style.marginLeft = "8px";
    actions.style.display = "inline-flex";
    actions.style.gap = "6px";
    actions.style.alignItems = "center";

    const pendingBtn = document.createElement("button");
    pendingBtn.type = "button";
    pendingBtn.textContent = task.status === "pending" ? "恢复" : "Pending";
    pendingBtn.addEventListener("click", () => togglePending(task.id));
    actions.appendChild(pendingBtn);

    if (task.status === "completed") {
      const undoBtn = document.createElement("button");
      undoBtn.type = "button";
      undoBtn.textContent = "撤销完成";
      undoBtn.addEventListener("click", () => setStatus(task.id, "active"));
      actions.appendChild(undoBtn);
    }

    li.appendChild(actions);

    // NEW: 删除按钮
    const delEl = ensureDeleteButton(li);
    delEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteTask(task.id);
    });

    // 只有 active 才允许拖拽
    if (task.status === "active") attachDrag(li);
    else li.draggable = false;

    return li;
  }

  // --- drag & drop ---
  function attachDrag(li) {
    li.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", li.dataset.id);
    });
  }

  // 修复：只绑定一次 drop targets（避免 render 多次叠加监听）
  function attachDropTargetsOnce() {
    document.querySelectorAll(".task-ul").forEach((ul) => {
      const accepts = ul.dataset.accepts;
      if (!accepts) return;

      if (ul.dataset.dropBound === "1") return;
      ul.dataset.dropBound = "1";

      ul.addEventListener("dragover", (e) => e.preventDefault());
      ul.addEventListener("drop", (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        moveToSlot(id, accepts);
      });
    });
  }

  function moveToSlot(taskId, slot) {
    const tasks = loadTasks();
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    if (t.status !== "active") return;

    t.slotOverride = slot;
    saveTasks(tasks);
    render();
  }

  // --- remap button ---
  if (remapBtn) {
    remapBtn.addEventListener("click", () => {
      let tasks = loadTasks();
      tasks = syncNotesIntoTasks(tasks);

      // 重新映射：清空 active 的 slotOverride
      for (const t of tasks) {
        if (t.status === "active") delete t.slotOverride;
      }
      saveTasks(tasks);
      render();
    });
  }

  // 跨 Tab 联动
  window.addEventListener("storage", (e) => {
    if (e.key === LS_TASKS || e.key === LS_NOTES) render();
  });

  // init
  render();
})();

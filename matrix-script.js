const LS_TASKS = "ff_tasks";
const LS_NOTES = "notes";

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// 兜底：如果还没有 ff_tasks，就从 notes 迁移一次（与 index/todo 逻辑一致，保持页面可用）
function migrateNotesToTasksIfNeeded() {
  const tasks = loadJSON(LS_TASKS, []);
  if (Array.isArray(tasks) && tasks.length > 0) return;

  const notes = loadJSON(LS_NOTES, []);
  if (!Array.isArray(notes) || notes.length === 0) return;

  const nowISO = new Date().toISOString();
  const migrated = notes.map(n => ({
    id: n.id || crypto.randomUUID(),
    content: n.content || "(未命名任务)",
    importance: n.importance ?? null,
    urgency: n.urgency ?? null,
    createdAt: n.createdAt || nowISO,
    status: "active"
  }));
  localStorage.setItem(LS_TASKS, JSON.stringify(migrated));
}

function loadTasks() {
  migrateNotesToTasksIfNeeded();
  const tasks = loadJSON(LS_TASKS, []);
  if (!Array.isArray(tasks)) return [];
  // 兼容老数据：completed boolean -> status
  let changed = false;
  for (const t of tasks) {
    if (!t.id) { t.id = crypto.randomUUID(); changed = true; }
    if (!t.status) { t.status = t.completed ? "completed" : "active"; delete t.completed; changed = true; }
  }
  if (changed) localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
  return tasks;
}

// 四象限映射逻辑
function getQuadrant(task) {
  if (task.importance === "high" && task.urgency === "high") return "q1"; // Do it now
  if (task.importance === "high" && task.urgency === "low") return "q2";  // Schedule it
  if (task.importance === "low" && task.urgency === "high") return "q3";  // Delegate it
  return "q4"; // Delete it
}

// 渲染函数
function renderTasks() {
  // 清空所有象限内容（避免刷新重复插入）
  ["q1", "q2", "q3", "q4"].forEach(id => {
    const list = document.querySelector(`#${id} .task-list`);
    if (list) list.innerHTML = "";
  });

  const tasks = loadTasks()
    // completed 不显示；pending 仍显示（带标识）
    .filter(t => t.status !== "completed");

  tasks.forEach(task => {
    const quadrantId = getQuadrant(task);
    const target = document.querySelector(`#${quadrantId} .task-list`);
    if (!target) return;

    const div = document.createElement("div");
    div.className = "task-item";
    div.textContent = task.status === "pending" ? `⏸ ${task.content}` : task.content;

    div.title = `重要性: ${task.importance || "未知"} | 紧急性: ${task.urgency || "未知"} | 状态: ${task.status || "active"}`;

    target.appendChild(div);
  });
}

// 初始化渲染
renderTasks();

// 如果你在另一个 Tab（比如 index / todo）改了任务，这里会自动刷新
window.addEventListener("storage", (e) => {
  if (e.key === LS_TASKS) renderTasks();
});

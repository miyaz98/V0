const submitBtn = document.getElementById("submitNote");
const noteInput = document.getElementById("noteInput");
const submitPopup = document.getElementById("submitPopup");
const closeSubmitPopup = document.getElementById("closeSubmitPopup");

const viewHistoryBtn = document.getElementById("viewHistory");
const historyPopup = document.getElementById("historyPopup");
const closeHistoryPopup = document.getElementById("closeHistoryPopup");
const historyList = document.getElementById("historyList");

const LS_NOTES = "notes";      // 兼容旧结构（Page2 早期用）
const LS_TASKS = "ff_tasks";   // 统一任务真源（Page3 用）

/**
 * 任务结构（V0.1）
 * {
 *   id: string,
 *   content: string,
 *   importance: "high"|"low"|""|null,
 *   urgency: "high"|"low"|""|null,
 *   createdAt: string,
 *   status: "active"|"pending"|"completed",
 *   slotOverride?: "inbox"|"q1"|"q2"|"q34"
 * }
 */

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn("Failed to parse localStorage:", key, e);
    return fallback;
  }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureId(obj) {
  if (!obj.id) obj.id = crypto.randomUUID();
  return obj;
}

// 把旧 notes 升级为 ff_tasks（只在 ff_tasks 为空时执行）
function migrateNotesToTasksIfNeeded() {
  const tasks = loadJSON(LS_TASKS, []);
  if (Array.isArray(tasks) && tasks.length > 0) return;

  const notes = loadJSON(LS_NOTES, []);
  if (!Array.isArray(notes) || notes.length === 0) {
    saveJSON(LS_TASKS, []);
    return;
  }

  const nowISO = new Date().toISOString();
  const migrated = notes.map(n => {
    ensureId(n);
    return {
      id: n.id,
      content: n.content || "(未命名任务)",
      importance: n.importance ?? null,
      urgency: n.urgency ?? null,
      createdAt: n.createdAt || nowISO,
      status: "active"
    };
  });

  // 同时把 notes 补上 id（以后删除/同步用）
  saveJSON(LS_NOTES, notes);
  saveJSON(LS_TASKS, migrated);
}

function loadTasks() {
  migrateNotesToTasksIfNeeded();
  const tasks = loadJSON(LS_TASKS, []);
  if (!Array.isArray(tasks)) return [];
  // 兜底：补齐老数据字段
  let changed = false;
  for (const t of tasks) {
    if (!t.id) { t.id = crypto.randomUUID(); changed = true; }
    if (!t.createdAt) { t.createdAt = new Date().toISOString(); changed = true; }
    if (!t.status) { t.status = t.completed ? "completed" : "active"; delete t.completed; changed = true; }
  }
  if (changed) saveJSON(LS_TASKS, tasks);
  return tasks;
}
function saveTasks(tasks) {
  saveJSON(LS_TASKS, tasks);
  // 兼容：同步一份 notes 给 matrix（但 matrix 也会升级为读 tasks）
  const notes = tasks.map(t => ({
    id: t.id,
    content: t.content,
    importance: t.importance ?? "",
    urgency: t.urgency ?? "",
    createdAt: t.createdAt
  }));
  saveJSON(LS_NOTES, notes);
}

// 显示提交成功弹窗
function showSubmitPopup() {
  submitPopup.classList.remove("hidden");
}

// 打开历史弹窗并渲染内容
function showHistoryPopup() {
  historyList.innerHTML = "";

  const tasks = loadTasks();

  if (tasks.length === 0) {
    historyList.innerHTML = "<p>暂无历史记录</p>";
    historyPopup.classList.remove("hidden");
    return;
  }

  // 最新的在前
  const sorted = [...tasks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  sorted.forEach((task) => {
    const div = document.createElement("div");
    div.className = "note-item";

    const status = task.status || "active";
    const badgeText = status === "completed" ? "✅ Completed" : status === "pending" ? "⏸ Pending" : "🟦 Active";

    div.innerHTML = `
      <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        <span class="status-badge">${badgeText}</span>
        <span style="margin-left:6px;">${escapeHTML(task.content || "(未命名任务)")}</span>
      </span>

      <span class="note-actions">
        <label title="标记完成">
          <input type="checkbox" ${status === "completed" ? "checked" : ""} onchange="toggleComplete('${task.id}', this.checked)" />
        </label>
        <button onclick="togglePending('${task.id}')">${status === "pending" ? "恢复" : "Pending"}</button>
        <button onclick="deleteTask('${task.id}')">删除</button>
      </span>
    `;
    historyList.appendChild(div);
  });

  historyPopup.classList.remove("hidden");
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[s]));
}

// 删除任务（统一删 ff_tasks）
function deleteTask(taskId) {
  const tasks = loadTasks().filter(t => t.id !== taskId);
  saveTasks(tasks);
  showHistoryPopup(); // 重新渲染
}

// 完成/取消完成
function toggleComplete(taskId, isCompleted) {
  const tasks = loadTasks();
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  t.status = isCompleted ? "completed" : "active";
  // 完成后清掉 override，避免以后回到日程出现怪位置
  if (isCompleted) delete t.slotOverride;
  saveTasks(tasks);
}

// pending / active 切换（pending 会从当日日程拿掉，但保留在 Pending 列表）
function togglePending(taskId) {
  const tasks = loadTasks();
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  t.status = (t.status === "pending") ? "active" : "pending";
  if (t.status === "pending") delete t.slotOverride; // pending 时让它暂时不占用日程
  saveTasks(tasks);
  showHistoryPopup();
}

// 供 inline onclick 使用
window.deleteTask = deleteTask;
window.toggleComplete = toggleComplete;
window.togglePending = togglePending;

// 提交任务
submitBtn.addEventListener("click", () => {
  const content = noteInput.value.trim();
  if (!content) return;

  const importance = document.querySelector('input[name="importance"]:checked')?.value || "";
  const urgency = document.querySelector('input[name="urgency"]:checked')?.value || "";

  const tasks = loadTasks();
  const newTask = {
    id: crypto.randomUUID(),
    content,
    importance,
    urgency,
    createdAt: new Date().toISOString(),
    status: "active"
  };

  tasks.push(newTask);
  saveTasks(tasks);

  showSubmitPopup();
});

// 关闭提交弹窗后清空输入框与选择
closeSubmitPopup.addEventListener("click", () => {
  submitPopup.classList.add("hidden");
  noteInput.value = "";
  document.querySelectorAll('input[name="importance"]').forEach(r => r.checked = false);
  document.querySelectorAll('input[name="urgency"]').forEach(r => r.checked = false);
});

// 打开/关闭历史弹窗
viewHistoryBtn.addEventListener("click", showHistoryPopup);
closeHistoryPopup.addEventListener("click", () => {
  historyPopup.classList.add("hidden");
});

// 清空单组选项（index.html 里有用）
function clearSelection(groupName) {
  const radios = document.querySelectorAll(`input[name="${groupName}"]`);
  radios.forEach(radio => radio.checked = false);
}
window.clearSelection = clearSelection;

// 1. 从 localStorage 中读取任务
const notes = JSON.parse(localStorage.getItem("notes")) || [];

// 2. 四象限映射逻辑
function getQuadrant(task) {
  if (task.importance === "high" && task.urgency === "high") return "q1"; // Do it now
  if (task.importance === "high" && task.urgency === "low") return "q2";  // Schedule it
  if (task.importance === "low" && task.urgency === "high") return "q3";  // Delegate it
  return "q4"; // Delete it
}

// 3. 渲染函数
function renderTasks() {
  // 清空所有象限内容（避免刷新重复插入）
  ["q1", "q2", "q3", "q4"].forEach(id => {
    const list = document.querySelector(`#${id} .task-list`);
    list.innerHTML = "";
  });

  // 遍历任务并插入对应象限
  notes.forEach(task => {
    const quadrantId = getQuadrant(task);
    const target = document.querySelector(`#${quadrantId} .task-list`);
    
    const div = document.createElement("div");
    div.className = "task-item";
    div.textContent = task.content;

    // 可选：展示属性 tooltip
    div.title = `重要性: ${task.importance || "未知"} | 紧急性: ${task.urgency || "未知"}`;

    target.appendChild(div);
  });
}

// 4. 初始化渲染
renderTasks();
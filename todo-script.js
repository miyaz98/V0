/**
 * FocusFlow - Page3（日程视图）
 * 适配你的现有数据源：localStorage["notes"] (来自 Page1 / Page2)
 * Page3 统一使用标准结构 localStorage["ff_tasks"]:
 * {
 *   id: string,
 *   content: string,
 *   importance: "high"|"low"|""|null,
 *   urgency:   "high"|"low"|""|null,
 *   createdAt: string | number,   // 来自 Page1 的 ISO 或时间戳
 *   completed: boolean,
 *   slotOverride?: "inbox"|"q1"|"q2"|"q34"
 * }
 */

(function(){
    const LS_NOTES = "notes";      // 你的现有数据源（Page1/2 使用）
    const LS_TASKS = "ff_tasks";   // Page3 的标准数据结构
  
    // ====== DOM 句柄（存在即用，不存在就忽略）======
    const todayLabel = document.getElementById("todayLabel");
    const refreshBtn = document.getElementById("refreshBtn");
    const lists = {
      inbox: document.querySelector('.task-ul[data-accepts="inbox"]'),
      q1:    document.querySelector('.task-ul[data-accepts="q1"]'),
      q2:    document.querySelector('.task-ul[data-accepts="q2"]'),
      q34:   document.querySelector('.task-ul[data-accepts="q34"]')
    };
    const tpl = document.getElementById("taskItemTpl");
  
    // ====== 工具函数 ======
    function formatDate(d=new Date()){
      const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0");
      return `${y}-${m}-${day}`;
    }
    if (todayLabel) todayLabel.textContent = `今天 · ${formatDate()}`;
  
    // 从 notes → ff_tasks（合并增量、保留已完成状态）
    function syncFromNotes() {
      let notes = [];
      try { notes = JSON.parse(localStorage.getItem(LS_NOTES)) || []; } catch {}
      let tasks = [];
      try { tasks = JSON.parse(localStorage.getItem(LS_TASKS)) || []; } catch {}
  
      // 建索引，按 content + createdAt 去重（你的 Page1 已写入 createdAt）
      const idx = new Map(tasks.map(t => [`${t.content}__${t.createdAt||""}`, t]));
      const nowISO = new Date().toISOString();
  
      for (const n of notes) {
        const key = `${n.content}__${n.createdAt || ""}`;
        if (!idx.has(key)) {
          const task = {
            id: crypto.randomUUID(),
            content: n.content || "(未命名任务)",
            importance: n.importance ?? null,
            urgency: n.urgency ?? null,
            createdAt: n.createdAt || nowISO,
            completed: false
          };
          tasks.push(task);
          idx.set(key, task);
        } else {
          // 同步补齐字段
          const t = idx.get(key);
          if (t.importance == null) t.importance = n.importance ?? null;
          if (t.urgency == null)    t.urgency    = n.urgency ?? null;
          if (!t.createdAt)         t.createdAt  = n.createdAt || nowISO;
        }
      }
  
      localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
      return tasks;
    }
  
    function loadTasks() {
      // 优先从 ff_tasks 读，若没有则从 notes 同步
      try {
        const raw = localStorage.getItem(LS_TASKS);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) return normalize(arr);
        }
      } catch {}
      return normalize(syncFromNotes());
    }
  
    function saveTasks(arr) {
      localStorage.setItem(LS_TASKS, JSON.stringify(arr));
    }
  
    // 补齐/容错
    function normalize(arr){
      return arr.map(t => ({
        id: t.id || crypto.randomUUID(),
        content: t.content || "(未命名任务)",
        importance: coerceImp(t.importance),
        urgency: coerceUrg(t.urgency),
        createdAt: t.createdAt || new Date().toISOString(),
        completed: !!t.completed,
        slotOverride: t.slotOverride
      }));
    }
    function coerceImp(v){
      if (v === "high" || v === "low") return v;
      if (v === "" || v == null) return null;
      return String(v);
    }
    function coerceUrg(v){
      if (v === "high" || v === "low") return v;
      if (v === "" || v == null) return null;
      return String(v);
    }
  
    // 四象限推断
    function deriveQuadrant(t){
      const imp = t.importance, urg = t.urgency;
      if (imp === "high" && urg === "high") return "q1";
      if (imp === "high" && urg === "low")  return "q2";
      if (imp === "low"  && urg === "high") return "q3";
      return "q4";
    }
  
    // 时间槽映射（固定工作流）
    function mapToSlot(t){
      if (t.slotOverride) return t.slotOverride;
      const q = deriveQuadrant(t);
      if (q === "q1") return "q1";       // 10:00–12:00
      if (q === "q2") return "q2";       // 13:00–15:00
      if (q === "q3" || q === "q4") return "q34"; // 15:00–17:00
      return "inbox";                    // 09:00–10:00
    }
  
    // 渲染
    function render(){
      // 清空
      Object.values(lists).forEach(ul => { if (ul) ul.innerHTML = ""; });
  
      const tasks = loadTasks();
      const active = tasks.filter(t => !t.completed);
  
      // 分桶
      const bucket = { inbox:[], q1:[], q2:[], q34:[] };
      for (const t of active) {
        const key = mapToSlot(t);
        if (bucket[key]) bucket[key].push(t);
      }
  
      // q34 内部：先紧急后不紧急、再按创建时间
      bucket.q34.sort((a,b)=>{
        const au = a.urgency === "high" ? 0 : 1;
        const bu = b.urgency === "high" ? 0 : 1;
        if (au !== bu) return au - bu;
        const at = new Date(a.createdAt).getTime() || 0;
        const bt = new Date(b.createdAt).getTime() || 0;
        return at - bt;
      });
  
      // 逐槽渲染
      for (const slot of ["inbox","q1","q2","q34"]) {
        const ul = lists[slot];
        if (!ul) continue;
        for (const t of bucket[slot]) {
          ul.appendChild(createTaskLI(t));
        }
      }
    }
  
    function createTaskLI(task){
      const li = tpl && tpl.content ? tpl.content.firstElementChild.cloneNode(true) : buildFallbackLI();
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
      if (doneEl) {
        doneEl.checked = !!task.completed;
        doneEl.addEventListener("change", (e)=>{
          if (e.target.checked) markDone(task.id);
        });
      }
  
      attachDrag(li);
      return li;
    }
  
    function buildFallbackLI(){
      const li = document.createElement("li");
      li.className = "task-li";
      li.draggable = true;
      li.innerHTML = `
        <label class="task-check">
          <input type="checkbox" class="task-done">
          <span class="checkmark"></span>
        </label>
        <span class="task-text"></span>
        <span class="task-chip"></span>
      `;
      return li;
    }
  
    // 完成处理：从日程消失，保留在 ff_tasks（completed:true）
    function markDone(id){
      const tasks = loadTasks();
      const i = tasks.findIndex(t => t.id === id);
      if (i >= 0) {
        tasks[i].completed = true;
        delete tasks[i].slotOverride;
        saveTasks(tasks);
        render();
      }
    }
  
    // 拖拽
    function attachDrag(li){
      li.addEventListener("dragstart", e=>{
        e.dataTransfer.setData("text/plain", li.dataset.id);
      });
    }
    document.querySelectorAll(".task-ul").forEach(ul=>{
      ul.addEventListener("dragover", e=>{
        e.preventDefault();
        ul.classList.add("drag-over");
      });
      ul.addEventListener("dragleave", ()=>{
        ul.classList.remove("drag-over");
      });
      ul.addEventListener("drop", e=>{
        e.preventDefault();
        ul.classList.remove("drag-over");
        const id = e.dataTransfer.getData("text/plain");
        const slot = ul.getAttribute("data-accepts");
        moveToSlot(id, slot);
      });
    });
  
    function moveToSlot(id, slot){
      const tasks = loadTasks();
      const i = tasks.findIndex(t => t.id === id);
      if (i < 0) return;
      tasks[i].slotOverride = slot;  // 记住用户手动放置
      saveTasks(tasks);
      render();
    }
  
    // 重新映射：先同步 notes → ff_tasks，再清除 slotOverride
    function remapFromQuadrant(){
      let tasks = syncFromNotes();
      tasks = tasks.map(t => (t.completed ? t : ({...t, slotOverride: undefined})));
      saveTasks(tasks);
      render();
    }
  
    if (refreshBtn) {
      // 点击“↻ 重新映射”：保证 Page1 新增后能立刻同步
      refreshBtn.addEventListener("click", remapFromQuadrant);
    }
  
    // ====== 首次渲染 ======
    syncFromNotes();
    render();
  })();
  
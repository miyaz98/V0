const submitBtn = document.getElementById("submitNote");
const noteInput = document.getElementById("noteInput");
const submitPopup = document.getElementById("submitPopup");
const closeSubmitPopup = document.getElementById("closeSubmitPopup");

const viewHistoryBtn = document.getElementById("viewHistory");
const historyPopup = document.getElementById("historyPopup");
const closeHistoryPopup = document.getElementById("closeHistoryPopup");
const historyList = document.getElementById("historyList");

let notes = JSON.parse(localStorage.getItem("notes")) || [];

// 显示提交成功弹窗
function showSubmitPopup() {
  submitPopup.classList.remove("hidden");
}

// 显示历史弹窗并渲染内容
function showHistoryPopup() {
  historyList.innerHTML = "";

  if (notes.length === 0) {
    historyList.innerHTML = "<p>暂无历史记录</p>";
    return;
  }

  notes.forEach((note, index) => {
    const div = document.createElement("div");
    div.className = "note-item";
    div.innerHTML = `
      <span>${note.content}</span>
      <button onclick="deleteNote(${index})">删除</button>
    `;
    historyList.appendChild(div);
  });

  historyPopup.classList.remove("hidden");
}

// 删除便签
function deleteNote(index) {
  notes.splice(index, 1);
  localStorage.setItem("notes", JSON.stringify(notes));
  showHistoryPopup(); // 重新渲染
}

// 提交便签
submitBtn.addEventListener("click", () => {
  const content = noteInput.value.trim();
  if (!content) return;

  const importance = document.querySelector('input[name="importance"]:checked')?.value || "";
  const urgency = document.querySelector('input[name="urgency"]:checked')?.value || "";

  const newNote = {
    content: content,
    importance: importance,
    urgency: urgency,
    createdAt: new Date().toISOString()
  };

  notes.push(newNote);
  localStorage.setItem("notes", JSON.stringify(notes));

  showSubmitPopup(); // 弹窗显示成功
});

// 关闭提交弹窗后清空输入框
closeSubmitPopup.addEventListener("click", () => {
  submitPopup.classList.add("hidden");
  noteInput.value = "";

  // 清空 radio 选中状态
  document.querySelectorAll('input[name="importance"]').forEach(r => r.checked = false);
  document.querySelectorAll('input[name="urgency"]').forEach(r => r.checked = false);
});


// 打开和关闭历史记录
viewHistoryBtn.addEventListener("click", showHistoryPopup);
closeHistoryPopup.addEventListener("click", () => {
  historyPopup.classList.add("hidden");
});

// 让删除按钮功能生效
window.deleteNote = deleteNote;

function clearSelection(groupName) {
  const radios = document.querySelectorAll(`input[name="${groupName}"]`);
  radios.forEach(radio => radio.checked = false);
}
window.clearSelection = clearSelection;

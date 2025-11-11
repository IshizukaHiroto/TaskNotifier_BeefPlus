// === popup.js ===

// 残り時間をフォーマット
function formatRemainingTime(dueISO) {
  const now = new Date();
  const due = new Date(dueISO);
  const diffMs = due - now;

  if (diffMs <= 0) return "締切済み";

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;

  if (diffHours < 24) {
    return `あと${diffHours}時間`;
  } else {
    return `あと${diffDays}日${remainingHours}時間`;
  }
}

// === 課題一覧をカード形式で描画 ===
chrome.storage.local.get(["tasks", "lastUpdated"], (data) => {
  const container = document.getElementById("taskList");
  const updated = document.getElementById("lastUpdated");
  const tasks = (data.tasks || []).sort((a, b) => new Date(a.due) - new Date(b.due));

  if (tasks.length === 0) {
    container.innerHTML = "<p>課題は登録されていません。</p>";
  } else {
    container.innerHTML = "";
    for (const t of tasks) {
      const card = document.createElement("div");
      card.className = "task-card";
      card.innerHTML = `
        <div class="task-title">${t.title}</div>
        <div class="task-meta">${t.course} / ${t.contentType}</div>
        <div class="task-due">
          締切：${new Date(t.due).toLocaleString()}
          <span class="remaining">${formatRemainingTime(t.due)}</span>
        </div>
      `;
      card.addEventListener("click", () => chrome.tabs.create({ url: t.url }));
      container.appendChild(card);
    }
  }

  // === 最終更新時刻 ===
  if (data.lastUpdated) {
    const date = new Date(data.lastUpdated);
    updated.textContent = `最終更新：${date.toLocaleString()}`;
  } else {
    updated.textContent = "最終更新：データ未取得";
  }
});

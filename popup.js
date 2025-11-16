// === popup.js ===

// 残り時間をフォーマット
function formatRemainingTime(dueISO) {
  // [BEEF+] 修正: 期限不明やInvalid Dateでも崩れないよう判定を強化
  if (!dueISO) return "締切不明";
  const now = new Date();
  const due = new Date(dueISO);
  const dueMs = due.getTime();
  if (Number.isNaN(dueMs)) return "締切不明";

  const diffMs = dueMs - now.getTime();

  if (diffMs <= 0) return "締切済み";

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 60) {
    const minutesToShow = Math.max(1, diffMinutes);
    return `あと${minutesToShow}分`;
  }

  if (diffHours < 24) {
    return `あと${diffHours}時間`;
  }

  return `あと${diffDays}日`;
}

function formatDue(dueISO) {
  // [BEEF+] 修正: 期限を表示できない場合はプレースホルダを返す
  if (!dueISO) return "情報がありません";
  const date = new Date(dueISO);
  if (Number.isNaN(date.getTime())) return "情報がありません";
  return date.toLocaleString();
}

function buildTargetUrl(task) {
  // [BEEF+] 修正: mailto等の非HTTPリンクはBeef+課題一覧にフォールバック
  const fallback = "https://beefplus.center.kobe-u.ac.jp/lms/task";
  if (!task?.url) return fallback;

  try {
    const parsed = new URL(task.url);
    if (["http:", "https:"].includes(parsed.protocol)) {
      return parsed.href;
    }
  } catch (_) {
    // fall through to fallback
  }
  return fallback;
}

// === 課題一覧をカード形式で描画 ===
chrome.storage.local.get(["tasks", "lastUpdated"], (data) => {
  const container = document.getElementById("taskList");
  const updated = document.getElementById("lastUpdated");
  // [BEEF+] 修正: 期限が無い/不明なものは先頭に出すようソートを調整
  const tasks = (data.tasks || []).slice().sort((a, b) => {
    const aTime = a?.due ? new Date(a.due).getTime() : -Infinity;
    const bTime = b?.due ? new Date(b.due).getTime() : -Infinity;
    return aTime - bTime; // 期限不明(-Infinity)が先頭に来る
  });
  const beefLink = document.querySelector(".go-beefplus a");

  if (tasks.length === 0) {
    container.innerHTML = "<p>課題は登録されていません。</p>";
  } else {
    container.innerHTML = "";
    for (const t of tasks) {
      const course = t.course || "科目情報なし";
      const contentType = t.contentType || "種別不明";
      const title = t.title || "名称不明";
      const card = document.createElement("div");
      card.className = "task-card";
      // [BEEF+] CSSの構造と一致するようにDOMを組み立て
      card.innerHTML = `
        <div class="task-title">${title}</div>
        <div class="task-meta">
          <span>${course}</span>
          <span>${contentType}</span>
        </div>
        <div class="task-due">
          <span>締切：${formatDue(t.due)}</span>
          <span class="remaining">${formatRemainingTime(t.due)}</span>
        </div>
      `;
      const targetUrl = buildTargetUrl(t);
      card.addEventListener("click", () => chrome.tabs.create({ url: targetUrl }));
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

  // [BEEF+] 追加: popup内リンクをクリックしたら新しいタブでBeef+を開く
  if (beefLink) {
    beefLink.addEventListener("click", (event) => {
      event.preventDefault();
      chrome.tabs.create({ url: beefLink.href });
    });
  }
});

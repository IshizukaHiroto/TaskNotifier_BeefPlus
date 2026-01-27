// === popup.js ===

// ===== タブ切り替え =====
document.addEventListener("DOMContentLoaded", () => {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.tab;

      tabButtons.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(`tab-${targetTab}`).classList.add("active");
    });
  });

  // 課題一覧を読み込み
  loadTasks();

  // 自動ログイン設定を読み込み
  loadCredentials();
});

// ===== 課題一覧機能 =====

// 残り時間をユーザーフレンドリーにフォーマット
function formatRemainingTime(dueISO) {
  const now = new Date();
  const due = new Date(dueISO);
  const diffMs = due - now;

  if (diffMs <= 0) return "締切済み";

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;
  const remainingMinutes = diffMinutes % 60;

  // 2日以上の場合
  if (diffDays >= 2) {
    return `あと${diffDays}日`;
  }

  // 1日以上2日未満の場合
  if (diffDays === 1) {
    if (remainingHours > 0) {
      return `あと1日と${remainingHours}時間`;
    }
    return "あと1日";
  }

  // 1時間以上24時間未満の場合
  if (diffHours >= 1) {
    if (remainingMinutes > 0 && diffHours < 12) {
      return `あと${diffHours}時間${remainingMinutes}分`;
    }
    return `あと${diffHours}時間`;
  }

  // 1時間未満の場合
  const minutesToShow = Math.max(1, diffMinutes);
  return `あと${minutesToShow}分`;
}

// 残り時間に応じた緊急度クラスを返す
function getUrgencyClass(dueISO) {
  const now = new Date();
  const due = new Date(dueISO);
  const diffMs = due - now;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs <= 0) return "expired";
  if (diffHours <= 3) return "urgent";
  if (diffHours <= 24) return "warning";
  if (diffHours <= 48) return "soon";
  return "normal";
}

// 課題一覧を描画
function loadTasks() {
  chrome.storage.local.get(["tasks", "lastUpdated", "noPending", "noPendingMessage"], (data) => {
    const container = document.getElementById("taskList");
    const updated = document.getElementById("lastUpdated");
    const tasks = (data.tasks || []).sort((a, b) => new Date(a.due) - new Date(b.due));
    const beefLink = document.querySelector(".beef-link-btn");
    const noPending = Boolean(data.noPending);
    const noPendingMessage = data.noPendingMessage || "未提出の課題・テストはありません。おつかれさま！";

    if (tasks.length === 0 && noPending) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🎉</span>
          <p>${noPendingMessage}</p>
          <p class="empty-hint">この調子でいきましょう</p>
        </div>
      `;
    } else if (tasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <p>課題は登録されていません</p>
          <p class="empty-hint">Beef+の課題ページを開くと自動で取得されます</p>
        </div>
      `;
    } else {
      container.innerHTML = "";
      for (const t of tasks) {
        const card = document.createElement("div");
        const urgency = getUrgencyClass(t.due);
        card.className = `task-card ${urgency}`;
        card.innerHTML = `
          <div class="task-header">
            <div class="task-title">${t.title}</div>
            <span class="remaining ${urgency}">${formatRemainingTime(t.due)}</span>
          </div>
          <div class="task-meta">
            <span class="course-tag">${t.course}</span>
            <span class="content-tag">${t.contentType}</span>
          </div>
          <div class="task-due">
            <span class="due-label">締切：${new Date(t.due).toLocaleString("ja-JP", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })}</span>
          </div>
        `;
        card.addEventListener("click", () => chrome.tabs.create({ url: t.url }));
        container.appendChild(card);
      }
    }

    // 最終更新時刻
    if (data.lastUpdated) {
      const date = new Date(data.lastUpdated);
      updated.textContent = `最終更新：${date.toLocaleString("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })}`;
    } else {
      updated.textContent = "最終更新：データ未取得";
    }

    // Beef+リンク
    if (beefLink) {
      beefLink.addEventListener("click", (event) => {
        event.preventDefault();
        chrome.tabs.create({ url: beefLink.href });
      });
    }
  });
}

// ===== 自動ログイン機能 =====
const STORAGE_KEY = "beefplusAutoLoginCredentials";
let storedCredentials = null;

function showStatus(message, type = "info") {
  const statusArea = document.getElementById("status");
  statusArea.textContent = message;
  statusArea.className = type;
}

async function persistCredentials(username, password) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: { username, password },
  });
}

async function loadCredentials() {
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");

  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const credentials = stored[STORAGE_KEY];
    if (credentials) {
      storedCredentials = credentials;
      usernameInput.value = credentials.username || "";
      passwordInput.value = credentials.password || "";
      showStatus("✓ 保存済みの情報を読み込みました", "success");
    } else {
      showStatus("保存された情報はありません", "info");
    }
    updateActionState();
  } catch (error) {
    console.error("資格情報の読み込みに失敗しました", error);
    showStatus("保存情報の読み込みに失敗しました", "error");
  }
}

function updateActionState() {
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const actionButton = document.getElementById("action-btn");

  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const hasInput = Boolean(username && password);
  const hasStored = Boolean(storedCredentials);
  const matchesStored =
    hasStored &&
    storedCredentials.username === username &&
    storedCredentials.password === password;

  if (!hasStored) {
    actionButton.textContent = "保存";
    actionButton.disabled = !hasInput;
    return;
  }

  if (matchesStored) {
    actionButton.textContent = "保存済";
    actionButton.disabled = true;
    return;
  }

  actionButton.textContent = "更新";
  actionButton.disabled = !hasInput;
}

async function saveOrUpdateCredentials(event) {
  event.preventDefault();

  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const actionButton = document.getElementById("action-btn");

  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const hasInput = Boolean(username && password);

  if (!hasInput) {
    showStatus("学籍番号とパスワードを入力してください", "error");
    return;
  }

  try {
    await persistCredentials(username, password);
    storedCredentials = { username, password };
    const message = actionButton.textContent === "更新" ? "✓ 情報を更新しました" : "✓ 保存しました";
    showStatus(message, "success");
    updateActionState();
  } catch (error) {
    console.error("資格情報の保存/更新に失敗しました", error);
    showStatus("保存/更新に失敗しました", "error");
  }
}

async function clearCredentials() {
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");

  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    usernameInput.value = "";
    passwordInput.value = "";
    storedCredentials = null;
    showStatus("保存情報を削除しました", "info");
    updateActionState();
  } catch (error) {
    console.error("資格情報の削除に失敗しました", error);
    showStatus("削除に失敗しました", "error");
  }
}

// イベントリスナーを設定
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("credentials-form");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const clearButton = document.getElementById("clear-btn");

  form.addEventListener("submit", saveOrUpdateCredentials);
  usernameInput.addEventListener("input", updateActionState);
  passwordInput.addEventListener("input", updateActionState);
  clearButton.addEventListener("click", clearCredentials);
});

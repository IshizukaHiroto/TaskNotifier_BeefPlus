// === popup.js ===

class PopupTabs {
  constructor(doc) {
    this.doc = doc;
  }

  init() {
    const tabButtons = this.doc.querySelectorAll(".tab-btn");
    const tabContents = this.doc.querySelectorAll(".tab-content");

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetTab = btn.dataset.tab;

        tabButtons.forEach((b) => b.classList.remove("active"));
        tabContents.forEach((c) => c.classList.remove("active"));

        btn.classList.add("active");
        this.doc.getElementById(`tab-${targetTab}`).classList.add("active");
      });
    });
  }
}

class TaskListController {
  constructor(storage, doc) {
    this.storage = storage;
    this.doc = doc;
  }

  init() {
    this.load();
  }

  formatRemainingTime(dueISO) {
    const now = new Date();
    const due = new Date(dueISO);
    const diffMs = due - now;

    if (diffMs <= 0) return "締切済み";

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    const remainingMinutes = diffMinutes % 60;

    if (diffDays >= 2) {
      return `あと${diffDays}日`;
    }

    if (diffDays === 1) {
      if (remainingHours > 0) {
        return `あと1日と${remainingHours}時間`;
      }
      return "あと1日";
    }

    if (diffHours >= 1) {
      if (remainingMinutes > 0 && diffHours < 12) {
        return `あと${diffHours}時間${remainingMinutes}分`;
      }
      return `あと${diffHours}時間`;
    }

    const minutesToShow = Math.max(1, diffMinutes);
    return `あと${minutesToShow}分`;
  }

  getUrgencyClass(dueISO) {
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

  renderNoPending(container, message) {
    container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🎉</span>
          <p>${message}</p>
          <p class="empty-hint">この調子でいきましょう</p>
        </div>
      `;
  }

  renderEmpty(container) {
    container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <p>課題は登録されていません</p>
          <p class="empty-hint">Beef+の課題ページを開くと自動で取得されます</p>
        </div>
      `;
  }

  renderTasks(container, tasks) {
    container.innerHTML = "";
    for (const task of tasks) {
      const card = this.doc.createElement("div");
      const urgency = this.getUrgencyClass(task.due);
      card.className = `task-card ${urgency}`;
      card.innerHTML = `
          <div class="task-header">
            <div class="task-title">${task.title}</div>
            <span class="remaining ${urgency}">${this.formatRemainingTime(task.due)}</span>
          </div>
          <div class="task-meta">
            <span class="course-tag">${task.course}</span>
            <span class="content-tag">${task.contentType}</span>
          </div>
          <div class="task-due">
            <span class="due-label">締切：${new Date(task.due).toLocaleString("ja-JP", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}</span>
          </div>
        `;
      card.addEventListener("click", () => chrome.tabs.create({ url: task.url }));
      container.appendChild(card);
    }
  }

  renderUpdated(updatedEl, lastUpdated) {
    if (lastUpdated) {
      const date = new Date(lastUpdated);
      updatedEl.textContent = `最終更新：${date.toLocaleString("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } else {
      updatedEl.textContent = "最終更新：データ未取得";
    }
  }

  wireBeefLink() {
    const beefLink = this.doc.querySelector(".beef-link-btn");
    if (!beefLink) return;
    beefLink.addEventListener("click", (event) => {
      event.preventDefault();
      chrome.tabs.create({ url: beefLink.href });
    });
  }

  load() {
    this.storage.get(["tasks", "lastUpdated", "noPending", "noPendingMessage"], (data) => {
      const container = this.doc.getElementById("taskList");
      const updated = this.doc.getElementById("lastUpdated");
      const tasks = (data.tasks || []).sort(
        (a, b) => new Date(a.due) - new Date(b.due)
      );
      const noPending = Boolean(data.noPending);
      const noPendingMessage =
        data.noPendingMessage || "未提出の課題・テストはありません。おつかれさま！";

      if (tasks.length === 0 && noPending) {
        this.renderNoPending(container, noPendingMessage);
      } else if (tasks.length === 0) {
        this.renderEmpty(container);
      } else {
        this.renderTasks(container, tasks);
      }

      this.renderUpdated(updated, data.lastUpdated);
      this.wireBeefLink();
    });
  }
}

class AutoLoginController {
  constructor(storage, doc) {
    this.storage = storage;
    this.doc = doc;
    this.storageKey = "beefplusAutoLoginCredentials";
    this.storedCredentials = null;

    this.form = null;
    this.usernameInput = null;
    this.passwordInput = null;
    this.actionButton = null;
    this.clearButton = null;
    this.statusArea = null;
  }

  init() {
    this.form = this.doc.getElementById("credentials-form");
    this.usernameInput = this.doc.getElementById("username");
    this.passwordInput = this.doc.getElementById("password");
    this.actionButton = this.doc.getElementById("action-btn");
    this.clearButton = this.doc.getElementById("clear-btn");
    this.statusArea = this.doc.getElementById("status");

    this.form.addEventListener("submit", (event) => this.saveOrUpdateCredentials(event));
    this.usernameInput.addEventListener("input", () => this.updateActionState());
    this.passwordInput.addEventListener("input", () => this.updateActionState());
    this.clearButton.addEventListener("click", () => this.clearCredentials());

    this.loadCredentials();
  }

  showStatus(message, type = "info") {
    this.statusArea.textContent = message;
    this.statusArea.className = type;
  }

  async persistCredentials(username, password) {
    await this.storage.set({
      [this.storageKey]: { username, password },
    });
  }

  async loadCredentials() {
    try {
      const stored = await this.storage.get(this.storageKey);
      const credentials = stored[this.storageKey];
      if (credentials) {
        this.storedCredentials = credentials;
        this.usernameInput.value = credentials.username || "";
        this.passwordInput.value = credentials.password || "";
        this.showStatus("✓ 保存済みの情報を読み込みました", "success");
      } else {
        this.showStatus("保存された情報はありません", "info");
      }
      this.updateActionState();
    } catch (error) {
      console.error("資格情報の読み込みに失敗しました", error);
      this.showStatus("保存情報の読み込みに失敗しました", "error");
    }
  }

  updateActionState() {
    const username = this.usernameInput.value.trim();
    const password = this.passwordInput.value;
    const hasInput = Boolean(username && password);
    const hasStored = Boolean(this.storedCredentials);
    const matchesStored =
      hasStored &&
      this.storedCredentials.username === username &&
      this.storedCredentials.password === password;

    if (!hasStored) {
      this.actionButton.textContent = "保存";
      this.actionButton.disabled = !hasInput;
      return;
    }

    if (matchesStored) {
      this.actionButton.textContent = "保存済";
      this.actionButton.disabled = true;
      return;
    }

    this.actionButton.textContent = "更新";
    this.actionButton.disabled = !hasInput;
  }

  async saveOrUpdateCredentials(event) {
    event.preventDefault();

    const username = this.usernameInput.value.trim();
    const password = this.passwordInput.value;
    const hasInput = Boolean(username && password);

    if (!hasInput) {
      this.showStatus("学籍番号とパスワードを入力してください", "error");
      return;
    }

    try {
      await this.persistCredentials(username, password);
      this.storedCredentials = { username, password };
      const message =
        this.actionButton.textContent === "更新"
          ? "✓ 情報を更新しました"
          : "✓ 保存しました";
      this.showStatus(message, "success");
      this.updateActionState();
    } catch (error) {
      console.error("資格情報の保存/更新に失敗しました", error);
      this.showStatus("保存/更新に失敗しました", "error");
    }
  }

  async clearCredentials() {
    try {
      await this.storage.remove(this.storageKey);
      this.usernameInput.value = "";
      this.passwordInput.value = "";
      this.storedCredentials = null;
      this.showStatus("保存情報を削除しました", "info");
      this.updateActionState();
    } catch (error) {
      console.error("資格情報の削除に失敗しました", error);
      this.showStatus("削除に失敗しました", "error");
    }
  }
}

class PopupApp {
  constructor(doc, storage) {
    this.doc = doc;
    this.storage = storage;
    this.tabs = new PopupTabs(doc);
    this.taskList = new TaskListController(storage, doc);
    this.autoLogin = new AutoLoginController(storage, doc);
  }

  init() {
    this.tabs.init();
    this.taskList.init();
    this.autoLogin.init();
  }
}

this.document.addEventListener("DOMContentLoaded", () => {
  const app = new PopupApp(document, chrome.storage.local);
  app.init();
});

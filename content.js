// === content.js ===
// BEEF+ の「課題・テスト一覧」ページから課題情報を抽出して保存

class TaskPageParser {
  constructor(doc, loc) {
    this.doc = doc;
    this.loc = loc;
  }

  parse() {
    const tasks = [];
    const noPendingEl = this.doc.querySelector(".contents-detail .contents-list .no-data");
    const noPendingDetected = Boolean(
      noPendingEl && noPendingEl.textContent.includes("未提出の課題・テスト一覧はありません")
    );

    const rows = this.doc.querySelectorAll(".result_list_line.sortTaskBlock");

    rows.forEach((row) => {
      const courseEl = row.querySelector(".tasklist-course");
      const contentEl = row.querySelector(".tasklist-contents a");
      const titleEl = row.querySelector(".tasklist-title a");
      const deadlineEl = row.querySelector(".tasklist-deadline .deadline");

      if (!courseEl || !contentEl || !titleEl || !deadlineEl) return;

      const course = courseEl.textContent.trim();
      const contentType = contentEl.textContent.trim();
      const title = titleEl.textContent.trim();
      const url = new URL(titleEl.getAttribute("href"), this.loc.origin).href;
      const dueText = deadlineEl.textContent.trim();

      const due = new Date(dueText.replace(/-/g, "/"));
      if (isNaN(due)) return;

      tasks.push({
        course,
        contentType,
        title,
        url,
        due: due.toISOString(),
      });
    });

    console.log("[BEEF+] 抽出した課題:", tasks);
    return { tasks, noPendingDetected };
  }
}

class TaskStorageUpdater {
  constructor(storage) {
    this.storage = storage;
  }

  update(newTasks) {
    this.storage.get("tasks", (data) => {
      const oldTasks = data.tasks || [];
      const newUrls = newTasks.map((t) => t.url);

      const kept = oldTasks.filter((t) => newUrls.includes(t.url));
      const added = newTasks.filter((t) => !oldTasks.some((o) => o.url === t.url));
      const merged = [...kept, ...added];

      this.storage.set(
        {
          tasks: merged,
          noPending: false,
          noPendingMessage: "",
          lastUpdated: new Date().toISOString(),
        },
        () => {
          if (added.length > 0 || kept.length !== oldTasks.length) {
            console.log(
              `[BEEF+] 課題一覧を更新しました (${merged.length}件, 新規:${added.length})`
            );
          } else {
            console.log("[BEEF+] 課題に変更はありません。");
          }
        }
      );
    });
  }
}

class TaskPageController {
  constructor(parser, updater, storage) {
    this.parser = parser;
    this.updater = updater;
    this.storage = storage;
  }

  run() {
    const result = this.parser.parse();
    if (result.noPendingDetected) {
      this.storage.set(
        {
          tasks: [],
          noPending: true,
          noPendingMessage: "未提出の課題・テストはありません。おつかれさま！",
          lastUpdated: new Date().toISOString(),
        },
        () => {
          console.log("[BEEF+] 未提出の課題・テストはありません。");
        }
      );
      return;
    }

    if (result.tasks.length > 0) {
      this.updater.update(result.tasks);
      return;
    }

    console.warn("[BEEF+] 課題が見つかりませんでした。ページ構造が変わった可能性があります。");
  }
}

(() => {
  const parser = new TaskPageParser(document, location);
  const updater = new TaskStorageUpdater(chrome.storage.local);
  const controller = new TaskPageController(parser, updater, chrome.storage.local);
  controller.run();
})();

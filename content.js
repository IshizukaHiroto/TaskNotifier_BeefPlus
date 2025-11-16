// === content.js ===
// BEEF+ の「課題・テスト一覧」ページから課題情報を抽出して保存

function parseDeadline(dueText) {
  if (!dueText) return null;
  // [BEEF+] 修正: 全角混在など崩れた日付もできるだけ解釈する
  const normalized = dueText
    .replace(/[年月]/g, "/")
    .replace(/日/g, "")
    .replace(/－/g, "-")
    .replace(/ー/g, "-")
    .replace(/-/g, "/")
    .replace(/\s+/g, " ")
    .trim();

  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = Date.parse(dueText);
  return Number.isNaN(fallback) ? null : new Date(fallback);
}

function parseTasks() {
  const tasks = [];

  // 各課題行を取得
  const rows = document.querySelectorAll(".result_list_line.sortTaskBlock");

  rows.forEach(row => {
    const courseEl = row.querySelector(".tasklist-course");
    const contentEl = row.querySelector(".tasklist-contents a");
    const titleEl = row.querySelector(".tasklist-title a");
    const deadlineEl = row.querySelector(".tasklist-deadline .deadline");

    if (!courseEl || !contentEl || !titleEl || !deadlineEl) return;

    const course = courseEl.textContent.trim();
    const contentType = contentEl.textContent.trim();
    const title = titleEl.textContent.trim();
    const url = new URL(titleEl.getAttribute("href"), location.origin).href;
    const dueText = deadlineEl.textContent.trim();

    // 期限をISO形式に変換（解釈できない場合は null）
    const due = parseDeadline(dueText);

    tasks.push({
      course,
      contentType,
      title,
      url,
      due: due ? due.toISOString() : null
    });
  });

  console.log("[BEEF+] 抽出した課題:", tasks);
  return tasks;
}

// === ストレージ更新（新規追加・削除・更新） ===
function updateStoredTasks(newTasks) {
  chrome.storage.local.get("tasks", (data) => {
    const oldTasks = data.tasks || [];
    const newUrls = newTasks.map(t => t.url);

    // 消えた課題は削除
    const kept = oldTasks.filter(t => newUrls.includes(t.url));

    // 新規追加
    const added = newTasks.filter(t => !oldTasks.some(o => o.url === t.url));

    // === 修正①: 保存する配列を "tasks" ではなく "merged" に修正 ===
    const merged = [...kept, ...added];

    // === 修正②: lastUpdated を保存し、正しい変数を使用 ===
    chrome.storage.local.set({
      tasks: merged,
      lastUpdated: new Date().toISOString()
    }, () => {
      // === 修正③: より明確なログ出力 ===
      if (added.length > 0 || kept.length !== oldTasks.length) {
        console.log(`[BEEF+] 課題一覧を更新しました (${merged.length}件, 新規:${added.length})`);
      } else {
        console.log("[BEEF+] 課題に変更はありません。");
      }
    });
  });
}

// === 実行 ===
const tasks = parseTasks();
if (tasks.length > 0) {
  updateStoredTasks(tasks);
} else {
  console.warn("[BEEF+] 課題が見つかりませんでした。ページ構造が変わった可能性があります。");
}

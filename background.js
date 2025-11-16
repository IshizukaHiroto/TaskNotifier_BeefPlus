// === background.js ===
// ============================================================
//                 BEEF+ Task Notifier
//            （スクレイピング + Gmail 自動同期）
// ============================================================


/* ============================================================
   既存：保存された課題を監視して期限前に通知
============================================================ */

// 通知を作成
function createNotification(task, remainingHours = null) {
  // [BEEF+] 修正: 期限/科目/種別が欠けても通知が壊れないようフォールバックを用意
  const dueDate = task?.due ? new Date(task.due) : null;
  const dueText = dueDate && !Number.isNaN(dueDate.getTime())
    ? dueDate.toLocaleString()
    : "情報なし";
  const course = task?.course || "科目情報なし";
  const contentType = task?.contentType || "種類不明";

  const title = remainingHours === null
    ? `締切間近：${task.title}`
    : `${task.title}の締切まであと${remainingHours}時間です!!`;

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title,
    message: `${course} (${contentType})\n締切：${dueText}`,
    priority: 2
  });
}

// [BEEF+] デバッグ用: 失敗箇所とエラーをまとめて出力するヘルパー
function logError(context, err) {
  const msg = err?.message || String(err);
  const stack = err?.stack || "";
  console.error(`[BEEF+] ${context}: ${msg}`, stack);
}

function encodeBase64(str) {
  // [BEEF+] 修正: UTF-8安全なBase64でアラーム名を生成
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function decodeBase64(str) {
  // [BEEF+] 修正: 上記のUTF-8エンコードを逆変換
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// 通知スケジュール
function scheduleNotifications(task) {
  // [BEEF+] 修正: 期限が無い/解釈できない場合は通知予約をスキップ
  if (!task?.due) {
    console.log("[BEEF+] 締切情報なしのため通知をスキップ:", task?.title);
    return;
  }

  const dueTime = new Date(task.due).getTime();
  if (Number.isNaN(dueTime)) {
    console.log("[BEEF+] 締切を解釈できないため通知をスキップ:", task?.title);
    return;
  }
  const now = Date.now();
  const offsets = [
    { hours: 24, label: "24時間前" },
    { hours: 12, label: "12時間前" },
    { hours: 3, label: "3時間前" },
    { hours: 1, label: "1時間前" }
  ];

  if (dueTime <= now) {
    console.log(`[BEEF+] 締切済みスキップ: ${task.title}`);
    return;
  }

  const immediateThresholdMs = 60 * 1000;
  if (dueTime - now <= immediateThresholdMs) {
    console.log(`[BEEF+] 即時通知: ${task.title}`);
    createNotification(task, 0);
    return;
  }

  let scheduled = false;
  for (const { hours, label } of offsets) {
    const when = dueTime - hours * 3600000;
    if (when > now) {
      const alarmKey = String(task.url || task.title || dueTime);
      const alarmName = `notify-${encodeBase64(alarmKey)}-${hours}`;
      chrome.alarms.create(alarmName, { when });
      console.log(`[BEEF+] 通知予約: ${task.title} (${label})`);
      scheduled = true;
    }
  }

  if (!scheduled) {
    console.log(`[BEEF+] 通知対象外（1時間未満）: ${task.title}`);
  }
}

// アラーム発火
chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith("notify-")) return;
  const matches = alarm.name.match(/^notify-(.*)-(\d+)$/);
  if (!matches) return;
  const [_, encodedUrl, hours] = matches;
  const url = decodeBase64(encodedUrl);

  chrome.storage.local.get("tasks", (data) => {
    const task = (data.tasks || []).find(t => t.url === url);
    if (task) {
      console.log(`[BEEF+] 通知発火: ${task.title} (${hours}時間前)`);
      createNotification(task, Number(hours));
    } else {
      logError("通知対象の課題が見つかりません", new Error(url));
    }
  });
});


// ストレージ変更時に再スケジュール
chrome.storage.onChanged.addListener((changes) => {
  if (changes.tasks?.newValue) {
    // [BEEF+] 修正: 通知用アラームのみ消して再予約し、gmailSync等は保持
    chrome.alarms.getAll((alarms) => {
      const notifyAlarms = alarms.filter(a => a.name.startsWith("notify-")).map(a => a.name);

      const scheduleAll = () => {
        changes.tasks.newValue.forEach(scheduleNotifications);
      };

      if (notifyAlarms.length === 0) {
        scheduleAll();
        return;
      }

      let cleared = 0;
      notifyAlarms.forEach(name => {
        chrome.alarms.clear(name, () => {
          cleared += 1;
          if (cleared === notifyAlarms.length) {
            scheduleAll();
          }
        });
      });
    });
  }
});

// 起動/インストール時
["onStartup", "onInstalled"].forEach(evt => {
  chrome.runtime[evt].addListener(() => {
    chrome.storage.local.get("tasks", (data) => {
      (data.tasks || []).forEach(scheduleNotifications);
    });
  });
});



/* ============================================================
   Gmail API 自動同期（方法1：Chrome拡張のみで完結）
============================================================ */

// ① Gmail OAuth トークン取得
async function getGmailToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) return resolve(token);
      chrome.identity.getAuthToken({ interactive: true }, (token2) => {
        if (chrome.runtime.lastError || !token2) {
          reject(new Error(chrome.runtime.lastError?.message || "getAuthToken failed"));
        } else resolve(token2);
      });
    });
  });
}


// ② Beef+ メール一覧取得
async function fetchBeefMailIds(token, pageToken = null, acc = []) {
  // [BEEF+] 修正: Gmail一覧取得時の失敗ハンドリングとページネーション対応
  // BEEF+ からの送信元は環境によって noreply/no-reply や domain の差分があるため幅広く検索する
  const senders = [
    "from:noreply@beefplus.center.kobe-u.ac.jp",
    "from:no-reply@beefplus.center.kobe-u.ac.jp",
    "from:noreply@beef.center.kobe-u.ac.jp",
    "from:no-reply@beef.center.kobe-u.ac.jp",
    "from:beefplus.center.kobe-u.ac.jp",
    "from:noreply@stu.kobe-u.ac.jp",
    "from:no-reply@stu.kobe-u.ac.jp",
    "from:stu.kobe-u.ac.jp"
  ];
  const query = encodeURIComponent(senders.join(" OR "));
  const base = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${query}`;
  const url = pageToken ? `${base}&pageToken=${pageToken}` : base;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gmail list failed (${res.status}) token:${token ? "yes" : "no"} page:${pageToken || "-"} body:${errText}`);
  }

  const data = await res.json();
  const resultSize = data.resultSizeEstimate ?? (data.messages ? data.messages.length : 0);
  console.log(`[BEEF+] Gmail一覧取得: ${resultSize}件 (pageToken:${pageToken || "-"})`);

  const collected = acc.concat(data.messages || []);

  if (data.nextPageToken) {
    return fetchBeefMailIds(token, data.nextPageToken, collected);
  }
  return collected;
}


// ③ Gmail API 正しい本文抽出（MIME 多階層対応）
function findBody(part) {
  if (!part) return null;
  if (part.body?.data) return part.body.data;
  if (part.parts) {
    for (const p of part.parts) {
      const found = findBody(p);
      if (found) return found;
    }
  }
  return null;
}

async function getMailBody(token, msgId) {
  // [BEEF+] 修正: 本文取得のエラーハンドリングとUTF-8デコードを安定化
  const res = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gmail message failed (${res.status}) id:${msgId} body:${errText}`);
  }

  const data = await res.json();

  const encoded = findBody(data.payload);
  if (!encoded) return "";

  // Base64url -> bytes -> UTF-8文字列
  const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}


// ④ メール解析（課題追加・提出・お知らせ）
function parseBeefMail(text) {
  const results = [];

  const courseMatch = text.match(/授業名：(.+)\n/);
  const course = courseMatch ? courseMatch[1].trim() : "情報なし";

  const updatesStart = text.indexOf("更新内容：");
  if (updatesStart === -1) return [];

  const lines = text.substring(updatesStart).split("\n").filter(v => v.includes("・"));

  for (const line of lines) {
    let m;

    if ((m = line.match(/課題\((.+)\)が追加されました/))) {
      results.push({ type: "task_added", title: m[1], course });
    }
    if ((m = line.match(/課題\((.+)\)を提出しました/))) {
      results.push({ type: "task_submitted", title: m[1], course });
    }
    if ((m = line.match(/アンケート\((.+)\)が追加されました/))) {
      results.push({ type: "notification", title: m[1], course, category: "アンケート" });
    }
    if ((m = line.match(/資料\((.+)\)が追加されました/))) {
      results.push({ type: "notification", title: m[1], course, category: "資料" });
    }
  }
  return results;
}


// ⑤ ストレージへ反映（既存の tasks に統合）
function applyMailUpdates(newItems) {
  chrome.storage.local.get(["tasks"], (data) => {
    const tasks = data.tasks || [];

    for (const item of newItems) {
      const id = item.course + "::" + item.title;

      if (item.type === "task_added") {
        if (!tasks.some(t => t.id === id)) {
          tasks.push({
            id,
            title: item.title,
            course: item.course,
            contentType: "メール検知",
            url: "mailto-task://" + encodeURIComponent(id),
            due: new Date(Date.now() + 7 * 86400000).toISOString() // 期限不明: 7日後
          });
        }
      }

      if (item.type === "task_submitted") {
        const idx = tasks.findIndex(t => t.id === id);
        if (idx !== -1) tasks.splice(idx, 1);
      }
    }

    chrome.storage.local.set({ tasks });
  });
}


// ⑥ メールの二重処理防止
async function loadProcessedIds() {
  return new Promise(resolve => {
    chrome.storage.local.get(["processedMailIds"], (data) => {
      resolve(new Set(data.processedMailIds || []));
    });
  });
}

function saveProcessedIds(set) {
  chrome.storage.local.set({ processedMailIds: Array.from(set) });
}


// ⑦ Gmail 自動同期（5分ごと）
chrome.alarms.create("gmailSync", { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "gmailSync") return;

  try {
    console.log("[BEEF+] Gmail同期開始");
    const token = await getGmailToken();
    const processed = await loadProcessedIds();
    const msgs = await fetchBeefMailIds(token);

    const results = [];

    for (const m of msgs) {
      if (processed.has(m.id)) continue;
      processed.add(m.id);

      try {
        const body = await getMailBody(token, m.id);
        const parsed = parseBeefMail(body);
        results.push(...parsed);
      } catch (mailErr) {
        logError(`メール解析失敗 id:${m.id}`, mailErr);
      }
    }

    saveProcessedIds(processed);
    applyMailUpdates(results);
    console.log(`[BEEF+] Gmail同期完了 新規メール:${results.length}件`);
  } catch (e) {
    logError("Gmail同期エラー", e);
    // [BEEF+] 修正: トークン不正時はキャッシュを破棄して次回再取得を促す
    if (e?.message?.includes("401")) {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) {
          chrome.identity.removeCachedAuthToken({ token }, () => {});
        }
      });
    }
  }
});

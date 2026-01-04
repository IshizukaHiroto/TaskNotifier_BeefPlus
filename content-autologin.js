// ログインページで資格情報を自動入力し、送信まで行うコンテンツスクリプト。
// ユーザーが保存した学籍番号・パスワードをchrome.storage.localから読み出す。
const STORAGE_KEY = "beefplusAutoLoginCredentials";
const START_HOST = "beefplus.center.kobe-u.ac.jp";
const START_PATH = "/login";
const ATTEMPT_KEY = "beefplusAutoLoginAttemptCount";
const MAX_ATTEMPTS = 3;

const SELECTORS = {
  signInLink: 'a.login-btn.btn-color.btn-txt[href="/saml/login?disco=true"]',
  username: "#username",
  password: "#password",
  submit: "#kc-login",
};

const RETRY_INTERVAL_MS = 250;
const WAIT_TIMEOUT_MS = 8000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadCredentials = async () => {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const credentials = stored[STORAGE_KEY];
    if (!credentials || !credentials.username || !credentials.password) {
      return null;
    }
    return credentials;
  } catch (error) {
    console.error("資格情報の読み込みに失敗しました", error);
    return null;
  }
};

const waitForElement = async (selector, timeoutMs = WAIT_TIMEOUT_MS) => {
  const start = Date.now();
  let element = document.querySelector(selector);
  while (!element && Date.now() - start < timeoutMs) {
    await sleep(RETRY_INTERVAL_MS);
    element = document.querySelector(selector);
  }
  return element;
};

const clickSignInLink = async () => {
  const link = await waitForElement(SELECTORS.signInLink, 4000);
  if (!link) {
    return false;
  }
  if (link.dataset.beefplusAutoLoginClicked === "true") {
    return true;
  }
  link.dataset.beefplusAutoLoginClicked = "true";
  link.click();
  return true;
};

const fillAndSubmitLogin = async (credentials) => {
  const usernameField = await waitForElement(SELECTORS.username);
  const passwordField = await waitForElement(SELECTORS.password);
  const submitButton = await waitForElement(SELECTORS.submit);

  if (!usernameField || !passwordField || !submitButton) {
    return false;
  }

  if (usernameField.value !== credentials.username) {
    usernameField.focus();
    usernameField.value = credentials.username;
    usernameField.dispatchEvent(new Event("input", { bubbles: true }));
  }

  if (passwordField.value !== credentials.password) {
    passwordField.focus();
    passwordField.value = credentials.password;
    passwordField.dispatchEvent(new Event("input", { bubbles: true }));
  }

  submitButton.click();
  return true;
};

const main = async () => {
  const attemptCount = Number(sessionStorage.getItem(ATTEMPT_KEY) || "0");
  if (attemptCount >= MAX_ATTEMPTS) {
    console.info("BeefPlusAutoLogin: サインイン試行が上限に達したため自動送信しません。");
    return;
  }

  const credentials = await loadCredentials();
  if (!credentials) {
    console.info("BeefPlusAutoLogin: 保存された資格情報がないため何も実行しません。");
    return;
  }

  const onStartPage =
    location.hostname === START_HOST && location.pathname.startsWith(START_PATH);
  const hasLoginForm =
    document.querySelector(SELECTORS.username) ||
    document.querySelector(SELECTORS.password) ||
    document.querySelector(SELECTORS.submit);

  // 対象ページでなければ早期終了する。
  if (!onStartPage && !hasLoginForm) {
    return;
  }

  // 入口ページではサインインリンクをクリックしてログイン画面へ進む。
  if (onStartPage) {
    await clickSignInLink();
  }

  const submitted = await fillAndSubmitLogin(credentials);
  if (submitted) {
    sessionStorage.setItem(ATTEMPT_KEY, String(attemptCount + 1));
  }
};

main().catch((error) =>
  console.error("BeefPlusAutoLogin: 実行中にエラーが発生しました", error)
);

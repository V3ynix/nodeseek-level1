// ==UserScript==
// @name         NodeSeek 一级及以下标记与屏蔽
// @namespace    nodeseek-level1
// @version      1.0.2
// @description  标记 Lv.0、Lv.1 作者；帖子、评论独立屏蔽开关，默认仅标记。
// @author       V3ynix
// @license      MIT
// @homepageURL  https://github.com/V3ynix/nodeseek-level1
// @supportURL   https://github.com/V3ynix/nodeseek-level1/issues
// @downloadURL  https://github.com/V3ynix/nodeseek-level1/raw/refs/heads/main/nodeseek-level1.user.js
// @updateURL    https://github.com/V3ynix/nodeseek-level1/raw/refs/heads/main/nodeseek-level1.user.js
// @match        https://www.nodeseek.com/*
// @match        https://nodeseek.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

/*
 * 使用：安装到 Tampermonkey 后刷新 NodeSeek。右下角「Lv.0 / Lv.1 助手」控制屏蔽。
 * 「帖子」覆盖列表主题和打开后的主楼，不影响其他人的评论。
 * 「评论」只作用于回复。关闭开关立即恢复，站内拉黑列表不会被修改。
 * 等级仅按官方 getInfo 接口 detail.rank 判断，Lv.0 和 Lv.1 纳入范围，未知等级不屏蔽。
 * 每个 UID 在本页只查询一次；成功结果在当前标签页缓存 30 分钟。
 * 1.0.2：添加 GitHub 安装、更新地址和 MIT 许可元数据。
 * 1.0.1：标记、屏蔽和统计统一覆盖一级及以下；徽标显示实际等级。
 * 1.0.0：一级号标记、独立开关、设置保存、动态页面支持。
 */
(() => {
  'use strict';
  if (document.getElementById('nsl1-panel')) return;

  const SETTINGS_KEY = 'nsl1:settings:v1';
  const CACHE_KEY = 'nsl1:ranks:v1';
  const TTL = 30 * 60 * 1000;
  const SELECTOR = '.post-list-item, .nsk-post > .content-item, .comments > .content-item';
  const records = new Map();
  const ranks = new Map();
  const pending = new Map();
  const queue = [];
  let active = 0;
  let scanTimer;
  let cacheTimer;
  let storageWarning = '';
  let settings = loadSettings();

  function loadSettings() {
    try {
      const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return { posts: value?.posts === true, comments: value?.comments === true };
    } catch {
      return { posts: false, comments: false };
    }
  }

  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
    for (const [uid, value] of Object.entries(cached)) {
      if (/^\d+$/.test(uid) && Number.isInteger(value?.rank) && value.rank >= 0 &&
          Number.isFinite(value.time) && Date.now() - value.time < TTL && value.time <= Date.now()) {
        ranks.set(uid, value);
      }
    }
  } catch { /* Storage is optional; unresolved users are queried normally. */ }

  const style = document.createElement('style');
  style.id = 'nsl1-style';
  style.textContent = `
    .nsl1-badge { display:inline-block; margin-left:7px; padding:1px 6px; border-radius:4px;
      font:600 11px/1.7 system-ui,sans-serif; vertical-align:middle; white-space:nowrap;
      color:#9a4900; background:#fff0d1; border:1px solid #efc77f; }
    .nsl1-badge[data-state="unknown"] { color:#666; background:#f1f1f1; border-color:#ccc; }
    html[data-nsl1-posts="true"] [data-nsl1-kind="posts"]:is([data-nsl1-rank="0"],[data-nsl1-rank="1"]),
    html[data-nsl1-comments="true"] [data-nsl1-kind="comments"]:is([data-nsl1-rank="0"],[data-nsl1-rank="1"]) {
      display:none !important;
    }
    #nsl1-panel { position:fixed; right:16px; bottom:18px; z-index:10000; box-sizing:border-box;
      width:252px; max-width:calc(100vw - 32px); border:1px solid var(--border-color,#ccc);
      border-radius:10px; background:var(--bg-main-color,#fff); color:var(--text-color,#444);
      box-shadow:0 4px 20px #0002; font:13px/1.6 system-ui,sans-serif; }
    #nsl1-panel summary { padding:10px 13px; cursor:pointer; user-select:none; font-weight:600; }
    #nsl1-panel .nsl1-body { padding:0 13px 12px; }
    #nsl1-panel label { display:flex; align-items:center; gap:8px; padding:6px 0; cursor:pointer; }
    #nsl1-panel input { width:16px; height:16px; margin:0; accent-color:#b96916; }
    #nsl1-panel p { margin:6px 0 0; font-size:12px; opacity:.8; }
    #nsl1-status { border-top:1px solid var(--border-color,#ddd); padding-top:8px; }
    @media(prefers-color-scheme:dark) {
      .nsl1-badge { color:#ffd28a; background:#493515; border-color:#8b642d; }
      .nsl1-badge[data-state="unknown"] { color:#ccc; background:#333; border-color:#666; }
    }
  `;
  document.head.append(style);

  const panel = document.createElement('details');
  panel.id = 'nsl1-panel';
  panel.open = true;
  panel.innerHTML = `<summary>Lv.0 / Lv.1 助手 · 标记与屏蔽</summary>
    <div class="nsl1-body">
      <label><input type="checkbox" data-setting="posts">屏蔽一级及以下帖子</label>
      <label><input type="checkbox" data-setting="comments">屏蔽一级及以下评论</label>
      <p>默认仅标记；两个开关互不影响。</p>
      <p id="nsl1-status" role="status" aria-live="polite"></p>
    </div>`;
  document.body.append(panel);
  const status = panel.querySelector('#nsl1-status');

  function updateSettings() {
    for (const key of ['posts', 'comments']) {
      document.documentElement.setAttribute(`data-nsl1-${key}`, String(settings[key]));
      panel.querySelector(`[data-setting="${key}"]`).checked = settings[key];
    }
    updateStatus();
  }

  panel.addEventListener('change', event => {
    const key = event.target.dataset.setting;
    if (key !== 'posts' && key !== 'comments') return;
    settings[key] = event.target.checked;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      storageWarning = '';
    } catch {
      storageWarning = '设置未能保存，当前页面仍生效。';
    }
    updateSettings();
  });
  window.addEventListener('storage', event => {
    if (event.storageArea === localStorage && (event.key === SETTINGS_KEY || event.key === null)) {
      settings = loadSettings();
      updateSettings();
    }
  });

  function isLowRank(rank) {
    return Number.isInteger(rank) && rank >= 0 && rank <= 1;
  }

  function updateStatus() {
    let posts = 0;
    let comments = 0;
    let unknown = 0;
    let waiting = 0;
    for (const [element, record] of records) {
      if (!element.isConnected) continue;
      if (isLowRank(record.rank)) record.kind === 'posts' ? posts++ : comments++;
      else if (record.rank === null) unknown++;
      else if (record.rank === undefined) waiting++;
    }
    const hidden = (settings.posts ? posts : 0) + (settings.comments ? comments : 0);
    const text = `本页一级及以下：帖子 ${posts} · 评论 ${comments}；已屏蔽 ${hidden} 条。` +
      (waiting ? ` 查询中 ${waiting} 条。` : '') +
      (unknown ? ` 等级未知 ${unknown} 条，未屏蔽；刷新可重查。` : '') +
      (storageWarning ? ` ${storageWarning}` : '');
    if (status.textContent !== text) status.textContent = text;
  }

  function saveCache() {
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => {
      const entries = [...ranks].filter(([, v]) => Date.now() - v.time < TTL).slice(-500);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries))); }
      catch { /* Cache failure never affects classification. */ }
    }, 300);
  }

  function getRank(uid) {
    const cached = ranks.get(uid);
    if (cached && Date.now() - cached.time < TTL) return Promise.resolve(cached.rank);
    if (pending.has(uid)) return pending.get(uid);
    const promise = new Promise(resolve => queue.push({ uid, resolve }));
    pending.set(uid, promise);
    pump();
    return promise;
  }

  function pump() {
    while (active < 2 && queue.length) {
      const task = queue.shift();
      active++;
      queryRank(task.uid).then(task.resolve).finally(() => {
        // Space out lookups; no automatic retries or unbounded parallel requests.
        setTimeout(() => { active--; pump(); }, 250);
      });
    }
  }

  async function queryRank(uid) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`/api/account/getInfo/${uid}`, {
        credentials: 'same-origin', signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.success !== true || !Number.isInteger(data.detail?.rank) || data.detail.rank < 0 ||
          String(data.detail.member_id) !== uid) throw new Error('Invalid account rank');
      const rank = data.detail.rank;
      ranks.set(uid, { rank, time: Date.now() });
      saveCache();
      return rank;
    } catch (error) {
      console.warn(`[NodeSeek Lv.0 / Lv.1] UID ${uid} 等级查询失败，保留内容。`, error);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function decorate(element, record) {
    element.setAttribute('data-nsl1-kind', record.kind);
    if (record.rank === undefined) element.removeAttribute('data-nsl1-rank');
    else element.setAttribute('data-nsl1-rank', record.rank === null ? 'unknown' : String(record.rank));
    const target = record.target;
    let badge = element.querySelector('.nsl1-badge');
    if (!isLowRank(record.rank) && record.rank !== null) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nsl1-badge';
    }
    const isLow = isLowRank(record.rank);
    const level = `Lv.${record.rank}`;
    const text = isLow ? (record.kind === 'posts' ? `${level} 发帖` : level) : '等级未知';
    if (badge.textContent !== text) badge.textContent = text;
    badge.dataset.state = isLow ? 'low-level' : 'unknown';
    badge.title = isLow ? `官方账号等级 ${level}；可用右下角开关屏蔽` : '等级接口查询失败，未作屏蔽判断';
    if (badge.parentElement !== target) target.append(badge);
  }

  function inspect(element) {
    const listItem = element.matches('.post-list-item');
    const author = listItem
      ? element.querySelector('.info-author a[href^="/space/"]')
      : element.querySelector(':scope > .nsk-content-meta-info .author-info > .author-name[href^="/space/"]');
    const uid = author?.getAttribute('href')?.match(/^\/space\/(\d+)\/?(?:[?#].*)?$/)?.[1];
    const target = listItem ? element.querySelector('.post-title') : author?.parentElement;
    if (!uid || !target) {
      records.delete(element);
      element.removeAttribute('data-nsl1-kind');
      element.removeAttribute('data-nsl1-rank');
      element.querySelector('.nsl1-badge')?.remove();
      return;
    }
    const kind = listItem || element.parentElement.matches('.nsk-post') ? 'posts' : 'comments';
    const previous = records.get(element);
    if (previous?.uid === uid && previous.kind === kind) {
      previous.target = target;
      decorate(element, previous);
      return;
    }
    const record = { uid, kind, target, rank: undefined };
    records.set(element, record);
    decorate(element, record);
    getRank(uid).then(rank => {
      // Vue may recycle a row while its old author lookup is in flight.
      if (records.get(element) !== record || !element.isConnected) return;
      record.rank = rank;
      decorate(element, record);
      updateStatus();
    });
  }

  function scan() {
    scanTimer = undefined;
    for (const [element] of records) {
      if (!element.isConnected || !element.matches(SELECTOR)) {
        records.delete(element);
        element.removeAttribute('data-nsl1-kind');
        element.removeAttribute('data-nsl1-rank');
        element.querySelector('.nsl1-badge')?.remove();
      }
    }
    document.querySelectorAll(SELECTOR).forEach(inspect);
    updateStatus();
  }

  const observer = new MutationObserver(mutations => {
    const relevant = mutations.some(mutation => {
      const element = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      return !element?.closest('#nsl1-panel, .nsl1-badge') &&
        (mutation.type === 'attributes' || [...mutation.addedNodes, ...mutation.removedNodes]
          .some(node => node.nodeType === 1 && !node.matches('.nsl1-badge')));
    });
    if (relevant && scanTimer === undefined) scanTimer = setTimeout(scan, 100);
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'id'] });
  updateSettings();
  scan();
})();

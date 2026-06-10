'use strict';

const app = getApp();

const PENDING_SYNC_KEY = 'ak_pending_sync_tasks';
const SYNC_INTERVAL = 30 * 60 * 1000;

const SyncTaskType = {
  ADD: 'add',
  UPDATE: 'update',
  DELETE: 'delete',
  RESTORE: 'restore',
};

// ── Pending Queue (FIFO + per-token merge) ─────────────────────

class PendingSyncQueue {
  constructor() {
    this.tasks = this._load();
  }

  _load() {
    try {
      const stored = wx.getStorageSync(PENDING_SYNC_KEY);
      return Array.isArray(stored) ? stored : [];
    } catch { return []; }
  }

  _save() {
    try { wx.setStorageSync(PENDING_SYNC_KEY, this.tasks); } catch {}
  }

  enqueue(type, tokenId, data) {
    const task = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type, tokenId, data,
      enqueuedAt: Date.now(),
    };
    this._merge(task);
    this._save();
  }

  // Merge consecutive operations on the same token (Rule: 可合并同一记录的连续操作)
  _merge(newTask) {
    const tid = newTask.tokenId;
    let idx = -1;
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      if (this.tasks[i].tokenId === tid) { idx = i; break; }
    }

    if (idx < 0) {
      // No prior task for this token. RESTORE with no prior ADD means the ADD
      // was already merged away (ADD+DELETE), so cloud has no record of this
      // token. Convert to ADD so the cloud receives it.
      if (newTask.type === SyncTaskType.RESTORE) {
        this.tasks.push({ ...newTask, type: SyncTaskType.ADD });
      } else {
        this.tasks.push(newTask);
      }
      return;
    }

    const existing = this.tasks[idx];

    // ADD + DELETE → remove both (token never reached cloud)
    if (existing.type === SyncTaskType.ADD && newTask.type === SyncTaskType.DELETE) {
      this.tasks.splice(idx, 1);
      return;
    }
    // ADD + UPDATE → ADD with latest data
    if (existing.type === SyncTaskType.ADD && newTask.type === SyncTaskType.UPDATE) {
      this.tasks[idx] = { ...existing, data: newTask.data };
      return;
    }
    // DELETE + RESTORE → RESTORE (undo the delete)
    if (existing.type === SyncTaskType.DELETE && newTask.type === SyncTaskType.RESTORE) {
      this.tasks[idx] = { ...newTask };
      return;
    }
    // RESTORE + DELETE → DELETE
    if (existing.type === SyncTaskType.RESTORE && newTask.type === SyncTaskType.DELETE) {
      this.tasks[idx] = { ...newTask };
      return;
    }
    // UPDATE + UPDATE → keep latest data
    if (newTask.type === SyncTaskType.UPDATE) {
      this.tasks[idx] = { ...existing, data: newTask.data };
      return;
    }
    // Default: append (handles UPDATE + DELETE, etc.)
    this.tasks.splice(idx, 1);
    this.tasks.push(newTask);
  }

  getTasks() { return this.tasks.slice(); }
  hasPending() { return this.tasks.length > 0; }
  getPendingCount() { return this.tasks.length; }
  clear() { this.tasks = []; this._save(); }
}

let _queue = null;
function getQueue() {
  if (!_queue) _queue = new PendingSyncQueue();
  return _queue;
}

// ── Network State ──────────────────────────────────────────────

let _networkConnected = true;
let _listenerStarted = false;

function startNetworkListener(onResume) {
  if (_listenerStarted) return;
  _listenerStarted = true;

  wx.onNetworkStatusChange(({ isConnected }) => {
    const wasDown = !_networkConnected;
    _networkConnected = isConnected;
    if (isConnected && wasDown) {
      console.log('[SYNC] Network resumed');
      if (onResume) onResume();
    }
  });

  wx.getNetworkType({
    success: ({ networkType }) => { _networkConnected = networkType !== 'none'; },
  });
}

async function checkNetwork() {
  try {
    const { networkType } = await wx.getNetworkType();
    _networkConnected = networkType !== 'none';
  } catch { _networkConnected = false; }
  return _networkConnected;
}

// ── Local Storage ──────────────────────────────────────────────

function saveTokensLocal(tokens) {
  try {
    wx.setStorageSync('ak_tokens', tokens);
    wx.setStorageSync('ak_tokens_timestamp', Date.now());
  } catch {}
}

// ── Queue Helpers ──────────────────────────────────────────────

function queueAdd(token) {
  getQueue().enqueue(SyncTaskType.ADD, token.id, token);
}

function queueUpdate(token) {
  getQueue().enqueue(SyncTaskType.UPDATE, token.id, token);
}

function queueDelete(tokenId) {
  getQueue().enqueue(SyncTaskType.DELETE, tokenId, {
    id: tokenId, is_deleted: true, deleted_at: new Date().toISOString(),
  });
}

function queueRestore(token) {
  getQueue().enqueue(SyncTaskType.RESTORE, token.id, {
    ...token, is_deleted: false, deleted_at: null,
  });
}

// ── Cloud Helpers ──────────────────────────────────────────────

function getOpenid() {
  return app.globalData.userInfo?.openid || app.globalData.openid || null;
}

async function getCloudDoc(db, openid) {
  // 使用 _openid 查询（微信云开发自动添加的真实用户标识）
  // 而不是 openid（应用代码设置的，之前是假的）
  const res = await db.collection('user_backups').where({ _openid: openid }).get();
  return res.data.length > 0 ? res.data[0] : null;
}

// 诊断函数：查询云端所有数据
async function debugCloudData() {
  try {
    const db = wx.cloud.database();
    const openid = getOpenid();
    console.log('[DEBUG] 当前 openid:', openid);

    // 查询当前 openid 的数据（使用 _openid）
    const myData = await getCloudDoc(db, openid);
    console.log('[DEBUG] 当前用户云端数据:', myData);

    // 查询所有数据（用于检查是否有遗漏）
    const allData = await db.collection('user_backups').limit(20).get();
    console.log('[DEBUG] 云端所有记录:', allData.data.length, '条');
    allData.data.forEach((doc, i) => {
      console.log(`[DEBUG] 记录${i}: openid=${doc.openid?.substring(0,10)}..., _openid=${doc._openid?.substring(0,10)}..., tokens=${doc.tokens?.length || 0}, active=${doc.active_tokens?.length || 0}`);
    });

    return { myData, allData: allData.data };
  } catch (err) {
    console.error('[DEBUG] 查询失败:', err);
    return null;
  }
}

async function saveCloudDoc(db, doc, openid, tokens) {
  const active = tokens.filter(t => !t.is_deleted);
  const payload = {
    tokens, active_tokens: active,
    timestamp: new Date().toISOString(), openid,
  };
  if (doc) {
    await db.collection('user_backups').doc(doc._id).update({ data: payload });
  } else {
    await db.collection('user_backups').add({ data: payload });
  }
}

// Apply one task to a cloud token array (pure function)
function applyTask(tokens, task) {
  switch (task.type) {
    case SyncTaskType.ADD:
      return [...tokens.filter(t => t.id !== task.tokenId), task.data];
    case SyncTaskType.UPDATE:
      return tokens.map(t => t.id === task.tokenId ? { ...t, ...task.data } : t);
    case SyncTaskType.DELETE:
      return tokens.map(t => t.id === task.tokenId
        ? { ...t, is_deleted: true, deleted_at: task.data.deleted_at } : t);
    case SyncTaskType.RESTORE:
      return tokens.map(t => t.id === task.tokenId
        ? { ...t, is_deleted: false, deleted_at: null } : t);
    default:
      return tokens;
  }
}

// ── processQueue ───────────────────────────────────────────────
// Upload all queued tasks (FIFO) to cloud in one round-trip.
// Rule 2: 网络可用时，按FIFO顺序处理队列

async function processQueue() {
  if (!app.globalData.loggedIn) return { processed: 0, reason: 'not_logged_in' };
  const openid = getOpenid();
  if (!openid) return { processed: 0, reason: 'no_openid' };

  const queue = getQueue();
  if (!queue.hasPending()) return { processed: 0, reason: 'empty' };

  if (!(await checkNetwork())) return { processed: 0, reason: 'no_network' };

  try {
    const db = wx.cloud.database();
    const doc = await getCloudDoc(db, openid);
    let cloudTokens = doc ? (doc.tokens || []) : [];

    // Apply all FIFO tasks to in-memory cloud state
    for (const task of queue.getTasks()) {
      cloudTokens = applyTask(cloudTokens, task);
    }

    await saveCloudDoc(db, doc, openid, cloudTokens);

    const processed = queue.getPendingCount();
    queue.clear();
    wx.setStorageSync('ak_last_sync_time', new Date().toISOString());
    console.log(`[SYNC] processQueue: ${processed} tasks uploaded`);
    return { processed };
  } catch (err) {
    console.error('[SYNC] processQueue failed:', err);
    return { processed: 0, reason: 'error', error: err };
  }
}

// ── pullFromCloud ──────────────────────────────────────────────
// Pull cloud data into local.
// Rule 3: 云端→本地同步只在无待上传任务时进行
// Rule 4: 删除为软删除，标记后不可从云端恢复

async function pullFromCloud() {
  if (!app.globalData.loggedIn) return { success: false, reason: 'not_logged_in' };
  const openid = getOpenid();
  if (!openid) return { success: false, reason: 'no_openid' };

  // Rule 3: block pull if any tasks are pending
  const queue = getQueue();
  if (queue.hasPending()) {
    console.log('[SYNC] pullFromCloud blocked: pending queue not empty');
    return { success: false, reason: 'pending_queue' };
  }

  if (!(await checkNetwork())) return { success: false, reason: 'no_network' };

  try {
    const db = wx.cloud.database();
    const doc = await getCloudDoc(db, openid);

    if (!doc || !doc.tokens) {
      return { success: true, added: 0, merged: app.globalData.tokens || [] };
    }

    const local = app.globalData.tokens || [];
    const merged = mergeCloudToLocal(local, doc.tokens);

    const localActiveIds = new Set(local.filter(t => !t.is_deleted).map(t => t.id));
    const added = merged.filter(t => !t.is_deleted && !localActiveIds.has(t.id)).length;

    app.globalData.tokens = merged;
    saveTokensLocal(merged);
    wx.setStorageSync('ak_last_sync_time', new Date().toISOString());
    console.log(`[SYNC] pullFromCloud: ${added} new tokens added`);
    return { success: true, added, merged };
  } catch (err) {
    console.error('[SYNC] pullFromCloud failed:', err);
    return { success: false, reason: 'error', error: err };
  }
}

// Merge cloud tokens into local state.
// Rule 4: local soft-delete is FINAL — cloud cannot restore it.
// Rule (conflict): local always wins when both have the token.
function mergeCloudToLocal(local, cloud) {
  const localMap = new Map(local.map(t => [t.id, t]));

  for (const ct of cloud) {
    const lt = localMap.get(ct.id);
    if (!lt) {
      // Cloud has a token we don't → add it if not deleted on cloud side
      if (!ct.is_deleted) {
        localMap.set(ct.id, ct);
      }
    } else if (lt.is_deleted) {
      // Rule 4: local soft-delete is final. Cloud cannot restore it.
      // Keep local deleted state as-is.
    }
    // else: both exist and local is active → local wins (Rule 1 conflict)
  }

  return Array.from(localMap.values());
}

// ── sync ───────────────────────────────────────────────────────
// Full sync cycle: processQueue first, then pullFromCloud if queue is empty.

async function sync() {
  const qResult = await processQueue();
  let pullResult = null;

  // Rule 3: only pull after queue is drained
  if (!getQueue().hasPending()) {
    pullResult = await pullFromCloud();
  }

  return { queue: qResult, pull: pullResult };
}

// ── Soft Delete / Restore ──────────────────────────────────────

function softDeleteToken(tokenId) {
  const tokens = app.globalData.tokens || [];
  if (!tokens.find(t => t.id === tokenId)) return tokens;

  const updated = tokens.map(t => t.id === tokenId
    ? { ...t, is_deleted: true, deleted_at: new Date().toISOString() }
    : t);

  app.globalData.tokens = updated;
  saveTokensLocal(updated);
  queueDelete(tokenId);
  return updated;
}

// Rule 5: 重新添加软删除记录，则恢复为正常状态
function restoreToken(tokenId) {
  const tokens = app.globalData.tokens || [];
  const token = tokens.find(t => t.id === tokenId);
  if (!token) return tokens;

  const restored = { ...token, is_deleted: false, deleted_at: null };
  const updated = tokens.map(t => t.id === tokenId ? restored : t);

  app.globalData.tokens = updated;
  saveTokensLocal(updated);
  queueRestore(restored);
  return updated;
}

// ── Auto Sync ──────────────────────────────────────────────────

function startAutoSync(onResult) {
  if (!app.globalData.loggedIn) return null;

  const syncEnabled = wx.getStorageSync('ak_sync_enabled') !== false;
  if (!syncEnabled) {
    console.log('[SYNC] Auto sync disabled by user');
    return null;
  }

  // Network listener for auto-resume (Rule: 网络恢复后自动继续)
  startNetworkListener(async () => {
    const result = await sync();
    if (onResult) onResult(result.pull || { success: false });
  });

  // Immediate sync on start
  sync().then(result => {
    if (onResult) onResult(result.pull || { success: false });
  });

  // Periodic sync
  const timer = setInterval(async () => {
    if (wx.getStorageSync('ak_sync_enabled') === false) {
      clearInterval(timer);
      return;
    }
    const result = await sync();
    if (onResult) onResult(result.pull || { success: false });
  }, SYNC_INTERVAL);

  return timer;
}

module.exports = {
  SYNC_INTERVAL,
  SyncTaskType,
  getQueue,
  queueAdd,
  queueUpdate,
  queueDelete,
  queueRestore,
  processQueue,
  pullFromCloud,
  sync,
  softDeleteToken,
  restoreToken,
  startAutoSync,
  saveTokensLocal,
  debugCloudData,
};

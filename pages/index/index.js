const app = getApp();
const { totp, timeLeft } = require('../../utils/totp');
const { saveTheme } = require('../../utils/storage');
const { encryptData, decryptData } = require('../../utils/crypto');
const { createQRCode, drawQRCode } = require('../../utils/qrcode');
const {
  sync,
  processQueue,
  pullFromCloud,
  startAutoSync,
  softDeleteToken,
  restoreToken,
  queueAdd,
  queueUpdate,
  getQueue,
  saveTokensLocal,
} = require('../../utils/sync');

Page({
  data: {
    screen: 'home',
    accentColor: '#4080D0',
    tokens: [],
    otpMap: {},
    timeLeft: 30,
    searching: false,
    searchQ: '',
    filteredTokens: [],
    navVisible: true,
    homeLastScrollY: 0,
    profileLastScrollY: 0,
    scanTab: 'camera',
    scanForm: { brand: '', account: '', secret: '' },
    scanErrors: {},
    scanScanned: false,
    scanScanning: false,
    editToken: null,
    editForm: { brand: '', account: '' },
    editSecretMask: '',
    confirmDelete: false,
    showLoginModal: false,
    showBackupModal: false,
    showImportModal: false,
    showThemeModal: false,
    backupPw: '',
    backupPw2: '',
    importPw: '',
    importFileName: '',
    importRaw: '',
    toast: '',
    toastType: 'success',
    loggedIn: false,
    userInfo: null,
    showAccountModal: false,
    THEMES: [],
    currentTheme: { name: '海洋蓝', color: '#4080D0' },
    scrollTop: 0,
    editSecretVisible: false,
    deleteTarget: null,
    showDeleteModal: false,
    loginAvatar: '',
    loginNickname: '',
    loginPrivacyAgreed: false,
    showQRCodeModal: false,
    qrCodeUrl: '',
    qrCodeCanvas: null,
    lastSyncTime: '',
    pendingSyncCount: 0,
    syncStatus: 'idle',
    showSyncModal: false,
    syncEnabled: true,  // 默认开启自动同步
    pendingUploadCount: 0,  // 待上传的新数据数量
  },

  _totpTimer: null,
  _toastTimer: null,
  _autoSyncTimer: null,

  onLoad() {
    const gd = app.globalData;
    // 过滤软删除的token用于显示
    const activeTokens = gd.tokens.filter(t => !t.is_deleted);

    // 加载同步状态
    const lastSyncTimestamp = wx.getStorageSync('ak_last_sync_time');
    const lastSyncTime = lastSyncTimestamp ? new Date(lastSyncTimestamp).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) : '';

    const pendingCount = getQueue().getPendingCount();
    const syncEnabled = wx.getStorageSync('ak_sync_enabled') !== false;

    this.setData({
      tokens: gd.tokens,
      filteredTokens: activeTokens,
      accentColor: gd.theme.color,
      currentTheme: gd.theme,
      loggedIn: gd.loggedIn,
      userInfo: gd.userInfo,
      THEMES: gd.THEMES,
      lastSyncTime,
      pendingSyncCount: pendingCount,
      pendingUploadCount: pendingCount,
      syncEnabled,
    });
    this._updateOtpMap();
    // 登录后开启云同步：先拉取（避免与自动同步竞态），再启动定时器
    if (gd.loggedIn) {
      this._cloudRestore().then(() => this._startAutoSync());
    }
    this._totpTimer = setInterval(() => {
      const tl = timeLeft();
      this.setData({ timeLeft: tl });
      if (tl === 30) this._updateOtpMap();
    }, 1000);
  },

  onUnload() {
    if (this._totpTimer) clearInterval(this._totpTimer);
    if (this._toastTimer) clearTimeout(this._toastTimer);
    if (this._autoSyncTimer) clearInterval(this._autoSyncTimer);
  },

  onShareAppMessage() {
    return {
      title: '星枢令 - TOTP 身份验证器',
      path: '/pages/index/index',
      imageUrl: '/images/logo-share.jpg'
    };
  },

  _filterTokens() {
    const q = this.data.searchQ.toLowerCase();
    // 排除软删除的token
    const activeTokens = this.data.tokens.filter(t => !t.is_deleted);
    const filtered = !q ? activeTokens : activeTokens.filter(t =>
      t.brand.toLowerCase().includes(q) || t.account.toLowerCase().includes(q)
    );
    this.setData({ filteredTokens: filtered });
  },

  _updateOtpMap() {
    const map = {};
    // 只为活跃token生成OTP（排除软删除）
    const activeTokens = this.data.tokens.filter(t => !t.is_deleted);
    for (const t of activeTokens) {
      map[t.id] = {
        current: totp(t.secret, 0),
        next:    totp(t.secret, 1),
      };
    }
    this.setData({ otpMap: map });
  },

  showToast(msg, type) {
    if (this._toastTimer) clearTimeout(this._toastTimer);
    const toastType = type || (msg.includes('失败') || msg.includes('取消') || msg.includes('无法') ? 'error' : 'success');
    this.setData({ toast: msg, toastType: toastType });
    this._toastTimer = setTimeout(() => this.setData({ toast: '' }), 2200);
  },

  // ── Navigation ──────────────────────────────────────────────
  onNavigate(e) {
    const { screen } = e.detail;
    // 添加功能需要登录
    if (screen === 'scan' && !this.data.loggedIn) {
      wx.showModal({
        title: '请先登录',
        content: '添加账号需要先登录。登录后可使用云端同步功能。',
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.onLoginOpen();
          }
        }
      });
      return;
    }
    if (screen === this.data.screen) return;
    this.setData({
      screen,
      navVisible: true,
      homeLastScrollY: 0,
      profileLastScrollY: 0,
      searching: false,
      searchQ: '',
    });
    if (screen === 'home') this._filterTokens();
    // 进入扫码页面时直接调用摄像头扫码
    if (screen === 'scan') {
      setTimeout(() => this.onScanCamera(), 100);
    }
  },

  // ── Scroll (Home) ───────────────────────────────────────────
  onHomeScroll(e) {
    const y = e.detail.scrollTop;
    const last = this.data.homeLastScrollY;
    if (y < 30) {
      this.setData({ navVisible: true, homeLastScrollY: y });
      return;
    }
    this.setData({ navVisible: y <= last, homeLastScrollY: y });
  },

  // ── Scroll (Profile) ─────────────────────────────────────────
  onProfileScroll(e) {
    const y = e.detail.scrollTop;
    const last = this.data.profileLastScrollY;
    if (y < 30) {
      this.setData({ navVisible: true, profileLastScrollY: y });
      return;
    }
    this.setData({ navVisible: y <= last, profileLastScrollY: y });
  },

  // ── Search ──────────────────────────────────────────────────
  onSearchToggle() {
    const searching = !this.data.searching;
    this.setData({
      searching,
      searchQ: '',
      screen: 'home',
      homeLastScrollY: 0,
    });
    if (!searching) { this._filterTokens(); }
  },
  onSearchClose() {
    this.setData({ searching: false, searchQ: '' });
    this._filterTokens();
  },
  onSearchClear() {
    this.setData({ searching: false, searchQ: '' });
    this._filterTokens();
  },
  onSearchInput(e) {
    this.setData({ searchQ: e.detail.value });
    this._filterTokens();
  },

  // ── Copy OTP ────────────────────────────────────────────────
  onCopyOtp(e) {
    const { token, code } = e.detail;
    if (!code || code === '------') {
      this.showToast('验证码无效，无法复制', 'error');
      return;
    }
    wx.setClipboardData({
      data: code,
      success: () => {
        this.showToast(`已复制 ${token.brand} 验证码`);
      },
      fail: (err) => {
        console.error('复制失败:', err);
        this.showToast(`复制失败: ${err.errMsg || '未知错误'}`, 'error');
      },
    });
  },

  // ── Edit Token ──────────────────────────────────────────────
  onEditToken(e) {
    const { token } = e.detail;
    this.setData({
      editToken: token,
      editForm: { brand: token.brand, account: token.account },
      editSecretMask: '*'.repeat(Math.min(token.secret.length, 20)),
      editSecretVisible: false,
      confirmDelete: false,
    });
  },

  onEditFormInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`editForm.${field}`]: e.detail.value });
  },

  onSaveEdit() {
    const { editToken, editForm, tokens } = this.data;
    if (!editToken) return;
    const updatedToken = { ...editToken, brand: editForm.brand, account: editForm.account };
    const updated = tokens.map(t => t.id === editToken.id ? updatedToken : t);
    app.globalData.tokens = updated;
    saveTokensLocal(updated);
    if (this.data.loggedIn) queueUpdate(updatedToken);
    const pendingCount = getQueue().getPendingCount();
    this.setData({ tokens: updated, editToken: null, pendingSyncCount: pendingCount, pendingUploadCount: pendingCount });
    this._filterTokens();
    this._updateOtpMap();
    this.showToast('已保存');
    if (this.data.loggedIn) processQueue();
  },

  requestDeleteToken() {
    const { editToken } = this.data;
    if (!editToken) return;
    this.setData({
      deleteTarget: { id: editToken.id, brand: editToken.brand, is_deleted: editToken.is_deleted },
      showDeleteModal: true,
    });
  },

  // 软删除并自动入队（有网则立即同步）
  _doSoftDelete(toastMsg) {
    const { deleteTarget } = this.data;
    if (!deleteTarget) return;

    const updated = softDeleteToken(deleteTarget.id);
    const pendingCount = getQueue().getPendingCount();
    this.setData({
      tokens: updated,
      filteredTokens: updated.filter(t => !t.is_deleted),
      editToken: null, deleteTarget: null, showDeleteModal: false,
      pendingSyncCount: pendingCount, pendingUploadCount: pendingCount,
    });
    this._updateOtpMap();
    this.showToast(toastMsg);
    if (this.data.loggedIn) processQueue();
  },

  executeDelete()      { this._doSoftDelete('已删除'); },
  executeDeleteCloud() { this._doSoftDelete('已删除(本地+云端)'); },

  // 仅本地删除：物理删除，不入队（云端保留）
  executeDeleteLocal() {
    const { deleteTarget, tokens } = this.data;
    if (!deleteTarget) return;

    const updated = tokens.filter(t => t.id !== deleteTarget.id);
    app.globalData.tokens = updated;
    saveTokensLocal(updated);

    this.setData({
      tokens: updated,
      filteredTokens: updated.filter(t => !t.is_deleted),
      editToken: null, deleteTarget: null, showDeleteModal: false,
    });
    this._filterTokens();
    this._updateOtpMap();
    this.showToast('已删除(仅本地)');
  },

  // 本地+云端删除：与 executeDelete 相同（软删除自动同步）
  executeDeleteCloud() {
    this.executeDelete();
    this.showToast('已删除(本地+云端)');
  },

  cancelDelete() {
    this.setData({ deleteTarget: null, showDeleteModal: false });
  },

  onConfirmDelete() { this.setData({ confirmDelete: true }); },
  onCancelDelete()  { this.setData({ confirmDelete: false }); },

  onToggleEditSecret() {
    this.setData({ editSecretVisible: !this.data.editSecretVisible });
  },

  // 显示Secret Key的QR码
  onShowQRCode() {
    if (!this.data.editToken) return;
    const token = this.data.editToken;
    // otpauth URI: use raw label values so QR data stays short and compatible.
    // Percent-encoding in the path is spec-compliant but many TOTP apps also
    // accept (and prefer) the unencoded form; raw is shorter → smaller QR.
    // Per Key Uri Format spec: encode issuer and account independently,
    // then join with ':' as separator in the path. Add standard params for
    // maximum compatibility with Google Authenticator, Authy, etc.
    const issuerEncoded = encodeURIComponent(token.brand);
    const accountEncoded = encodeURIComponent(token.account);
    const secret = token.secret;
    const otpauthUrl = `otpauth://totp/${issuerEncoded}:${accountEncoded}?secret=${secret}&issuer=${issuerEncoded}&algorithm=SHA1&digits=6&period=30`;
    console.log('[QR-GEN] otpauth URL:', otpauthUrl);
    console.log('[QR-GEN] URL length:', otpauthUrl.length, 'bytes');
    this.setData({ showQRCodeModal: true, qrCodeUrl: otpauthUrl });
    // 绘制QR码
    setTimeout(() => this._drawQRCode(otpauthUrl), 100);
  },

  onCloseQRCode() {
    this.setData({ showQRCodeModal: false, qrCodeUrl: '' });
  },

  // 绘制QR码到Canvas
  _drawQRCode(url) {
    const query = wx.createSelectorQuery().in(this);
    query.select('#qrcode-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          this.showToast('QR码画布未找到', 'error');
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          this.showToast('QR码上下文获取失败', 'error');
          return;
        }
        const { pixelRatio: dpr = 1 } = wx.getWindowInfo();
        const canvasWidth = res[0].width || 256;
        const canvasHeight = res[0].height || 256;
        canvas.width = canvasWidth * dpr;
        canvas.height = canvasHeight * dpr;
        ctx.scale(dpr, dpr);
        try {
          const qrData = createQRCode(url, 'M');
          console.log('[QR-DRAW] version:', qrData.version, 'moduleCount:', qrData.moduleCount, 'canvasSize:', canvasWidth, 'moduleSize:', Math.floor(canvasWidth / qrData.moduleCount), 'px');
          drawQRCode(ctx, qrData, canvasWidth);
          console.log('[QR-DRAW] draw complete');
        } catch (e) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);
          ctx.fillStyle = '#ff0000';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('QR码生成失败', canvasWidth / 2, canvasWidth / 2 - 10);
          ctx.fillText(e.message.substring(0, 30), canvasWidth / 2, canvasWidth / 2 + 10);
        }
      });
  },

  onCloseEdit() { this.setData({ editToken: null }); },

  // ── Scan View ───────────────────────────────────────────────
  onScanTabChange(e) {
    this.setData({ scanTab: e.currentTarget.dataset.tab });
  },

  onScanCamera() {
    if (this.data.scanScanning) return;
    this.setData({ scanScanning: true });
    wx.scanCode({
      onlyFromCamera: true,
      success: (res) => {
        console.log('[SCAN] camera result:', res.result);
        this._parseScanResult(res.result);
        this.setData({ scanScanning: false });
      },
      fail: (err) => {
        console.log('[SCAN] camera fail:', JSON.stringify(err));
        this.setData({ scanScanning: false });
        this.showToast('扫码取消');
      },
    });
  },

  onScanAlbum() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (r) => {
        console.log('[SCAN] album result:', r.result);
        this._parseScanResult(r.result);
      },
      fail: (err) => {
        console.log('[SCAN] album fail:', JSON.stringify(err));
        this.showToast('未识别到二维码');
      },
    });
  },

  _parseScanResult(result) {
    console.log('[PARSE] raw result:', result);
    try {
      if (!result || result.indexOf('otpauth://totp/') !== 0) throw new Error('not otpauth: got "' + String(result).substring(0, 80) + '"');
      const after = result.substring('otpauth://totp/'.length);
      const qIdx = after.indexOf('?');
      const label = qIdx >= 0 ? after.substring(0, qIdx) : after;
      const queryStr = qIdx >= 0 ? after.substring(qIdx + 1) : '';

      const params = {};
      if (queryStr) {
        queryStr.split('&').forEach(p => {
          const eqIdx = p.indexOf('=');
          if (eqIdx > 0) {
            params[p.substring(0, eqIdx)] = decodeURIComponent(p.substring(eqIdx + 1));
          }
        });
      }

      const decoded = decodeURIComponent(label);
      const account = decoded.includes(':') ? decoded.split(':')[1] : decoded;
      const brand = params.issuer || (decoded.includes(':') ? decoded.split(':')[0] : decoded);

      const secret = (params.secret || '').trim().toUpperCase();
      console.log('[PARSE] brand:', brand, 'account:', account, 'secret:', secret ? secret.substring(0, 4) + '***' : '(empty)', 'params:', JSON.stringify(params));
      if (!secret) { this.showToast('二维码中未找到密钥'); return; }

      // 去重检查：检查secret是否已存在
      const existingToken = this.data.tokens.find(t => t.secret === secret);
      if (existingToken) {
        if (existingToken.is_deleted) {
          const restored = restoreToken(existingToken.id);
          this.setData({ tokens: restored });
          this._filterTokens();
          this._updateOtpMap();
          this.showToast(`已恢复 ${existingToken.brand}`);
          if (this.data.loggedIn) processQueue();
          return;
        }
        this.showToast(`${existingToken.brand} 已存在`, 'warning');
        return;
      }

      const tok = {
        id: Date.now().toString(),
        brand: (brand || '').trim(),
        account: (account || '').trim(),
        secret,
        created_at: new Date().toISOString(),
      };
      const updated = [...this.data.tokens, tok];
      app.globalData.tokens = updated;
      saveTokensLocal(updated);
      if (this.data.loggedIn) queueAdd(tok);
      const pendingCount = getQueue().getPendingCount();
      this.setData({
        tokens: updated, screen: 'home',
        scanForm: { brand: '', account: '', secret: '' },
        scanScanned: false, scanTab: 'camera',
        pendingSyncCount: pendingCount, pendingUploadCount: pendingCount,
      });
      this._filterTokens();
      this._updateOtpMap();
      this.showToast(`已添加 ${tok.brand}`);
      if (this.data.loggedIn) processQueue();
    } catch (e) {
      console.error('[PARSE] error:', e.message, 'raw result was:', String(result).substring(0, 120));
      this.showToast('无法解析二维码（仅支持 otpauth 格式）');
    }
  },

  onScanFormInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`scanForm.${field}`]: e.detail.value, [`scanErrors.${field}`]: '' });
  },

  onAddToken() {
    const { scanForm, tokens, loggedIn } = this.data;
    const errors = {};
    if (!scanForm.brand.trim()) errors.brand = '请输入品牌名称';
    if (!scanForm.secret.trim()) errors.secret = '请输入 Secret Key';
    if (Object.keys(errors).length) { this.setData({ scanErrors: errors }); return; }

    const secret = scanForm.secret.trim().toUpperCase();

    // 去重检查：检查secret是否已存在
    const existingToken = tokens.find(t => t.secret === secret);
    if (existingToken) {
      if (existingToken.is_deleted) {
        const restored = restoreToken(existingToken.id);
        this.setData({ tokens: restored, screen: 'home' });
        this._filterTokens();
        this._updateOtpMap();
        this.showToast(`已恢复 ${existingToken.brand}`);
        if (loggedIn) processQueue();
        return;
      }
      this.showToast(`${existingToken.brand} 已存在`, 'warning');
      return;
    }

    const tok = {
      id: Date.now().toString(),
      brand:   scanForm.brand.trim(),
      account: scanForm.account.trim(),
      secret,
      created_at: new Date().toISOString(),
    };
    const updated = [...this.data.tokens, tok];
    app.globalData.tokens = updated;
    saveTokensLocal(updated);
    if (loggedIn) queueAdd(tok);
    const pendingCount = getQueue().getPendingCount();
    this.setData({
      tokens: updated, screen: 'home',
      scanForm: { brand: '', account: '', secret: '' },
      scanErrors: {}, scanScanned: false, scanTab: 'camera',
      pendingSyncCount: pendingCount, pendingUploadCount: pendingCount,
    });
    this.setData({ scrollTop: 0.1 });
    setTimeout(() => { this.setData({ scrollTop: 0 }); }, 50);
    this._filterTokens();
    this._updateOtpMap();
    this.showToast(`已添加 ${tok.brand}`);
    if (loggedIn) processQueue();
  },

  onCloseScan() {
    this.setData({
      screen: 'home',
      scanForm: { brand: '', account: '', secret: '' },
      scanErrors: {}, scanScanned: false, scanTab: 'camera',
    });
  },

  // ── Cloud Backup & Sync ─────────────────────────────────────

  async _cloudRestore() {
    if (!this.data.loggedIn) return { success: false, added: 0 };
    const result = await pullFromCloud();
    if (result.success) {
      if (result.merged) {
        this.setData({ tokens: result.merged });
        this._filterTokens();
        this._updateOtpMap();
      }
      const pendingCount = getQueue().getPendingCount();
      this.setData({ pendingSyncCount: pendingCount, pendingUploadCount: pendingCount });
      if (result.added > 0) {
        this.showToast(`从云端同步 ${result.added} 个账号`);
      }
    }
    return result;
  },

  _autoSyncTimer: null,

  _startAutoSync() {
    if (!this.data.loggedIn) return;
    if (!this.data.syncEnabled) return;

    if (this._autoSyncTimer) { clearInterval(this._autoSyncTimer); this._autoSyncTimer = null; }

    this._autoSyncTimer = startAutoSync((result) => {
      if (result && result.success && result.merged) {
        this.setData({ tokens: result.merged });
        this._filterTokens();
        this._updateOtpMap();
      }
      const pendingCount = getQueue().getPendingCount();
      this.setData({ pendingSyncCount: pendingCount, pendingUploadCount: pendingCount });
    });
  },

  // ── Profile Menu ────────────────────────────────────────────
  onMenuTap(e) {
    const { id, locked } = e.currentTarget.dataset;
    if (locked && !this.data.loggedIn) return;

    // 云同步/备份/导入功能需要登录
    if (id === 'sync' || id === 'backup' || id === 'import') {
      if (!this.data.loggedIn) {
        wx.showModal({
          title: '请先登录',
          content: '云端功能需要先登录才能使用。',
          confirmText: '去登录',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              this.onLoginOpen();
            }
          }
        });
        return;
      }
    }

    if (id === 'backup') {
      this.setData({ showBackupModal: true, backupPw: '', backupPw2: '' });
    } else if (id === 'import') {
      this.setData({ showImportModal: true, importPw: '', importFileName: '', importRaw: '' });
    } else if (id === 'theme') this.setData({ showThemeModal: true });
    else if (id === 'sync') this.setData({ showSyncModal: true });
    else if (id === 'feedback') wx.navigateTo({ url: '/pages/feedback/feedback' });
    else if (id === 'account') {
      if (this.data.loggedIn) {
        this.onShowAccount();
      } else {
        this.onLoginOpen();
      }
    }
  },

  onLogout() {
    // 只清除登录状态，保留用户信息（下次登录可自动填充）
    app.globalData.loggedIn = false;
    // 不清除userInfo，保留记忆功能
    this.setData({ loggedIn: false });
    this.showToast('已退出登录');
  },

  // ── Login (简化：头像昵称设置) ───────────────────────────────────────────
  onLoginOpen() {
    // 加载已保存的用户信息（自动填充上次登录信息）
    const savedUserInfo = app.globalData.userInfo;
    const savedAvatar = savedUserInfo?.avatar || '';
    const savedNickname = savedUserInfo?.name || '';

    this.setData({
      showLoginModal: true,
      loginAvatar: savedAvatar,
      loginNickname: savedNickname,
      loginPrivacyAgreed: false  // 隐私协议必须用户手动勾选，绝不自动勾选
    });
  },

  // 登录隐私协议开关（同意后自动生成随机昵称）
  onLoginPrivacyToggle() {
    const newAgreed = !this.data.loginPrivacyAgreed;
    this.setData({ loginPrivacyAgreed: newAgreed });

    // 用户首次同意协议时，如果没有昵称且没有保存的信息，自动生成随机昵称
    if (newAgreed && !this.data.loginNickname && !app.globalData.userInfo) {
      const randomNickname = this._generateRandomNickname();
      this.setData({ loginNickname: randomNickname });
    }
  },

  // 生成随机昵称
  _generateRandomNickname() {
    const prefixes = ['星', '月', '云', '风', '雪', '雨', '霜', '露', '虹', '霞', '晨', '暮', '春', '夏', '秋', '冬'];
    const suffixes = ['令', '钥', '枢', '钥', '钥', '钥', '钥', '钥'];
    const numbers = Math.floor(Math.random() * 1000);
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    return `${prefix}${suffix}${numbers}`;
  },

  onChooseAvatar(e) {
    // 检查隐私协议是否已同意
    if (!this.data.loginPrivacyAgreed) {
      this.showToast('请先同意隐私保护协议', 'error');
      return;
    }
    const avatarUrl = e.detail.avatarUrl;
    this.setData({ loginAvatar: avatarUrl });
  },

  // 昵称获取（微信自动填充）
  onNicknameInput(e) {
    const nickname = e.detail.value;
    this.setData({ loginNickname: nickname });
  },

  // 使用微信昵称
  onUseWxNickname(e) {
    const nickname = e.detail.value;
    if (nickname) {
      this.setData({ loginNickname: nickname });
      this.showToast('已使用微信昵称');
    }
  },

  // 昵称输入框聚焦时检查隐私协议
  onNicknameFocus() {
    if (!this.data.loginPrivacyAgreed) {
      this.showToast('请先同意隐私保护协议', 'error');
      return;
    }
  },

  // 保存头像昵称设置（无需手机号）
  onSaveProfile() {
    if (!this.data.loginPrivacyAgreed) {
      this.showToast('请先同意隐私保护协议', 'error');
      return;
    }
    if (!this.data.loginAvatar) {
      this.showToast('请先选择头像', 'error');
      return;
    }
    if (!this.data.loginNickname.trim()) {
      this.showToast('昵称不能为空', 'error');
      return;
    }
    const info = { name: this.data.loginNickname.trim(), avatar: this.data.loginAvatar };
    app.saveUserInfo(info);
    this.setData({ loggedIn: true, userInfo: info, showLoginModal: false, loginAvatar: '', loginNickname: '', loginPrivacyAgreed: false });
    this.showToast('设置成功');
  },

  // 暂不设置，跳过登录
  onSkipLogin() {
    this.setData({ showLoginModal: false, loginAvatar: '', loginNickname: '', loginPrivacyAgreed: false });
    this.showToast('您可随时在「我的」设置头像昵称');
  },

  onCloseLogin() {
    this.setData({ showLoginModal: false, loginAvatar: '', loginNickname: '', loginPrivacyAgreed: false });
  },

  // ── Account Info ────────────────────────────────────────────
  onShowAccount() { this.setData({ showAccountModal: true }); },
  onCloseAccount() { this.setData({ showAccountModal: false }); },

  // 从账号管理页面修改昵称
  onEditNicknameFromAccount() {
    this.setData({
      showAccountModal: false,
      showLoginModal: true,
      loginAvatar: this.data.userInfo?.avatar || '',
      loginNickname: this.data.userInfo?.name || '',
      loginPrivacyAgreed: false,  // 隐私协议必须用户手动勾选
    });
  },

  // 备份功能
  onBackupPwInput(e)  { this.setData({ backupPw: e.detail.value }); },
  onBackupPw2Input(e) { this.setData({ backupPw2: e.detail.value }); },
  onDoBackup() {
    const { backupPw, backupPw2, tokens } = this.data;
    if (!backupPw) {
      this.showToast('请输入备份密码', 'error');
      return;
    }
    if (backupPw !== backupPw2) {
      this.showToast('两次输入的密码不一致', 'error');
      return;
    }
    try {
      const data = encryptData(tokens, backupPw);
      const fs = wx.getFileSystemManager();
      // Use a fixed filename so each backup overwrites the previous one.
      // Timestamped filenames accumulate and exhaust the 10 MB storage quota.
      const fileName = 'auth_backup.atbk';
      const path = `${wx.env.USER_DATA_PATH}/${fileName}`;
      // Remove stale file before writing to avoid "size limit exceeded" on rewrite.
      try { fs.unlinkSync(path); } catch (_) {}
      // Also clean up any old timestamped backup files from earlier app versions.
      try {
        const files = fs.readdirSync(wx.env.USER_DATA_PATH);
        files.forEach(f => {
          if (/^auth_backup_\d+\.atbk$/.test(f)) {
            try { fs.unlinkSync(`${wx.env.USER_DATA_PATH}/${f}`); } catch (_) {}
          }
        });
      } catch (_) {}
      fs.writeFileSync(path, data, 'utf8');
      this.setData({ showBackupModal: false, backupPw: '', backupPw2: '' });
      this.showToast(`已备份 ${tokens.length} 个账号`);
      if (wx.shareFileMessage) {
        wx.shareFileMessage({
          filePath: path,
          fileName: fileName,
          success: () => this.showToast('分享成功'),
          fail: () => {
            wx.showModal({
              title: '备份文件已生成',
              content: `文件路径：${path}\n\n您可以手动在文件管理中分享此文件`,
              showCancel: false,
              confirmText: '知道了',
            });
          },
        });
      } else {
        wx.showModal({
          title: '备份文件已生成',
          content: `文件路径：${path}\n\n当前环境不支持直接分享，请手动复制文件`,
          showCancel: false,
          confirmText: '知道了',
        });
      }
    } catch (err) {
      console.error('Backup failed:', err);
      this.showToast('备份失败: ' + (err.message || '未知错误'), 'error');
    }
  },
  onCloseBackup() { this.setData({ showBackupModal: false }); },

  // ── Import ──────────────────────────────────────────────────
  onImportFileSelect() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const file = res.tempFiles[0];
        const fs = wx.getFileSystemManager();
        try {
          const raw = fs.readFileSync(file.path, 'utf8');
          this.setData({ importFileName: file.name, importRaw: raw });
        } catch (e) {
          this.showToast('读取文件失败');
        }
      },
      fail: () => { this.showToast('选择文件取消'); },
    });
  },
  onImportPwInput(e) { this.setData({ importPw: e.detail.value }); },
  onDoImport() {
    const { importRaw, importPw, tokens } = this.data;
    if (!importRaw || !importPw) return;
    try {
      const data = decryptData(importRaw, importPw);
      if (!Array.isArray(data)) throw new Error('invalid');
      const existingIds = new Set(tokens.map(t => t.id));
      const imported = data.filter(t => !existingIds.has(t.id));
      const merged = [...tokens, ...imported];
      app.globalData.tokens = merged;
      saveTokensLocal(merged);
      if (this.data.loggedIn) imported.forEach(tok => queueAdd(tok));
      const pendingCount = getQueue().getPendingCount();
      this.setData({ tokens: merged, showImportModal: false, pendingSyncCount: pendingCount, pendingUploadCount: pendingCount });
      this._filterTokens();
      this._updateOtpMap();
      this.showToast(`成功导入 ${imported.length} 个账号`);
      if (this.data.loggedIn && imported.length > 0) processQueue();
    } catch (e) {
      this.showToast('解密失败，请检查密码');
    }
  },
  onCloseImport() { this.setData({ showImportModal: false }); },

  // ── Theme ───────────────────────────────────────────────────
  onThemeSelect(e) {
    const { idx } = e.currentTarget.dataset;
    const theme = this.data.THEMES[idx];
    app.globalData.theme = theme;
    saveTheme(theme);
    this.setData({ accentColor: theme.color, currentTheme: theme, showThemeModal: false });
  },
  onCloseTheme() { this.setData({ showThemeModal: false }); },

  // 手动同步
  async onManualSync() {
    // 检查登录状态
    if (!this.data.loggedIn) {
      wx.showModal({
        title: '请先登录',
        content: '同步功能需要先登录才能使用。',
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.onLoginOpen();
          }
        }
      });
      return;
    }

    this.showToast('正在同步...');

    try {
      const result = await sync();

      if (result.pull && result.pull.merged) {
        this.setData({ tokens: result.pull.merged });
        this._filterTokens();
        this._updateOtpMap();
      }

      const now = new Date();
      const lastSyncTime = now.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const pendingCount = getQueue().getPendingCount();
      this.setData({ lastSyncTime, pendingSyncCount: pendingCount, pendingUploadCount: pendingCount });

      this.showToast(result.queue.processed > 0 ? `同步成功，上传 ${result.queue.processed} 条` : '同步成功');
    } catch (err) {
      console.error('Manual sync failed:', err);
      this.showToast('同步失败', 'error');
    }
  },

  // ── Sync Config Modal ─────────────────────────────────────────
  onCloseSync() { this.setData({ showSyncModal: false }); },

  onToggleSync() {
    const newEnabled = !this.data.syncEnabled;
    wx.setStorageSync('ak_sync_enabled', newEnabled);
    this.setData({ syncEnabled: newEnabled });
    this.showToast(newEnabled ? '自动同步已开启' : '自动同步已关闭');

    // 如果开启，重新启动自动同步
    if (newEnabled && this.data.loggedIn) {
      this._startAutoSync();
    } else if (!newEnabled && this._autoSyncTimer) {
      clearInterval(this._autoSyncTimer);
      this._autoSyncTimer = null;
    }
  },

  async onSyncToLocal() {
    if (!this.data.loggedIn) {
      this.showToast('请先登录', 'error');
      return;
    }

    // 先检查是否有待上传任务（用队列真实状态，避免UI数据过期）
    const livePending = getQueue().getPendingCount();
    if (livePending > 0) {
      wx.showModal({
        title: '提示',
        content: `您有 ${livePending} 条本地变更未上传。\n请先上传，再从云端同步。`,
        confirmText: '先上传',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.onUploadToCloud();
          }
        }
      });
      return;
    }

    this.setData({ syncStatus: 'syncing' });
    this.showToast('正在同步...');

    try {
      // 从云端恢复
      const result = await this._cloudRestore();

      // 更新同步时间
      const now = new Date();
      wx.setStorageSync('ak_last_sync_time', now.getTime());
      const lastSyncTime = now.toLocaleString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const pendingCount = getQueue().getPendingCount();
      this.setData({
        lastSyncTime,
        pendingSyncCount: pendingCount,
        pendingUploadCount: pendingCount,
        syncStatus: 'idle',
      });

      if (result && result.success) {
        if (result.added > 0) {
          this.showToast(`同步成功，新增 ${result.added} 条数据`);
        } else {
          this.showToast('同步成功');
        }
      } else {
        this.showToast('同步失败', 'error');
      }
    } catch (err) {
      console.error('Sync to local failed:', err);
      this.setData({ syncStatus: 'idle' });
      this.showToast('同步失败', 'error');
    }
  },

  async onUploadToCloud() {
    if (!this.data.loggedIn) {
      this.showToast('请先登录', 'error');
      return;
    }

    this.setData({ syncStatus: 'syncing' });
    this.showToast('正在上传...');

    try {
      const result = await processQueue();
      const pendingCount = getQueue().getPendingCount();
      this.setData({ pendingUploadCount: pendingCount, pendingSyncCount: pendingCount, syncStatus: 'idle' });
      this.showToast(result.processed > 0 ? `上传成功，${result.processed} 条` : '已是最新');
    } catch (err) {
      console.error('Upload to cloud failed:', err);
      this.setData({ syncStatus: 'idle' });
      this.showToast('上传失败', 'error');
    }
  },

  _countPendingUploads() {
    return getQueue().getPendingCount();
  },
});
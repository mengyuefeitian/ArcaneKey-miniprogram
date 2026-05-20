const app = getApp();
const { totp, timeLeft } = require('../../utils/totp');
const { saveTokens, saveTheme } = require('../../utils/storage');
const { encryptData, decryptData } = require('../../utils/crypto');

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
    isMember: false,
    memberExpiryText: '',
    showAccountModal: false,
    privacyAgreed: false,
    THEMES: [],
    currentTheme: { name: '海洋蓝', color: '#4080D0' },
    scrollTop: 0,
    editSecretVisible: false,
    deleteTarget: null,
    showDeleteModal: false,
    loginStep: 1,
    loginAvatar: '',
    loginNickname: '',
  },

  _totpTimer: null,
  _toastTimer: null,
  _autoSyncTimer: null,

  onLoad() {
    const gd = app.globalData;
    this.setData({
      tokens: gd.tokens,
      filteredTokens: gd.tokens,
      accentColor: gd.theme.color,
      currentTheme: gd.theme,
      loggedIn: gd.loggedIn,
      userInfo: gd.userInfo,
      THEMES: gd.THEMES,
      isMember: gd.isMember,
      memberExpiryText: gd.memberExpiry ? gd.memberExpiry.toLocaleDateString('zh-CN') : '',
    });
    this._updateOtpMap();
    if (this.data.isMember) {
      this._cloudRestore();
      this._startAutoSync();
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

  _updateOtpMap() {
    const map = {};
    const tokens = this.data.tokens;
    for (const t of tokens) {
      map[t.id] = {
        current: totp(t.secret, 0),
        next:    totp(t.secret, 1),
      };
    }
    this.setData({ otpMap: map });
  },

  _filterTokens() {
    const q = this.data.searchQ.toLowerCase();
    const filtered = !q ? this.data.tokens : this.data.tokens.filter(t =>
      t.brand.toLowerCase().includes(q) || t.account.toLowerCase().includes(q)
    );
    this.setData({ filteredTokens: filtered });
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
    if (screen === 'scan' && !this.data.loggedIn) {
      this.onLoginOpen();
      this.showToast('扫码功能需要登录后使用');
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
    if (!searching) { this.setData({ filteredTokens: this.data.tokens }); }
  },
  onSearchClose() {
    this.setData({ searching: false, searchQ: '', filteredTokens: this.data.tokens });
  },
  onSearchClear() { this.setData({ searching: false, searchQ: '', filteredTokens: this.data.tokens }); },
  onSearchInput(e) {
    this.setData({ searchQ: e.detail.value });
    this._filterTokens();
  },

  // ── Copy OTP ────────────────────────────────────────────────
  onCopyOtp(e) {
    const { token, code } = e.detail;
    if (!code || code === '------') return;
    wx.setClipboardData({
      data: code,
      success: () => this.showToast(`已复制 ${token.brand} 验证码`),
      fail: () => this.showToast('复制失败'),
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
    const updated = tokens.map(t =>
      t.id === editToken.id ? { ...t, brand: editForm.brand, account: editForm.account } : t
    );
    app.globalData.tokens = updated;
    saveTokens(updated);
    this.setData({ tokens: updated, editToken: null });
    this._filterTokens();
    this._updateOtpMap();
    this.showToast('已保存');
  },

  requestDeleteToken() {
    const { editToken } = this.data;
    if (!editToken) return;
    this.setData({ deleteTarget: { id: editToken.id, brand: editToken.brand }, showDeleteModal: true });
  },

  executeDelete() {
    const { deleteTarget, tokens } = this.data;
    if (!deleteTarget) return;
    const updated = tokens.filter(t => t.id !== deleteTarget.id);
    app.globalData.tokens = updated;
    saveTokens(updated);
    this.setData({ tokens: updated, editToken: null, deleteTarget: null, showDeleteModal: false });
    this._filterTokens();
    this._updateOtpMap();
    this.showToast('已删除');
    // 会员同步删除云端
    if (this.data.isMember) this._cloudDelete(deleteTarget.id);
  },

  executeDeleteLocal() {
    const { deleteTarget, tokens } = this.data;
    if (!deleteTarget) return;
    const updated = tokens.filter(t => t.id !== deleteTarget.id);
    app.globalData.tokens = updated;
    saveTokens(updated);
    this.setData({ tokens: updated, editToken: null, deleteTarget: null, showDeleteModal: false });
    this._filterTokens();
    this._updateOtpMap();
    this.showToast('已删除(仅本地)');
  },

  executeDeleteCloud() {
    const { deleteTarget, tokens } = this.data;
    if (!deleteTarget) return;
    const updated = tokens.filter(t => t.id !== deleteTarget.id);
    app.globalData.tokens = updated;
    saveTokens(updated);
    this.setData({ tokens: updated, editToken: null, deleteTarget: null, showDeleteModal: false });
    this._filterTokens();
    this._updateOtpMap();
    this._cloudDelete(deleteTarget.id);
    this.showToast('已删除(本地+云端)');
  },

  cancelDelete() {
    this.setData({ deleteTarget: null, showDeleteModal: false });
  },

  onConfirmDelete() { this.setData({ confirmDelete: true }); },
  onCancelDelete()  { this.setData({ confirmDelete: false }); },

  onToggleEditSecret() {
    if (!this.data.isMember) return;
    this.setData({ editSecretVisible: !this.data.editSecretVisible });
  },

  onCopySecret() {
    const { editSecretVisible, isMember, editToken } = this.data;
    if (!editSecretVisible || !isMember || !editToken.secret) return;
    wx.setClipboardData({
      data: editToken.secret,
      success: () => { this.showToast('密钥已复制'); },
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
        this._parseScanResult(res.result);
        this.setData({ scanScanning: false });
      },
      fail: () => {
        this.setData({ scanScanning: false });
        this.showToast('扫码取消');
      },
    });
  },

  onScanAlbum() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (r) => this._parseScanResult(r.result),
      fail: () => this.showToast('未识别到二维码'),
    });
  },

  _parseScanResult(result) {
    try {
      if (!result || result.indexOf('otpauth://totp/') !== 0) throw new Error('not otpauth');
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

      // 检查数量限制
      if (!this.data.isMember && this.data.tokens.length >= 5) {
        this.showToast('免费用户最多添加5个口令');
        this.setData({ screen: 'profile' });
        return;
      }

      const secret = (params.secret || '').trim().toUpperCase();
      if (!secret) { this.showToast('二维码中未找到密钥'); return; }

      // 直接添加
      const tok = {
        id: Date.now().toString(),
        brand: (brand || '').trim(),
        account: (account || '').trim(),
        secret,
      };
      const updated = [...this.data.tokens, tok];
      app.globalData.tokens = updated;
      saveTokens(updated);
      this.setData({
        tokens: updated, screen: 'home',
        scanForm: { brand: '', account: '', secret: '' },
        scanScanned: false, scanTab: 'camera',
      });
      this._filterTokens();
      this._updateOtpMap();
      this.showToast(`已添加 ${tok.brand}`);
      // 触发云端备份（会员）
      if (this.data.isMember) this._cloudBackup(updated);
    } catch (e) {
      this.showToast('无法解析二维码（仅支持 otpauth 格式）');
    }
  },

  onScanFormInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`scanForm.${field}`]: e.detail.value, [`scanErrors.${field}`]: '' });
  },

  onAddToken() {
    const { scanForm, tokens, isMember } = this.data;
    if (!isMember && tokens.length >= 5) {
      this.showToast('免费用户最多添加5个口令');
      this.setData({ screen: 'profile' });
      return;
    }
    const errors = {};
    if (!scanForm.brand.trim()) errors.brand = '请输入品牌名称';
    if (!scanForm.secret.trim()) errors.secret = '请输入 Secret Key';
    if (Object.keys(errors).length) { this.setData({ scanErrors: errors }); return; }
    const tok = {
      id: Date.now().toString(),
      brand:   scanForm.brand.trim(),
      account: scanForm.account.trim(),
      secret:  scanForm.secret.trim().toUpperCase(),
    };
    const updated = [...this.data.tokens, tok];
    app.globalData.tokens = updated;
    saveTokens(updated);
    this.setData({
      tokens: updated, screen: 'home',
      scanForm: { brand: '', account: '', secret: '' },
      scanErrors: {}, scanScanned: false, scanTab: 'camera',
    });
    this.setData({ scrollTop: 0.1 });
    setTimeout(() => { this.setData({ scrollTop: 0 }); }, 50);
    this._filterTokens();
    this._updateOtpMap();
    this.showToast(`已添加 ${tok.brand}`);
    // 触发云端备份（会员）
    if (this.data.isMember) this._cloudBackup(updated);
  },

  onCloseScan() {
    this.setData({
      screen: 'home',
      scanForm: { brand: '', account: '', secret: '' },
      scanErrors: {}, scanScanned: false, scanTab: 'camera',
    });
  },

  // ── Cloud Membership ───────────────────────────────────────────
  _loadCloudMembership(openid) {
    if (!openid) return;
    const db = wx.cloud.database();
    db.collection('user_memberships').where({ openid }).get()
      .then(res => {
        if (res.data.length > 0 && res.data[0].expiry) {
          const expiry = new Date(res.data[0].expiry);
          if (expiry > new Date()) {
            app.saveMemberData(true, expiry);
            this.setData({ isMember: true, memberExpiryText: expiry.toLocaleDateString('zh-CN') });
            this._cloudRestore();
            this._startAutoSync();
          } else {
            // 会员已过期，清除状态
            app.saveMemberData(false, null);
            this.setData({ isMember: false, memberExpiryText: '' });
          }
        }
      })
      .catch(err => console.error('Membership query failed:', err));
  },

  // ── Cloud Backup & Sync ─────────────────────────────────────
  _cloudBackup(tokens) {
    if (!this.data.isMember) return;
    const db = wx.cloud.database();
    const openid = app.globalData.userInfo?.openid;
    if (!openid) return;
    db.collection('user_backups').where({ openid }).get()
      .then(res => {
        if (res.data.length > 0) {
          db.collection('user_backups').doc(res.data[0]._id).update({
            data: { tokens, timestamp: db.serverDate() }
          }).catch(err => console.error('Backup update failed:', err));
        } else {
          db.collection('user_backups').add({
            data: { openid, tokens, timestamp: db.serverDate() }
          }).catch(err => console.error('Backup add failed:', err));
        }
      })
      .catch(err => console.error('Backup query failed:', err));
  },

  _cloudRestore() {
    if (!this.data.isMember) return;
    const db = wx.cloud.database();
    const openid = app.globalData.userInfo?.openid;
    if (!openid) return;
    db.collection('user_backups').where({ openid }).get()
      .then(res => {
        if (res.data.length > 0 && res.data[0].tokens) {
          const cloudTokens = res.data[0].tokens;
          const localIds = new Set(this.data.tokens.map(t => t.id));
          const newTokens = cloudTokens.filter(t => !localIds.has(t.id));
          if (newTokens.length > 0) {
            const merged = [...this.data.tokens, ...newTokens];
            app.globalData.tokens = merged;
            saveTokens(merged);
            this.setData({ tokens: merged });
            this._filterTokens();
            this._updateOtpMap();
            this.showToast(`从云端同步 ${newTokens.length} 个账号`);
          }
        }
      })
      .catch(err => console.error('Restore failed:', err));
  },

  _cloudDelete(tokenId) {
    const db = wx.cloud.database();
    const openid = app.globalData.userInfo?.openid;
    if (!openid) return;
    db.collection('user_backups').where({ openid }).get()
      .then(res => {
        if (res.data.length > 0) {
          const updated = res.data[0].tokens.filter(t => t.id !== tokenId);
          db.collection('user_backups').doc(res.data[0]._id).update({ data: { tokens: updated } })
            .catch(err => console.error('Delete sync failed:', err));
        }
      })
      .catch(err => console.error('Cloud delete query failed:', err));
  },

  _autoSyncTimer: null,

  _startAutoSync() {
    if (!this.data.isMember) return;
    this._autoSyncTimer = setInterval(() => {
      this._cloudBackup(this.data.tokens);
    }, 60 * 60 * 1000);
  },

  // ── Profile Menu ────────────────────────────────────────────
  onMenuTap(e) {
    const { id, locked } = e.currentTarget.dataset;
    if (locked && !this.data.loggedIn) return;
    if (id === 'backup') {
      if (!this.data.isMember) {
        this.showToast('备份功能需要开通会员');
        wx.navigateTo({ url: '/pages/membership/membership' });
        return;
      }
      this.setData({ showBackupModal: true, backupPw: '', backupPw2: '' });
    } else if (id === 'import') {
      if (!this.data.isMember) {
        this.showToast('导入功能需要开通会员');
        wx.navigateTo({ url: '/pages/membership/membership' });
        return;
      }
      this.setData({ showImportModal: true, importPw: '', importFileName: '', importRaw: '' });
    } else if (id === 'theme') this.setData({ showThemeModal: true });
    else if (id === 'membership') wx.navigateTo({ url: '/pages/membership/membership' });
    else if (id === 'feedback') wx.navigateTo({ url: '/pages/feedback/feedback' });
    else if (id === 'account') {
      if (this.data.loggedIn) {
        this.onShowAccount();
      } else {
        this.onLoginOpen();
      }
    }
  },

  onBindPhone() {
    this.setData({ showLoginModal: true, privacyAgreed: false });
  },

  onLogout() {
    app.globalData.loggedIn = false;
    app.globalData.userInfo = null;
    app.globalData.isMember = false;
    app.globalData.memberExpiry = null;
    this.setData({ loggedIn: false, userInfo: null, isMember: false, memberExpiryText: '' });
    this.showToast('已退出登录');
  },

  // ── Login ───────────────────────────────────────────────────
  onLoginOpen() { this.setData({ showLoginModal: true, privacyAgreed: false, loginStep: 1, loginAvatar: '', loginNickname: '' }); },
  onPrivacyToggle() { this.setData({ privacyAgreed: !this.data.privacyAgreed }); },

  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    this.setData({ loginAvatar: avatarUrl });
  },

  onNicknameInput(e) {
    this.setData({ loginNickname: e.detail.value });
  },

  onLoginStep2() {
    if (!this.data.loginAvatar || !this.data.loginNickname.trim()) {
      this.showToast('请先选择头像和填写昵称', 'error');
      return;
    }
    this.setData({ loginNickname: this.data.loginNickname.trim(), loginStep: 2 });
  },

  onLoginBack() {
    this.setData({ loginStep: 1 });
  },

  onWeChatPhone(e) {
    if (!this.data.privacyAgreed) {
      this.showToast('请先同意隐私保护协议', 'error');
      return;
    }
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      this.showToast('用户取消授权', 'error');
      return;
    }
    const nickName = this.data.loginNickname || '微信用户';
    const avatar = this.data.loginAvatar || '';
    const phone = e.detail.phoneNumber || '';
    const openid = 'wx_' + (phone || Date.now()); // 模拟 openid，生产环境需从云端获取真实 openid
    const info = { name: nickName, phone: phone || '已授权', avatar, wechatLogin: true, openid };
    app.globalData.loggedIn = true;
    app.globalData.userInfo = info;
    this.setData({ loggedIn: true, userInfo: info, showLoginModal: false, privacyAgreed: false, loginStep: 1, loginAvatar: '', loginNickname: '' });
    this.showToast('登录成功');
    // 查询云端会员状态
    this._loadCloudMembership(openid);
  },
  onCloseLogin() {
    this.setData({ showLoginModal: false, loginStep: 1, loginAvatar: '', loginNickname: '', privacyAgreed: false });
  },

  // ── Backup ──────────────────────────────────────────────────
  onBackupPwInput(e)  { this.setData({ backupPw: e.detail.value }); },
  onBackupPw2Input(e) { this.setData({ backupPw2: e.detail.value }); },
  onDoBackup() {
    const { backupPw, backupPw2, tokens } = this.data;
    if (backupPw !== backupPw2 || !backupPw) return;
    try {
      const data = encryptData(tokens, backupPw);
      const fs = wx.getFileSystemManager();
      const fileName = `auth_backup_${Date.now()}.atbk`;
      const path = `${wx.env.USER_DATA_PATH}/${fileName}`;
      fs.writeFileSync(path, data, 'utf8');
      this.setData({ showBackupModal: false });
      this.showToast(`已备份 ${tokens.length} 个账号`);
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
    } catch (err) {
      this.showToast('备份失败');
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
    this.showToast('解密中…');
    try {
      const data = decryptData(importRaw, importPw);
      if (!Array.isArray(data)) throw new Error('invalid');
      const existingIds = new Set(tokens.map(t => t.id));
      const imported = data.filter(t => !existingIds.has(t.id));
      const merged = [...tokens, ...imported];
      app.globalData.tokens = merged;
      saveTokens(merged);
      this.setData({ tokens: merged, showImportModal: false });
      this._filterTokens();
      this._updateOtpMap();
      this.showToast(`成功导入 ${imported.length} 个账号`);
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

  // ── Account Info ────────────────────────────────────────────
  onShowAccount() { this.setData({ showAccountModal: true }); },
  onCloseAccount() { this.setData({ showAccountModal: false }); },
  onBindWechat() {
    this.setData({ showAccountModal: false, showLoginModal: true, loginTab: 'wechat' });
  },
});

const { loadTokens, saveTokens, loadTheme, saveTheme } = require('./utils/storage');

const APP_NAME = '星枢令';

const INITIAL_TOKENS = [];

const THEMES = [
  { name: '海洋蓝', color: '#4080D0' },
  { name: '皇室紫', color: '#9060D0' },
  { name: '玫瑰粉', color: '#D04080' },
  { name: '热情红', color: '#D04040' },
  { name: '暖橙色', color: '#D07030' },
  { name: '琥珀金', color: '#C09030' },
  { name: '森林绿', color: '#30A060' },
  { name: '青绿色', color: '#2090A0' },
  { name: '天空蓝', color: '#3080C0' },
  { name: '深靛蓝', color: '#6050C8' },
];

App({
  globalData: {
    THEMES,
    tokens: [],
    theme: THEMES[0],
    loggedIn: false,
    userInfo: null,
    openid: null,           // 静默登录获取的 openid
  },

  onLaunch() {
    wx.setEnableDebug({ enableDebug: false });

    // 一次性迁移：过滤体验版遗留的测试账号（alice@ 账号），保留用户自己添加的真实数据
    if (!wx.getStorageSync('ak_release_v1')) {
      try {
        const raw = wx.getStorageSync('ak_tokens');
        if (Array.isArray(raw)) {
          const TEST_IDS = new Set(['1', '2', '3', '4', '5', '6']);
          const real = raw.filter(t => !TEST_IDS.has(t.id) && !(t.account || '').includes('alice'));
          wx.setStorageSync('ak_tokens', real);
        }
      } catch (_) {}
      wx.removeStorageSync('ak_pending_sync_tasks');
      wx.setStorageSync('ak_release_v1', true);
    }

    const stored = loadTokens();
    this.globalData.tokens = stored || [];
    const theme = loadTheme();
    if (theme) this.globalData.theme = theme;

    // 初始化云开发
    wx.cloud.init({ env: 'cloud1-d6gv0hhga084dbe14' });

    // 隐私授权全局拦截器：存 resolve，通知当前页面弹出含真实按钮的授权弹窗
    wx.onNeedPrivacyAuthorization((resolve) => {
      this.globalData._privacyResolve = resolve;
      if (typeof this._onNeedPrivacy === 'function') {
        this._onNeedPrivacy();
      }
    });

    // 同步恢复登录状态（不等待云函数，页面渲染前即可用）
    const savedUserInfo = wx.getStorageSync('ak_user_info');
    if (savedUserInfo && savedUserInfo.name) {
      this.globalData.userInfo = savedUserInfo;
      this.globalData.loggedIn = true;
    }

    // 读取发布版本号（开发版返回空字符串）
    try {
      const acct = wx.getAccountInfoSync();
      this.globalData.appVersion = acct.miniProgram.version || '';
    } catch (_) {
      this.globalData.appVersion = '';
    }

    // 异步获取 openid，补充到已恢复的 userInfo
    this._silentLogin();
  },

  // 静默登录：仅获取 openid，不再负责恢复登录状态
  async _silentLogin() {
    try {
      const result = await wx.cloud.callFunction({ name: 'login' });
      if (result.result && result.result.success && result.result.openid) {
        const openid = result.result.openid;
        this.globalData.openid = openid;
        // 将 openid 补充到已恢复的 userInfo，供云同步使用
        if (this.globalData.userInfo) {
          this.globalData.userInfo = { ...this.globalData.userInfo, openid };
          wx.setStorageSync('ak_user_info', this.globalData.userInfo);
        }
      }
    } catch (err) {
      console.error('[APP] 静默登录失败:', err);
    }
  },

  saveUserInfo(info) {
    // 确保 userInfo 包含 openid，用于云同步
    const fullInfo = { ...info, openid: this.globalData.openid };
    this.globalData.userInfo = fullInfo;
    this.globalData.loggedIn = true;
    wx.setStorageSync('ak_user_info', fullInfo);
  },
});
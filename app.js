const { loadTokens, saveTokens, loadTheme, saveTheme } = require('./utils/storage');

const APP_NAME = '星枢令';

const INITIAL_TOKENS = [
  { id: '1', brand: 'Google',    account: 'alice@gmail.com',   secret: 'JBSWY3DPEHPK3PXP' },
  { id: '2', brand: 'Microsoft', account: 'alice@outlook.com', secret: 'MFRA22LDNRSXG5AP' },
  { id: '3', brand: 'GitHub',    account: 'alicedev',          secret: 'NZXSAYLBNFXWY3DP' },
  { id: '4', brand: 'Apple',     account: 'alice@icloud.com',  secret: 'OJSXI33PNZXE5LN' },
  { id: '5', brand: 'Stripe',    account: 'alice@company.com', secret: 'KRUGS4TANFXGK4TF' },
  { id: '6', brand: 'Discord',   account: 'alice#0042',        secret: 'LBSWY3DPEHPK3PXP' },
];

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
    const stored = loadTokens();
    this.globalData.tokens = stored && stored.length ? stored : INITIAL_TOKENS;
    const theme = loadTheme();
    if (theme) this.globalData.theme = theme;

    // 初始化云开发
    wx.cloud.init({ env: 'cloud1-d6gv0hhga084dbe14' });

    // 静默登录：自动获取 openid，不弹出任何授权弹窗
    this._silentLogin();
  },

  // 静默登录：获取 openid，用户可正常使用本地功能
  _silentLogin() {
    wx.login({
      success: (res) => {
        if (res.code) {
          // 将 code 发送到云端换取 openid（这里暂时用本地模拟）
          // 生产环境需要调用云函数获取真实 openid
          this.globalData.openid = 'wx_' + Date.now();
          // 检查是否有已存储的用户信息
          const savedUserInfo = wx.getStorageSync('ak_user_info');
          if (savedUserInfo) {
            this.globalData.userInfo = savedUserInfo;
            this.globalData.loggedIn = true;
          }
        }
      },
      fail: () => {
        // 静默登录失败不影响本地功能使用
        console.log('静默登录失败，本地功能可正常使用');
      }
    });
  },

  saveUserInfo(info) {
    this.globalData.userInfo = info;
    this.globalData.loggedIn = true;
    wx.setStorageSync('ak_user_info', info);
  },
});
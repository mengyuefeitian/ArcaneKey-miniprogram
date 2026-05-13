const { loadTokens, saveTokens, loadTheme, saveTheme } = require('./utils/storage');

const FREE_TOKEN_LIMIT = 5;
const MEMBERSHIP_PRICE = 19.90;
const APP_NAME = '玄钥';

const INITIAL_TOKENS = [
  { id: '1', brand: 'Google',    account: 'alice@gmail.com',   secret: 'JBSWY3DPEHPK3PXP' },
  { id: '2', brand: 'Microsoft', account: 'alice@outlook.com', secret: 'MFRA22LDNRSXG5AP' },
  { id: '3', brand: 'GitHub',    account: 'alicedev',          secret: 'NZXSAYLBNFXWY3DP' },
  { id: '4', brand: 'Apple',     account: 'alice@icloud.com',  secret: 'OJSXI33PNZQXE5LN' },
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
    isMember: false,
    memberExpiry: null,
  },

  onLaunch() {
    const stored = loadTokens();
    this.globalData.tokens = stored && stored.length ? stored : INITIAL_TOKENS;
    const theme = loadTheme();
    if (theme) this.globalData.theme = theme;

    // 初始化云开发
    wx.cloud.init({ env: 'cloud1-d6gxlvduza77569eb' });

    // 加载会员状态
    const memberData = wx.getStorageSync('ak_membership');
    if (memberData) {
      this.globalData.isMember = memberData.isMember;
      this.globalData.memberExpiry = memberData.expiry ? new Date(memberData.expiry) : null;
    }
  },

  saveMemberData(isMember, expiry) {
    this.globalData.isMember = isMember;
    this.globalData.memberExpiry = expiry;
    wx.setStorageSync('ak_membership', { isMember, expiry: expiry ? expiry.toISOString() : null });
  },
});

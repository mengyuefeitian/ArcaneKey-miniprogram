const app = getApp();

Page({
  data: { accentColor: '#4080D0', isMember: false, memberExpiryText: '' },

  onLoad() {
    this.setData({ accentColor: app.globalData.theme.color });
    this.updateMemberStatus();
  },

  onShow() { this.updateMemberStatus(); },

  updateMemberStatus() {
    const { isMember, memberExpiry } = app.globalData;
    this.setData({
      isMember,
      memberExpiryText: memberExpiry ? memberExpiry.toLocaleDateString('zh-CN') : '',
    });
  },

  onBack() { wx.navigateBack(); },

  onPay() {
    // 检查是否已登录
    if (!app.globalData.loggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    // TODO: 生产环境需调用后端创建订单 → wx.requestPayment
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    app.saveMemberData(true, expiry);
    this.updateMemberStatus();
    // 存储到云端（绑定微信账号）
    this._saveCloudMembership(expiry);
    wx.showToast({ title: '开通成功', icon: 'success' });
  },

  _saveCloudMembership(expiry) {
    const db = wx.cloud.database();
    const openid = app.globalData.userInfo?.openid;
    if (!openid) {
      console.error('No openid found, cannot save membership to cloud');
      return;
    }
    db.collection('user_memberships').where({ openid }).get()
      .then(res => {
        if (res.data.length > 0) {
          db.collection('user_memberships').doc(res.data[0]._id).update({
            data: { expiry: expiry.toISOString(), timestamp: db.serverDate() }
          }).catch(err => console.error('Update membership failed:', err));
        } else {
          db.collection('user_memberships').add({
            data: { openid, expiry: expiry.toISOString(), timestamp: db.serverDate() }
          }).catch(err => console.error('Add membership failed:', err));
        }
      })
      .catch(err => console.error('Query membership failed:', err));
  },
});

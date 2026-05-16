const app = getApp();

Page({
  data: {
    accentColor: '#4080D0',
    isMember: false,
    memberExpiryText: '',
    paying: false,
    isDemoMode: true, // 是否为演示模式
  },

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

  // 支付按钮点击
  async onPay() {
    // 防止重复点击
    if (this.data.paying) return;

    // 检查是否已登录
    if (!app.globalData.loggedIn) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再开通会员',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateBack();
          }
        },
      });
      return;
    }

    this._doPay();
  },

  // 执行支付流程
  async _doPay() {
    this.setData({ paying: true });

    try {
      // 调用云函数创建支付订单
      const result = await wx.cloud.callFunction({
        name: 'createPayment',
        data: {},
      });

      const payResult = result.result;

      if (!payResult.success) {
        wx.showToast({ title: payResult.errMsg || '创建订单失败', icon: 'none' });
        this.setData({ paying: false });
        return;
      }

      // 演示模式：直接开通会员
      if (payResult.isDemo) {
        this._activateMember(payResult.expiryDate);
        wx.showModal({
          title: '演示模式',
          content: '支付已模拟成功，会员已开通。\n\n生产环境需配置微信支付商户信息。',
          showCancel: false,
          confirmText: '知道了',
        });
        return;
      }

      // 生产模式：调用真实支付
      const { paymentParams } = payResult;
      await wx.requestPayment({
        timeStamp: paymentParams.timeStamp,
        nonceStr: paymentParams.nonceStr,
        package: paymentParams.package,
        signType: paymentParams.signType,
        paySign: paymentParams.paySign,
      });

      // 支付成功，激活会员
      this._activateMember(payResult.expiryDate);
      wx.showToast({ title: '开通成功', icon: 'success' });

    } catch (err) {
      console.error('Payment error:', err);

      // 云函数不存在或网络错误：进入演示模式
      if (err.errMsg && (err.errMsg.includes('FUNCTION_NOT_FOUND') || err.errMsg.includes('cloud.callFunction:fail'))) {
        // 演示模式fallback：直接激活会员
        const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        this._activateMember(expiryDate);
        wx.showModal({
          title: '演示模式',
          content: '云函数未部署，已自动模拟开通会员。\n\n请在微信开发者工具中上传并部署云函数：\n右键 cloudfunctions/createPayment → 上传并部署',
          showCancel: false,
          confirmText: '知道了',
        });
        return;
      }

      // 用户取消支付
      if (err.errMsg && err.errMsg.includes('requestPayment:fail cancel')) {
        wx.showToast({ title: '已取消支付', icon: 'none' });
      } else {
        wx.showToast({ title: '支付失败，请稍后重试', icon: 'none' });
      }
    }

    this.setData({ paying: false });
  },

  // 激活会员
  _activateMember(expiryDate) {
    const expiry = new Date(expiryDate);
    app.saveMemberData(true, expiry);
    this.updateMemberStatus();
    this._saveCloudMembership(expiry);
  },

  // 保存会员信息到云端
  _saveCloudMembership(expiry) {
    const db = wx.cloud.database();
    const openid = app.globalData.userInfo?.openid || app.globalData.openid;

    if (!openid) {
      console.log('No openid, membership saved locally only');
      return;
    }

    db.collection('user_memberships').where({ openid }).get()
      .then(res => {
        if (res.data.length > 0) {
          db.collection('user_memberships').doc(res.data[0]._id).update({
            data: {
              expiry: expiry.toISOString(),
              status: 'active',
              updatedAt: db.serverDate(),
            },
          }).catch(err => console.error('Update membership failed:', err));
        } else {
          db.collection('user_memberships').add({
            data: {
              openid,
              expiry: expiry.toISOString(),
              status: 'active',
              createdAt: db.serverDate(),
            },
          }).catch(err => console.error('Add membership failed:', err));
        }
      })
      .catch(err => console.error('Query membership failed:', err));
  },
});
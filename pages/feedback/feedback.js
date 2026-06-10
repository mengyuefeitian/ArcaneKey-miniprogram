const app = getApp();

Page({
  data: {
    accentColor: '#4080D0', type: '需求', content: '', images: [],
    contact: '', sending: false, canSubmit: false,
    statusBarHeight: 20,  // 状态栏高度，用于动态padding
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    this.setData({
      accentColor: app.globalData.theme.color,
      statusBarHeight: sysInfo.statusBarHeight || 20,
    });
  },

  onBack() { wx.navigateBack(); },
  onTypeChange(e) { this.setData({ type: e.currentTarget.dataset.type }); },
  onContentInput(e) {
    const content = e.detail.value;
    this.setData({ content, canSubmit: content.length >= 10 && content.length <= 500 });
  },
  onContactInput(e) { this.setData({ contact: e.detail.value }); },

  onAddImage() {
    const { images } = this.data;
    if (images.length >= 3) return;
    // 先调用隐私授权检查
    wx.requirePrivacyAuthorize({
      success: () => {
        wx.chooseMedia({
          count: 3 - images.length, mediaType: ['image'], sizeType: ['compressed'],
          success: (res) => {
            const paths = res.tempFiles.map(f => f.tempFilePath);
            this.setData({ images: [...images, ...paths] });
          },
          fail: () => {
            wx.showToast({ title: '选择图片取消', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '需要授权才能上传图片', icon: 'none' });
      }
    });
  },

  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.index;
    this.setData({ images: this.data.images.filter((_, i) => i !== idx) });
  },

  onSubmit() {
    // 防止重复提交
    if (this.data.sending) {
      return;
    }

    const { type, content, images, contact, canSubmit } = this.data;
    if (!canSubmit) {
      if (content.length < 10) { wx.showToast({ title: '至少10个字', icon: 'none' }); }
      return;
    }
    this.setData({ sending: true });

    const uploadPromises = images.map((path, i) =>
      wx.cloud.uploadFile({ cloudPath: `feedback/${Date.now()}_${i}.jpg`, filePath: path })
    );

    Promise.all(uploadPromises)
      .then(fileResults => {
        const imageUrls = fileResults.map(r => r.fileID);
        return wx.cloud.callFunction({
          name: 'sendFeedback',
          data: {
            feedbackId: Date.now().toString(),
            type,
            content,
            contactInfo: contact,
            nickName: app.globalData.userInfo?.name || '',
            imageUrls
          },
        });
      })
      .then(() => {
        this.setData({ sending: false });
        wx.showToast({ title: '反馈已提交', icon: 'success', duration: 2000 });
        setTimeout(() => wx.navigateBack(), 2000);
      })
      .catch((err) => {
        this.setData({ sending: false });
        wx.showToast({ title: '提交失败：' + (err.message || '网络错误'), icon: 'none', duration: 3000 });
      });
  },
});

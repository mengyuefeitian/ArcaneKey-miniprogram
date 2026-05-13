const app = getApp();

Page({
  data: {
    accentColor: '#4080D0', type: '需求', content: '', images: [],
    contact: '', sending: false, canSubmit: false,
  },

  onLoad() {
    this.setData({ accentColor: app.globalData.theme.color });
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
    wx.chooseMedia({
      count: 3 - images.length, mediaType: ['image'], sizeType: ['compressed'],
      success: (res) => {
        const paths = res.tempFiles.map(f => f.tempFilePath);
        this.setData({ images: [...images, ...paths] });
      },
    });
  },

  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.index;
    this.setData({ images: this.data.images.filter((_, i) => i !== idx) });
  },

  onSubmit() {
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
            nickName: app.globalData.userInfo?.nickName || '',
            imageUrls
          },
        });
      })
      .then(() => {
        wx.showToast({ title: '反馈已提交', icon: 'success' });
        wx.navigateBack();
      })
      .catch(() => { wx.showToast({ title: '提交失败', icon: 'error' }); })
      .finally(() => { this.setData({ sending: false }); });
  },
});

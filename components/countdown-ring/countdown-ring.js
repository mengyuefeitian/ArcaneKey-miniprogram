Component({
  properties: {
    timeLeft:    { type: Number, value: 30 },
    accentColor: { type: String, value: '#4080D0' },
  },
  data: {
    col: '#4080D0',
    tl: 30,
  },
  observers: {
    'timeLeft, accentColor': function(tl, ac) {
      this.setData({ col: ac, tl: tl });
      this._drawRing(tl, ac);
    },
  },
  lifetimes: {
    attached() {
      const { timeLeft, accentColor } = this.properties;
      this.setData({ col: accentColor, tl: timeLeft });
      // 延迟绘制，确保 canvas 已渲染
      setTimeout(() => this._drawRing(timeLeft, accentColor), 50);
    },
  },
  methods: {
    _drawRing(tl, color) {
      const query = this.createSelectorQuery();
      query.select('#ringCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            console.error('Canvas 获取失败');
            return;
          }
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getWindowInfo().pixelRatio || 1;

          // 设置 canvas 实际尺寸
          canvas.width = 34 * dpr;
          canvas.height = 34 * dpr;
          ctx.scale(dpr, dpr);

          // 清除画布
          ctx.clearRect(0, 0, 34, 34);

          const cx = 17, cy = 17, r = 12;

          // 背景圆环
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // 进度圆环
          const progress = tl / 30;
          const startAngle = -Math.PI / 2; // 从顶部开始
          const endAngle = startAngle + Math.PI * 2 * progress;

          ctx.beginPath();
          ctx.arc(cx, cy, r, startAngle, endAngle);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.stroke();
        });
    },
  },
});
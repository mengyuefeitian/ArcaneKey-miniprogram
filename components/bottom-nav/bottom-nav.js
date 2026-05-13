Component({
  properties: {
    current:     { type: String, value: 'home' },
    visible:     { type: Boolean, value: true },
    accentColor: { type: String, value: '#4080D0' },
    searching:   { type: Boolean, value: false },
  },
  methods: {
    onTap(e) {
      const { screen } = e.currentTarget.dataset;
      // 如果当前在搜索状态且点击首页，先关闭搜索
      if (screen === 'home' && this.properties.searching) {
        this.triggerEvent('searchclose');
        return;
      }
      if (screen !== this.properties.current) {
        this.triggerEvent('navigate', { screen });
      }
    },
    onSearchTap() {
      this.triggerEvent('searchtoggle');
    },
  },
});

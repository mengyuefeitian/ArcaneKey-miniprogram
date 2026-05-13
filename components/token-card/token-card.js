Component({
  properties: {
    token:       { type: Object, value: {} },
    otp:         { type: Object, value: {} },
    timeLeft:    { type: Number, value: 30 },
    accentColor: { type: String, value: '#4080D0' },
  },
  data: { curFmt: '--- ---', nxtFmt: '--- ---', pressed: false, digitColors: [] },
  methods: {
    onEditTap() { this.triggerEvent('edit', { token: this.properties.token }); },
    onCopyTap() {
      const code = (this.properties.otp || {}).current;
      this.triggerEvent('copy', { token: this.properties.token, code });
    },
    onPressStart() { this.setData({ pressed: true }); },
    onPressEnd()   { this.setData({ pressed: false }); },
    _interpolateColor(hex, t) {
      // Mix from lighter version (40% white mix at t=0) to full accent at t=1
      const r1 = parseInt(hex.slice(1, 3), 16);
      const g1 = parseInt(hex.slice(3, 5), 16);
      const b1 = parseInt(hex.slice(5, 7), 16);
      // Lighter: blend 40% white
      const lr = Math.round(r1 + (255 - r1) * 0.4);
      const lg = Math.round(g1 + (255 - g1) * 0.4);
      const lb = Math.round(b1 + (255 - b1) * 0.4);
      const r = Math.round(lr + (r1 - lr) * t);
      const g = Math.round(lg + (g1 - lg) * t);
      const b = Math.round(lb + (b1 - lb) * t);
      return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    },
    _computeDigitColors() {
      const accent = this.properties.accentColor || '#4080D0';
      const cur = this.data.curFmt || '--- ---';
      const colors = [];
      for (let i = 0; i < cur.length; i++) {
        if (cur[i] === ' ') {
          colors.push('transparent');
        } else {
          const t = colors.filter(c => c !== 'transparent').length / 6;
          colors.push(this._interpolateColor(accent, t));
        }
      }
      this.setData({ digitColors: colors });
    },
  },
  observers: {
    'otp': function(otp) {
      const cur = (otp && otp.current) ? otp.current : '------';
      const nxt = (otp && otp.next)    ? otp.next    : '------';
      this.setData({
        curFmt: cur.slice(0,3) + ' ' + cur.slice(3),
        nxtFmt: nxt.slice(0,3) + ' ' + nxt.slice(3),
      });
      this._computeDigitColors();
    },
    'accentColor': function() {
      this._computeDigitColors();
    },
  },
});

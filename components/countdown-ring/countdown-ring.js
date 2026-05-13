Component({
  properties: {
    timeLeft:    { type: Number, value: 30 },
    accentColor: { type: String, value: '#4080D0' },
  },
  observers: {
    'timeLeft, accentColor': function(tl, ac) {
      const r = 12;
      const circ = 2 * Math.PI * r;
      const col = ac;
      const dash = circ * tl / 30;
      const gap  = circ - dash;
      this.setData({ col, dash, gap, tl });
    },
  },
  data: {
    col: '#4080D0',
    dash: 2 * Math.PI * 12,
    gap: 0,
    tl: 30,
    r: 12,
    circ: 2 * Math.PI * 12,
  },
  lifetimes: {
    attached() {
      const { timeLeft, accentColor } = this.properties;
      const r = 12, circ = 2 * Math.PI * r;
      const col = accentColor;
      this.setData({ col, dash: circ * timeLeft / 30, gap: circ * (1 - timeLeft / 30), tl: timeLeft });
    },
  },
});

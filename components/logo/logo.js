const { matchBrandIcon, findBrandIconConfig } = require('../../utils/brandIcons');

const BRAND_COLORS = {
  Google:'#EA4335', Microsoft:'#00A4EF', GitHub:'#e6edf3',
  Apple:'#aaaaaa', Twitter:'#1DA1F2', 'X (Twitter)':'#e7e9ea',
  Dropbox:'#0061FF', Facebook:'#1877F2', Amazon:'#FF9900',
  Slack:'#4A154B', Discord:'#5865F2', Notion:'#ffffff',
  Stripe:'#635BFF', Figma:'#F24E1E', LinkedIn:'#0A66C2',
  Steam:'#c6d4df', Netflix:'#E50914', Spotify:'#1DB954',
};

function computeData(brand, account, size) {
  const iconFile = matchBrandIcon(brand, account);
  if (iconFile) {
    const config = findBrandIconConfig(iconFile);
    const scale = (config && config.scale) || 1;
    const iconSize = Math.round(size * 0.62 * scale);
    const radius = Math.round(size * 0.28);
    return {
      iconPath: '/images/brand-icons/' + iconFile,
      iconWrapStyle: `width:${size}px;height:${size}px;border-radius:${radius}px;background:#FFFFFF;border:1.5px solid #E5E5E5;`,
      iconImgStyle: `width:${iconSize}px;height:${iconSize}px;`,
      style: '',
      letter: '',
    };
  }
  const col = BRAND_COLORS[brand] || '#4080D0';
  const isLight = (col === '#ffffff' || col === '#e7e9ea' || col === '#e6edf3');
  const bg = isLight ? 'rgba(255,255,255,0.08)' : col + '1a';
  const border = isLight ? 'rgba(255,255,255,0.15)' : col + '44';
  const letter = (brand || '?')[0].toUpperCase();
  const radius = Math.round(size * 0.28);
  const fontSize = Math.round(size * 0.42);
  return {
    iconPath: '',
    iconWrapStyle: '',
    iconImgStyle: '',
    style: `width:${size}px;height:${size}px;border-radius:${radius}px;background:${bg};border:1.5px solid ${border};color:${col};font-size:${fontSize}px;`,
    letter,
  };
}

Component({
  properties: {
    brand: { type: String, value: '' },
    account: { type: String, value: '' },
    size:  { type: Number, value: 40 },
  },
  computed: {},
  methods: {},
  observers: {
    'brand, account, size': function(brand, account, size) {
      this.setData(computeData(brand, account, size));
    },
  },
  data: { style: '', letter: '?', iconPath: '', iconWrapStyle: '', iconImgStyle: '' },
  lifetimes: {
    attached() {
      const { brand, account, size } = this.properties;
      this.setData(computeData(brand, account, size));
    },
  },
});

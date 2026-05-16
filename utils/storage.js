var TOKENS_KEY = 'ak_tokens';
var THEME_KEY  = 'ak_theme';

function loadTokens() {
  try { return wx.getStorageSync(TOKENS_KEY) || null; } catch (e) { return null; }
}

function saveTokens(tokens) {
  try { wx.setStorageSync(TOKENS_KEY, tokens); } catch (e) { console.error('saveTokens failed', e); }
}

function loadTheme() {
  try { return wx.getStorageSync(THEME_KEY) || null; } catch (e) { return null; }
}

function saveTheme(theme) {
  try { wx.setStorageSync(THEME_KEY, theme); } catch (e) { console.error('saveTheme failed', e); }
}

module.exports = { loadTokens, saveTokens, loadTheme, saveTheme };

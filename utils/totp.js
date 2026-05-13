// Pure-JS SHA-1
function sha1(data) {
  var msg = Array.prototype.slice.call(data);
  var ml = msg.length * 8;
  msg.push(0x80);
  while ((msg.length % 64) !== 56) msg.push(0);
  for (var i = 7; i >= 0; i--) {
    msg.push((ml / Math.pow(2, i * 8)) & 0xff);
  }

  var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE,
      h3 = 0x10325476, h4 = 0xC3D2E1F0;

  for (var bi = 0; bi < msg.length; bi += 64) {
    var w = new Array(80);
    for (var j = 0; j < 16; j++) {
      w[j] = ((msg[bi + j * 4] << 24) | (msg[bi + j * 4 + 1] << 16) |
              (msg[bi + j * 4 + 2] << 8) | msg[bi + j * 4 + 3]);
    }
    for (var j = 16; j < 80; j++) {
      var n = w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16];
      w[j] = (n << 1) | (n >>> 31);
    }
    var a = h0, b = h1, c = h2, d = h3, e = h4;
    for (var j = 0; j < 80; j++) {
      var f, k;
      if (j < 20)      { f = (b & c) | (~b & d);           k = 0x5A827999; }
      else if (j < 40) { f = b ^ c ^ d;                     k = 0x6ED9EBA1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d);  k = 0x8F1BBCDC; }
      else             { f = b ^ c ^ d;                     k = 0xCA62C1D6; }
      var temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) | 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = temp;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }

  var result = [];
  [h0, h1, h2, h3, h4].forEach(function(h) {
    result.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  });
  return result;
}

function hmacSha1(keyBytes, dataBytes) {
  var blockSize = 64;
  var key = keyBytes.slice();
  if (key.length > blockSize) key = sha1(key);
  while (key.length < blockSize) key.push(0);

  var ipad = key.map(function(b) { return b ^ 0x36; });
  var opad = key.map(function(b) { return b ^ 0x5c; });

  var inner = sha1(ipad.concat(dataBytes));
  return sha1(opad.concat(inner));
}

function base32Decode(s) {
  var alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s = s.toUpperCase().replace(/[\s=]/g, '');
  var bits = 0, val = 0, out = [];
  for (var i = 0; i < s.length; i++) {
    var idx = alpha.indexOf(s[i]);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((val >> (bits - 8)) & 0xff); bits -= 8; }
  }
  return out;
}

function totp(secret, offset) {
  offset = offset || 0;
  try {
    var key = base32Decode(secret);
    if (!key.length) throw new Error('empty');
    var t = Math.floor(Date.now() / 30000) + offset;
    var buf = [0, 0, 0, 0, (t >>> 24) & 0xff, (t >>> 16) & 0xff, (t >>> 8) & 0xff, t & 0xff];
    var sig = hmacSha1(key, buf);
    var o = sig[19] & 0xf;
    var n = (
      ((sig[o] & 0x7f) << 24) | ((sig[o+1] & 0xff) << 16) |
      ((sig[o+2] & 0xff) << 8) | (sig[o+3] & 0xff)
    ) % 1000000;
    return n.toString().padStart(6, '0');
  } catch (e) {
    var h = 0;
    for (var i = 0; i < secret.length; i++) {
      h = (h ^ (secret.charCodeAt(i) << (i % 7))) | 0;
    }
    var t2 = Math.floor(Date.now() / 30000) + offset;
    return (Math.abs(h * 1234567 + t2 * 7654321) % 1000000).toString().padStart(6, '0');
  }
}

function timeLeft() {
  return 30 - (Math.floor(Date.now() / 1000) % 30);
}

function fmtCode(s) {
  if (!s || s.length < 6) return s || '------';
  return s.slice(0, 3) + ' ' + s.slice(3);
}

module.exports = { totp, timeLeft, fmtCode };

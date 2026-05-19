var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8Encode(str) {
  var bytes = [];
  for (var i = 0; i < str.length; i++) {
    var code = str.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
      var low = str.charCodeAt(i + 1);
      if (low >= 0xDC00 && low <= 0xDFFF) {
        var cp = ((code - 0xD800) << 10) + (low - 0xDC00) + 0x10000;
        bytes.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
        i++;
        continue;
      }
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
    else bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
  }
  return bytes;
}

function utf8Decode(bytes) {
  var str = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0x80) { str += String.fromCharCode(b); }
    else if (b < 0xE0) {
      str += String.fromCharCode(((b & 0x1F) << 6) | (bytes[++i] & 0x3F));
    } else if (b < 0xF0) {
      str += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[++i] & 0x3F) << 6) | (bytes[++i] & 0x3F));
    } else {
      var cp = ((b & 0x07) << 18) | ((bytes[++i] & 0x3F) << 12) | ((bytes[++i] & 0x3F) << 6) | (bytes[++i] & 0x3F);
      cp -= 0x10000;
      str += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
    }
  }
  return str;
}

function btoa(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i], b1 = i + 1 < bytes.length ? bytes[i + 1] : 0, b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

function atob(enc) {
  var rev = {};
  for (var i = 0; i < B64.length; i++) rev[B64[i]] = i;
  // Count trailing '=' padding before stripping (1 '=' => 1 extra byte, 2 '==' => 2 extra bytes)
  var pad = 0;
  if (enc.length > 0 && enc[enc.length - 1] === '=') pad++;
  if (enc.length > 1 && enc[enc.length - 2] === '=') pad++;
  var clean = enc.replace(/=/g, '');
  var buf = [];
  for (var i = 0; i < clean.length; i += 4) {
    var a = rev[clean[i]] || 0, b = i + 1 < clean.length ? (rev[clean[i + 1]] || 0) : 0;
    var c = i + 2 < clean.length ? (rev[clean[i + 2]] || 0) : 0, d = i + 3 < clean.length ? (rev[clean[i + 3]] || 0) : 0;
    buf.push((a << 2) | (b >> 4), ((b & 15) << 4) | (c >> 2), ((c & 3) << 6) | d);
  }
  // Remove trailing null bytes introduced by base64 padding
  if (pad > 0) buf.splice(buf.length - pad, pad);
  return buf;
}

// ── SHA-1 (copied verbatim from miniprogram/utils/totp.js) ───────────────────
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

// ── HMAC-SHA1 (copied verbatim from miniprogram/utils/totp.js) ───────────────
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

// ── PBKDF2-HMAC-SHA1 (ported from harmonyos/.../CryptoUtil.ets:pbkdf2) ───────
// Parameters must match HarmonyOS exactly: 10000 iterations, keyLen = cipher.length
function pbkdf2(password, salt, iterations, keyLen) {
  var passBytes = utf8Encode(password);
  var key = [];
  var block = 1;
  while (key.length < keyLen) {
    var blockBytes = [
      (block >>> 24) & 0xff, (block >>> 16) & 0xff,
      (block >>> 8)  & 0xff,  block          & 0xff
    ];
    var u = hmacSha1(passBytes, salt.concat(blockBytes));
    var t = u.slice();
    for (var i = 1; i < iterations; i++) {
      u = hmacSha1(passBytes, u);
      for (var j = 0; j < t.length; j++) t[j] ^= u[j];
    }
    key = key.concat(t);
    block++;
  }
  return key.slice(0, keyLen);
}

// ENC2 magic bytes: ASCII "ENC2" = [0x45, 0x4E, 0x43, 0x32]
var ENC2_MAGIC = [0x45, 0x4E, 0x43, 0x32];

function encryptData(data, pass) {
  var json = JSON.stringify(data);
  var jsonBytes = utf8Encode(json);
  var keyBytes = utf8Encode(pass);
  var xored = [];
  for (var i = 0; i < jsonBytes.length; i++) {
    xored.push(jsonBytes[i] ^ keyBytes[i % keyBytes.length]);
  }
  return btoa(xored);
}

function decryptData(enc, pass) {
  var bytes = atob(enc); // returns number[] — bytes[i] is already an integer

  // Detect ENC2 format produced by HarmonyOS CryptoUtil.ets
  // Layout: [magic 4B][salt 16B][ciphertext NB]  — minimum 20 bytes before magic is safe
  if (bytes.length >= 20 &&
      bytes[0] === ENC2_MAGIC[0] && bytes[1] === ENC2_MAGIC[1] &&
      bytes[2] === ENC2_MAGIC[2] && bytes[3] === ENC2_MAGIC[3]) {
    var salt   = bytes.slice(4, 20);   // 16 bytes
    var cipher = bytes.slice(20);      // remainder
    var key    = pbkdf2(pass, salt, 10000, cipher.length);
    var plain  = [];
    for (var i = 0; i < cipher.length; i++) {
      plain.push(cipher[i] ^ key[i]);
    }
    return JSON.parse(utf8Decode(plain));
  }

  // Fallback: legacy raw XOR format (WeChat-native backups — backward compatible)
  var keyBytes = utf8Encode(pass);
  var jsonBytes = [];
  for (var i = 0; i < bytes.length; i++) {
    jsonBytes.push(bytes[i] ^ keyBytes[i % keyBytes.length]);
  }
  return JSON.parse(utf8Decode(jsonBytes));
}

module.exports = { encryptData, decryptData };

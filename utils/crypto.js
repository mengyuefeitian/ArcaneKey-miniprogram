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
  var clean = enc.replace(/=/g, '');
  var buf = [];
  for (var i = 0; i < clean.length; i += 4) {
    var a = rev[clean[i]] || 0, b = i + 1 < clean.length ? (rev[clean[i + 1]] || 0) : 0;
    var c = i + 2 < clean.length ? (rev[clean[i + 2]] || 0) : 0, d = i + 3 < clean.length ? (rev[clean[i + 3]] || 0) : 0;
    buf.push((a << 2) | (b >> 4), ((b & 15) << 4) | (c >> 2), ((c & 3) << 6) | d);
  }
  return buf;
}

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
  var xored = atob(enc);
  var keyBytes = utf8Encode(pass);
  var jsonBytes = [];
  for (var i = 0; i < xored.length; i++) {
    jsonBytes.push(xored[i] ^ keyBytes[i % keyBytes.length]);
  }
  return JSON.parse(utf8Decode(jsonBytes));
}

module.exports = { encryptData, decryptData };

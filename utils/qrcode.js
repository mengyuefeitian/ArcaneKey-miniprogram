'use strict';

/**
 * QR Code generator — JavaScript port of Nayuki's reference implementation.
 * https://www.nayuki.io/page/qr-code-generator-library  (MIT License)
 *
 * Key design: every function cell (finder, alignment, timing, format, version)
 * is explicitly marked in isFunction[][] as it is drawn. Data placement and
 * masking simply skip isFunction cells — no post-hoc geometry calculation.
 */

// ─── ECC Levels ──────────────────────────────────────────────
const ECC = {
  L: { ordinal: 0, formatBits: 1 },
  M: { ordinal: 1, formatBits: 0 },
  Q: { ordinal: 2, formatBits: 3 },
  H: { ordinal: 3, formatBits: 2 },
};

// ─── Encoding Modes ──────────────────────────────────────────
const MODE_NUMERIC      = { bits: 0x1, ccBits: [10, 12, 14] };
const MODE_ALPHANUMERIC = { bits: 0x2, ccBits: [ 9, 11, 13] };
const MODE_BYTE         = { bits: 0x4, ccBits: [ 8, 16, 16] };

function charCountBits(mode, version) {
  return mode.ccBits[Math.floor((version + 7) / 17)];
}

// ─── ISO 18004 Table 9 (from Nayuki — correct values) ────────
const ECC_PER_BLOCK = [
  // ordinal 0 = L
  [-1, 7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  // ordinal 1 = M
  [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
  // ordinal 2 = Q
  [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
  // ordinal 3 = H
  [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
];

const NUM_BLOCKS = [
  // ordinal 0 = L
  [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
  // ordinal 1 = M
  [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
  // ordinal 2 = Q
  [-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
  // ordinal 3 = H
  [-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81],
];

// ─── GF(256) Reed-Solomon ─────────────────────────────────────
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xFF;
}

function rsGenPoly(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return r;
}

function rsRemainder(data, gen) {
  const rem = gen.map(() => 0);
  for (const b of data) {
    const factor = b ^ rem.shift();
    rem.push(0);
    gen.forEach((c, i) => { rem[i] ^= gfMul(c, factor); });
  }
  return rem;
}

// ─── Helpers ─────────────────────────────────────────────────
function appendBits(val, len, bb) {
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}

function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

function utf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
    else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
  }
  return out;
}

// ─── Segment ─────────────────────────────────────────────────
const ALPHA_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function makeSegment(text) {
  if (/^[0-9]*$/.test(text)) {
    const bb = [];
    for (let i = 0; i < text.length; ) {
      const n = Math.min(text.length - i, 3);
      appendBits(parseInt(text.substring(i, i + n), 10), n * 3 + 1, bb);
      i += n;
    }
    return { mode: MODE_NUMERIC, numChars: text.length, data: bb };
  }
  if (/^[A-Z0-9 $%*+\-./:]*$/.test(text)) {
    const bb = [];
    let i = 0;
    for (; i + 2 <= text.length; i += 2) {
      appendBits(ALPHA_CHARS.indexOf(text[i]) * 45 + ALPHA_CHARS.indexOf(text[i + 1]), 11, bb);
    }
    if (i < text.length) appendBits(ALPHA_CHARS.indexOf(text[i]), 6, bb);
    return { mode: MODE_ALPHANUMERIC, numChars: text.length, data: bb };
  }
  const bytes = utf8Bytes(text);
  const bb = [];
  for (const b of bytes) appendBits(b, 8, bb);
  return { mode: MODE_BYTE, numChars: bytes.length, data: bb };
}

// ─── Capacity ─────────────────────────────────────────────────
function numRawDataModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const na = Math.floor(ver / 7) + 2;
    r -= (25 * na - 10) * na - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

function numDataCodewords(ver, ecl) {
  return Math.floor(numRawDataModules(ver) / 8) -
    ECC_PER_BLOCK[ecl.ordinal][ver] * NUM_BLOCKS[ecl.ordinal][ver];
}

// ─── Alignment Pattern Positions ─────────────────────────────
function alignPos(version) {
  if (version === 1) return [];
  const na = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + na * 3 + 5) / (na * 4 - 4)) * 2;
  const r = [6];
  const size = version * 4 + 17;
  for (let pos = size - 7; r.length < na; pos -= step) r.splice(1, 0, pos);
  return r;
}

// ─── Main Generator ──────────────────────────────────────────
function createQRCode(text, errorLevel) {
  if (!text) throw new Error('Empty input');

  const ecl = ECC[errorLevel] || ECC.M;
  const seg = makeSegment(text);

  // Find minimum version
  let version;
  for (version = 1; version <= 40; version++) {
    const cap = numDataCodewords(version, ecl) * 8;
    const need = 4 + charCountBits(seg.mode, version) + seg.data.length;
    if (need <= cap) break;
    if (version === 40) throw new Error('Text too long');
  }

  // Build data bit buffer
  const dataCap = numDataCodewords(version, ecl) * 8;
  const bb = [];
  appendBits(seg.mode.bits, 4, bb);
  appendBits(seg.numChars, charCountBits(seg.mode, version), bb);
  for (const b of seg.data) bb.push(b);
  appendBits(0, Math.min(4, dataCap - bb.length), bb);
  appendBits(0, (8 - bb.length % 8) % 8, bb);
  for (let pad = 0xEC; bb.length < dataCap; pad ^= 0xEC ^ 0x11) appendBits(pad, 8, bb);

  // Pack bits into bytes
  const dataBytes = [];
  while (dataBytes.length * 8 < bb.length) dataBytes.push(0);
  bb.forEach((b, i) => { dataBytes[i >>> 3] |= b << (7 - (i & 7)); });

  // ECC + interleave
  const nb    = NUM_BLOCKS[ecl.ordinal][version];
  const eccLen = ECC_PER_BLOCK[ecl.ordinal][version];
  const raw   = Math.floor(numRawDataModules(version) / 8);
  const nShort = nb - raw % nb;
  const shortLen = Math.floor(raw / nb);
  const gen = rsGenPoly(eccLen);

  const blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = dataBytes.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, gen);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }

  const cw = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((bl, j) => {
      if (i !== shortLen - eccLen || j >= nShort) cw.push(bl[i]);
    });
  }

  // ─── Build matrix ─────────────────────────────────────────
  const size = version * 4 + 17;
  const modules = [];
  const isFn = [];
  for (let i = 0; i < size; i++) {
    modules.push(new Array(size).fill(false));
    isFn.push(new Array(size).fill(false));
  }

  function setFn(x, y, dark) {
    modules[y][x] = dark;
    isFn[y][x] = true;
  }

  // Timing patterns
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  // Finder patterns (center coords: 3,3 / size-4,3 / 3,size-4)
  function drawFinder(cx, cy) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size)
          setFn(x, y, Math.max(Math.abs(dx), Math.abs(dy)) !== 2 && Math.max(Math.abs(dx), Math.abs(dy)) !== 4);
      }
    }
  }
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  // Alignment patterns
  const ap = alignPos(version);
  const na = ap.length;
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < na; j++) {
      if (i === 0 && j === 0) continue;
      if (i === 0 && j === na - 1) continue;
      if (i === na - 1 && j === 0) continue;
      const cx = ap[i], cy = ap[j];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Format info (first pass with dummy mask 0)
  function drawFormat(mask) {
    const data = ecl.formatBits << 3 | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = (data << 10 | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) setFn(8, i, getBit(bits, i));
    setFn(8, 7, getBit(bits, 6));
    setFn(8, 8, getBit(bits, 7));
    setFn(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, getBit(bits, i));

    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(bits, i));
    setFn(8, size - 8, true); // dark module
  }
  drawFormat(0);

  // Version info (version >= 7)
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bits = version << 12 | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + i % 3, b = Math.floor(i / 3);
      setFn(a, b, getBit(bits, i));
      setFn(b, a, getBit(bits, i));
    }
  }

  // Data codewords (zigzag scan)
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFn[y][x] && bi < cw.length * 8) {
          modules[y][x] = getBit(cw[bi >>> 3], 7 - (bi & 7));
          bi++;
        }
      }
    }
  }

  // Masking
  function applyMask(mods, mask) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFn[y][x]) continue;
        let inv;
        switch (mask) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = x * y % 2 + x * y % 3 === 0; break;
          case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
          case 7: inv = ((x + y) % 2 + x * y % 3) % 2 === 0; break;
          default: inv = false;
        }
        if (inv) mods[y][x] = !mods[y][x];
      }
    }
  }

  function penalty(mods) {
    let score = 0;
    // Rule 1: runs of 5+
    for (let y = 0; y < size; y++) {
      let run = 1;
      for (let x = 1; x < size; x++) {
        if (mods[y][x] === mods[y][x - 1]) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
        else run = 1;
      }
    }
    for (let x = 0; x < size; x++) {
      let run = 1;
      for (let y = 1; y < size; y++) {
        if (mods[y][x] === mods[y - 1][x]) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
        else run = 1;
      }
    }
    // Rule 2: 2×2 blocks
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = mods[y][x];
        if (c === mods[y][x+1] && c === mods[y+1][x] && c === mods[y+1][x+1]) score += 3;
      }
    }
    // Rule 3: finder-like 1:1:3:1:1 patterns
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size - 10; x++) {
        const r = mods[y];
        if (r[x] && !r[x+1] && r[x+2] && r[x+3] && r[x+4] && !r[x+5] && r[x+6] && !r[x+7] && !r[x+8] && !r[x+9] && !r[x+10]) score += 40;
        if (!r[x] && !r[x+1] && !r[x+2] && !r[x+3] && r[x+4] && !r[x+5] && r[x+6] && r[x+7] && r[x+8] && !r[x+9] && r[x+10]) score += 40;
      }
    }
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size - 10; y++) {
        if (mods[y][x] && !mods[y+1][x] && mods[y+2][x] && mods[y+3][x] && mods[y+4][x] && !mods[y+5][x] && mods[y+6][x] && !mods[y+7][x] && !mods[y+8][x] && !mods[y+9][x] && !mods[y+10][x]) score += 40;
        if (!mods[y][x] && !mods[y+1][x] && !mods[y+2][x] && !mods[y+3][x] && mods[y+4][x] && !mods[y+5][x] && mods[y+6][x] && mods[y+7][x] && mods[y+8][x] && !mods[y+9][x] && mods[y+10][x]) score += 40;
      }
    }
    // Rule 4: dark ratio
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (mods[y][x]) dark++;
    const total = size * size;
    const k = Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1);
    score += k * 10;
    return score;
  }

  let bestMask = 0, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const test = modules.map(row => row.slice());
    applyMask(test, mask);
    const s = penalty(test);
    if (s < bestScore) { bestScore = s; bestMask = mask; }
  }

  applyMask(modules, bestMask);
  drawFormat(bestMask);

  return { moduleCount: size, modules, version };
}

// ─── Draw to Canvas ───────────────────────────────────────────
function drawQRCode(ctx, qrData, canvasSize) {
  const { moduleCount, modules } = qrData;
  const margin = 4;
  const size = Math.floor(canvasSize / (moduleCount + margin * 2));
  const offset = Math.floor((canvasSize - moduleCount * size) / 2);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize, canvasSize);
  ctx.fillStyle = '#000000';
  for (let y = 0; y < moduleCount; y++) {
    for (let x = 0; x < moduleCount; x++) {
      if (modules[y][x]) ctx.fillRect(offset + x * size, offset + y * size, size, size);
    }
  }
}

module.exports = { createQRCode, drawQRCode };

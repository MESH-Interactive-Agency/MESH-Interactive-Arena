// Draws a small ring "gauge" PNG in memory so the tray icon reflects live usage
// without shipping image assets.
const zlib = require('zlib');

const COLORS = {
  ok: [52, 199, 89], warning: [255, 176, 32], critical: [255, 99, 71],
  limited: [220, 38, 38], unknown: [150, 150, 150],
};

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Ring gauge: filled arc = percent, colour = status. */
function gaugePng(percent, status, size = 32) {
  const [r, g, b] = COLORS[status] || COLORS.unknown;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = (size - 1) / 2, outer = size / 2 - 1, inner = outer * 0.55;
  const frac = percent == null ? 0 : Math.max(0, Math.min(1, percent / 100));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      if (d > outer + 0.5 || d < inner - 0.5) continue;
      const edge = Math.min(1, outer + 0.5 - d, d - (inner - 0.5));
      let ang = Math.atan2(dx, -dy) / (2 * Math.PI); if (ang < 0) ang += 1;
      const filled = ang <= frac;
      raw[o] = filled ? r : 128; raw[o + 1] = filled ? g : 128; raw[o + 2] = filled ? b : 128;
      raw[o + 3] = Math.round(255 * edge * (filled ? 1 : 0.35));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { gaugePng };

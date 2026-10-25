import fs from "node:fs";
import zlib from "node:zlib";

// Read public/icon.png
const srcBuf = fs.readFileSync("public/icon.png");
const idat = [];
let pos = 8;
while (pos < srcBuf.length) {
  const len = srcBuf.readUInt32BE(pos);
  const type = srcBuf.toString("ascii", pos + 4, pos + 8);
  if (type === "IDAT") idat.push(srcBuf.subarray(pos + 8, pos + 8 + len));
  pos += 12 + len;
}
const srcRaw = zlib.inflateSync(Buffer.concat(idat));
const width = 512;
const height = 512;
const rowStride = 1 + width * 4;

const destRaw = Buffer.alloc(height * rowStride);

const centerX = 255.5;
const centerY = 255.5;
const radius = 252;
const scale = 0.78;

const srcMinY = 55;
const srcMaxY = 459;
const srcMinX = 157;
const srcMaxX = 355;
const srcCenterX = (srcMinX + srcMaxX) / 2; // 256
const srcCenterY = (srcMinY + srcMaxY) / 2; // 257

for (let y = 0; y < height; y++) {
  destRaw[y * rowStride] = 0; // Filter None
  for (let x = 0; x < width; x++) {
    const dist = Math.hypot(x - centerX, y - centerY);
    const destOffset = y * rowStride + 1 + x * 4;

    if (dist > radius + 1) {
      destRaw[destOffset] = 0;
      destRaw[destOffset + 1] = 0;
      destRaw[destOffset + 2] = 0;
      destRaw[destOffset + 3] = 0;
      continue;
    }

    let circleAlpha = 1;
    if (dist > radius - 1) {
      circleAlpha = Math.max(0, Math.min(1, (radius + 1 - dist) / 2));
    }

    let r = 255;
    let g = 255;
    let b = 255;
    const a = Math.round(255 * circleAlpha);

    const srcX = Math.round((x - centerX) / scale + srcCenterX);
    const srcY = Math.round((y - centerY) / scale + srcCenterY);

    if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
      const srcOffset = srcY * rowStride + 1 + srcX * 4;
      const srcR = srcRaw[srcOffset];
      const srcG = srcRaw[srcOffset + 1];
      const srcB = srcRaw[srcOffset + 2];
      const srcA = srcRaw[srcOffset + 3] / 255;

      if (srcA > 0) {
        r = Math.round(srcR * srcA + 255 * (1 - srcA));
        g = Math.round(srcG * srcA + 255 * (1 - srcA));
        b = Math.round(srcB * srcA + 255 * (1 - srcA));
      }
    }

    destRaw[destOffset] = r;
    destRaw[destOffset + 1] = g;
    destRaw[destOffset + 2] = b;
    destRaw[destOffset + 3] = a;
  }
}

function crc32(buf) {
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return crc ^ -1;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(12 + len);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, "ascii");
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeInt32BE(crc, 8 + len);
  return buf;
}

const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const compressed = zlib.deflateSync(destRaw);
const idatChunk = makeChunk("IDAT", compressed);
const ihdrChunk = makeChunk("IHDR", ihdr);
const iendChunk = makeChunk("IEND", Buffer.alloc(0));

const finalPng = Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
fs.writeFileSync("public/brand/email-avatar.png", finalPng);
console.log(`Created public/brand/email-avatar.png (${finalPng.length} bytes)`);

// Also create vector wrapper public/brand/email-avatar.svg
const base64Png = finalPng.toString("base64");
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <circle cx="256" cy="256" r="252" fill="#FFFFFF" />
  <image href="data:image/png;base64,${base64Png}" x="0" y="0" width="512" height="512" />
</svg>
`;
fs.writeFileSync("public/brand/email-avatar.svg", svgContent);
console.log(`Created public/brand/email-avatar.svg (${svgContent.length} bytes)`);

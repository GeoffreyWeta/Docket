/* Render the app icons from one definition of the mark.

   iOS ignores SVG favicons, so a home-screen install without a raster icon gets
   a screenshot of the page instead of the mark, and Android's maskable icon
   wants its own padded version. Rather than commit binaries nobody can diff,
   this draws them.

   It rasterises directly: four circles and a rounded rectangle, supersampled 4x
   and box-filtered, encoded with node's own zlib. No image library, and no
   headless browser either, so it runs anywhere node does.

   The mark is the same seal the app draws (SealMark in icons.jsx, the inline
   favicon in index.html): rose disc, darker rim, inner ring, one off-centre
   specular that clears both. Keep the three in step by hand; they are five
   numbers and they change rarely.

   usage: node tools/make-icons.mjs
   then:  npm run build      (vite copies public/ into dist/) */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, "..", "public");

/* studio's seal on studio's navigation slate: the --seal-* and --side tokens */
const SLATE = "#111827", CORE = "#E11D48", RIM = "#881337", RING = "#FB7185", HI = "#FDA4AF";
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/* ---------------- the mark, in a 32-unit square ---------------- */

/** Layers, back to front. Each returns true where it paints. */
function layers(maskable) {
  const pad = maskable ? 0.18 : 0;      // Android crops to about 80% of the canvas
  const c = 16, r = 9 * (1 - pad * 1.1);
  const tileR = maskable ? 0 : 8;       // a maskable icon must bleed to the edge
  const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);
  /** rounded-rectangle signed distance, negative inside */
  const roundRect = (x, y) => {
    const dx = Math.abs(x - 16) - (16 - tileR);
    const dy = Math.abs(y - 16) - (16 - tileR);
    const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(ox, oy) - tileR;
  };
  return [
    { colour: rgb(SLATE), hit: (x, y) => roundRect(x, y) <= 0 },
    { colour: rgb(CORE), hit: (x, y) => dist(x, y, c, c) <= r },
    { colour: rgb(RIM), hit: (x, y) => Math.abs(dist(x, y, c, c) - r) <= 0.6 },
    { colour: rgb(RING), hit: (x, y) => Math.abs(dist(x, y, c, c) - r * 0.49) <= 0.65 },
    /* 0.54r out on the diagonal at 0.15r across: that puts the specular's inner
       edge at 5.5 against the ring's outer edge at 5.1, and its outer edge at
       8.2 against the rim's inner edge at 8.4. Any closer and it eats a notch
       out of the ring, which is what it looked like at 0.48r. */
    { colour: rgb(HI), hit: (x, y) => dist(x, y, c - r * 0.54, c - r * 0.54) <= r * 0.15 },
  ];
}

/** RGBA bitmap of the mark, supersampled then box-filtered. */
function raster(size, maskable) {
  const SS = 4, W = size * SS, scale = 32 / W;
  const L = layers(maskable);
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px * SS + sx + 0.5) * scale;
          const y = (py * SS + sy + 0.5) * scale;
          let hit = null;
          for (const layer of L) if (layer.hit(x, y)) hit = layer.colour;
          if (hit) { r += hit[0]; g += hit[1]; b += hit[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      const cover = a / n;
      // un-premultiply so the edge pixels carry colour, not grey
      out[i] = cover ? Math.round(r / (a / 255)) : 0;
      out[i + 1] = cover ? Math.round(g / (a / 255)) : 0;
      out[i + 2] = cover ? Math.round(b / (a / 255)) : 0;
      out[i + 3] = Math.round(cover);
    }
  }
  return out;
}

/* ---------------- minimal PNG encoder ---------------- */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // truecolour with alpha
  // 10..12 stay 0: deflate, adaptive filtering, no interlace
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0;   // filter: none
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- write them ---------------- */

const TARGETS = [
  { file: "apple-touch-icon.png", size: 180, maskable: false },
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-512-maskable.png", size: 512, maskable: true },
];

const MANIFEST = {
  name: "DOCKET",
  short_name: "DOCKET",
  description: "Sealed-bid tendering: cryptographic sealing, blind evaluation and a tamper-evident audit trail.",
  /* the app is served at the site root; the manifest and icons are not, because
     vite's base is /static/ for Django + WhiteNoise */
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#F7F8FA",
  theme_color: SLATE,
  /* icon paths stay RELATIVE, so they resolve against wherever the manifest is
     served from (/static/) rather than the site root, and keep working if that
     base ever changes. An absolute "/icon-192.png" 404s in this deployment. */
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

fs.mkdirSync(PUBLIC, { recursive: true });
for (const t of TARGETS) {
  const buf = png(raster(t.size, t.maskable), t.size);
  fs.writeFileSync(path.join(PUBLIC, t.file), buf);
  console.log(`  ${t.file.padEnd(26)} ${t.size}x${t.size}  ${buf.length} bytes`);
}
fs.writeFileSync(path.join(PUBLIC, "manifest.webmanifest"), JSON.stringify(MANIFEST, null, 2) + "\n");
console.log("  manifest.webmanifest");

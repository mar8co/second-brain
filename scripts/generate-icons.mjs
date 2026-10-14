// Genera le icone PNG della PWA a partire da public/favicon.svg (sharp):
// cervello nero su quadrato rosa, come vogliono le linee guida.
// Uso: npm run icons
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/favicon.svg", import.meta.url));
const out = (p) => new URL(`../public/${p}`, import.meta.url).pathname;
await mkdir(out("icons"), { recursive: true });

// Icone "any": l'SVG ha già gli angoli arrotondati.
for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(out(`icons/icon-${size}.png`));
}

// Apple touch icon e maskable: quadrato pieno (iOS e Android arrotondano da sé),
// con il simbolo dentro la "safe zone".
const full = Buffer.from(
  svg.toString().replace('rx="112"', 'rx="0"'),
);
await sharp(full).resize(180, 180).png().toFile(out("apple-touch-icon.png"));
const inner = await sharp(full).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#ffb5d0" } })
  .composite([{ input: inner, left: 56, top: 56 }])
  .png()
  .toFile(out("icons/icon-maskable-512.png"));
console.log("Icone generate.");

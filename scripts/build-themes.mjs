// Builds themes/<name>.css from themes/<name>.src.css by replacing
// __SPACE_BANNER__ with assets/space-banner.jpg as a data URI. bb serves theme
// CSS as a single stylesheet, so images must be inlined.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const themesDir = join(root, "themes");
const MAX_BYTES = 256 * 1024;

const banner = readFileSync(join(root, "assets", "space-banner.jpg")).toString("base64");

for (const file of readdirSync(themesDir).filter((f) => f.endsWith(".src.css"))) {
  const css = readFileSync(join(themesDir, file), "utf8").replaceAll(
    "__SPACE_BANNER__",
    `data:image/jpeg;base64,${banner}`,
  );
  const size = Buffer.byteLength(css);
  if (size > MAX_BYTES) {
    throw new Error(`${file}: ${size} bytes exceeds bb's ${MAX_BYTES}-byte theme limit`);
  }
  const out = file.replace(".src.css", ".css");
  writeFileSync(join(themesDir, out), css);
  console.log(`themes/${out}: ${size} bytes`);
}

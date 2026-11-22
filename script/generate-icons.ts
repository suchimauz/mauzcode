// Regenerates every built-in MauzCode icon from the canonical brand SVG (src/ui/assets/icon.svg):
// web/PWA PNGs, desktop PNG/ICO/ICNS/tray assets and browser extension icons.
// Run: bun script/generate-icons.ts (or `cd desktop && bun run icons`). Needs the @resvg/resvg-js devDependency.
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dir, '..');
const svg = readFileSync(path.join(root, 'src/ui/assets/icon.svg'), 'utf8');
const BACKGROUND = '#252a34';

/** Renders an SVG to a square PNG of the given pixel size. */
function render(source: string, size: number, background?: string): Buffer {
    return Buffer.from(new Resvg(source, { fitTo: { mode: 'width', value: size }, background }).render().asPng());
}

/** Full-bleed variant (no rounded corners) for home-screen icons that the OS masks itself. */
const square = svg.replace(/<rect([^>]*?) rx="[^"]*"/, '<rect$1');
/** macOS menu-bar template: transparent tile, every mark drawn in opaque black. */
const template = svg.replace(/<rect[^>]*\/>/, '').replace(/(stroke|fill)="#(?!000)[0-9a-fA-F]{3,6}"/g, '$1="#000"');

function write(file: string, data: Buffer) {
    const full = path.join(root, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, data);
}

// Web: /ui/app-icon serves these opaque PNGs (apple-touch-icon and web manifest).
for (const size of [180, 192, 512]) write(`src/ui/assets/icon-${size}.png`, render(square, size, BACKGROUND));

// Desktop client.
const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const images = new Map(sizes.map(size => [size, render(svg, size)]));
const png = (size: number) => images.get(size)!;
write('desktop/assets/icon.png', png(512));
write('desktop/assets/tray.png', png(32));
write('desktop/assets/trayTemplate.png', render(template, 18));
write('desktop/assets/trayTemplate@2x.png', render(template, 36));

const icoSizes = sizes.filter(size => size <= 256);
const directory = Buffer.alloc(6 + 16 * icoSizes.length);
directory.writeUInt16LE(1, 2); directory.writeUInt16LE(icoSizes.length, 4);
let offset = directory.length;
icoSizes.forEach((size, index) => {
    const entry = 6 + index * 16, image = png(size);
    directory[entry] = directory[entry + 1] = size === 256 ? 0 : size;
    directory.writeUInt16LE(1, entry + 4); directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.length, entry + 8); directory.writeUInt32LE(offset, entry + 12);
    offset += image.length;
});
write('desktop/assets/icon.ico', Buffer.concat([directory, ...icoSizes.map(png)]));

const entries = ([['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]] as const).map(([type, size]) => {
    const header = Buffer.alloc(8);
    header.write(type); header.writeUInt32BE(png(size).length + 8, 4);
    return Buffer.concat([header, png(size)]);
});
const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns'); icnsHeader.writeUInt32BE(8 + entries.reduce((sum, entry) => sum + entry.length, 0), 4);
write('desktop/assets/icon.icns', Buffer.concat([icnsHeader, ...entries]));

// Browser extensions.
for (const dir of ['browser-extension', 'extensions/canvas-frames'])
    for (const size of [16, 32, 48, 128]) write(`${dir}/icons/icon-${size}.png`, size <= 64 ? png(size) : render(svg, size));

console.log('Generated MauzCode icons from src/ui/assets/icon.svg');

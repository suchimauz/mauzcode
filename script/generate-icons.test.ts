import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dir, '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const svg = read('src/ui/assets/icon.svg');

test('generated brand icon copies match the canonical SVG (run bun script/generate-icons.ts after editing it)', () => {
    expect(read('frontend/public/brand-icon.svg')).toBe(svg);
    for (const file of ['desktop/index.html', 'docs/index.html']) {
        const href = /<link rel="icon" data-brand-icon href="([^"]*)">/.exec(read(file))?.[1];
        expect(href).toStartWith('data:image/svg+xml,');
        expect(decodeURIComponent(href!.slice('data:image/svg+xml,'.length))).toBe(svg.trim());
    }
    expect(read('desktop/index.html')).toContain('img-src data:');
});

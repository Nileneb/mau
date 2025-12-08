#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

const args = process.argv.slice(2);
const inputDirArgIndex = args.findIndex(a => a === '--input');
const inputDir = inputDirArgIndex !== -1 ? args[inputDirArgIndex + 1] : 'public/images/cat';
const sizesArgIndex = args.findIndex(a => a === '--sizes');
const defaultSizes = [28, 56, 128, 256, 512];
const sizes = sizesArgIndex !== -1 ? args[sizesArgIndex + 1].split(',').map(s => parseInt(s.trim())).filter(Boolean) : defaultSizes;
const force = args.includes('--force');

async function listFiles(dir) {
    const items = await fs.readdir(dir, { withFileTypes: true });
    return items.filter(it => it.isFile()).map(it => it.name);
}

function buildRegex(sizes) {
    const joined = sizes.join('|');
    return new RegExp(`-(?:${joined})\\.(jpe?g|png|webp)$`, 'i');
}

async function main() {
    const dir = path.resolve(process.cwd(), inputDir);
    if (!existsSync(dir)) {
        console.error('Input directory does not exist:', dir);
        process.exit(1);
    }
    const files = await listFiles(dir);
    const rx = buildRegex(sizes);
    const toDelete = files.filter(f => rx.test(f));
    if (!toDelete.length) {
        console.log('No converted suffix files found in', dir);
        process.exit(0);
    }
    console.log('Found', toDelete.length, 'files that look like converted variants:');
    toDelete.forEach(f => console.log('  ', f));
    if (!force) {
        console.log('\nRun with --force to delete these files');
        process.exit(0);
    }
    for (const f of toDelete) {
        const fp = path.join(dir, f);
        await fs.unlink(fp);
        console.log('Deleted', fp);
    }
    console.log('Deletion complete');
}

main();

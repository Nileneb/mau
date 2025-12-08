#!/usr/bin/env node
/*
 * Image conversion script
 * - Converts JPG/PNG to optimized WebP
 * - Produces two sizes: mobile (128x128) and desktop (512x512)
 * - Keeps originals in place and writes new files with suffixes: image-128.webp & image-512.webp
 *
 * Usage: node scripts/convert-images.js [--input public/images/cat] [--quality 80]
 */
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import sharp from 'sharp';

const args = process.argv.slice(2);
const inputDirArgIndex = args.findIndex(a => a === '--input');
const inputDir = inputDirArgIndex !== -1 ? args[inputDirArgIndex + 1] : 'public/images/cat';
const qualityArgIndex = args.findIndex(a => a === '--quality');
const quality = qualityArgIndex !== -1 ? parseInt(args[qualityArgIndex + 1]) : 80;
// allow sizes list: comma separated or defaults
const sizesArgIndex = args.findIndex(a => a === '--sizes');
const defaultSizes = [28, 56, 128, 256, 512];
let sizes = sizesArgIndex !== -1 ? (args[sizesArgIndex + 1].split(',').map(s => parseInt(s.trim())).filter(Boolean)) : defaultSizes;
// Ensure defaults are always included (e.g. 28/56) so mobile optimization exists even if sizes flag is omitted
sizes = Array.from(new Set([...defaultSizes, ...sizes])).sort((a, b) => a - b);

async function getImages(dir) {
    const items = await fs.readdir(dir, { withFileTypes: true });
    const files = items.filter(it => it.isFile()).map(it => it.name);
    // Only pick original image files (not already suffixed with -<size>), so we don't keep
    // re-processing converted files and create nested suffixes like name-128-128.jpg
    return files.filter(f => /\.(jpe?g|png)$/i.test(f) && !/(-\d+)+\.(jpe?g|png)$/i.test(f));
}

async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (e) {
        // ignore
    }
}

async function convertImage(filePath, size) {
    const ext = path.extname(filePath);
    // Normalize base name: strip previous size suffixes like -128, -512, -128-512 etc.
    const baseRaw = path.basename(filePath, ext);
    // Remove trailing -{numbers} or -{numbers}-{numbers} suffixes
    // Remove any trailing size suffixes like -128, -512, -128-512 etc.
    const base = baseRaw.replace(/(-\d+)+$/, '');
    const dir = path.dirname(filePath);
    // write into size subfolder e.g. /.../cat/28/<basename>.webp
    const targetDir = path.join(dir, String(size));
    await ensureDir(targetDir);
    const outWebpPath = path.join(targetDir, base + '.webp');
    const outJpegPath = path.join(targetDir, base + '.jpg');

    try {
        // Create small WebP
        await sharp(filePath)
            .resize(size, size, { fit: 'cover' })
            .webp({ quality })
            .toFile(outWebpPath);
        console.log(`Converted ${filePath} -> ${outWebpPath}`);
    } catch (e) {
        console.error(`Failed to convert ${filePath} to webp: ${e.message}`);
    }

    try {
        // Create small JPEG fallback to serve browsers without WebP
        await sharp(filePath)
            .resize(size, size, { fit: 'cover' })
            .jpeg({ quality })
            .toFile(outJpegPath);
        console.log(`Converted ${filePath} -> ${outJpegPath}`);
    } catch (e) {
        console.error(`Failed to convert ${filePath} to jpeg: ${e.message}`);
    }
}

async function main() {
    const dir = path.resolve(process.cwd(), inputDir);
    if (!existsSync(dir)) {
        console.error('Input directory does not exist:', dir);
        process.exit(1);
    }
    const files = await getImages(dir);
    if (!files.length) {
        console.log('No JPG/PNG images found in', dir);
        process.exit(0);
    }

    console.log(`Converting ${files.length} images in ${dir} to formats: ${sizes.join(', ')}...`);
    const variants = {};
    for (const file of files) {
        const fp = path.join(dir, file);
        const rel = `/${path.relative(path.join(process.cwd(), 'public'), fp).replace(/\\\\/g, '/')}`; // e.g. /images/cat/20240124_163823.jpg
        const key = path.basename(file);
        variants[key] = {};
        for (const s of sizes) {
            await convertImage(fp, s);
        }
    }
    // normalize the variant paths (since base is from basename raw)
    // We'll rebuild the variants map properly by scanning folders
    const finalVariants = {};
    for (const file of files) {
        const baseName = path.basename(file, path.extname(file));
        finalVariants[file] = {};
        for (const s of sizes) {
            const webpPath = `/images/cat/${s}/${baseName}.webp`;
            const jpgPath = `/images/cat/${s}/${baseName}.jpg`;
            finalVariants[file][String(s)] = { webp: webpPath, jpg: jpgPath };
        }
    }

    // write variants.json into the image directory
    try {
        const outVariantsPath = path.join(dir, 'variants.json');
        await fs.writeFile(outVariantsPath, JSON.stringify(finalVariants, null, 2), 'utf8');
        console.log('Wrote variants manifest to', outVariantsPath);
    } catch (e) {
        console.error('Failed to write variants.json:', e.message);
    }
    console.log('Done');
}

main();

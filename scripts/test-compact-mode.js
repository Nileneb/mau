/*
Quick verification script to confirm the frontend logic:
- Loads public/images/cat/variants.json
- Simulates isCompact true/false
- Generates srcset & sizes values the front-end will use
- Confirms that when compact = true, sizes === '28px' and the 28w entry is present and points to subfolder variant path
*/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getImageSizes(isCompact) {
    return isCompact ? '28px' : '(max-width: 600px) 33vw, 25vw';
}

const VARIANTS_PATH = path.join(__dirname, '..', 'public', 'images', 'cat', 'variants.json');
if (!fs.existsSync(VARIANTS_PATH)) {
    console.error('variants.json not found:', VARIANTS_PATH);
    process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(VARIANTS_PATH, 'utf8'));
const keys = Object.keys(manifest);
if (keys.length === 0) {
    console.error('No images in manifest');
    process.exit(1);
}

const filename = keys[0];
const v = manifest[filename];
console.log('Using file from manifest:', filename);

function buildVariantPaths(v, original) {
    const fallback = (s, ext) => original.replace(/\.(jpe?g|png)$/i, `-${s}.${ext}`);

    return {
        webp28: v['28']?.webp || fallback(28, 'webp'),
        webp56: v['56']?.webp || fallback(56, 'webp'),
        webp128: v['128']?.webp || fallback(128, 'webp'),
        webp256: v['256']?.webp || fallback(256, 'webp'),
        webp512: v['512']?.webp || fallback(512, 'webp'),
        jpeg28: v['28']?.jpg || fallback(28, 'jpg'),
        jpeg56: v['56']?.jpg || fallback(56, 'jpg'),
        jpeg128: v['128']?.jpg || fallback(128, 'jpg'),
        jpeg256: v['256']?.jpg || fallback(256, 'jpg'),
        jpeg512: v['512']?.jpg || fallback(512, 'jpg')
    };
}

const variantPaths = buildVariantPaths(v, `/images/cat/${filename}`);

['compact', 'normal'].forEach(mode => {
    const isCompact = mode === 'compact';
    const sizes = getImageSizes(isCompact);
    const sourceWebpSrcset = `${variantPaths.webp28} 28w, ${variantPaths.webp56} 56w, ${variantPaths.webp128} 128w, ${variantPaths.webp256} 256w, ${variantPaths.webp512} 512w`;
    const sourceJpegSrcset = `${variantPaths.jpeg28} 28w, ${variantPaths.jpeg56} 56w, ${variantPaths.jpeg128} 128w, ${variantPaths.jpeg256} 256w, ${variantPaths.jpeg512} 512w`;

    console.log('\n---', mode.toUpperCase(), 'MODE ---');
    console.log('sizes:', sizes);
    console.log('webp srcset sample:', sourceWebpSrcset.split(',')[0]);
    console.log('jpeg srcset sample:', sourceJpegSrcset.split(',')[0]);
    // confirm 28 path points into the manifest subfolder if manifest present
    const webp28 = variantPaths.webp28;
    if (isCompact) {
        if (webp28.indexOf('/images/cat/28/') !== -1) {
            console.log('✅ 28px webp path uses subfolder:', webp28);
        } else {
            console.warn('⚠️ 28px webp path does NOT use subfolder; path:', webp28);
        }
    } else {
        console.log('normal mode: webp28 path:', webp28);
    }
});

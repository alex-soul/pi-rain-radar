// Rebuild bundled installation icons from the small, source-controlled SVG.
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const input=await readFile(new URL('../public/icon.svg',import.meta.url));
for(const size of [192,512]) await sharp(input).resize(size,size).png().toFile(fileURLToPath(new URL(`../public/icon-${size}.png`,import.meta.url)));
// Keep the complete mark inside the central 80% mask-safe diameter.
const mark=await sharp(input).resize(384,384).png().toBuffer();
await sharp({create:{width:512,height:512,channels:4,background:'#142623'}}).composite([{input:mark,left:64,top:64}]).png().toFile(fileURLToPath(new URL('../public/icon-maskable-512.png',import.meta.url)));

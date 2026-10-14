/** Generates the PWA icons from an original vector mark (a small crystal lattice). */
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';

const mark = (bg: string, pad: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="${bg}"/>
  <g transform="translate(${pad},${pad}) scale(${(512 - 2 * pad) / 512})">
    <g stroke="#fff" stroke-width="22" stroke-linejoin="round" opacity="0.75" fill="none">
      <path d="M140 170 256 112l116 58v128l-116 58-116-58z"/>
      <path d="M256 112v120M140 170l116 62 116-62M256 232v122"/>
    </g>
    <g fill="#fff">
      <circle cx="256" cy="112" r="34"/><circle cx="140" cy="170" r="34"/><circle cx="372" cy="170" r="34"/>
      <circle cx="256" cy="232" r="40"/><circle cx="140" cy="298" r="34"/><circle cx="372" cy="298" r="34"/>
      <circle cx="256" cy="356" r="34"/>
    </g>
    <rect x="128" y="404" width="256" height="28" rx="14" fill="#fff" opacity="0.9"/>
  </g>
</svg>`;

mkdirSync('public/icons', { recursive: true });
const svg = mark('#9d2529', 0);
writeFileSync('public/icons/icon.svg', svg);
const maskable = mark('#9d2529', 0).replace('rx="112"', 'rx="0"');
const run = async () => {
  await sharp(Buffer.from(svg)).resize(192, 192).png().toFile('public/icons/icon-192.png');
  await sharp(Buffer.from(svg)).resize(512, 512).png().toFile('public/icons/icon-512.png');
  // maskable: full-bleed background, artwork inside the 80% safe zone
  await sharp(Buffer.from(mark('#9d2529', 72).replace('rx="0"', 'rx="0"'))).resize(512, 512).png().toFile('public/icons/icon-maskable-512.png');
  await sharp(Buffer.from(mark('#9d2529', 40).replace('rx="0"', 'rx="0"'))).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
  void maskable;
};
run();

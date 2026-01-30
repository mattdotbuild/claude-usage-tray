const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// Generate app icon (matches the one in main.js)
function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Navy background with rounded corners
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#1e2a45');
  gradient.addColorStop(1, '#0f1729');

  // Draw rounded square background
  const radius = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Add subtle inner glow
  const innerGlow = ctx.createRadialGradient(size * 0.3, size * 0.3, 0, size * 0.5, size * 0.5, size * 0.7);
  innerGlow.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
  innerGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = innerGlow;
  ctx.fill();

  const cx = size / 2;
  const cy = size / 2;
  const gaugeRadius = size * 0.38;
  const strokeWidth = size * 0.06;

  // Draw gauge track (background arc)
  ctx.beginPath();
  ctx.arc(cx, cy, gaugeRadius, -Math.PI * 0.75, Math.PI * 0.75);
  ctx.strokeStyle = 'rgba(148, 180, 255, 0.2)';
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Draw gauge fill (amber arc) - about 70% filled
  ctx.beginPath();
  const startAngle = -Math.PI * 0.75;
  const endAngle = startAngle + (Math.PI * 1.5 * 0.7);
  ctx.arc(cx, cy, gaugeRadius, startAngle, endAngle);

  const gaugeGradient = ctx.createLinearGradient(0, 0, size, size);
  gaugeGradient.addColorStop(0, '#f59e0b');
  gaugeGradient.addColorStop(1, '#d97706');
  ctx.strokeStyle = gaugeGradient;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Draw lightning bolt in center
  ctx.save();
  const boltScale = size / 100;
  ctx.translate(cx - 14 * boltScale, cy - 24 * boltScale);
  ctx.scale(boltScale, boltScale);

  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(0, 28);
  ctx.lineTo(14, 28);
  ctx.lineTo(8, 48);
  ctx.lineTo(28, 18);
  ctx.lineTo(16, 18);
  ctx.lineTo(20, 0);
  ctx.closePath();

  const boltGradient = ctx.createLinearGradient(0, 0, 28, 48);
  boltGradient.addColorStop(0, '#fbbf24');
  boltGradient.addColorStop(1, '#f59e0b');
  ctx.fillStyle = boltGradient;
  ctx.fill();

  ctx.restore();

  return canvas;
}

// Generate icons at multiple sizes for ICO
const sizes = [256, 128, 64, 48, 32, 16];
const assetsDir = path.join(__dirname, 'assets');

// Ensure assets directory exists
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Generate main 256x256 PNG (electron-builder can use this)
const mainIcon = generateIcon(256);
const mainBuffer = mainIcon.toBuffer('image/png');
fs.writeFileSync(path.join(assetsDir, 'icon.png'), mainBuffer);
console.log('Generated assets/icon.png (256x256)');

// Generate all sizes
sizes.forEach(size => {
  const canvas = generateIcon(size);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(assetsDir, `icon-${size}.png`), buffer);
  console.log(`Generated assets/icon-${size}.png`);
});

console.log('\nIcon generation complete!');
console.log('To build the app, run: npm run build');

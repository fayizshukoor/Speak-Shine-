import { createCanvas } from "canvas";
import fs from "fs";

export default async function generatePoster(question) {
  const canvas = createCanvas(1080, 1080);
  const ctx = canvas.getContext("2d");

  // ===== Background Gradient =====
  const bg = ctx.createLinearGradient(0, 0, 1080, 1080);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(1, "#111827");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1080);

  // ===== Top Glow =====
  const glow = ctx.createRadialGradient(540, 100, 50, 540, 100, 400);
  glow.addColorStop(0, "rgba(34,197,94,0.18)");
  glow.addColorStop(1, "rgba(34,197,94,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 350);

  // ===== TITLE =====
  ctx.textAlign = "center";
  ctx.fillStyle = "#000000";
  ctx.font = "bold 68px Arial";
  ctx.fillText("Speak & Shine", 544, 124); // shadow

  ctx.fillStyle = "#ffffff";
  ctx.fillText("Speak & Shine", 540, 120);

  // ===== Subtitle =====
  ctx.fillStyle = "#9ca3af";
  ctx.font = "32px Arial";
  ctx.fillText("Daily Speaking Challenge", 540, 180);

  // ===== Quote Box =====
  drawRoundedRect(ctx, 70, 240, 940, 220, 28, "#1e293b");

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "36px Arial";
  wrapText(ctx, `"${question.quote}"`, 100, 315, 880, 48);

  // ===== Question Box =====
  drawRoundedRect(ctx, 70, 520, 940, 270, 28, "#14532d");

  ctx.fillStyle = "#22c55e";
  ctx.font = "bold 46px Arial";
  wrapText(ctx, `Q: ${question.question}`, 100, 610, 880, 58);

  // ===== Footer =====
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "32px Arial";
  ctx.fillText("Send your 1-min speaking video", 540, 950);

  // ===== Bottom line =====
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(260, 980, 560, 4);

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync("./daily.png", buffer);
}

// ===== Rounded Rectangle =====
function drawRoundedRect(ctx, x, y, width, height, radius, color) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();
}

// ===== Text Wrap =====
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    const width = ctx.measureText(testLine).width;

    if (width > maxWidth && i > 0) {
      ctx.fillText(line, x, y);
      line = words[i] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }

  ctx.fillText(line, x, y);
}

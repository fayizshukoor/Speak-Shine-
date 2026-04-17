import { createCanvas } from "canvas";
import fs from "fs";

export default async function generatePoster(question) {
  const canvas = createCanvas(1080, 1080);
  const ctx = canvas.getContext("2d");

  // ===== Background: Deep Slate Gradient =====
  const bg = ctx.createLinearGradient(0, 0, 0, 1080);
  bg.addColorStop(0, "#020617");
  bg.addColorStop(1, "#0f172a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1080);

  // ===== Ambient Glow (Top Right & Bottom Left) =====
  drawGlow(ctx, 800, 100, 600, "rgba(34, 197, 94, 0.12)");
  drawGlow(ctx, 100, 900, 500, "rgba(59, 130, 246, 0.08)");

  // ===== Header Section =====
  ctx.textAlign = "center";

  // Subtle Glow behind Title
  ctx.shadowBlur = 20;
  ctx.shadowColor = "rgba(34, 197, 94, 0.4)";

  // Title with Gradient
  const titleGrad = ctx.createLinearGradient(400, 0, 680, 0);
  titleGrad.addColorStop(0, "#ffffff");
  titleGrad.addColorStop(1, "#4ade80");
  ctx.fillStyle = titleGrad;
  ctx.font = "bold 82px Arial";
  ctx.fillText("Speak & Shine", 540, 140);

  // Reset Shadow
  ctx.shadowBlur = 0;

  // Subtitle
  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 34px Arial";
  ctx.fillText("DAILY SPEAKING CHALLENGE", 540, 200);

  // ===== Quote Card (Glassmorphism style) =====
  // drawCard(ctx, x, y, width, height, radius, bgColor, borderColor)
  drawCard(
    ctx,
    80,
    280,
    920,
    240,
    32,
    "rgba(30, 41, 59, 0.5)",
    "rgba(255,255,255,0.1)",
  );

  ctx.textAlign = "left";
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "italic 38px Arial";
  wrapText(ctx, `"${question.quote}"`, 130, 360, 820, 52);

  // ===== Question Card (Highlight style) =====
  drawCard(ctx, 80, 560, 920, 300, 32, "rgba(20, 83, 45, 0.3)", "#22c55e");

  ctx.fillStyle = "#4ade80";
  ctx.font = "bold 28px Arial";
  ctx.fillText("TODAY'S TOPIC", 130, 620);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 52px Arial";
  wrapText(ctx, question.question, 130, 690, 820, 64);

  // ===== Footer: Modern Button Style =====
  const footerY = 960;
  drawRoundedRect(ctx, 240, footerY - 50, 600, 80, 40, "#22c55e");

  ctx.textAlign = "center";
  ctx.fillStyle = "#052e16";
  ctx.font = "bold 32px Arial";
  ctx.fillText("Send your 1-min video", 540, footerY + 2);

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync("./daily.png", buffer);
}

// --- Helper: Modern Card with Border ---
function drawCard(ctx, x, y, width, height, radius, bgColor, borderColor) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = bgColor;
  ctx.fill();

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// --- Helper: Ambient Glows ---
function drawGlow(ctx, x, y, radius, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

// --- Standard Rounded Rect ---
function drawRoundedRect(ctx, x, y, width, height, radius, color) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

// --- Enhanced Wrap Text ---
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line, x, y);
      line = words[i] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

import fs from "fs";
import https from "https";

export default async function generateVoice(text, filePath) {
  const encodedText = encodeURIComponent(text);

  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=en&client=tw-ob`;

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error("Failed to fetch audio"));
          return;
        }

        res.pipe(file);

        file.on("finish", () => {
          file.close(() => resolve(true));
        });

        file.on("error", (err) => {
          fs.unlink(filePath, () => {});
          reject(err);
        });
      },
    );

    // ⏱ timeout (10 sec)
    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error("TTS request timeout"));
    });

    request.on("error", (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
}

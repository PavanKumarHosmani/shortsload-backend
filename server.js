import express from "express";
import cors from "cors";
import { spawn } from "child_process";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("✅ ShortsLoad Backend Running"));

app.get("/api/getinfo", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  const proc = spawn("yt-dlp", ["-j", "--no-warnings", url]);
  let out = "", err = "";

  proc.stdout.on("data", (d) => (out += d.toString()));
  proc.stderr.on("data", (d) => (err += d.toString()));

  proc.on("close", (code) => {
    if (code !== 0 || !out.trim()) {
      console.error("yt-dlp error:", err);
      return res.status(500).json({ error: "Failed to fetch formats" });
    }

    try {
      const meta = JSON.parse(out);

      // ✅ Include both mp4 + webm, exclude m3u8 + storyboards
      const formats = (meta.formats || [])
        .filter(
          (f) =>
            f.url &&
            !f.url.includes(".m3u8") &&
            f.ext !== "mhtml" &&
            (f.vcodec !== "none" || f.acodec !== "none")
        )
        .map((f) => ({
          quality: f.height ? `${f.height}p` : "audio",
          ext: f.ext,
          hasAudio: f.acodec !== "none",
          hasVideo: f.vcodec !== "none",
          acodec: f.acodec,
          vcodec: f.vcodec,
          url: f.url,
        }))
        // Sort: with audio first, then higher resolution
        .sort((a, b) => {
          if (a.hasAudio !== b.hasAudio) return b.hasAudio - a.hasAudio;
          return (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0);
        });

      res.json({
        title: meta.title,
        thumbnail: meta.thumbnail,
        formats,
      });
    } catch (e) {
      console.error("Parse error:", e);
      res.status(500).json({ error: "Parse error" });
    }
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));

import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import NodeCache from "node-cache";

const app = express();

// 🧠 Cache YouTube metadata for 1 hour (3600 seconds)
const cache = new NodeCache({ stdTTL: 3600 });

// ✅ Allow frontend & localhost
const allowedOrigins = [
  "https://www.shortsload.com",
  "http://localhost:3000"
];

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET"],
}));

app.use(express.json());

app.get("/", (req, res) => res.send("✅ ShortsLoad Backend Running"));

// 🧩 Extract video ID (works for YouTube Shorts, normal URLs, etc.)
function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.searchParams.has("v")) return u.searchParams.get("v");
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
    return null;
  } catch {
    return null;
  }
}

app.get("/api/getinfo", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: "Invalid YouTube URL" });

  // ✅ 1. Check cache first
  const cached = cache.get(videoId);
  if (cached) {
    console.log(`⚡ Cache hit: ${videoId}`);
    return res.json(cached);
  }

  console.log(`🆕 Cache miss: ${videoId}`);

  // ✅ 2. Fetch via yt-dlp if not cached
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

      // ✅ Only formats with BOTH audio & video
      const formats = (meta.formats || [])
        .filter(
          (f) =>
            f.url &&
            !f.url.includes(".m3u8") &&
            f.ext !== "mhtml" &&
            f.vcodec !== "none" &&
            f.acodec !== "none"
        )
        .map((f) => ({
          quality: f.height ? `${f.height}p` : "unknown",
          ext: f.ext,
          hasAudio: f.acodec !== "none",
          hasVideo: f.vcodec !== "none",
          acodec: f.acodec,
          vcodec: f.vcodec,
          url: f.url,
        }))
        .sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

      const result = {
        title: meta.title,
        thumbnail: meta.thumbnail,
        formats,
      };

      // ✅ 3. Store in cache
      cache.set(videoId, result);
      console.log(`💾 Cached: ${videoId}`);

      res.json(result);
    } catch (e) {
      console.error("Parse error:", e);
      res.status(500).json({ error: "Parse error" });
    }
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));

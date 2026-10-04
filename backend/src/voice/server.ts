import "../../scripts/load-env.js";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { createGeminiGenerate } from "./gemini.js";
import { loadVoiceContext } from "./context.js";
import { createChatterboxSynthesize, createVoiceService } from "./service.js";

const service = createVoiceService({ configured: !!process.env.GEMINI_API_KEY,
  loadContext: loadVoiceContext,
  generate: createGeminiGenerate({ key: process.env.GEMINI_API_KEY ?? "", model: process.env.GEMINI_MODEL }),
  synthesize: createChatterboxSynthesize(process.env.CHATTERBOX_URL ?? "http://127.0.0.1:8001"),
});
const voiceDir = fileURLToPath(new URL("../../voice/", import.meta.url));
const python = fileURLToPath(new URL(process.platform === "win32" ? "../../voice/.venv/Scripts/python.exe" : "../../voice/.venv/bin/python", import.meta.url));
const tts = process.env.VOICE_MANAGE_TTS === "false" ? null : spawn(python, ["service.py"], { cwd: voiceDir, stdio: "inherit", windowsHide: true, env: process.env });
tts?.on("error", () => console.error("Chatterbox could not start. Run the setup steps in docs/voice-assistant.md."));
const server = createServer(async (req, res) => {
  const controller = new AbortController();
  req.on("aborted", () => controller.abort());
  res.on("close", () => { if (!res.writableEnded) controller.abort(); });
  try {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 3_000_000) { res.writeHead(413, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { code: "TOO_LARGE", message: "The recording is too large.", retryable: false } })); return; }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
    const response = await service.handle(new Request(`http://localhost${req.url ?? "/"}`, { method: req.method, headers, ...(size ? { body: Buffer.concat(chunks) } : {}), signal: controller.signal }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    else res.end();
  } catch {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { code: "UNAVAILABLE", message: "The voice service could not process the request.", retryable: true } }));
  }
});
const timer = setInterval(service.reap, 30_000); timer.unref();
server.listen(Number(process.env.VOICE_PORT ?? 3002), "127.0.0.1", () => console.log(`Voice API listening on http://127.0.0.1:${process.env.VOICE_PORT ?? 3002}`));
for (const event of ["SIGINT", "SIGTERM"] as const) process.on(event, () => { clearInterval(timer); service.dispose(); tts?.kill(); server.close(() => process.exit(0)); });

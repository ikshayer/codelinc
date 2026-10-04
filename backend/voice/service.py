"""Loopback-only, warm Chatterbox Turbo service. No audio or transcript files."""
import asyncio
import io
import logging
import os
import time
import wave
from contextlib import asynccontextmanager
from pathlib import Path

os.environ.setdefault("HF_HOME", str(Path(__file__).parent / ".cache"))
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

log = logging.getLogger("chatterbox")
device = os.getenv("CHATTERBOX_DEVICE", "cuda")
model = None
state = "loading"
failure = None
lock = asyncio.Lock()


def load_model():
    global model, state, failure
    try:
        if device not in ("cuda", "cpu"):
            raise RuntimeError("CHATTERBOX_DEVICE must be cuda or cpu.")
        if device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA is unavailable to this process. Run npm run dev:voice from your normal Windows terminal, verify the NVIDIA driver, and check the CUDA PyTorch installation. CPU fallback is disabled; set CHATTERBOX_DEVICE=cpu explicitly for diagnostics.")
        torch.set_num_threads(min(8, os.cpu_count() or 4))
        if device == "cuda":
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
        from chatterbox.tts_turbo import ChatterboxTurboTTS
        from huggingface_hub import snapshot_download
        from huggingface_hub.errors import IncompleteSnapshotError, LocalEntryNotFoundError
        required = ["ve.safetensors", "t3_turbo_v1.safetensors", "s3gen_meanflow.safetensors", "conds.pt"]
        cached = None
        try:
            cached = snapshot_download("ResembleAI/chatterbox-turbo", local_files_only=True, allow_patterns=required + ["*.json", "*.txt"])
            if not all((Path(cached) / name).exists() for name in required):
                cached = None
        except (LocalEntryNotFoundError, IncompleteSnapshotError):
            pass
        if cached is None:
            cached = snapshot_download("ResembleAI/chatterbox-turbo", allow_patterns=required + ["*.json", "*.txt"], token=os.getenv("HF_TOKEN") or None)
        candidate = ChatterboxTurboTTS.from_local(cached, device=device)
        reference = os.getenv("CHATTERBOX_VOICE_PATH")
        if reference:
            candidate.prepare_conditionals(reference)
        if candidate.conds is None:
            raise RuntimeError("This model has no built-in voice. Set CHATTERBOX_VOICE_PATH to a local reference WAV longer than five seconds.")
        # Warm the model before accepting replies; model downloads aren't on the conversation path.
        with torch.inference_mode():
            candidate.generate("Hello. How can I help?")
        model = candidate
        state = "ready"
        log.warning("Chatterbox Turbo ready on %s", torch.cuda.get_device_name(0) if device == "cuda" else "CPU")
    except Exception as exc:
        state = "failed"
        failure = str(exc)
        log.error("Chatterbox setup failed: %s", failure)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(asyncio.to_thread(load_model))
    yield
    await task


app = FastAPI(lifespan=lifespan)


class Speech(BaseModel):
    text: str = Field(min_length=1, max_length=480)


@app.get("/health")
def health():
    return {"state": state, "device": device, "cuda_available": torch.cuda.is_available(), "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None, "torch": torch.__version__, "model": "chatterbox-turbo", "error": failure}


def synthesize(text: str):
    start = time.perf_counter()
    with torch.inference_mode():
        samples = model.generate(text).detach().cpu().squeeze().clamp(-1, 1)
    pcm = (samples.numpy() * 32767).astype("<i2").tobytes()
    audio = io.BytesIO()
    with wave.open(audio, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(model.sr)
        wav.writeframes(pcm)
    return audio.getvalue(), time.perf_counter() - start


@app.post("/synthesize")
async def speech(body: Speech, request: Request):
    if state != "ready":
        raise HTTPException(503, "Chatterbox is not ready. Check /health.")
    if not body.text.strip():
        raise HTTPException(422, "Speech text is empty.")
    async with lock:
        if await request.is_disconnected():
            raise HTTPException(499, "Request cancelled.")
        audio, elapsed = await asyncio.to_thread(synthesize, body.text)
    # Durations aid latency measurement without logging user text.
    return Response(audio, media_type="audio/wav", headers={"Cache-Control": "no-store", "X-Synthesis-Ms": str(round(elapsed * 1000))})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("CHATTERBOX_PORT", "8001")), access_log=False)

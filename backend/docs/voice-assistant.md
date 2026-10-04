# Gemini + local Chatterbox voice assistant

The existing Voice intake screen now has a live service. Gemini transcribes each spoken utterance, streams its reply, and proposes intake facts. Chatterbox Turbo speaks complete sentences as soon as they arrive; the next sentence is synthesized while the previous sentence plays. The microphone ends an utterance after 550 ms of silence. Spoken clips are bounded to 20 seconds and encoded as complete 16 kHz mono WAVs, rather than undecodable recorder fragments.

## Run locally on the RTX 5070 Ti

Dependencies have been installed in `backend/voice/.venv`. The setup is isolated from your global Python. To reproduce it, from `backend` run:

```powershell
./voice/setup.ps1
```

This requires Python 3.11 and `uv`. It installs Chatterbox 0.1.7 and overrides its PyTorch 2.6 pin with the CUDA 12.8 builds of PyTorch/torchaudio 2.8, which support the RTX 50-series. The initial CUDA wheel download is several GB. Models are cached in the ignored `voice/.cache` directory.

Add these **server-only** settings to `backend/.env.local`:

```dotenv
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-3.5-flash-lite
CHATTERBOX_DEVICE=cuda
CHATTERBOX_URL=http://127.0.0.1:8001
VOICE_PORT=3002
```

The default is Gemini 3.5 Flash-Lite with minimal thinking for shorter response delay. Google restricts 2.5 models to projects that have previously used them; the initial 2.5 setting returned 404 for this key. See [Google's model availability guidance](https://ai.google.dev/gemini-api/docs/models). The generation schema omits string and array bounds rejected by Google's structured-output grammar; the server still enforces those limits when validating completed replies.

Run in your normal Windows terminal:

```powershell
npm run dev:voice
```

This starts both the voice API on port 3002 and Chatterbox on port 8001. The model is loaded and warmed once, before speech requests are accepted. First startup downloads the public Turbo model; subsequent starts reuse its local cache without needing a model-host connection. The model supplies a built-in voice; optionally set `CHATTERBOX_VOICE_PATH` to a local reference WAV longer than five seconds before startup.

Leave the frontend running on port 3000, with `NEXT_PUBLIC_CAREWINDOW_MODE=live`. Its separate, server-only `VOICE_BACKEND_URL` defaults to `http://127.0.0.1:3002`; MongoDB and the calculation engine keep their existing ports. Restart the voice service after changing its env values. Open an analysis → Voice intake → Start conversation. Alternatively, select Type instead and send a message; that creates a conversation without requesting the microphone.

Check readiness:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
Invoke-RestMethod http://127.0.0.1:3002/health
```

For low latency, the first response must show `state=ready`, `device=cuda`, and `cuda_available=true`. After the laptop restart on October 4, 2026, both NVIDIA and PyTorch detected the RTX 5070 Ti Laptop GPU, and a CUDA matrix operation passed in the voice environment. Before that restart, NVIDIA reported insufficient permissions and PyTorch saw no devices. The service deliberately reports a setup failure rather than silently falling back to CPU. `CHATTERBOX_DEVICE=cpu` is available for explicit diagnostics, but is not the low-latency configuration.

Actual Turbo inference also passed on the GPU after warmup: a short reply produced 2.16 seconds of valid 24 kHz mono audio in 1.655 seconds (real-time factor 0.77). The earlier CPU sample took 8.543 seconds. These single samples verify GPU synthesis; they do not measure Gemini or end-to-end conversation latency.

## Behavior and limits

- Text and transcripts appear while the reply streams; speech uses local Chatterbox Turbo, without a paid TTS service. Gemini has a quota-limited free tier. A paid Gemini key uses the project's billing configuration; the app does not enable billing or guarantee zero cost.
- Playback uses the browser's audio element. Allow sound for this site if it is blocked. Mute discards current microphone capture. Stop speaking aborts speech downloads and clears playback, including queued sentences. Speaking into the microphone can interrupt playback after the current Gemini turn finishes. Audio is not captured during Gemini generation, so full-duplex interruption of an unfinished model turn is not supported.
- Every accepted proposal has an exact quote from the current utterance. Paths and value types are checked server-side and again by the existing frontend review flow. Voice cannot confirm eligibility or dentist permission to move treatment. Nothing bypasses the Confirm screen or the deterministic calculation engine.
- Sessions require consent, use random bearer capabilities, expire after 15 minutes, and allow at most 40 turns. Ending/clearing a conversation releases capture, playback and session resources. New sessions start with a fresh conversation; existing manually entered facts are not sent to Gemini.
- Conversation history and reply segments live only in server memory. Recorded audio and generated WAVs are never written to MongoDB or disk. The browser keeps the existing draft/transcript in app memory for review. Google receives utterances and the last ten conversation turns; its data terms apply, including product improvement on the free tier. Keep using fictional information in this prototype.
- GPU warmup removes model loading from reply latency. End-of-speech detection, Gemini's first sentence, local synthesis, and browser playback still contribute delay. This is a streaming pipeline, not a guarantee of instantaneous audio. `/synthesize` returns `X-Synthesis-Ms` for measuring local inference without logging text.

## Service contract

The frontend uses same-origin HTTP streaming through Next route handlers. No Gemini key, Python service URL, or permanent credentials are exposed to browser bundles.

| Request | Result |
| --- | --- |
| `POST /api/voice/sessions` | Consent + analysis scope → expiring session and bearer capability |
| `POST /api/voice/sessions/:id/turns` | Typed text or complete base64 WAV → NDJSON person, partial reply, sentence segment, complete extraction, or normalized error |
| `POST /api/voice/sessions/:id/speech` | Server-issued turn ID and sentence index → local WAV |
| `DELETE /api/voice/sessions/:id` | Abort generation and release ephemeral state |

All session operations require the issued bearer capability. Speech accepts only sentences generated in that session. Both services bind to loopback, and the Next bridge rejects requests with another origin. Deploying this local prototype requires a host with GPU access, private service routing, shared/session storage if scaling, and appropriate account-level quota controls.

Documentation used: [Gemini content generation API](https://ai.google.dev/api/generate-content), [audio understanding](https://ai.google.dev/gemini-api/docs/audio), [pricing and free-tier data usage](https://ai.google.dev/gemini-api/docs/pricing), [official Chatterbox](https://github.com/resemble-ai/chatterbox), [PyTorch CUDA builds](https://pytorch.org/get-started/previous-versions/). Context7 was unavailable in this session, so official sources and the installed Next.js route-handler guide were used.

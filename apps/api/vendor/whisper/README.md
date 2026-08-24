# whisper.cpp (prebuilt)

`services/captions.ts` shells out to a prebuilt whisper.cpp CLI to get
word-level caption timings. Two files have to be in this directory:

| File | Source |
|---|---|
| `whisper-cli.exe` (+ its `.dll`s) | [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases) — `whisper-blas-bin-x64.zip` on Windows |
| `ggml-base.en.bin` | `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin` |

Everything here is gitignored — binaries and a 148 MB model don't belong in
the repo. Re-download them on a fresh clone.

## Why not `nodejs-whisper`?

It compiles whisper.cpp from source on first use, so it needs cmake and a C++
toolchain (MSVC on Windows). That is a multi-gigabyte install to produce a
binary upstream already publishes. The prebuilt path needs no compiler.

## Overrides

- `WHISPER_MODEL` — model name, default `base.en`. Resolves to `ggml-<name>.bin`
  in this directory, so a different model means downloading that `.bin` too.
- `WHISPER_MODEL_PATH` — absolute path to a `.bin`, bypassing the name lookup.
- `WHISPER_BIN` — absolute path to the CLI binary.
- `DISABLE_WHISPER=1` — skip transcription entirely; renders lose captions but
  still succeed.

Captions are soft-fail by design: if either file is missing, `transcribeWords`
logs a warning, returns `[]`, and the render continues without captions.

# whisper.cpp (prebuilt)

`services/captions.ts` shells out to a prebuilt whisper.cpp CLI to get
word-level caption timings. Two things have to be in this directory: the CLI
(plus its shared libraries) and a `ggml-*.bin` model.

Get both with:

```bash
pnpm --filter @contentengine/api setup:whisper
```

Everything here is gitignored — binaries and a 148 MB model don't belong in the
repo — so run that once on a fresh clone or in a container build.

## Platform support

| Platform | Archive | Notes |
|---|---|---|
| Windows x64 | `whisper-bin-x64.zip` | needs the VC++ redistributable, see below |
| Linux x64 | `whisper-bin-ubuntu-x64.tar.gz` | works as-is |
| Linux arm64 | `whisper-bin-ubuntu-arm64.tar.gz` | works as-is |
| macOS | — | no prebuilt upstream; build from source and set `WHISPER_BIN` |

Upstream attaches these archives to the rolling **build-number** tags (`b4938`),
not the versioned ones — `v1.9.3` and friends are source-only and carry no
assets at all. `setup-whisper.mjs` pins a build number for that reason; override
it with `WHISPER_BUILD`.

Each archive extracts into its own subdirectory (`Release/` on Windows,
`whisper-bin-ubuntu-x64/` on Linux), so `resolveWhisperBin()` scans one level
down rather than assuming a layout.

### Windows: VCRUNTIME140_1.dll

The Windows build links against the Visual C++ 2015–2022 runtime. If
`whisper-cli.exe` exits immediately with `3221225781` (`STATUS_DLL_NOT_FOUND`)
and captions come back empty, check for the runtime:

```powershell
Test-Path C:\Windows\System32\VCRUNTIME140_1.dll
```

`VCRUNTIME140.dll` alone is not enough — `_1` shipped later and an older redist
install will have the first without the second. Install the current
[VC++ x64 redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe) and
the binary runs. Linux containers are unaffected.

## Why not `nodejs-whisper`?

It compiles whisper.cpp from source on first use, so it needs cmake and a C++
toolchain (MSVC on Windows). That is a multi-gigabyte install to produce a
binary upstream already publishes. The prebuilt path needs no compiler.

## Overrides

- `WHISPER_BUILD` — upstream build tag the setup script pulls, default `b4938`.
- `WHISPER_MODEL` — model name, default `base.en`. Resolves to `ggml-<name>.bin`
  in this directory, so a different model means downloading that `.bin` too.
- `WHISPER_MODEL_PATH` — absolute path to a `.bin`, bypassing the name lookup.
- `WHISPER_BIN` — absolute path to the CLI binary.
- `DISABLE_WHISPER=1` — skip transcription entirely; renders lose captions but
  still succeed.

Captions are soft-fail by design: if either file is missing, `transcribeWords`
logs a warning, returns `[]`, and the render continues without captions. That is
why a broken setup shows up as silently caption-less video rather than an error.

// Downloads the prebuilt whisper.cpp CLI and the caption model into
// apps/api/vendor/whisper. Run once on a fresh clone:
//
//   pnpm --filter @contentengine/api setup:whisper
//
// Both files are gitignored — a CLI and a 148 MB model do not belong in the
// repo — so this script is how any new machine or container gets them.
//
// The versioned tags (v1.9.x) are source-only; upstream attaches the prebuilt
// archives to the rolling build-number tags instead. Hence the pin below.

import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const WHISPER_BUILD = process.env.WHISPER_BUILD || 'b4938'
const MODEL = process.env.WHISPER_MODEL || 'base.en'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VENDOR_DIR = path.resolve(HERE, '../vendor/whisper')

const RELEASE_BASE = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_BUILD}`
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL}.bin`

// Upstream publishes no prebuilt macOS archive; see the note in the catch-all.
function archiveName() {
  const { platform, arch } = process
  if (platform === 'win32' && arch === 'x64') return 'whisper-bin-x64.zip'
  if (platform === 'linux' && arch === 'x64') return 'whisper-bin-ubuntu-x64.tar.gz'
  if (platform === 'linux' && arch === 'arm64') return 'whisper-bin-ubuntu-arm64.tar.gz'
  return null
}

async function download(url, dest) {
  process.stdout.write(`  ${path.basename(dest)} … `)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`)
}

// tar ships with Windows 10+ and every Linux image we target; unzip does not,
// so Windows gets PowerShell's Expand-Archive.
function extract(archive, into) {
  const isZip = archive.endsWith('.zip')
  const result = isZip && process.platform === 'win32'
    ? spawnSync('powershell', [
        '-NoProfile', '-Command',
        `Expand-Archive -Path "${archive}" -DestinationPath "${into}" -Force`,
      ], { stdio: 'inherit' })
    : spawnSync('tar', ['-xf', archive, '-C', into], { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`extract failed (exit ${result.status}) for ${archive}`)
  }
}

// Mirrors resolveWhisperBin() in services/captions.ts: the CLI lands in a
// subdirectory whose name varies by archive.
function findBin() {
  const exe = process.platform === 'win32' ? '.exe' : ''
  const dirs = [VENDOR_DIR]
  for (const e of fs.readdirSync(VENDOR_DIR, { withFileTypes: true })) {
    if (e.isDirectory()) dirs.push(path.join(VENDOR_DIR, e.name))
  }
  for (const name of ['whisper-cli', 'main']) {
    for (const dir of dirs) {
      const p = path.join(dir, name + exe)
      if (fs.existsSync(p)) return p
    }
  }
  return null
}

async function main() {
  const archive = archiveName()
  if (!archive) {
    console.error(
      `No prebuilt whisper.cpp archive for ${process.platform}/${process.arch}.\n` +
      `Upstream publishes Windows x64 and Linux x64/arm64 only. On macOS, build\n` +
      `whisper.cpp from source and point WHISPER_BIN at the resulting binary,\n` +
      `or set DISABLE_WHISPER=1 to render without captions.`,
    )
    process.exit(1)
  }

  fs.mkdirSync(VENDOR_DIR, { recursive: true })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ce_whisper_setup_'))

  try {
    console.log(`whisper.cpp ${WHISPER_BUILD} for ${process.platform}/${process.arch}`)

    if (findBin()) {
      console.log('  CLI already present — skipping')
    } else {
      const archivePath = path.join(tmp, archive)
      await download(`${RELEASE_BASE}/${archive}`, archivePath)
      extract(archivePath, VENDOR_DIR)
    }

    const modelPath = path.join(VENDOR_DIR, `ggml-${MODEL}.bin`)
    if (fs.existsSync(modelPath)) {
      console.log(`  ggml-${MODEL}.bin already present — skipping`)
    } else {
      await download(MODEL_URL, modelPath)
    }

    const bin = findBin()
    if (!bin) throw new Error(`extracted archive but found no CLI under ${VENDOR_DIR}`)
    if (process.platform !== 'win32') fs.chmodSync(bin, 0o755)

    console.log(`\nReady:\n  CLI   ${bin}\n  model ${modelPath}`)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(`\nsetup-whisper failed: ${err.message}`)
  process.exit(1)
})

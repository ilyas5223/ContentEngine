# Music license inventory

Every track in `apps/video/public/music/` MUST be listed here with its source and license. This file is the audit trail — anything not listed gets removed.

## Adding a track

1. Download from a CC0 / royalty-free source (preference order below).
2. Save as `<mood>-<name>.mp3` (e.g. `upbeat-pulse.mp3`, `chill-loft.mp3`, `dramatic-rise.mp3`).
3. Add an entry to the table below with file, source URL, license, and attribution requirement.
4. Register the file in `apps/video/src/audio/manifest.ts` under the matching `MUSIC_BY_MOOD` key. Without that registration, AudioBed won't see it.

## Source preference (most permissive first)

1. **Pixabay Music** (https://pixabay.com/music/) — Pixabay Content License, no attribution required.
2. **YouTube Audio Library** — CC0 / "no attribution" picks only.
3. **Uppbeat free tier** (https://uppbeat.io) — requires the free Uppbeat key in attribution (NOT CC0). Verify per-track terms.
4. **Freesound** (https://freesound.org) — CC0 only. Reject CC-BY tracks unless we add visible credits.

## Inventory

| File | Mood | Source URL | License | Attribution required |
|---|---|---|---|---|
| _none yet_ |  |  |  |  |

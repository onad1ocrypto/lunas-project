# Evidence: video verification tested against real files

The video/audio checks in `web/lib/verify.ts` and `web/components/DeliveryPanel.tsx` were not written
from assumptions about what a browser can read. Every number below came out of the app measuring a real
file, and every one of those numbers was then compared against **ffmpeg's own `volumedetect`**, which is
an independent implementation of the same "mean level" idea.

## Does the audio measurement agree with ffmpeg?

`mean_volume` from `ffmpeg -af volumedetect` versus the app's `audio ≥ N dBFS` note
(mean RMS over the decoded track, every 8th sample, in the browser's WebAudio):

| File | ffmpeg `mean_volume` | Lunas reported |
|---|---|---|
| `reel-75s.mp4` (h264 + aac, 75s) | −21.1 dB | **−21.1 dBFS** |
| `reel-quiet.mp4` (aac, `volume=0.02`) | −55.1 dB | **−55.1 dBFS** |
| `tone-known.wav` (`aevalsrc`, amplitude 0.1) | −26.0 dB | **−26.0 dBFS** |
| `tone-known.mp4` (same tone, aac) | −26.0 dB | **−26.0 dBFS** |
| `mp3-known.mp3` (same tone, mp3) | −26.3 dB | **−26.3 dBFS** |
| the reel Lunas records itself (sine gain 0.15) | — | **−19.5 dBFS** (= 20·log₁₀(0.15/√2)) |

Three containers (WAV, AAC-in-MP4, MP3) and a MediaRecorder file, each within 0.1 dB of the truth.

## What each screenshot shows

| File | Situation |
|---|---|
| `video-1-terukur.png` | a video job after upload: 1 of 1 files measured, thumbnail with a play badge |
| `video-2-hasil.png` | the reel Lunas recorded itself: 5 criteria measured, 1 handed to the human eye ("Checks done — 1 need your eye") |
| `video-4-terlalu-panjang.png` | a 75s mp4 → `reel-75s.mp4 runs 75.0s (rule: ≤ 60s)` → **Needs a fix** |
| `video-5-bisu.png` | a 6s mp4 whose audio track is silent (−91 dB) → `carries no audible track` → **Needs a fix** |
| `video-6-tak-ada-audio.png` | a 6s mp4 with **no audio track at all**: the browser cannot decode it, so the criterion is `manual` — "Checks done — 2 need your eye" — never a pass |
| `video-7-terlalu-pelan.png` | audio at −55.1 dBFS → fails by number, not by opinion |
| `video-8-regresi-foto.png` | the photo order (`LNS-0142`) still behaves: 20/20 measured, the grey `IMG_014.jpg` fails by name |

## Reproducing it

The fixtures are regenerated with ffmpeg (the test scripts expect them in `/tmp`):

```bash
# a 75-second vertical reel with audio
ffmpeg -y -f lavfi -i "testsrc=size=1080x1920:rate=30:duration=75" \
       -f lavfi -i "sine=frequency=220:duration=75" \
       -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest /tmp/reel-75s.mp4

# 6s vertical, no audio track at all
ffmpeg -y -f lavfi -i "testsrc=size=1080x1920:rate=30:duration=6" \
       -c:v libx264 -preset ultrafast -pix_fmt yuv420p -an /tmp/reel-silent.mp4

# 6s vertical with a silent audio track (-91 dB)
ffmpeg -y -f lavfi -i "testsrc=size=1080x1920:rate=30:duration=6" \
       -f lavfi -i "anullsrc=r=48000:cl=stereo" \
       -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest /tmp/reel-mutedtrack.mp4

# 4s tone at a known level, as wav / mp4 / mp3
ffmpeg -y -f lavfi -i "aevalsrc=0.1*sin(2*PI*1000*t):d=4:s=48000" -ac 2 /tmp/tone-known.wav
ffmpeg -y -i /tmp/tone-known.wav -c:a aac -b:a 192k /tmp/tone-known.mp4
ffmpeg -y -i /tmp/tone-known.wav -c:a libmp3lame -b:a 192k /tmp/mp3-known.mp3
```

Then, with the app running (`cd web && npx next start -p 3222`):

```bash
python3 docs/evidence/uji-video-api.py   # per-criterion verdicts straight off POST /api/agent/verify
python3 docs/evidence/uji-video.py       # the same thing driven through the UI, with screenshots
```

Both scripts need `pip install playwright && playwright install chromium`.
The offline rule-engine tests (`bash web/scripts/uji-verify-video.sh`, 41 assertions) need neither.

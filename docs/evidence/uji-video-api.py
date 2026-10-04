"""Reads the verification verdict straight off POST /api/agent/verify for each real
file, so no UI state can hide a criterion's real outcome."""
import asyncio, json, os
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:3222"
ORDER = "/orders/LNS-0152"

FIXTURES = [
    ("/tmp/reel-75s.mp4", "75s mp4, audio"),
    ("/tmp/reel-silent.mp4", "6s mp4, NO audio track"),
    ("/tmp/reel-mutedtrack.mp4", "6s mp4, silent audio TRACK (-91 dB)"),
    ("/tmp/reel-quiet.mp4", "6s mp4, very quiet"),
    ("/tmp/tone-known.wav", "4s wav, known level"),
    ("/tmp/tone-known.mp4", "4s mp4, known level"),
    ("/tmp/mp3-known.mp3", "4s mp3, known level"),
]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 1440, "height": 1080})
        captured = {}

        async def on_resp(r):
            if "/api/agent/verify" in r.url:
                try:
                    captured["v"] = await r.json()
                except Exception as e:
                    captured["v"] = {"error": str(e)}

        pg.on("response", lambda r: asyncio.create_task(on_resp(r)))

        for path, label in FIXTURES:
            if not os.path.exists(path):
                continue
            captured.clear()
            await pg.goto(BASE + ORDER, wait_until="networkidle")
            await pg.wait_for_timeout(700)
            await pg.locator("input[type=file]").first.set_input_files(path, timeout=60000)
            await pg.wait_for_selector(".dl-grid", timeout=60000)
            await pg.wait_for_timeout(1200)
            await pg.click("button.btn.lav")
            for _ in range(40):
                await pg.wait_for_timeout(500)
                if captured.get("v"):
                    break
            v = captured.get("v") or {}
            print(f"\n=== {label}  ({os.path.getsize(path)/1024:.0f} KB) ===")
            print(f"    source={v.get('source')}  measured={sum(1 for r in v.get('results', []) if r['kind']=='measured')}  manual={v.get('manual')}  failed={v.get('failed')}")
            for crit, res in zip(["count(videos)", "mime", "duration", "aspect", "audio", "vision"], v.get("results", [])):
                print(f"    {'✓' if res['pass'] else '✕' if res['kind']!='manual' else '?'} [{res['kind']:8}] {crit:14} {res['note']}")
        await b.close()

asyncio.run(main())

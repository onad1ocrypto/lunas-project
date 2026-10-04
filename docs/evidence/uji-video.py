"""Real-file test for the video path (order LNS-0152).

Four real deliveries are pushed through the app's own upload + verification path,
each starting from a fresh page so the delivery panel is in its normal state:
  1. the demo reel, recorded in this browser by MediaRecorder (canvas + tone);
  2. a 75s mp4 with audio (ffmpeg)      -> must fail "Under 60 s" by name;
  3. a 6s mp4 with no audio track       -> what does the audio rule say?
  4. a 6s mp4 whose audio is ~-34 dBFS  -> the level has to be measured, not assumed.

Fixtures come from /tmp; screenshots land in docs/evidence/.
"""
import asyncio, os
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:3222"
ORDER = "/orders/LNS-0152"
OUT = "/home/user/lunas-project/docs/evidence"
os.makedirs(OUT, exist_ok=True)


async def read_rows(pg):
    return await pg.eval_on_selector_all(".chk", "els => els.map(e => e.innerText.replace(/\\n+/g,' | '))")


async def verify_and_report(pg, label, shot):
    await pg.click("button.btn.lav")
    await pg.wait_for_timeout(6000)  # the panel reveals one verdict every 560ms
    rows = await read_rows(pg)
    print(f"\n=== {label} ===")
    for r in rows:
        print("  ", r)
    badges = await pg.eval_on_selector_all(".card .badge", "els => els.map(e => e.innerText.trim())")
    print("   badges:", badges)
    head = await pg.eval_on_selector_all("h3, .panel-head b, .card.pad > .row b", "els => els.map(e => e.innerText.trim())")
    print("   card headings:", head[:6])
    await pg.screenshot(path=f"{OUT}/{shot}")
    return rows


async def fresh(pg):
    await pg.goto(BASE + ORDER, wait_until="networkidle")
    await pg.wait_for_timeout(900)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width": 1440, "height": 1080})
        errs = []
        pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
        pg.on("console", lambda m: errs.append("CONSOLE " + m.text[:200]) if m.type == "error" else None)

        # 1) the reel this browser records for real
        await fresh(pg)
        await pg.click(".drop button")
        await pg.wait_for_selector(".dl-grid", timeout=45000)
        await pg.wait_for_timeout(1500)
        print("sample upload badge:", await pg.inner_text(".dl-grid .badge"))
        print("thumbnails:", await pg.eval_on_selector_all(".thumb", "els => els.map(e => e.tagName + ' ' + e.innerText.trim())"))
        await pg.screenshot(path=f"{OUT}/video-1-terukur.png")
        await verify_and_report(pg, "recorded sample, in-browser (mp4, tone)", "video-2-hasil.png")

        # 2-4) real mp4s
        for path, label, shot in [
            ("/tmp/reel-75s.mp4", "75s mp4 with audio", "video-4-terlalu-panjang.png"),
            ("/tmp/reel-mutedtrack.mp4", "6s mp4 with a silent audio track", "video-5-bisu.png"),
            ("/tmp/reel-silent.mp4", "6s mp4 with no audio track at all", "video-6-tak-ada-audio.png"),
            ("/tmp/reel-quiet.mp4", "6s mp4, audio ~-55 dBFS", "video-7-terlalu-pelan.png"),
        ]:
            await fresh(pg)
            print(f"\nfixture {os.path.basename(path)}: {os.path.getsize(path)/1024:.0f} KB")
            await pg.locator("input[type=file]").first.set_input_files(path, timeout=60000)
            await pg.wait_for_selector(".dl-grid", timeout=60000)
            await pg.wait_for_timeout(1500)
            print("  badge:", await pg.inner_text(".dl-grid .badge"))
            await verify_and_report(pg, label, shot)

        print("\nconsole errors:", errs or "none")
        await b.close()

asyncio.run(main())

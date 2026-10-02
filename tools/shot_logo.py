import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1366, 'height': 900})
        await pg.goto('http://localhost:3000/', wait_until='networkidle')
        await pg.wait_for_timeout(800)
        await pg.screenshot(path='/home/user/lunas/v_logo_nav.png', clip={'x': 0, 'y': 0, 'width': 700, 'height': 90})
        await pg.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await pg.wait_for_timeout(600)
        await pg.screenshot(path='/home/user/lunas/v_logo_foot.png', clip={'x': 0, 'y': 640, 'width': 1366, 'height': 260})
        await pg.goto('http://localhost:3000/dashboard', wait_until='networkidle')
        await pg.wait_for_timeout(900)
        await pg.screenshot(path='/home/user/lunas/v_logo_side.png', clip={'x': 0, 'y': 0, 'width': 300, 'height': 120})
        await b.close()

asyncio.run(main())

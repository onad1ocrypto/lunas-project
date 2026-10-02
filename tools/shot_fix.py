import asyncio
from playwright.async_api import async_playwright
OUT='/home/user/lunas/'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={'width':1366,'height':900})
        await pg.goto('http://localhost:3000/dashboard', wait_until='networkidle')
        await pg.click('button[aria-label="Theme"]'); await pg.wait_for_timeout(250)
        await pg.locator('.popmenu').get_by_text('Midnight').click(); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT+'w2_dash_mid.png', clip={'x':0,'y':60,'width':1366,'height':420})
        await pg.set_viewport_size({'width':400,'height':860})
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT+'w2_m_nav.png', clip={'x':0,'y':640,'width':400,'height':220})
        await b.close()
asyncio.run(main())

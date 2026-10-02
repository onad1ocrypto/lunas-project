import asyncio
from playwright.async_api import async_playwright

OUT = '/home/user/lunas/'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1366, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append("PAGEERR " + str(e)))
        pg.on('console', lambda m: errs.append(m.text[:300]) if m.type == 'error' else None)

        # 1. landing candy with new font + logo
        await pg.goto('http://localhost:3000/', wait_until='networkidle')
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=OUT + 'w_land_candy.png')

        # 2. midnight theme on landing
        await pg.click('button[aria-label="Theme"]')
        await pg.wait_for_timeout(300)
        await pg.locator('.popmenu').get_by_text('Midnight').click()
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT + 'w_land_mid.png')

        # 3. midnight dashboard
        await pg.goto('http://localhost:3000/dashboard', wait_until='networkidle')
        await pg.wait_for_timeout(1000)
        await pg.screenshot(path=OUT + 'w_dash_mid.png')

        # 4. profile page in midnight
        await pg.goto('http://localhost:3000/profile', wait_until='networkidle')
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=OUT + 'w_profile_mid.png', full_page=True)

        # 5. back to candy, profile menu dropdown open
        await pg.click('button[aria-label="Theme"]')
        await pg.wait_for_timeout(250)
        await pg.locator('.popmenu').get_by_text('Candy').click()
        await pg.wait_for_timeout(400)
        await pg.click('button[aria-label="View profile"]')
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT + 'w_menu.png', clip={'x': 900, 'y': 0, 'width': 466, 'height': 420})

        # 6. matcha on public page
        await pg.click('.menu-backdrop')  # close menu
        await pg.click('button[aria-label="Theme"]')
        await pg.wait_for_timeout(250)
        await pg.locator('.popmenu').get_by_text('Matcha').click()
        await pg.wait_for_timeout(400)
        await pg.goto('http://localhost:3000/to/sari', wait_until='networkidle')
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=OUT + 'w_pub_matcha.png')

        # 7. mobile midnight dashboard
        await pg.click('button[aria-label="Theme"]')
        await pg.wait_for_timeout(250)
        await pg.locator('.popmenu').get_by_text('Midnight').click()
        await pg.set_viewport_size({'width': 400, 'height': 860})
        await pg.goto('http://localhost:3000/dashboard', wait_until='networkidle')
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=OUT + 'w_m_dash_mid.png')

        print("\n".join(errs) or "no errors")
        await b.close()

asyncio.run(main())

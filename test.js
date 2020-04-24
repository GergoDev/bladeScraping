const puppeteer = require('puppeteer');
(async() => {
const browser = await puppeteer.launch({headless: false});
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.resourceType() === 'script' || request.resourceType() === 'image')
      request.abort();
    else
      request.continue();
  });
  await page.goto('https://socialblade.com/youtube/user/kormanyhu');
  await page.screenshot({path: 'webkul.png'});

  await browser.close();
  })();
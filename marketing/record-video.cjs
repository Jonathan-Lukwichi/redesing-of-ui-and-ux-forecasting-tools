/* Records the marketing scenes to webm with Playwright.
   Usage: node marketing/record-video.cjs <outputDir>
   Produces hero.webm (laptop scene) and endcard.webm (closing card);
   ffmpeg then trims, converts and concatenates them into the final mp4. */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const outDir = process.argv[2] || __dirname;

const timing = {};

async function record(browser, htmlFile, ms, outName) {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: outDir, size: { width: 1920, height: 1080 } },
  });
  const t0 = Date.now();
  const page = await ctx.newPage();
  await page.goto('file:///' + htmlFile.replace(/\\/g, '/'));
  await page.addStyleTag({ content: '.controls{display:none!important}' });
  /* restart the animation cycle so the hidden-controls frame is the whole take */
  await page.evaluate(() => {
    const b = document.getElementById('replayBtn');
    if (b) b.click();
  });
  await page.waitForTimeout(ms);
  /* true wall-clock span of the recording, for retiming stretched footage */
  timing[outName] = (Date.now() - t0) / 1000;
  const video = page.video();
  await ctx.close();
  const tmp = await video.path();
  const dest = path.join(outDir, outName);
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(tmp, dest);
  console.log('recorded', outName, timing[outName].toFixed(2) + 's wall');
}

(async () => {
  const here = __dirname;
  const browser = await chromium.launch();
  await record(browser, path.join(here, 'ed-forecast-hero.html'), 17400, 'hero.webm');
  await record(browser, path.join(here, 'ed-endcard.html'), 6800, 'endcard.webm');
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'timing.json'), JSON.stringify(timing));
})();

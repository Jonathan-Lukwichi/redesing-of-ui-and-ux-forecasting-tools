const { chromium } = require('@playwright/test');

(async () => {
  const src = process.argv[2];
  const out = process.argv[3];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file:///' + src.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  await page.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;text-align:center;font-size:8px;color:#94a3b8;font-family:Arial;">HealthForecast AI — The Knowledge Behind the System &nbsp;·&nbsp; page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    margin: { top: '14mm', bottom: '16mm', left: '13mm', right: '13mm' },
  });
  await browser.close();
  console.log('PDF written:', out);
})();

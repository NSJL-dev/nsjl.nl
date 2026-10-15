import {test, expect} from '@playwright/test';

// Anonymous GETs only. No personal session, mail link, form submission or sync.
for (const width of [1440, 900, 660, 420]) {
  for (const [pathname, status] of [['/privacy', 200], ['/onbekend-font-test', 404], ['/admin/login', 200], ['/auth/voltooien', 200]] as const) {
    test(pathname + ' serves every font locally at ' + width + 'px', async ({page}) => {
      await page.setViewportSize({width, height: 900});
      const googleRequests: string[] = [], fontOrigins: string[] = [], failedFonts: string[] = [];
      page.on('request', request => {
        const url = new URL(request.url());
        // Retain categories/origins only, never URL queries, cookies or bodies.
        if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) googleRequests.push('EXTERNAL_GOOGLE_FONT');
        if (request.resourceType() === 'font') fontOrigins.push(url.origin);
      });
      page.on('response', response => {
        if (response.request().resourceType() === 'font' && !response.ok()) failedFonts.push('FONT_HTTP_ERROR');
      });
      const response = await page.goto(pathname, {waitUntil: 'networkidle'});
      expect(response?.status()).toBe(status);
      const policy = response!.headers()['content-security-policy'];
      expect(policy.split(';').map(value => value.trim())).toContain("font-src 'self'");
      const loaded = await page.evaluate(async () => {
        const samples = [400, 600, 700, 800, 900].map(weight => ({family: 'Nunito', weight}));
        samples.push({family: 'Bebas Neue', weight: 400});
        return Promise.all(samples.map(async ({family, weight}) => {
          const faces = await document.fonts.load(`${weight} 16px "${family}"`, 'No Skill Just Luck é —');
          return faces.length > 0 && faces.every(face => face.status === 'loaded');
        }));
      });
      expect(loaded).toEqual([true, true, true, true, true, true]);
      expect(googleRequests).toEqual([]);
      expect(fontOrigins.length).toBeGreaterThan(0);
      expect(fontOrigins.every(origin => origin === new URL(response!.url()).origin)).toBe(true);
      expect(failedFonts).toEqual([]);
    });
  }
}

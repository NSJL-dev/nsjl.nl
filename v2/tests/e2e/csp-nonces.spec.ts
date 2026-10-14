import {test, expect} from '@playwright/test';

// GET/navigation only: no login, cookies from a personal session, form submission,
// contact message, database write or synchronization. Run against the exact preview.
for (const [pathname, status] of [['/privacy', 200], ['/onbekend-csp-test', 404]] as const) {
  test(pathname + ' executes its scripts under a fresh strict CSP and supports the mobile menu', async ({page}) => {
    await page.setViewportSize({width: 420, height: 900});
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', event => {
        // Record only the directive; never capture URLs, script samples or tokens.
        if (event.effectiveDirective.startsWith('script-src')) document.documentElement.dataset.cspScriptViolation = event.effectiveDirective;
      });
    });
    page.on('console', message => {if (message.type() === 'error' && /content security policy/i.test(message.text())) violations.push('CSP_ERROR');});
    let previousNonce: string | undefined;
    for (let request = 0; request < 2; request++) {
      const response = await page.goto(pathname, {waitUntil: 'networkidle'});
      expect(response?.status()).toBe(status);
      const policy = response!.headers()['content-security-policy'];
      const scriptSources = policy.split(';').map(value => value.trim()).find(value => value.startsWith('script-src '))!;
      const nonce = scriptSources.match(/'nonce-([^']+)'/)?.[1];
      expect(nonce).toBeTruthy(); expect(nonce).not.toBe(previousNonce); previousNonce = nonce;
      expect(scriptSources).toContain("'strict-dynamic'"); expect(scriptSources).not.toContain("'unsafe-inline'");
      // Development's existing eval allowance is absent on a deployed build.
      if (!new URL(response!.url()).hostname.match(/^(?:127\.0\.0\.1|localhost)$/)) expect(scriptSources).not.toContain("'unsafe-eval'");
      const scripts = await page.locator('script').evaluateAll(elements => elements.filter(element => !['application/ld+json', 'application/json'].includes(element.getAttribute('type') || '')).map(element => (element as HTMLScriptElement).nonce));
      expect(scripts.length).toBeGreaterThan(0); expect(scripts.every(value => value === nonce)).toBe(true);
      expect(response!.headers()['cache-control']).toContain('no-store');
      await expect(page.locator('html')).not.toHaveAttribute('data-csp-script-violation');
      const toggle = page.getByRole('button', {name: 'Menu openen'});
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('navigation', {name: 'Mobiele navigatie'})).toBeVisible();
      await expect(page.locator('#public-mobile-menu').getByRole('link', {name: 'Sponsors'})).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
      await expect(page.getByRole('navigation', {name: 'Mobiele navigatie'})).toBeHidden();
    }
    expect(violations).toEqual([]);
  });
}

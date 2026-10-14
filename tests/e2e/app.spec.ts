import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

async function axe(page: Page) {
  // @axe-core/playwright bundles a newer playwright-core, so its Page type differs from @playwright/test's
  const r = await new AxeBuilder({ page: page as never }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.katex-html').analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target}`);
}

const PAGES: [string, string, RegExp][] = [
  ['home', '/', /Quantum ESPRESSO documentation/],
  ['pw.x', '/input/pw', /pw\.x/],
  ['guide chapter', '/guide/ph-user-guide/a-appendix-electron-phonon-coefficients', /Electron-phonon/],
  ['release notes', '/release-notes', /Release notes/],
  ['variable index', '/variables', /Variable index/],
  ['graph', '/graph/pw?focus=nat', /Cross-reference graph/],
  ['pdf', '/pdf/pdf-hubbard-input', /Hubbard/i],
  ['about', '/about', /About this reader/],
];

for (const [name, url, heading] of PAGES) {
  test(`${name} renders without errors and passes axe (serious/critical)`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(url);
    await expect(page.locator('h1').first()).toContainText(heading);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
    expect(await axe(page)).toEqual([]);
  });
}

for (const theme of ['dark', 'contrast', 'sepia']) {
  test(`${theme} theme passes axe colour contrast on pw.x`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('qe-reader-settings', JSON.stringify({ theme: t })), theme);
    await page.goto('/input/pw#occupations');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.waitForLoadState('networkidle');
    expect(await axe(page)).toEqual([]);
  });
}

test('keyboard search: "/" opens, Enter navigates to the exact variable', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('/');
  const box = page.getByRole('combobox');
  await expect(box).toBeFocused();
  await box.fill('ecutrho');
  await expect(page.locator('#sr-0')).toContainText('ecutrho');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/input\/(pw|cp)#ecutrho$/);
  await expect(page.locator('article#ecutrho')).toBeInViewport();
});

test('legacy helpdoc anchors (#idN) resolve to the right entry', async ({ page }) => {
  await page.goto('/input/dos#id5');
  await expect(page).toHaveURL(/#bz_sum$/);
  await expect(page.locator('article#bz_sum')).toBeInViewport();
});

test('in-document links and cross-document links navigate', async ({ page }) => {
  await page.goto('/input/pw#ecutrho');
  await page.locator('article#ecutrho .qe-meta a', { hasText: 'ecutwfc' }).click();
  await expect(page).toHaveURL(/#ecutwfc$/);
  await page.goto('/guide/pw-user-guide');
  await page.getByRole('link', { name: /Using PWscf/ }).first().click();
  await expect(page.locator('h1')).toContainText('Using PWscf');
});

test('settings change theme, text size and line breaks, and persist', async ({ page }) => {
  await page.goto('/input/dos');
  await page.getByRole('button', { name: /reading/i }).click();
  const dialog = page.getByRole('dialog', { name: /Reading & accessibility/ });
  await expect(dialog).toBeVisible();
  await dialog.getByText('High contrast', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Larger text' }).click();
  await dialog.getByText('Show original line breaks').click();
  await page.keyboard.press('Escape');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'contrast');
  await expect(html).toHaveAttribute('data-original', 'true');
  await expect(html).toHaveAttribute('style', /--font-scale: 1.05/);
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'contrast');
});

test('related-entries drawer and graph open from a variable', async ({ page }) => {
  await page.goto('/input/pw#ecutwfc');
  const btn = page.locator('article#ecutwfc button[data-act="xref"]');
  await expect(btn).toBeVisible();
  await btn.click();
  const drawer = page.getByRole('dialog', { name: 'ecutwfc' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('Referred to by')).toBeVisible();
  await expect(drawer.locator('svg .node')).not.toHaveCount(0);
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test('guide formulas are rendered as MathML (accessible) by KaTeX', async ({ page }) => {
  await page.goto('/guide/ph-user-guide/a-appendix-electron-phonon-coefficients');
  await expect(page.locator('.qe-math math').first()).toBeAttached();
  expect(await page.locator('.qe-math').count()).toBeGreaterThan(40);
});

test('PDF viewer renders pages and a text layer', async ({ page }) => {
  await page.goto('/pdf/pdf-brillouin-zones?page=2');
  await expect(page.locator('#pdf-p-2 canvas')).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('#pdf-p-2 .textLayer span').first()).toBeAttached({ timeout: 20_000 });
  await page.keyboard.press(']');
  await expect(page).toHaveURL(/page=3/);
});

test('release notes filter by kind and text', async ({ page }) => {
  await page.goto('/release-notes');
  await page.getByRole('button', { name: 'Incompatible changes' }).click();
  await expect(page.locator('.sec[data-kind="new"]')).toHaveCount(0);
  await page.getByPlaceholder(/Filter items/).fill('Hubbard');
  await expect(page.locator('.notes li').first()).toContainText(/Hubbard/i);
});

test('@mobile navigation drawer and contents panel work on a phone', async ({ page }) => {
  await page.goto('/input/pw');
  await page.getByRole('button', { name: 'Documentation menu' }).click();
  const nav = page.getByRole('navigation', { name: 'Documentation' });
  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: /^dos\.x/ }).click();
  await expect(page.locator('h1')).toContainText('dos.x');
  await expect(nav).toBeHidden();
  await page.getByRole('button', { name: 'Contents' }).click();
  await expect(page.locator('.toc.toc-open')).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

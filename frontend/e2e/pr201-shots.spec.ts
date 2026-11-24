// Test branch only (ci/pr201-frontend): renders the issue #182 path bar in its
// states and saves PNGs to frontend/pr201-shots for review. Not part of PR #201.

import { bootTDrive, byFirstArg, expect, resolves, test } from './wails-mock';
import type { Page } from '@playwright/test';

const NOW = new Date('2026-01-15T10:00:00Z');
const T = Math.floor(NOW.getTime() / 1000);
const file = (msg_id: number, name: string, size: number, days: number, parent_id = '') => ({
    name, size, msg_id, parent_id, upload_time: T - days * 86_400, uploader_id: 7, encrypted: false, plaintext_size: 0,
});
const plans = {
    ListChannels: resolves([
        { id: 1, title: 'My Drive', kind: 'personal', is_active: true, invite_link: '' },
        { id: 2, title: 'Team assets', kind: 'shared', is_active: false, invite_link: 'https://t.me/x' },
    ]),
    GetFolderContents: byFirstArg({
        '': resolves({
            folders: [
                { id: 'docs', name: 'Documents', parent_id: '' },
                { id: 'photos', name: 'Photos 2025', parent_id: '' },
                { id: 'proj', name: 'Projects', parent_id: '' },
            ],
            files: [file(101, 'Quarterly report.pdf', 2_400_000, 1), file(105, 'notes.md', 3_200, 12)],
        }),
        docs: resolves({
            folders: [{ id: 'tax', name: 'Taxes 2025', parent_id: 'docs' }, { id: 'ins', name: 'Insurance', parent_id: 'docs' }],
            files: [file(201, 'Lease agreement.pdf', 640_000, 30, 'docs')],
        }),
        tax: resolves({
            folders: [],
            files: [
                file(301, 'Form 16.pdf', 210_000, 20, 'tax'),
                file(302, 'Invoice March.pdf', 98_000, 18, 'tax'),
                file(303, 'Receipts.zip', 14_500_000, 15, 'tax'),
                file(304, 'Summary.xlsx', 42_000, 2, 'tax'),
            ],
        }),
    }, resolves({ folders: [], files: [] })),
    GetFileList: resolves([]),
    ListTrash: resolves([]),
};

const OUT = 'pr201-shots';

async function prepare(page: Page, mode: 'dark' | 'light') {
    await page.clock.setFixedTime(NOW);
    await page.addInitScript((m) => {
        localStorage.setItem('tdrive.appearance.v1', JSON.stringify({ mode: m, lightThemeId: 'daybreak', darkThemeId: 'quiet-relay' }));
    }, mode);
}

async function shoot(page: Page, name: string) {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.screenshot({ path: `${OUT}/${name}-header.png`, clip: { x: 0, y: 0, width: 1280, height: 160 } });
}

for (const mode of ['dark', 'light'] as const) {
    test(`path bar screenshots, ${mode}`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await prepare(page, mode);
        await bootTDrive(page, plans);
        await expect(page.getByRole('row', { name: 'Folder: Documents' })).toBeVisible();
        const apple = await page.evaluate(() => /Mac|iPhone|iPad|iPod/i.test(navigator.platform));
        const editKey = apple ? 'Meta+l' : 'Control+l';
        const field = page.getByRole('textbox', { name: 'Folder path' });

        // 1. Open Documents by clicking, then hover the trail to reveal the edit button.
        await page.getByRole('row', { name: 'Folder: Documents' }).dblclick();
        await expect(page.locator('#breadcrumb-path [aria-current="location"]')).toHaveText('Documents');
        await page.locator('#breadcrumb-path').hover();
        await shoot(page, `${mode}-1-hover-edit-button`);

        // 2. Ctrl/Cmd+L opens the field, prefilled and selected.
        await page.keyboard.press(editKey);
        await expect(field).toBeFocused();
        await shoot(page, `${mode}-2-field-open`);

        // 3. A missing folder keeps the text and explains.
        await field.fill('/Documents/Taxes 2024');
        await field.press('Enter');
        await expect(page.locator('#breadcrumb-path-error')).toBeVisible();
        await shoot(page, `${mode}-3-not-found`);

        // 4. A path on this computer is explained too.
        await field.fill('"C:\\Users\\deepesh\\Documents\\Taxes 2025"');
        await field.press('Enter');
        await expect(page.locator('#breadcrumb-path-error')).toBeVisible();
        await shoot(page, `${mode}-4-local-path`);

        // 5. A pasted file path opens its folder and selects the file.
        await field.fill('My Drive / Documents / taxes 2025 / summary.xlsx');
        await field.press('Enter');
        await expect(page.locator('#breadcrumb-path [aria-current="location"]')).toHaveText('Taxes 2025');
        await expect(page.locator('[data-row-key="file:304"]')).toBeFocused();
        await page.mouse.move(1200, 780);
        await shoot(page, `${mode}-5-file-selected`);
    });
}

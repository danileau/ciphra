/**
 * CIPH-741 / CIPH-751 — quick-add: entry + event + diary each land where the
 * product files them.
 *
 * The quick-add UI has two top-level mode buttons:
 *   - `log`   (combined "entry / event") — tapping an episode chip creates
 *              an `entry` doc; leaving chips alone + filling the note creates
 *              an `event` doc (a note marker).
 *   - `diary` — private diary entry.
 *
 * Where each one shows up changed after this spec was written:
 *  - #142 (04827db) rebuilt /journal around what the person WROTE. The old
 *    Entries / Events / Diary tabs (`filter-tab-*`) became the kind chips
 *    `journal-filter-{all,note,diary,marker}`. An `event` note is a
 *    `marker`; a `diary` doc is `diary`. An episode with no written text
 *    deliberately does not appear in the journal at all (journal/narrative.ts),
 *    so the entry is checked where it does surface: the dashboard hero flips
 *    from the "new entry" CTA to "today logged".
 *  - pi v24-5d dropped the desktop FAB; on desktop quick-add opens from the
 *    /journal header (see `_helpers/quickAdd.ts`).
 *  - Episode chips come from the blueprint, so the user picks a preset first
 *    (a fresh account has none and is sent to /setup).
 */
import { test, expect } from '@playwright/test';
import { registerNewUser, selectCohort } from './_helpers/testUser';
import { openQuickAddDesktop } from './_helpers/quickAdd';

test.setTimeout(120_000);

test('quick-add: entry + event + diary each land in the correct journal tab', async ({ page }) => {
    await registerNewUser(page);
    await selectCohort(page, /epilepsy|epilepsie|epilessia/i);

    // Before anything is logged the dashboard offers the new-entry CTA.
    await page.goto('/');
    await expect(page.getByTestId('companion-new-entry')).toBeVisible({ timeout: 30_000 });

    // --- 1. Entry (episode chip in log mode) ---
    await openQuickAddDesktop(page);
    await page.getByTestId('quickadd-mode-log').click();
    // Pick the first visible episode chip.
    const firstEpisode = page.locator('[data-testid^="quickadd-episode-"]').first();
    await firstEpisode.click();
    await page.getByTestId('quickadd-save').click();
    await expect(page.getByTestId('quickadd-mode-log')).toHaveCount(0, { timeout: 10_000 });

    // --- 2. Event (note-only in log mode) ---
    await openQuickAddDesktop(page);
    await page.getByTestId('quickadd-mode-log').click();
    await page.getByTestId('quickadd-note').fill('e2e-test-event');
    await page.getByTestId('quickadd-save').click();
    await expect(page.getByTestId('quickadd-mode-log')).toHaveCount(0, { timeout: 10_000 });

    // --- 3. Diary ---
    await openQuickAddDesktop(page);
    await page.getByTestId('quickadd-mode-diary').click();
    await page.getByTestId('quickadd-diary-text').fill('e2e-test-diary');
    await page.getByTestId('quickadd-save').click();
    await expect(page.getByTestId('quickadd-mode-log')).toHaveCount(0, { timeout: 10_000 });

    // The entry became today's log: the hero swaps the CTA for the recap.
    await page.goto('/');
    await expect(page.getByText(/Today logged|Heute geloggt|Aujourd'hui noté|Oggi registrato/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('companion-new-entry')).toHaveCount(0);

    // Event and diary land under their own journal kind, and only there.
    await page.goto('/journal');
    const feed = page.getByTestId('journal-feed');

    await page.getByTestId('journal-filter-marker').click();
    await expect(feed).toContainText('e2e-test-event');
    await expect(feed).not.toContainText('e2e-test-diary');

    await page.getByTestId('journal-filter-diary').click();
    await expect(feed).toContainText('e2e-test-diary');
    await expect(feed).not.toContainText('e2e-test-event');
});

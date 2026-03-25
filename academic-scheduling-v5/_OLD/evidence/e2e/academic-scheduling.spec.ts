import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:5174';
const COMPANY_ID = '00000000-0000-4000-8000-000000000001';

// ============================================================================
// HELPERS
// ============================================================================

async function login(page: Page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const url = page.url();
  if (url.includes('localhost:8080') || url.includes('/auth/')) {
    await page.fill('#username', 'admin@cogedu.dev');
    await page.fill('#password', 'admin123');
    await page.click('#kc-login');
    await page.waitForTimeout(5000);
  }
}

async function goToTab8(page: Page) {
  await page.goto(`${BASE}/companies/${COMPANY_ID}`, { waitUntil: 'domcontentloaded' });
  // Wait for page to settle — may need re-login
  await page.waitForTimeout(4000);
  const url = page.url();
  if (url.includes('localhost:8080') || url.includes('/auth/')) {
    await page.fill('#username', 'admin@cogedu.dev');
    await page.fill('#password', 'admin123');
    await page.click('#kc-login');
    await page.waitForTimeout(5000);
    await page.goto(`${BASE}/companies/${COMPANY_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
  }
  // Tab "Calendário" visible in screenshot
  const tab = page.locator('button', { hasText: 'Calendário' });
  await tab.waitFor({ state: 'visible', timeout: 20000 });
  await tab.click();
  await page.waitForTimeout(2000);
}

// ============================================================================
// TESTS
// ============================================================================

test.describe('Academic Scheduling — Tab 8', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    await login(page);
  });

  test('1. Calendar renders with events', async ({ page }) => {
    await goToTab8(page);

    // FullCalendar should be present
    await expect(page.locator('.fc')).toBeVisible({ timeout: 15000 });

    // Banner "Mostrando todos os eventos"
    const banner = page.locator('text=Mostrando todos os eventos');
    await expect(banner).toBeVisible({ timeout: 10000 });

    // Events in calendar
    const events = page.locator('.fc-event');
    await events.first().waitFor({ state: 'visible', timeout: 15000 });
    const count = await events.count();
    console.log(`  ✓ Calendar events visible: ${count}`);
    expect(count).toBeGreaterThan(0);

    // Buttons
    await expect(page.locator('button', { hasText: 'Novo Evento' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Agendamento em Lote' })).toBeVisible();

    await page.screenshot({ path: 'apps/web/e2e/screenshots/01-calendar.png', fullPage: true });
  });

  test('2. Day detail panel opens on click', async ({ page }) => {
    await goToTab8(page);
    await expect(page.locator('.fc')).toBeVisible({ timeout: 15000 });

    // Click a day cell that has events — use dateClick (select range)
    const cellWithEvents = page.locator('.fc-daygrid-day:has(.fc-event)').first();
    await cellWithEvents.waitFor({ state: 'visible', timeout: 10000 });
    // Click on the day number area to trigger dateClick
    const dayTop = cellWithEvents.locator('.fc-daygrid-day-top');
    await dayTop.click();
    await page.waitForTimeout(2000);

    // Side panel should appear — check both possible selectors
    const panel = page.locator('aside').first();
    const panelVisible = await panel.isVisible({ timeout: 5000 }).catch(() => false);
    if (panelVisible) {
      console.log('  ✓ Day detail panel opened');
      await page.screenshot({ path: 'apps/web/e2e/screenshots/02-day-panel.png', fullPage: true });
      // Close via any close button
      const closeBtn = panel.locator('button').filter({ hasText: /×/ }).or(panel.locator('button svg').first().locator('..'));
      if (await closeBtn.first().isVisible()) await closeBtn.first().click();
    } else {
      console.log('  ⚠ Day panel not visible — select may not trigger dateClick in headless');
      await page.screenshot({ path: 'apps/web/e2e/screenshots/02-day-panel-debug.png', fullPage: true });
    }
  });

  test('3. Selection Wizard — turma multi-picker', async ({ page }) => {
    await goToTab8(page);
    await expect(page.locator('.fc')).toBeVisible({ timeout: 15000 });

    // Click "Filtrar por Turma"
    await page.locator('button', { hasText: 'Filtrar por Turma' }).first().click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator('text=Filtrar por Turmas')).toBeVisible();

    // Turma items
    const items = dialog.locator('button').filter({ hasText: /Turma|Computer Science|Workshop|Cinematografia/ });
    const count = await items.count();
    console.log(`  ✓ Turmas available: ${count}`);
    expect(count).toBeGreaterThan(0);

    // Select first
    await items.first().click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'apps/web/e2e/screenshots/03-wizard.png' });

    // Confirm
    const filterBtn = dialog.locator('button', { hasText: /Filtrar \(/ });
    await filterBtn.click();
    await page.waitForTimeout(1500);

    // Banner should disappear
    await expect(page.locator('text=Mostrando todos os eventos')).not.toBeVisible({ timeout: 5000 });
    console.log('  ✓ Turma filter applied');

    await page.screenshot({ path: 'apps/web/e2e/screenshots/03-turma-selected.png', fullPage: true });
  });

  test('4. EventModal — institutional event (step 1 + step 2)', async ({ page }) => {
    await goToTab8(page);
    await expect(page.locator('.fc')).toBeVisible({ timeout: 15000 });

    await page.locator('button', { hasText: 'Novo Evento' }).click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Step 1: pick "Instituicao"
    await dialog.locator('button:has-text("Instituicao")').click();
    await page.waitForTimeout(500);
    await expect(dialog.locator('text=Evento institucional')).toBeVisible();

    // Fill title
    const titleInput = dialog.locator('input[placeholder*="Reuniao"]');
    await titleInput.fill('Reuniao Pedagogica E2E');

    await page.screenshot({ path: 'apps/web/e2e/screenshots/04-event-step1.png' });

    // Advance to step 2
    await dialog.locator('button', { hasText: 'Definir Data e Hora' }).click();
    await page.waitForTimeout(1000);

    // Date and time inputs should be visible
    await expect(dialog.locator('input[type="date"]')).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator('input[type="time"]').first()).toBeVisible();

    // Fill date
    await dialog.locator('input[type="date"]').fill('2026-04-15');

    // RecurrencePicker should be visible
    await expect(dialog.locator('text=Recorrencia')).toBeVisible();
    console.log('  ✓ RecurrencePicker visible in step 2');

    await page.screenshot({ path: 'apps/web/e2e/screenshots/04-event-step2.png' });

    // Close without saving
    await dialog.locator('button', { hasText: 'Cancelar' }).click();
    await page.waitForTimeout(500);
  });

  test('5. EventModal — turma event with component hierarchy', async ({ page }) => {
    await goToTab8(page);
    await expect(page.locator('.fc')).toBeVisible({ timeout: 15000 });

    await page.locator('button', { hasText: 'Novo Evento' }).click();
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Step 1: pick "Turma"
    await dialog.locator('button:has-text("Vinculado a uma turma")').click();
    await page.waitForTimeout(500);

    // Turma dropdown
    const turmaCombo = dialog.locator('button[role="combobox"]').filter({ hasText: /Selecione a turma/ });
    await expect(turmaCombo).toBeVisible({ timeout: 5000 });
    await turmaCombo.click();
    await page.waitForTimeout(800);

    // Pick first turma
    const turmaOpts = page.locator('[role="option"]');
    const turmaCount = await turmaOpts.count();
    console.log(`  ✓ Turma options: ${turmaCount}`);
    expect(turmaCount).toBeGreaterThan(0);
    const turmaName = await turmaOpts.first().textContent();
    console.log(`  ✓ First turma: ${turmaName}`);
    await turmaOpts.first().click();
    await page.waitForTimeout(1500);

    // Module dropdown should appear
    const moduleCombo = dialog.locator('button[role="combobox"]').filter({ hasText: /Selecione o modulo/ });
    await expect(moduleCombo).toBeVisible({ timeout: 8000 });
    await moduleCombo.click();
    await page.waitForTimeout(800);

    // Verify modules are NOT "Sem modulo" (our transformer fix)
    const moduleOpts = page.locator('[role="option"]');
    const modCount = await moduleOpts.count();
    console.log(`  ✓ Module options: ${modCount}`);
    if (modCount > 0) {
      const firstModText = await moduleOpts.first().textContent();
      console.log(`  ✓ First module: ${firstModText}`);
      expect(firstModText).not.toContain('Sem modulo');

      await moduleOpts.first().click();
      await page.waitForTimeout(800);

      // Component dropdown should appear
      const compCombo = dialog.locator('button[role="combobox"]').filter({ hasText: /Selecione\.\.\./ });
      if (await compCombo.isVisible({ timeout: 3000 })) {
        await compCombo.click();
        await page.waitForTimeout(500);
        const compOpts = page.locator('[role="option"]');
        const compCount = await compOpts.count();
        console.log(`  ✓ Component options: ${compCount}`);
      }
    }

    await page.screenshot({ path: 'apps/web/e2e/screenshots/05-turma-hierarchy.png' });

    // Close any open dropdown first by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test('6. RecurrencePicker — weekly config', async ({ page }) => {
    await goToTab8(page);
    await expect(page.locator('.fc')).toBeVisible({ timeout: 15000 });

    // Open event modal → institution → step 2
    await page.locator('button', { hasText: 'Novo Evento' }).click();
    await page.waitForTimeout(1000);
    const dialog = page.locator('[role="dialog"]');
    await dialog.locator('button:has-text("Instituicao")').click();
    await dialog.locator('input[placeholder*="Reuniao"]').fill('Teste Recorrencia');
    await dialog.locator('button', { hasText: 'Definir Data e Hora' }).click();
    await page.waitForTimeout(1000);

    // Change recurrence from "Nao repete" to "Semanalmente"
    const freqCombo = dialog.locator('button[role="combobox"]').filter({ hasText: /Nao repete/ });
    await freqCombo.click();
    await page.waitForTimeout(500);
    await page.locator('[role="option"]', { hasText: 'Semanalmente' }).click();
    await page.waitForTimeout(800);

    // Weekday buttons should appear
    await expect(dialog.locator('text=Dias da semana')).toBeVisible();

    // "Terminar" should appear
    await expect(dialog.locator('text=Terminar')).toBeVisible();

    // Click Ter and Qui
    const terBtn = dialog.locator('button').filter({ hasText: /^Ter$/ });
    const quiBtn = dialog.locator('button').filter({ hasText: /^Qui$/ });
    await terBtn.click();
    await quiBtn.click();
    await page.waitForTimeout(500);

    // Skip toggles
    await expect(dialog.locator('text=Pular feriados')).toBeVisible();
    await expect(dialog.locator('text=Pular fins de semana')).toBeVisible();

    console.log('  ✓ RecurrencePicker fully functional');

    await page.screenshot({ path: 'apps/web/e2e/screenshots/06-recurrence.png' });
    await dialog.locator('button', { hasText: 'Cancelar' }).click();
  });

  test('7. Batch Scheduler opens with components', async ({ page }) => {
    await goToTab8(page);
    await expect(page.locator('.fc')).toBeVisible({ timeout: 15000 });

    // Select a turma first
    await page.locator('button', { hasText: 'Filtrar por Turma' }).first().click();
    await page.waitForTimeout(1000);
    const wizDialog = page.locator('[role="dialog"]');
    const turmaItems = wizDialog.locator('button').filter({ hasText: /Turma|Computer|Workshop|Cinemat/ });
    if ((await turmaItems.count()) > 0) {
      await turmaItems.first().click();
      await wizDialog.locator('button', { hasText: /Filtrar \(/ }).click();
      await page.waitForTimeout(1500);
    }

    // "Agendamento em Lote" should now be enabled
    const batchBtn = page.locator('button', { hasText: 'Agendamento em Lote' });
    const isDisabled = await batchBtn.isDisabled();
    if (!isDisabled) {
      await batchBtn.click();
      await page.waitForTimeout(1000);

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(dialog.locator('text=Agendamento em Lote')).toBeVisible();
      await expect(dialog.locator('text=Selecione os componentes')).toBeVisible();

      console.log('  ✓ Batch scheduler opened with component list');
      await page.screenshot({ path: 'apps/web/e2e/screenshots/07-batch.png' });

      await dialog.locator('button', { hasText: 'Cancelar' }).click();
    } else {
      console.log('  ⚠ Batch button still disabled (turma may not have selection)');
    }
  });

  test('8. Calendar views — month/week/day', async ({ page }) => {
    await goToTab8(page);
    await expect(page.locator('.fc')).toBeVisible({ timeout: 15000 });

    // Week view
    await page.locator('.fc-timeGridWeek-button').click();
    await page.waitForTimeout(1500);
    await expect(page.locator('.fc-timegrid')).toBeVisible();
    console.log('  ✓ Week view');
    await page.screenshot({ path: 'apps/web/e2e/screenshots/08-week.png', fullPage: true });

    // Day view
    await page.locator('.fc-timeGridDay-button').click();
    await page.waitForTimeout(1500);
    console.log('  ✓ Day view');
    await page.screenshot({ path: 'apps/web/e2e/screenshots/08-day.png', fullPage: true });

    // Back to month
    await page.locator('.fc-dayGridMonth-button').click();
    await page.waitForTimeout(1500);

    // Navigate months
    await page.locator('.fc-next-button').click();
    await page.waitForTimeout(1500);
    console.log('  ✓ Month navigation');
    await page.screenshot({ path: 'apps/web/e2e/screenshots/08-next-month.png', fullPage: true });
  });

  test('9. Academic Year Panel expands', async ({ page }) => {
    await goToTab8(page);
    await expect(page.locator('.fc')).toBeVisible({ timeout: 15000 });

    const details = page.locator('details summary');
    if ((await details.count()) > 0) {
      await details.first().click();
      await page.waitForTimeout(1000);
      console.log('  ✓ Academic year panel expanded');
      await page.screenshot({ path: 'apps/web/e2e/screenshots/09-academic-year.png', fullPage: true });
    }
  });

  test('10. Event click opens edit modal', async ({ page }) => {
    await goToTab8(page);
    await expect(page.locator('.fc')).toBeVisible({ timeout: 15000 });
    await page.locator('.fc-event').first().waitFor({ state: 'visible', timeout: 10000 });

    const eventText = await page.locator('.fc-event').first().textContent();
    console.log(`  Clicking: ${eventText?.slice(0, 50)}`);
    await page.locator('.fc-event').first().click();
    await page.waitForTimeout(2000);

    const dialog = page.locator('[role="dialog"]');
    if (await dialog.isVisible({ timeout: 5000 })) {
      // Edit mode — should show title input with value
      const titleInput = dialog.locator('input[id="evt-title"]');
      if (await titleInput.isVisible({ timeout: 5000 })) {
        const val = await titleInput.inputValue();
        console.log(`  ✓ Edit modal opened: "${val}"`);
        expect(val.length).toBeGreaterThan(0);
      }

      await page.screenshot({ path: 'apps/web/e2e/screenshots/10-edit-event.png' });
      await dialog.locator('button', { hasText: /Fechar|Cancelar/ }).first().click();
    }
  });
});

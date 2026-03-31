import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

const ONLINE_FILE_INPUT_NAME =
  /Lien vers un fichier|Link to a file stored online|Online file/i;
const LOAD_BUTTON_NAME = /^Charger$|^Load$/i;
const CREATE_BUTTON_NAME = /^Créer$|^Create$/i;
const ADD_FILES_BUTTON_NAME = /Ajouter des fichiers|Add files/i;
const ADD_TO_PROJECT_BUTTON_NAME = /Ajouter au projet|Add to project/i;
const ADD_DATA_MODAL_NAME =
  /Ajouter des données au projet|Add data to the project/i;
const CONSENT_ACCEPT_BUTTON_NAME = /Accepter|Accept/i;
const CONSENT_REJECT_BUTTON_NAME = /Refuser|Reject/i;
const PROJECT_NAME_INPUT_NAME = /Nom du projet|Project name|Sans nom|Untitled/i;
const DEFAULT_TEST_PROJECT_NAME = 'Playwright E2E Project';
const JOIN_STEP_BUTTON_NAME = /Joindre|Join/i;
const ENRICH_STEP_BUTTON_NAME = /Enrichir|Enrich/i;
const GEO_STEP_BUTTON_NAME = /Géolocaliser|Geolocate/i;
const GEO_COORDINATES_BUTTON_NAME =
  /Coordonnées géographiques|Geographic coordinates|Coordinates/i;
const GEO_ENTITIES_BUTTON_NAME =
  /Entités administratives|Administrative entities|Entities/i;

const FIND_VISIBLE_POLL_INTERVAL_MS = 200;
const STATIC_TEST_DATASETS_DIR = path.join(
  process.cwd(),
  'static',
  'tests-datasets'
);

async function findFirstVisible(
  locator: Locator,
  label: string,
  timeoutMs: number = 15000
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }

    await new Promise((resolve) =>
      setTimeout(resolve, FIND_VISIBLE_POLL_INTERVAL_MS)
    );
  }

  throw new Error(`No visible locator found for ${label}`);
}

async function findFirstVisibleOrNull(
  locator: Locator,
  timeoutMs: number = 2000
): Promise<Locator | null> {
  try {
    return await findFirstVisible(locator, 'optional locator', timeoutMs);
  } catch {
    return null;
  }
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/^\/+/, '');
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function baseUrlForFixtures(page: Page): string {
  const currentUrl = page.url();
  if (!currentUrl || currentUrl === 'about:blank') {
    throw new Error(
      'Cannot build fixture URL before opening the application page'
    );
  }

  return currentUrl.endsWith('/') ? currentUrl : `${currentUrl}/`;
}

export function fixtureUploadUrl(page: Page, relativePath: string): string {
  const baseUrl = baseUrlForFixtures(page);
  const normalizedPath = normalizeRelativePath(relativePath);
  return new URL(`tests-datasets/${normalizedPath}`, baseUrl).toString();
}

function fixtureFilePath(relativePath: string): string {
  return path.join(
    STATIC_TEST_DATASETS_DIR,
    normalizeRelativePath(relativePath)
  );
}

async function resolvePrimaryUploadScope(page: Page): Promise<{
  scope: Locator;
  requiresAddModalConfirm: boolean;
  shouldFinalizeProjectCreation: boolean;
}> {
  const createProjectModal = page.getByTestId('create-project-modal');
  const createProjectTab = await findFirstVisibleOrNull(
    createProjectModal.getByRole('tab', {
      name: /Créer un nouveau projet|Create a new project/i
    }),
    8000
  );

  if (createProjectTab) {
    await createProjectTab.click();
  }

  const createModalUrlInput = await findFirstVisibleOrNull(
    createProjectModal.locator('input[placeholder^="https"]'),
    8000
  );
  if (createModalUrlInput) {
    return {
      scope: createProjectModal,
      requiresAddModalConfirm: false,
      shouldFinalizeProjectCreation: true
    };
  }

  const addFilesButton = await findFirstVisibleOrNull(
    page.getByRole('button', { name: ADD_FILES_BUTTON_NAME }),
    5000
  );
  if (!addFilesButton) {
    return {
      scope: createProjectModal,
      requiresAddModalConfirm: false,
      shouldFinalizeProjectCreation: false
    };
  }

  await addFilesButton.click();
  const addDataModal = page.getByRole('dialog', { name: ADD_DATA_MODAL_NAME });
  await expect(addDataModal).toBeVisible({ timeout: 10000 });

  return {
    scope: addDataModal,
    requiresAddModalConfirm: true,
    shouldFinalizeProjectCreation: false
  };
}

export async function dismissConsentBanner(page: Page): Promise<void> {
  const deadline = Date.now() + 2500;

  while (Date.now() < deadline && !page.isClosed()) {
    const acceptButton = page.getByRole('button', {
      name: CONSENT_ACCEPT_BUTTON_NAME
    });
    if (
      await acceptButton
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await acceptButton
        .first()
        .click({ force: true })
        .catch(() => {
          return;
        });
      await page.waitForTimeout(120).catch(() => {
        return;
      });
      return;
    }

    const rejectButton = page.getByRole('button', {
      name: CONSENT_REJECT_BUTTON_NAME
    });
    if (
      await rejectButton
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await rejectButton
        .first()
        .click({ force: true })
        .catch(() => {
          return;
        });
      await page.waitForTimeout(120).catch(() => {
        return;
      });
      return;
    }

    await page.waitForTimeout(120).catch(() => {
      return;
    });
  }
}

async function clickWithConsentRetry(
  page: Page,
  locator: Locator,
  timeoutMs: number = 12000
): Promise<void> {
  await dismissConsentBanner(page);
  await locator.click({ timeout: timeoutMs, force: true });
}

export async function uploadURL(
  page: Page,
  relativePath: string,
  scope?: Locator
): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await dismissConsentBanner(page);

  const {
    scope: uploadScope,
    requiresAddModalConfirm,
    shouldFinalizeProjectCreation
  } = scope
    ? {
        scope,
        requiresAddModalConfirm: false,
        shouldFinalizeProjectCreation: false
      }
    : await resolvePrimaryUploadScope(page);

  const uploadRows = uploadScope.locator(
    '[data-testid="file-processing"], [data-testid="file-complete"], [data-testid="file-incomplete"], [data-testid="file-error"]'
  );
  const expectedFileName = path.basename(relativePath);
  const expectedFileNameRegex = new RegExp(escapeRegex(expectedFileName), 'i');
  type UploadOutcome = 'rows' | 'error' | 'none';
  const waitForUploadOutcome = async (
    initialRows: number,
    timeoutMs: number
  ): Promise<UploadOutcome> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (page.isClosed()) {
        return 'none';
      }

      const rowCount = await uploadRows.count().catch(() => -1);
      if (rowCount > initialRows) {
        return 'rows';
      }

      const hasImportedFileBlock = await uploadScope
        .locator('.imported-file')
        .first()
        .isVisible()
        .catch(() => false);
      if (hasImportedFileBlock) {
        return 'rows';
      }

      const hasExpectedFileName = await uploadScope
        .getByText(expectedFileNameRegex)
        .first()
        .isVisible()
        .catch(() => false);
      if (hasExpectedFileName) {
        return 'rows';
      }

      const hasErrorNotification = await uploadScope
        .locator('.bx--inline-notification--error')
        .first()
        .isVisible()
        .catch(() => false);
      if (hasErrorNotification) {
        return 'error';
      }

      await page.waitForTimeout(FIND_VISIBLE_POLL_INTERVAL_MS).catch(() => {
        return;
      });
    }
    return 'none';
  };

  let uploadSucceeded = false;
  const preferDirectFileInput = /\.shp$/i.test(relativePath) || Boolean(scope);

  const urlInput = await findFirstVisibleOrNull(
    uploadScope
      .getByRole('textbox', { name: ONLINE_FILE_INPUT_NAME })
      .or(uploadScope.locator('input[placeholder^="https"]')),
    6000
  );
  const loadButton = await findFirstVisibleOrNull(
    uploadScope
      .getByRole('button', { name: LOAD_BUTTON_NAME })
      .or(
        uploadScope.locator(
          'button:has-text("Charger"), button:has-text("Load")'
        )
      ),
    6000
  );

  if (!preferDirectFileInput && urlInput && loadButton) {
    const initialRows = await uploadRows.count();
    const uploadUrl = fixtureUploadUrl(page, relativePath);
    await urlInput.fill(uploadUrl);
    await urlInput.press('Tab').catch(() => {
      return;
    });
    await page.waitForTimeout(400);

    const canUseUrlUpload = await loadButton
      .isEnabled({ timeout: 10000 })
      .catch(() => false);

    if (canUseUrlUpload) {
      const responsePromise = page
        .waitForResponse((response) => response.url() === uploadUrl, {
          timeout: 12000
        })
        .catch(() => null);

      await loadButton.click();
      await responsePromise;

      const urlOutcome = await waitForUploadOutcome(initialRows, 12000);
      uploadSucceeded = urlOutcome === 'rows';
    }
  }

  if (!uploadSucceeded) {
    const fallbackInput = uploadScope.locator('input[type="file"]').first();
    if (page.isClosed()) {
      throw new Error(
        `Upload failed for fixture ${relativePath} because page was closed`
      );
    }

    const initialRows = await uploadRows.count().catch(() => 0);
    await fallbackInput.setInputFiles(fixtureFilePath(relativePath));
    const fallbackOutcome = await waitForUploadOutcome(initialRows, 30000);
    uploadSucceeded = fallbackOutcome === 'rows';

    if (
      !uploadSucceeded &&
      !requiresAddModalConfirm &&
      !shouldFinalizeProjectCreation
    ) {
      const hasErrorNotification = await uploadScope
        .locator('.bx--inline-notification--error')
        .first()
        .isVisible()
        .catch(() => false);
      uploadSucceeded = !hasErrorNotification;
    }
  }

  if (!uploadSucceeded) {
    throw new Error(`Upload failed for fixture ${relativePath}`);
  }

  if (requiresAddModalConfirm) {
    const confirmButton = uploadScope.getByRole('button', {
      name: ADD_TO_PROJECT_BUTTON_NAME
    });
    await expect(confirmButton).toBeEnabled({ timeout: 20000 });
    await clickWithConsentRetry(page, confirmButton);
    await expect(uploadScope).not.toBeVisible({ timeout: 60000 });
    return;
  }

  if (shouldFinalizeProjectCreation && !preferDirectFileInput) {
    const createProjectModal = page.getByTestId('create-project-modal');
    const createButton = await findFirstVisibleOrNull(
      createProjectModal.getByRole('button', { name: CREATE_BUTTON_NAME }),
      10000
    );

    if (!createButton) {
      return;
    }

    const projectNameInput = await findFirstVisibleOrNull(
      createProjectModal
        .getByRole('textbox', { name: PROJECT_NAME_INPUT_NAME })
        .or(createProjectModal.getByTestId('project-name-input')),
      5000
    );

    if (projectNameInput) {
      const currentValue =
        (await projectNameInput.inputValue().catch(() => '')) || '';
      const normalizedValue = currentValue.trim().toLowerCase();
      const isDefaultPlaceholderValue =
        normalizedValue === 'sans nom' || normalizedValue === 'untitled';
      if (!normalizedValue || isDefaultPlaceholderValue) {
        await projectNameInput.fill(DEFAULT_TEST_PROJECT_NAME);
      }
    }

    await expect(createButton).toBeEnabled({ timeout: 30000 });
    // Guard: modal may have auto-closed during DuckDB processing
    if (!await createProjectModal.isVisible().catch(() => false)) {
      await page.waitForLoadState('networkidle').catch(() => {});
      return;
    }
    await createButton.click({ force: true, timeout: 10000 }).catch(() => {});
    await expect(createProjectModal).not.toBeVisible({ timeout: 60000 });
    await page.waitForLoadState('networkidle');
  }
}

async function selectComboBoxOption(
  field: Locator,
  optionName: RegExp,
  fallbackIndex: number = 0
): Promise<void> {
  const combo = field.getByRole('combobox').first();
  await expect(combo).toBeVisible({ timeout: 20000 });
  await combo.click();

  const namedOptions = field.page().getByRole('option', { name: optionName });
  const visibleNamedOption = await findFirstVisibleOrNull(namedOptions, 5000);
  if (visibleNamedOption) {
    await visibleNamedOption.click();
    return;
  }

  const allOptions = field.page().getByRole('option');
  const visibleFallback = await findFirstVisibleOrNull(
    allOptions.nth(fallbackIndex).or(allOptions),
    10000
  );
  if (!visibleFallback) {
    throw new Error(
      `No visible option available for combobox ${optionName.toString()}`
    );
  }
  await visibleFallback.click();
}

export function joinProgressStep(page: Page): Locator {
  return page
    .locator('.bx--progress-step-button')
    .filter({ hasText: JOIN_STEP_BUTTON_NAME })
    .first();
}

export function geolocateProgressStep(page: Page): Locator {
  return page
    .locator('.bx--progress-step-button')
    .filter({ hasText: GEO_STEP_BUTTON_NAME })
    .first();
}

export function enrichProgressStep(page: Page): Locator {
  return page
    .locator('.bx--progress-step-button')
    .filter({ hasText: ENRICH_STEP_BUTTON_NAME })
    .first();
}

export async function goToJoinStep(page: Page): Promise<void> {
  const joinStep = joinProgressStep(page);
  await expect(joinStep).toBeVisible({ timeout: 20000 });
  await expect(joinStep).toBeEnabled({ timeout: 30000 });
  await joinStep.click();
}

export async function goToEnrichStep(page: Page): Promise<void> {
  const enrichStep = enrichProgressStep(page);
  await expect(enrichStep).toBeVisible({ timeout: 20000 });
  await expect(enrichStep).toBeEnabled({ timeout: 30000 });
  await enrichStep.click();
}

export async function selectGeolocationLinkedVariable(
  page: Page,
  optionName: RegExp
): Promise<void> {
  const geolocationStep = page.locator('#geolocation-step');
  await expect(geolocationStep).toBeVisible({ timeout: 30000 });

  const linkedVariableField = geolocationStep
    .locator('.form-field')
    .filter({ hasText: /Variable liée|Linked variable/i })
    .first();
  await selectComboBoxOption(linkedVariableField, optionName);
}

export async function switchToGeolocationCoordinates(
  page: Page
): Promise<void> {
  const geolocationStep = page.locator('#geolocation-step');
  await expect(geolocationStep).toBeVisible({ timeout: 30000 });
  const coordinatesTab = geolocationStep.getByRole('button', {
    name: GEO_COORDINATES_BUTTON_NAME
  });
  await expect(coordinatesTab).toBeVisible({ timeout: 10000 });
  await coordinatesTab.click();
}

export async function switchToGeolocationEntities(page: Page): Promise<void> {
  const geolocationStep = page.locator('#geolocation-step');
  await expect(geolocationStep).toBeVisible({ timeout: 30000 });
  const entitiesTab = geolocationStep.getByRole('button', {
    name: GEO_ENTITIES_BUTTON_NAME
  });
  await expect(entitiesTab).toBeVisible({ timeout: 10000 });
  await entitiesTab.click();
}

export async function selectGeolocationLongitude(
  page: Page,
  optionName: RegExp
): Promise<void> {
  const geolocationStep = page.locator('#geolocation-step');
  await expect(geolocationStep).toBeVisible({ timeout: 30000 });
  const longitudeField = geolocationStep
    .locator('.form-field')
    .filter({ hasText: /Longitude/i })
    .first();
  await selectComboBoxOption(longitudeField, optionName);
}

export async function selectGeolocationLatitude(
  page: Page,
  optionName: RegExp
): Promise<void> {
  const geolocationStep = page.locator('#geolocation-step');
  await expect(geolocationStep).toBeVisible({ timeout: 30000 });
  const latitudeField = geolocationStep
    .locator('.form-field')
    .filter({ hasText: /Latitude/i })
    .first();
  await selectComboBoxOption(latitudeField, optionName);
}

export async function createProject(
  page: Page,
  projectName: string
): Promise<void> {
  await dismissConsentBanner(page);

  const createProjectModal = page.getByTestId('create-project-modal');
  const createButton = page.getByRole('button', { name: CREATE_BUTTON_NAME });
  const createButtonVisible = await expect(createButton.first())
    .toBeVisible({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!createButtonVisible) {
    return;
  }

  const nameInput = page.getByTestId('project-name-input');
  if (await nameInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    await nameInput.fill(projectName).catch(() => {});
  } else {
    const fallbackNameInput = page
      .getByRole('textbox', { name: PROJECT_NAME_INPUT_NAME })
      .first();
    if (
      await fallbackNameInput.isVisible({ timeout: 4000 }).catch(() => false)
    ) {
      await fallbackNameInput.fill(projectName).catch(() => {});
    }
  }

  await expect(createButton).toBeEnabled({ timeout: 60000 });
  await clickWithConsentRetry(page, createButton);

  await expect(createProjectModal).not.toBeVisible({
    timeout: 60000
  });
  await page.waitForLoadState('networkidle');
}

export async function addDatasetViaModal(
  page: Page,
  relativePath: string
): Promise<void> {
  await dismissConsentBanner(page);

  const addFilesButton = page.getByRole('button', {
    name: ADD_FILES_BUTTON_NAME
  });
  await expect(addFilesButton).toBeVisible({ timeout: 10000 });
  await addFilesButton.click();

  const addDataModal = page.getByRole('dialog', { name: ADD_DATA_MODAL_NAME });
  await expect(addDataModal).toBeVisible({ timeout: 10000 });

  await uploadURL(page, relativePath, addDataModal);

  const confirmButton = addDataModal.getByRole('button', {
    name: ADD_TO_PROJECT_BUTTON_NAME
  });
  await expect(confirmButton).toBeEnabled({ timeout: 20000 });
  await confirmButton.click();

  await expect(addDataModal).not.toBeVisible({ timeout: 60000 });
}

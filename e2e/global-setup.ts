import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(config.projects[0].use.baseURL || 'http://localhost:4173');

  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      Promise.all([
        indexedDB.databases().then((dbs) => {
          return Promise.all(
            dbs.map((db) => {
              if (db.name) {
                return new Promise<void>((res) => {
                  const req = indexedDB.deleteDatabase(db.name);
                  req.onsuccess = () => res();
                  req.onerror = () => res();
                });
              }
              return Promise.resolve();
            })
          );
        }),
        Promise.resolve(localStorage.clear()),
        Promise.resolve(sessionStorage.clear())
      ]).then(() => resolve());
    });
  });

  await browser.close();
}

export default globalSetup;

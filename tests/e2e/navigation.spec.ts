import { expect, test } from "@playwright/test";
import {
  PRIMARY_DESTINATIONS,
  SECONDARY_DESTINATIONS,
} from "../../src/lib/navigation";

// Ces parcours s'appuient sur la STRUCTURE — rôles, liens, `aria-current` —
// plutôt que sur les libellés, qui changeront avec les écrans du design.

test.describe("navigation", () => {
  test("l'accueil s'affiche et se signale comme page courante @critical", async ({
    page,
  }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", {
      name: "Navigation principale",
    });

    await expect(nav).toBeVisible();
    await expect(nav.locator('a[href="/"]')).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("chaque destination principale s'ouvre et devient courante @critical", async ({
    page,
  }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", {
      name: "Navigation principale",
    });

    for (const destination of PRIMARY_DESTINATIONS) {
      await nav.locator(`a[href="${destination.href}"]`).click();
      await expect(page).toHaveURL(destination.href);
      await expect(
        nav.locator(`a[href="${destination.href}"]`),
      ).toHaveAttribute("aria-current", "page");
    }
  });

  for (const destination of SECONDARY_DESTINATIONS) {
    test(`la vue ${destination.href} répond et porte un titre`, async ({
      page,
    }) => {
      const response = await page.goto(destination.href);

      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }
});

test.describe("tenue technique", () => {
  test("l'accueil ne produit aucune erreur dans la console @critical", async ({
    page,
  }) => {
    const errors: string[] = [];

    page.on("console", message => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("pageerror", error => errors.push(error.message));

    await page.goto("/", { waitUntil: "load" });
    // Hydratée : la navigation est un composant client.
    await expect(
      page.getByRole("navigation", { name: "Navigation principale" }),
    ).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("le manifeste de la webapp est servi", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");

    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({
      name: "HouseMate",
      display: "standalone",
      lang: "fr",
    });
  });

  test("les polices viennent de l'app, jamais d'un tiers", async ({ page }) => {
    const external: string[] = [];

    page.on("request", request => {
      const url = new URL(request.url());

      if (url.hostname !== "127.0.0.1") {
        external.push(url.hostname);
      }
    });

    await page.goto("/", { waitUntil: "load" });
    // Attendre que les polices soient réellement chargées : ce sont elles
    // qu'un CDN aurait servies.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    expect(external).toEqual([]);
  });
});

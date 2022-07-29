import { test, expect } from "@playwright/test";
import { open } from "fs/promises";
import JSONStream from "JSONStream";

const waitUntil = "domcontentloaded";

test("Crawl Lego Ideas", async ({ page }) => {
  const stream = JSONStream.stringify();
  stream.pipe((await open("data.json", "w")).createWriteStream());

  await page.goto(
    "/search/global_search/ideas?idea_phase=idea_idea_approved&idea_phase=idea_on_shelves&sort=most_recent",
    { waitUntil }
  );

  // See more…
  const seeMore = page.locator("text=See More");
  await seeMore.click();

  const cards = page.locator("h3.card-title > a[href^='/projects/']");
  await expect.poll(() => cards.count()).toBeGreaterThan(30);

  const urls = await cards.evaluateAll((r) =>
    r.map((e) => e.getAttribute("href"))
  );
  for (const url of urls) {
    if (!url) continue;
    console.log(url);

    await page.goto(url + "/official_comments", { waitUntil });

    // published date
    const publishDate = new Date(
      (await page.locator(".published-date time").getAttribute("datetime")) ??
        ""
    );

    // name
    const idea = await page.locator(".content-title").textContent();

    // timeline
    const timeline = await page
      .locator(".response-view-tab-content .card-block")
      .evaluateAll((r) =>
        r.map((e) => ({
          date: new Date(e.querySelector("time")?.getAttribute("datetime")!),
          title: e.querySelector("h3")?.textContent,
        }))
      );

    // set number
    let setNumber: string | undefined;
    const instructions = page.locator("text=Building Instructions");
    if (await instructions.count())
      setNumber = (await instructions.getAttribute("href"))?.match(
        /product\/(\d+)\//
      )![1];

    let name: string | null | undefined;
    let releaseDate: Date | null | undefined;
    let retireDate: Date | null | undefined;
    if (setNumber) {
      // brickset
      await page.goto(`https://brickset.com/sets/${setNumber}-1/`, {
        waitUntil,
      });

      name = (await page.locator(".content h1").textContent())?.replace(
        /\d+: /,
        ""
      );

      const field = page.locator("dt:has-text('Launch/exit') + dd");
      if (await field.count()) {
        const value = await field.textContent();
        [releaseDate, retireDate] =
          value
            ?.split("-")
            .map((s) =>
              s.includes("t.b.a") ? undefined : new Date(s.trim())
            ) ?? [];
      }
    }

    stream.write({
      url,
      idea,
      publishDate,
      timeline,
      setNumber,
      name,
      releaseDate,
      retireDate,
    });
  }
  stream.end();
});

import { test, expect } from "@playwright/test";
import { open } from "fs/promises";
import JSONStream from "JSONStream";

const waitUntil = "domcontentloaded";

test("Crawl LEGO Ideas", async ({ page }) => {
  const stream = JSONStream.stringify();
  stream.pipe((await open("data.json", "w")).createWriteStream());

  await page.goto(
    "/search/global_search/ideas?idea_phase=idea_idea_approved&idea_phase=idea_on_shelves&sort=most_recent",
    { waitUntil }
  );

  // See more…
  const seeMore = page.getByText("See More");
  await seeMore.click();

  const cards = page.locator("h3.card-title > a[href^='/projects/']");
  await expect
    .poll(async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      return cards.count();
    })
    .toBeGreaterThan(50);

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
    let pieces: number | null | undefined;
    if (setNumber) {
      // brickset
      if (setNumber === "92177") setNumber = "21313";
      if (setNumber === "92176") setNumber = "21309";
      while (true) {
        try {
          await page.goto(`https://brickset.com/sets/${setNumber}-1/`, {
            waitUntil,
          });
          name = (
            await page.locator(".content h1").textContent({ timeout: 2e3 })
          )?.replace(/\d+: /, "");
          break;
        } catch (e) {
          // captcha
          await page.context().clearCookies();
        }
      }

      // re-release?
      const reRelease = page.locator("text=Re-released version of");
      if (await reRelease.count()) throw new Error("Re-release");

      pieces = Number(
        await page.locator("dt:has-text('Pieces') + dd").textContent()
      );

      const launch = page.locator("dt:has-text('Launch/exit') + dd");
      if (await launch.count()) {
        const value = await launch.textContent();
        [releaseDate, retireDate] =
          value
            ?.split("-")
            .map((s) =>
              s.includes("t.b.a") ? undefined : new Date(s.trim())
            ) ?? [];
      } else {
        const unitedStates = page.locator(
          "#shopLEGOComOutput dt:has-text('United States') + dd"
        );
        const value = await unitedStates.innerHTML();
        [releaseDate, retireDate] =
          value
            ?.replace(/<br.*/, "")
            .split("-")
            .map((s) => (s.includes("now") ? undefined : new Date(s.trim()))) ??
          [];
      }
    }

    stream.write({
      idea,
      publishDate,
      setNumber,
      name,
      pieces,
      releaseDate,
      retireDate,
      timeline,
      url,
    });
  }
  stream.end();
});

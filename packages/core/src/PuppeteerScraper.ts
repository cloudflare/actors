import { Actor } from "./index";

export interface PuppeteerEnv {
  browser: any;
}

export class PuppeteerScraper<E extends PuppeteerEnv = any> extends Actor<E> {
  /**
   * Scrapes the given URL using Cloudflare Browser Rendering.
   * If it fails or times out, it falls back to a standard fetch-based scrape.
   */
  public async scrape(url: string, timeoutMs: number = 8000): Promise<string> {
    const browserBinding = (this.env as any).browser;
    if (!browserBinding) {
      console.warn("Browser rendering binding 'browser' is not configured. Falling back to fetch.");
      return this.fallbackScrape(url);
    }

    let browser: any = null;
    try {
      // We import @cloudflare/puppeteer dynamically to avoid bundling issues if the library isn't present
      const pkg = "@cloudflare/puppeteer";
      const puppeteer: any = await import(pkg);
      browser = await puppeteer.default.launch(browserBinding);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });

      // Navigate to page
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: Math.max(1000, timeoutMs - 1500),
      });

      // Allow SPA client-side hydration to finish rendering
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Extract cleaned content
      const content = await page.content();
      return content;
    } catch (err) {
      console.error(`Puppeteer scraping failed for ${url}:`, err);
      return this.fallbackScrape(url);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeErr) {
          console.error("Failed to close browser session:", closeErr);
        }
      }
    }
  }

  /**
   * Fallback fetch-based scraper that extracts text/HTML directly.
   */
  private async fallbackScrape(url: string): Promise<string> {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      return await res.text();
    } catch (err: any) {
      return `[Fallback Scrape Failed: ${err.message || err}]`;
    }
  }
}

import { chromium } from "playwright";

async function testTelegramPage() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log("Открываем страницу...");
    await page.goto("https://t.me/s/digitaltender", { waitUntil: "networkidle" });
    await page.waitForTimeout(5000);

    const html = await page.content();
    console.log("HTML length:", html.length);

    // Проверяем различные селекторы
    const selectors = [
      ".tgme_widget_message",
      ".message",
      "[data-post]",
      ".post",
      ".tgme_widget_message_wrap",
      ".tgme_widget_message_text",
      "div"
    ];

    for (const selector of selectors) {
      const count = await page.locator(selector).count();
      console.log(`${selector}: ${count} элементов`);
    }

    // Получаем текст страницы
    const text = await page.locator("body").textContent();
    console.log("Page text preview:", text?.substring(0, 500));

    // Проверяем, есть ли посты
    const messages = await page.locator(".tgme_widget_message_text").allTextContents();
    console.log("Found messages:", messages.length);
    if (messages.length > 0) {
      console.log("First message:", messages[0].substring(0, 200));
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await browser.close();
  }
}

testTelegramPage();
import { test, expect } from "@playwright/test";

test("new user can message the pinned admin", async ({ page }) => {
  const suffix = Math.random().toString(36).slice(2, 8);
  const username = `e2e_${suffix}`;
  const message = `Hello admin ${suffix}`;

  await page.goto("/signup");
  await page.getByPlaceholder("John Doe").fill("E2E User");
  await page.getByPlaceholder("user_1234").fill(username);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("This name is available.")).toBeVisible();
  await page.getByPlaceholder("johndoe@gmail.com").fill(`e2e-${suffix}@example.com`);
  await page.getByPlaceholder("Enter your password").fill("password123");
  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(page.getByRole("button", { name: "Contacts" })).toBeVisible();
  await page.getByRole("button", { name: "Contacts" }).click();

  await expect(page.getByText("Admin User").first()).toBeVisible();
  await expect(page.getByText("Admin").first()).toBeVisible();
  await page.getByText("Admin User").first().click();

  await page.getByPlaceholder("Type your message...").fill(message);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText(message)).toBeVisible();
});

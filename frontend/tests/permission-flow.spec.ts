import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

test.describe('Claude Code Permission Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the chat page
    await page.goto('/chat');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should prompt for permissions when requesting file operations', async ({ page }) => {
    // Step 1: Send message requesting poem creation
    const textArea = page.getByTestId('chat-text-area-middle');
    await textArea.fill('write me a poem in hello.txt');
    
    // Click send button
    const sendButton = page.getByTestId('chat-send-welcome');
    await sendButton.click();

    // Step 2: Wait for permission prompt to appear
    const permissionPrompt = page.getByTestId('permission-prompt-container');
    await expect(permissionPrompt).toBeVisible({ timeout: 30000 });
    
    // Verify prompt contains relevant information
    await expect(permissionPrompt).toContainText('Claude Code');
    await expect(permissionPrompt).toContainText('permission');

    // Step 3: Check that all permission options are available
    const allowOnceButton = page.getByTestId('permission-option-1');
    const allowAlwaysButton = page.getByTestId('permission-option-2');
    const denyButton = page.getByTestId('permission-option-3');
    
    await expect(allowOnceButton).toBeVisible();
    await expect(allowAlwaysButton).toBeVisible();
    await expect(denyButton).toBeVisible();

    // Step 4: Click "Allow Always" (option 2)
    await allowAlwaysButton.click();

    // Step 5: Wait for permission prompt to disappear
    await expect(permissionPrompt).toBeHidden({ timeout: 10000 });

    // Step 6: Wait for Claude to complete the task
    // Look for completion indicators
    await page.waitForFunction(() => {
      const messages = document.querySelectorAll('[data-testid*="message"]');
      return Array.from(messages).some(msg => 
        msg.textContent?.toLowerCase().includes('completed') ||
        msg.textContent?.toLowerCase().includes('created') ||
        msg.textContent?.toLowerCase().includes('written')
      );
    }, { timeout: 60000 });

    // Step 7: Verify hello.txt was created with poem content
    const helloTxtPath = join(process.cwd(), '..', 'hello.txt');
    
    // Wait for file to be created (with retries)
    await page.waitForFunction(async () => {
      try {
        const fs = await import('fs');
        return fs.existsSync(helloTxtPath);
      } catch {
        return false;
      }
    }, { timeout: 30000 });

    // Verify file exists and contains poem-like content
    const fileExists = existsSync(helloTxtPath);
    expect(fileExists).toBe(true);
    
    if (fileExists) {
      const fileContent = readFileSync(helloTxtPath, 'utf8');
      
      // Basic checks for poem content
      expect(fileContent.length).toBeGreaterThan(10);
      expect(fileContent).toMatch(/\w+/); // Contains words
      
      // Log the content for debugging
      console.log('hello.txt content:', fileContent);
    }
  });

  test('should deny permission and abort operation', async ({ page }) => {
    // Send message requesting file operation
    const textArea = page.getByTestId('chat-text-area-middle');
    await textArea.fill('create a test file called test.txt');
    
    const sendButton = page.getByTestId('chat-send-welcome');
    await sendButton.click();

    // Wait for permission prompt
    const permissionPrompt = page.getByTestId('permission-prompt-container');
    await expect(permissionPrompt).toBeVisible({ timeout: 30000 });
    
    // Click "Deny" (option 3)
    const denyButton = page.getByTestId('permission-option-3');
    await denyButton.click();

    // Verify permission prompt disappears
    await expect(permissionPrompt).toBeHidden({ timeout: 10000 });

    // Verify operation was aborted (look for error message)
    await expect(page.locator('text=denied')).toBeVisible({ timeout: 10000 });
    
    // Verify file was NOT created
    const testTxtPath = join(process.cwd(), '..', 'test.txt');
    
    // Wait a bit to ensure no file is created
    await page.waitForTimeout(5000);
    
    const fileExists = existsSync(testTxtPath);
    expect(fileExists).toBe(false);
  });

  test('should remember "Allow Always" permission for subsequent requests', async ({ page }) => {
    // First request - should show permission prompt
    const textArea = page.getByTestId('chat-text-area-middle');
    await textArea.fill('write hello to hello1.txt');
    
    const sendButton = page.getByTestId('chat-send-welcome');
    await sendButton.click();

    // Grant permission with "Allow Always"
    const permissionPrompt = page.getByTestId('permission-prompt-container');
    await expect(permissionPrompt).toBeVisible({ timeout: 30000 });
    
    const allowAlwaysButton = page.getByTestId('permission-option-2');
    await allowAlwaysButton.click();
    
    await expect(permissionPrompt).toBeHidden({ timeout: 10000 });

    // Wait for first request to complete
    await page.waitForTimeout(5000);

    // Second request - should NOT show permission prompt
    await textArea.fill('write world to hello2.txt');
    await sendButton.click();

    // Verify no permission prompt appears
    await page.waitForTimeout(3000);
    const secondPrompt = page.getByTestId('permission-prompt-container');
    await expect(secondPrompt).toBeHidden();

    // Should proceed directly to execution
    console.log('Second request should proceed without permission prompt');
  });
});
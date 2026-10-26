import { test,expect,type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function english(page:Page) {
  const toggle=page.getByRole('button',{name:'Switch to English'});
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
}

test('public home is bilingual, has no horizontal overflow and passes automated AA checks',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('html')).toHaveAttribute('lang','th');
  await english(page);
  await expect(page.getByText('TEST service — not an actual offering',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);expect(errors).toEqual([]);
});

test('simulated booking, reschedule and cancel keep credentials out of history storage',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/book');await english(page);
  await page.getByRole('checkbox',{name:/TEST service/}).check();
  await page.locator('input[name="book-date"]').nth(1).locator('..').click();
  await page.getByText('10:30',{exact:true}).click();
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('SYNTHETIC QA CUSTOMER');
  await page.getByRole('textbox',{name:'Phone number',exact:true}).fill('0812345678');
  await page.getByRole('button',{name:'Confirm booking',exact:true}).click();
  await expect(page).toHaveURL(/\/confirmation$/);
  await expect(page.getByRole('heading',{name:'Simulated booking (test mode)',exact:true})).toBeVisible();
  const link=await page.getByRole('textbox',{name:'Manage link (secret)',exact:true}).inputValue();
  const token=new URLSearchParams(new URL(link).hash.slice(1)).get('token')!;
  const persisted=await page.evaluate(()=>JSON.stringify({history:history.state,local:{...localStorage},session:{...sessionStorage}}));
  expect(persisted).not.toContain(token);expect(persisted).not.toContain('SYNTHETIC QA CUSTOMER');
  await page.getByRole('link',{name:'Open manage page',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Manage your booking',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/\/manage$/);
  await page.getByRole('button',{name:'Reschedule',exact:true}).click();
  await page.getByText('14:00',{exact:true}).click();
  await page.getByRole('button',{name:'Confirm new time',exact:true}).click();
  await expect(page.locator('section[aria-labelledby="current-h"]')).toContainText('14:00');
  const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button',{name:'Cancel appointment',exact:true}).click();
  await page.getByRole('button',{name:'Yes, cancel appointment',exact:true}).click();
  await expect(page.locator('section[aria-labelledby="current-h"]')).toContainText('Cancelled');
  expect(errors).toEqual([]);
  await page.reload();await expect(page.getByRole('button',{name:'Reschedule',exact:true})).toHaveCount(0);
});

test('a confirmation reload cannot recover private route state from browser history',async({page})=>{
  await page.goto('/confirmation');await english(page);
  await expect(page.getByText('No booking found on this page',{exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Manage link (secret)',exact:true})).toHaveCount(0);
});

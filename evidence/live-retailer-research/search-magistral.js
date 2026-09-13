async page => {
  const query = 'detergente Magistral 500 ml';
  const start = page.__research.responses.length;
  const search = page.getByRole('textbox', { name: /Buscar Productos/ }).first();
  const response = page.waitForResponse(r => /productSearch|__pickRuntime/i.test(r.url() + (r.request().postData() || '')), { timeout: 15000 }).catch(() => null);
  await search.fill(query);
  await search.press('Enter');
  const observed = await response;
  await page.waitForTimeout(1500);
  
  page.__research.searches.push({ query, start, end: page.__research.responses.length });
  return { query, title: await page.title(), responseStatus: observed?.status(), newJsonResponses: page.__research.responses.length - start };
}


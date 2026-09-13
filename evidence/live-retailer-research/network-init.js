async page => {
  const state = { requests: [], responses: [], pending: [], searches: [] };
  page.__research = state;
  const relevant = request => ['xhr', 'fetch'].includes(request.resourceType()) && /^https:\/\/[^/]*(?:carrefour\.com\.ar|vea\.com\.ar|masonline\.com\.ar|vtex[^/]*)(?:\/|$)/.test(request.url());
  page.on('request', request => {
    if (relevant(request)) state.requests.push(request);
  });
  page.on('response', response => {
    if (!relevant(response.request())) return;
    const task = (async () => {
      try {
        if (!(response.headers()['content-type'] || '').includes('json')) return;
        const body = await response.json();
        state.responses.push({ response, body });
      } catch {}
    })();
    state.pending.push(task);
  });
  return { installed: true, page: page.url().split('?')[0] };
}

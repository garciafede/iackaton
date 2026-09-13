async page => {
  
  const captures = [];
  for (const {response, body} of page.__research.responses) {
    if (!body) continue;
    const rows = body.queryData ? body.queryData.map(q => ({variables: q.variables, data: JSON.parse(q.data)})) : [{data: body.data}];
    for (const row of rows) {
      if (!row.data?.productSearch) continue;
      const request = response.request();
      const headers = await request.allHeaders();
      const queryParams = await page.evaluate(raw => Object.fromEntries(new URL(raw).searchParams), response.url());
      captures.push({ observedAt: new Date().toISOString(), request: { url: response.url(), method: request.method(), queryParams,
        headerNames: Object.keys(headers), cookieNames: (headers.cookie || '').split(';').filter(Boolean).map(s => s.trim().split('=')[0]), body: request.postData() },
        status: response.status(), variables: row.variables,
        data: { productSearch: { recordsFiltered: row.data.productSearch.recordsFiltered,
          products: row.data.productSearch.products.map(p => ({productId: p.productId, productName: p.productName, brand: p.brand, link: p.link,
            properties: p.properties, skuSpecifications: p.skuSpecifications,
            items: p.items.map(i => ({ itemId: i.itemId, name: i.name, ean: i.ean, measurementUnit: i.measurementUnit, unitMultiplier: i.unitMultiplier,
              sellers: i.sellers.map(s => ({sellerId: s.sellerId, sellerName: s.sellerName, sellerDefault: s.sellerDefault,
                commertialOffer: {Price: s.commertialOffer.Price, ListPrice: s.commertialOffer.ListPrice, AvailableQuantity: s.commertialOffer.AvailableQuantity,
                  PriceWithoutDiscount: s.commertialOffer.PriceWithoutDiscount, discountHighlights: s.commertialOffer.discountHighlights,
                  teasers: s.commertialOffer.teasers, spotPrice: s.commertialOffer.spotPrice, taxPercentage: s.commertialOffer.taxPercentage } })) })) })) } },
        onlinePriceFound: row.data.productSearch.products.some(p => p.items.some(i => i.sellers.some(s => s.commertialOffer.Price > 0))), physicalStoreMapping: false });
    }
  }
  return captures;
}


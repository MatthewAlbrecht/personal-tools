# Exchange rates and import fees

Two questions for the price tracker. Which free, keyless API can a daily Convex cron call for USD conversion rates? And what default import-fee percentage should apply per seller country when a US buyer orders a single Yu-Gi-Oh card from abroad on ebay.com?

Everything here was checked on 2026-10-20 (US time). The live API calls ran at about 01:33 UTC on 2026-10-21. **Verified** means seen in a live response or a primary document. **Unverified** means it comes from a secondary source or is inferred, so treat it as a guess. Tariffs changed several times in 2026, so re-check the [tariff sources](#sources) before trusting the table below.

## 1. Exchange rates

### Candidates

| Source | Keyless | Terms / attribution | Limits | Updates | Coverage | Status |
|---|---|---|---|---|---|---|
| **Frankfurter v2** `api.frankfurter.dev/v2/rates` | Yes | "Blended rates are Frankfurter's own calculation and free to use." No attribution requirement found | "There are no quotas. Requests are rate-limited to prevent abuse" | "Rates update daily" | 165 quotes for base USD, including TWD, VND, KRW, HKD | Verified (live, plus [frankfurter.dev](https://frankfurter.dev/)) |
| Frankfurter v1 `api.frankfurter.dev/v1/latest` (`api.frankfurter.app` 301-redirects here) | Yes | Same | Same | ECB working days | **Only 29 currencies (ECB set): no TWD, VND, AED** | Verified. The response carries `deprecation: @1779103800` (2026-05-18) and `link: <…/v2/rates>; rel="successor-version"` headers. The site says v1 "remains available indefinitely" |
| open.er-api.com (ExchangeRate-API Open Access) | Yes | **Attribution required**: a "Rates By Exchange Rate API" link to `https://www.exchangerate-api.com` on pages that show the rates. Caching is allowed and redistribution is not | Rate-limited. They suggest at most 1 request per hour. Over the limit you get HTTP 429 for 20 minutes | Once every 24 hours. The response includes `time_next_update_unix` | 166 codes, including TWD and VND | Verified (live, plus [docs/free](https://www.exchangerate-api.com/docs/free)) |
| fawazahmed0 currency-api (jsDelivr, with a Cloudflare Pages fallback) | Yes | CC0-1.0, no attribution | "No Rate limits" | "Daily Updated". The jsDelivr `@latest` copy was a day behind (`2026-10-19`, `age: 15778`), and the pages.dev copy was current (`2026-10-20`) | Hundreds of codes, including crypto. Keys are lowercase | Verified (live, plus [GitHub README](https://github.com/fawazahmed0/exchange-api)). The upstream data source isn't documented |
| exchangerate.host | **No** | n/a | n/a | n/a | n/a | Verified: returns `{"success":false,"error":{"code":101,"type":"missing_access_key",…}}` |
| ECB eurofxref-daily.xml | Yes | ECB reference rates | n/a | ECB working days, published around 16:00 CET | About 30 currencies, **EUR base only** (you'd have to cross-rate to USD), XML | Verified (live) |

### Recommendation: Frankfurter v2

Call:

```
GET https://api.frankfurter.dev/v2/rates?base=USD&quotes=GBP,EUR,CAD,AUD,JPY,KRW,TWD,HKD,CNY,SGD,CHF,MXN
```

Real response, trimmed to the requested quotes (verified):

```json
[{"date":"2026-10-21","base":"USD","quote":"AUD","rate":1.4323},
 {"date":"2026-10-21","base":"USD","quote":"CAD","rate":1.407},
 {"date":"2026-10-21","base":"USD","quote":"CHF","rate":0.82475},
 {"date":"2026-10-21","base":"USD","quote":"CNY","rate":6.6755},
 {"date":"2026-10-21","base":"USD","quote":"EUR","rate":0.8908},
 {"date":"2026-10-21","base":"USD","quote":"GBP","rate":0.74995},
 {"date":"2026-10-21","base":"USD","quote":"HKD","rate":7.8543},
 {"date":"2026-10-21","base":"USD","quote":"JPY","rate":158.28},
 {"date":"2026-10-21","base":"USD","quote":"KRW","rate":1329.24},
 {"date":"2026-10-21","base":"USD","quote":"MXN","rate":18.4709},
 {"date":"2026-10-21","base":"USD","quote":"SGD","rate":1.2786},
 {"date":"2026-10-20","base":"USD","quote":"TWD","rate":32.522}]
```

- The response is a top-level **array** of `{ date, base, quote, rate }`. `rate` is the number of units of `quote` per 1 USD, so **1 unit of X = `1 / rate` USD**. For example, 1 GBP = 1 / 0.74995 ≈ 1.3334 USD.
- `date` can differ between rows: TWD was a day older than the others. Store each row's own date.
- Omit `quotes` to get all 165 currencies.
- Response headers: `cache-control: public, max-age=80768`, served by Cloudflare. One call a day is fine.
- Why v2: it's keyless, has no attribution requirement or quota, and covers TWD and VND, which v1 and ECB lack.

**Fallback:** `https://open.er-api.com/v6/latest/USD`. The shape is `{"result":"success","base_code":"USD","time_last_update_unix":1792540952,"rates":{"USD":1,"GBP":0.748335,"EUR":0.89075,"JPY":158.224062,"TWD":32.626371,…}}`, and here too 1 X = `1 / rates[X]` USD (verified). If you use it, **the UI must show a "Rates By Exchange Rate API" link to https://www.exchangerate-api.com** (verified, [docs/free](https://www.exchangerate-api.com/docs/free)).

Other shapes, for reference (verified):

- fawazahmed0: `{"date":"2026-10-20","usd":{"aud":1.42838714,"eur":…}}`. Keys are lowercase and nested under the base code.
- Frankfurter v1: `{"amount":1.0,"base":"USD","date":"2026-10-20","rates":{"AUD":1.4317,…}}`.

## 2. Import fees for a US buyer of single cards

### Classification and base duty

- **HTS 9504.40.00 "Playing cards", general (MFN) rate Free.** Verified with the USITC HTS REST API (`https://hts.usitc.gov/reststop/search?keyword=9504.40` → `"general":"Free"`).
- **CBP classifies Yu-Gi-Oh! cards there.** Verified: ruling [N352820](https://rulings.cbp.gov/ruling/N352820) (2025-09-11), "Yu-Gi-Oh! trading cards from Japan … 9504.40.0000 … The column one, general rate of duty will be Free". Pokémon cards bought as collectibles were also put there, in [N359352](https://rulings.cbp.gov/ruling/N359352) (2026-03-16), which says "Chapter 49 … does not cover playing cards", so 4911.91 does not apply. Both rulings mistype the number as "9404.40.0000" in places; the description is 9504.
- **China's 2018–19 Section 301 lists do not appear to cover 9504.40.** Unverified (inferred): recent CBP rulings on 9504.40 card games from China, such as N354061 and N364961, cite no 9903.88.xx heading, while rulings on 9504.90 and 4911.99 items do cite 9903.88.15.
- **Tariffs follow country of origin, meaning where the card was printed, not where the seller is.** A Japanese OCG card sold from Hong Kong is a product of Japan. The table below keys on seller location as a practical default. Where English TCG cards are printed was not checked, so that is unverified.

### De minimis ($800) is gone

- On 2025-07-04 the One Big Beautiful Bill Act (Pub. L. 119-21, §70531(b)) terminated de minimis effective **2027-07-01**. EO 14324 (signed 2025-07-30) suspended it for all countries from **2025-08-29**. EO 14388 (2026-02-20) continued the suspension after the Supreme Court ruling and set a flat 10% Section 122 duty on postal shipments. On 2026-06-24 CBP published IFRs (91 FR 37789, 91 FR 37801) suspending de minimis "indefinitely" in its regulations and creating a new postal informal entry process; "CBP began applying all applicable duties to postal informal shipments". Verified: CBP proposed rule "Low-Value Shipments", [91 FR 64532](https://www.federalregister.gov/documents/2026/10/08/2026-20650/low-value-shipments) (2026-10-08), background section.
- So every card shipment, by post or courier, now owes the full applicable duty from the first dollar.

### What happened to the IEEPA "reciprocal" tariffs

- **Struck down.** *Learning Resources, Inc. v. Trump*, No. 24-1287, together with *Trump v. V.O.S. Selections*, No. 25-250, was decided 2026-02-20. The holding: "IEEPA does not authorize the President to impose tariffs." Verified ([opinion PDF](https://www.supremecourt.gov/opinions/25pdf/24-1287_4gcj.pdf)). The EU 15%, Japan 15%, India 50% and other IEEPA rates, and the fentanyl tariffs on Canada, Mexico and China, are no longer collected. UPS and FedEx both say IEEPA duties stopped for entries from 2026-02-24 (unverified, from search snippets of their pages).
- **Replaced on 2026-02-24 by a 10% global Section 122 surcharge.** That surcharge expired on **2026-07-24** after its 150-day limit. Verified from the CBP rule above and eBay's [tariff page](https://pages.ebay.com/tariffs/) ("The 10% US global tariff has expired"). The expiry date itself is unverified, from secondary sources ([Baker Donelson](https://www.bakerdonelson.com/forced-labor-section-301-tariffs-imposed-to-replace-expiring-section-122-tariffs-what-importers-need-to-know)).
- **Replaced on 2026-07-24 by the Section 301 "forced labor" tariffs on 60 economies.** These apply "indefinitely absent subsequent amendment" (Baker Donelson). Verified from the USTR notice [91 FR 47318](https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies), FR Doc 2026-15181, and the presidential memo [91 FR 47717](https://www.federalregister.gov/documents/2026/07/28/2026-15274/actions-by-the-united-states-in-the-investigations-under-section-301-of-the-trade-act-of-1974-of-the):
  - **10%:** Argentina, Bangladesh, Cambodia, Canada, Ecuador, El Salvador, Guatemala, Honduras, India, Indonesia, Jordan, Malaysia, Mexico, Pakistan, Sri Lanka, the United Kingdom, Trinidad and Tobago.
  - **10% net of MFN:** the EU and Taiwan. **12.5% net of MFN:** Japan, Korea and Switzerland. "Net of MFN" means MFN plus Section 301 adds up to the cap. Cards have an MFN rate of 0%, so the full 10% or 12.5% applies.
  - **12.5%:** every other investigated economy, including Australia, Brazil, China, Hong Kong, New Zealand, the Philippines, Singapore, Thailand and Vietnam.
  - **Exemptions:** informational materials, donations, accompanied baggage, Section 232 goods and annexed HTS lines. **Chapter 95 and chapter 49 do not appear anywhere in USTR's final-action PDF**, which has about 7,400 HTS codes in its text, so cards are not exempt (verified by grep). USMCA duty-free goods of Canada and Mexico are exempt. Secondary sources say USMCA can't be claimed for postal shipments ([Zonos](https://zonos.com/us-tariff-updates), unverified).
- **Brazil also pays an extra 25% Section 301 tariff** (effective 2026-07-22, [FR Doc 2026-14542](https://www.federalregister.gov/documents/2026/07/20/2026-14542)). It stacks on top of the forced-labor tariff. The exemption annex is an image, so whether 9504.40 is excluded is **unverified**. The default assumes it is not excluded.
- **Canada's 50% Section 338 duties do not list 9504.40.00.** Verified against the White House annexes ([July Annex I](https://www.whitehouse.gov/wp-content/uploads/2026/07/ANNEX-I-3.pdf), [September Annex I](https://www.whitehouse.gov/wp-content/uploads/2026/09/ANNEX-I-AUTO.pdf)). They list 9504.30, 9504.50 and 9504.90.40, but not 9504.40. They **do** list 4911.91.40 (pictures and prints), so a card shipment misdeclared as printed matter could be charged 50%. Some Canadian goods have been banned from import since 2026-09-29 (FR Doc 2026-18837). That annex wasn't checked.

### Fees on top of duty

- **eBay** ([tariffs page](https://pages.ebay.com/tariffs/), verified): "If you purchase any item that ships from outside the US, you will need to pay import fees." "Import fees will continue to be shown at checkout when they're collected on eBay"; otherwise "the shipping carrier will contact you to collect fees on delivery". **"Shipping carriers or US Customs usually charge $5–$30 in processing fees."**
- **eBay help [4057](https://www.ebay.com/help/buying/shipping-delivery/changing-delivery-address-method/international-purchases-shipping?id=4057)** (verified): eBay International Shipping, GSP and SpeedPAK handle customs. With SpeedPAK you pay "applicable import fees, duties, and taxes" at checkout. Import charges can include "Third party brokerage fees (including advancement and disbursement charges)". No separate eBay processing fee is mentioned.
- **Carriers** (unverified, from search snippets of first-party rate sheets):
  - DHL Express US Duty Tax Processing: 2–2.5% of duty or $17.50, whichever is greater ([DHL customs services](https://www.dhl.com/us-en/home/express/products-and-solutions/products-and-services-overview/customs-services.html), [2026 rate guide](https://www.dhl.com/content/dam/dhl/global/dhl-express/documents/pdf/service-and-rate-guide-us-en.pdf)).
  - FedEx US disbursement fee: 2% or $15, whichever is greater ([2026 surcharge changes](https://www.fedex.com/content/dam/fedex/us-united-states/services/surcharge_and_fee_changes_2026.pdf)).
  - UPS: no current US figure found.
  - CBP's flat informal-entry MPF is about $2.69 (from DHL's guide).
- **Fees are mostly flat, so a percentage can't model them well.** A $17.50 minimum is 35% of a $50 card and 6% of a $300 one. The defaults below add a **3-point allowance** for a typical eBay-collected or postal DDP order. They do not cover an express-courier minimum. If precision matters, add a separate fixed-fee field.

### Default rates

Each rate is the tariff on a card at MFN 0% (Section 301 forced-labor tariff, plus Brazil's extra 25%) plus a 3-point fee allowance, rounded. Use **10% as the fallback for unlisted countries**. That covers 10% countries reasonably, under-counts 12.5% countries a little, and over-counts countries outside the 60, which pay 0% duty plus fees. **Update (ticket 13):** the app uses **15%**, approved by Matt, so an unlisted country never looks cheaper than a listed one.

eBay's "Located in" names come from the `_salic` "Located in" dropdown on `https://www.ebay.com/sch/ebayadvsearch`, fetched 2026-10-20. Verified: United States, United Kingdom, Canada, Australia, Greece and Japan were also seen as literal `Located in <X>` text on saved result pages. **Korea:** the dropdown says "South Korea", but a country JSON list on the same page says "Korea, South". Match both.

| eBay "Located in" | Default % | What's in it |
|---|---|---|
| United States | 0 | Domestic |
| Canada | 13 | 10 + 3. USMCA could make this 0 + fees if the card is USMCA-originating and not shipped by post. Unlikely |
| Mexico | 13 | 10 + 3. Same USMCA note |
| United Kingdom | 13 | 10 + 3 |
| Ireland | 13 | EU 10 + 3 |
| Germany | 13 | EU 10 + 3 |
| France | 13 | EU 10 + 3 |
| Italy | 13 | EU 10 + 3 |
| Spain | 13 | EU 10 + 3 |
| Netherlands | 13 | EU 10 + 3 |
| Belgium | 13 | EU 10 + 3 |
| Austria | 13 | EU 10 + 3 |
| Portugal | 13 | EU 10 + 3 |
| Poland | 13 | EU 10 + 3 |
| Sweden | 13 | EU 10 + 3 |
| Denmark | 13 | EU 10 + 3 |
| Finland | 13 | EU 10 + 3 |
| Greece | 13 | EU 10 + 3 |
| Japan | 16 | 12.5 + 3 |
| South Korea (also "Korea, South") | 16 | 12.5 + 3 |
| China | 16 | 12.5 + 3. Old China 301 lists don't seem to cover 9504.40 (unverified) |
| Hong Kong | 16 | 12.5 + 3 |
| Taiwan | 13 | 10 + 3 |
| Singapore | 16 | 12.5 + 3 |
| Malaysia | 13 | 10 + 3 |
| Philippines | 16 | 12.5 + 3 |
| Thailand | 16 | 12.5 + 3 |
| Indonesia | 13 | 10 + 3 |
| Vietnam | 16 | 12.5 + 3 |
| India | 13 | 10 + 3. The IEEPA 50% is gone |
| Australia | 16 | 12.5 + 3 |
| New Zealand | 16 | 12.5 + 3 |
| Switzerland | 16 | 12.5 + 3 |
| Brazil | 41 | 25 + 12.5 + 3. Conservative, since the exclusion status of 9504.40 is unverified |
| *(any other)* | 10 | Fallback |

Watch for changes. The administration has announced more Section 301 investigations. The EU and Japan framework deals no longer set the rate; the Section 301 notice does.

## Sources

- Frankfurter: [frankfurter.dev](https://frankfurter.dev/), and live calls to `/v1/latest` and `/v2/rates`
- ExchangeRate-API Open Access: [docs/free](https://www.exchangerate-api.com/docs/free), and a live call to `open.er-api.com/v6/latest/USD`
- fawazahmed0: [README](https://github.com/fawazahmed0/exchange-api), and live calls to jsDelivr and `latest.currency-api.pages.dev`
- ECB: live call to `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`
- USITC HTS REST API: `https://hts.usitc.gov/reststop/search?keyword=9504.40`
- CBP CROSS JSON API: `https://rulings.cbp.gov/api/ruling/N352820` and others
- Supreme Court: [24-1287 opinion](https://www.supremecourt.gov/opinions/25pdf/24-1287_4gcj.pdf)
- Federal Register:
  - [91 FR 47318](https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies) (Section 301 forced-labor action)
  - [91 FR 64532](https://www.federalregister.gov/documents/2026/10/08/2026-20650/low-value-shipments) (CBP Low-Value Shipments proposed rule)
  - [91 FR 37801](https://www.federalregister.gov/documents/2026/06/24/2026-12669/indefinite-suspension-of-the-de-minimis-exemption-for-mail-shipments-and-new-postal-informal-entry) (postal de minimis IFR)
  - [FR Doc 2026-14542](https://www.federalregister.gov/documents/2026/07/20/2026-14542) (Brazil 301)
  - FR Docs 2026-14997, 2026-18837 and 2026-18839 (Canada Section 338)
- USTR: [final action PDF](https://ustr.gov/sites/default/files/files/Press/Releases/2026/FLIP%20301%20Investigation%20Final%20Action%20FRN%207-23-26%20FINAL.pdf), [fact sheet](https://www.ustr.gov/about/policy-offices/press-office/fact-sheets/2026/july/fact-sheet-ustr-section-301-action-response-failure-60-economies-ban-imports-produced-forced-labor)
- White House Section 338 annexes (linked above)
- eBay: [tariff updates](https://pages.ebay.com/tariffs/), [help 4057](https://www.ebay.com/help/buying/shipping-delivery/changing-delivery-address-method/international-purchases-shipping?id=4057), advanced search page `https://www.ebay.com/sch/ebayadvsearch`
- Secondary sources, used only where marked unverified: [Baker Donelson](https://www.bakerdonelson.com/forced-labor-section-301-tariffs-imposed-to-replace-expiring-section-122-tariffs-what-importers-need-to-know), [Zonos](https://zonos.com/us-tariff-updates)

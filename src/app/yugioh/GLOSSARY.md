# Yu-Gi-Oh

Tracks what it costs to finish building a Yu-Gi-Oh! deck in max rarity, and links out to buy each card.

## Language

**Card**:
A game card by name, regardless of how it was printed (e.g. Ash Blossom & Joyous Spring).
_Avoid_: Item

**Printing**:
One release of a Card, identified by set code and rarity (e.g. RA01-EN008 Quarter Century Secret Rare). One set code can have several Printings with different rarities.
_Avoid_: Version, variant, product

**Overloaded set code**:
A set code shared by several Printings of different rarities, so searching the code alone also finds the rarities you don't want.
_Avoid_: Shared code, duplicate code

**Listing**:
One offer to sell a Card on a marketplace (eBay or TCGplayer), whether still active or already sold. It may not be for a Printing you want.
_Avoid_: Post, item, auction (an auction is one kind of Listing)

**Available Listing**:
A Listing still for sale: buy it now, Best Offer, or an auction still taking bids or that ended without a bid. A Listing is either Available or a Sale, never both.
_Avoid_: Active listing, all

**Sale**:
A Listing that sold, or an auction that ended with bids. Sales set Reference prices.
_Avoid_: Sold listing, completed listing

**New Listing**:
A Listing first seen since your last visit to the Deck, whether it's Available or a Sale.
_Avoid_: Fresh, recent

**Search**:
One marketplace query covering a group of Printings' set codes at once, viewed as Newly Listed or Sold, or as Ending soon (its running auctions, ending soonest first) shortly before one of them ends.
_Avoid_: Query, feed

**Required rarity**:
The rarity a Search makes every title say (e.g. "(ultimate,utr)": the rarity's word or its abbreviation), when all the Printings it looks for have that rarity and one of its set codes is Overloaded. Rare and Common have none, having no word of their own.
_Avoid_: Rarity filter, rarity term

**Exclusion**:
A term a Search leaves out (e.g. "-super") so an Overloaded set code doesn't pull in rarities you don't want. Never a word of a rarity or Card name that Search looks for, so set codes share a Search only when their Exclusions spare each other's Printings.
_Avoid_: Filter, negative keyword

**Per-copy price**:
What one Copy from a Listing costs you landed: price plus shipping and import fees, divided by the number of Copies in the Listing.
_Avoid_: Unit price, total

**Reference price**:
What a Printing usually sells for on one marketplace, used to judge that marketplace's Listings. Each Printing has an eBay Reference price and a TCGplayer Reference price, kept separate.
_Avoid_: Market price (that is TCGplayer's own figure), blended price

**Cost to finish**:
What the Copies a Deck still needs should cost: remaining Copies × the lower Reference price, per Card (an undecided Card takes its cheapest Candidate). Cards without a Reference price are named, not counted as $0.
_Avoid_: Estimate, budget, total

**Buy-now total**:
What finishing would cost today: remaining Copies × the cheapest Qualifying buy-it-now Per-copy price of each Card, on eBay or TCGplayer. Cards with nothing to buy now are left out and counted.
_Avoid_: Buy-now floor (that is one Printing's cheapest price), checkout total

**Lowest acceptable condition**:
The most-played condition you'd accept for a Card in a Deck (Near Mint, Lightly Played, Moderately Played or Heavily Played).
_Avoid_: Min grade (grading is a different thing)

**Qualifying Listing**:
A Listing that counts toward prices, deals and cost estimates: matched to a Printing you want, not Rejected, English, not graded, and at or above the Card's Lowest acceptable condition (or of unknown condition).
_Avoid_: Valid listing, eligible listing

**Deal grade**:
How a Listing's Per-copy price compares to its Printing's Reference price: Great, Good, Fair or Poor.
_Avoid_: Score, rating

**Rejected Listing**:
A Listing you marked wrong, with a reason (wrong language, wrong card, wrong rarity, wrong set or Printing, graded, lot, fake, other). It counts toward nothing (prices, deals, cost to finish, pushes), stays rejected when captured again, and shows only under Marked wrong, where you can restore it.
_Avoid_: Hidden, blocked, bad listing

**Condition set by you**:
A Listing's condition as you set it (or "Not stated"), over what its title says. It wins everywhere a condition counts (Qualifying, Deal grades, Reference prices, Cost to finish, filters, pushes) and stays through re-reads and recaptures. Shown with a pencil.
_Avoid_: Corrected condition, manual grade

**Graded Listing**:
A Listing for a Copy sealed and graded by a grading company (e.g. PSA 10).
_Avoid_: Slab

**Copy**:
One physical card.
_Avoid_: Unit

**Deck**:
A named list of Cards and how many Copies of each it needs.
_Avoid_: Build, list

**Candidate Printing**:
A Printing you'd accept for a Card in a Deck. A Card can have several while you're undecided.
_Avoid_: Target, option

**Chosen Printing**:
The one Printing all Copies of a Card in a Deck will be. Copies of a Card are never mixed across Printings.
_Avoid_: Selected printing, final printing

**Section**:
One of a Deck's three parts: Main, Extra or Side.
_Avoid_: Zone, pile

**Max rarity**:
Building a Deck with each Card in its most prized Printing.

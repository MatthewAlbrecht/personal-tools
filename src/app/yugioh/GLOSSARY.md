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

**Search**:
One marketplace query covering a group of Printings' set codes at once, viewed as either Newly Listed or Sold.
_Avoid_: Query, feed

**Exclusion**:
A term a Search leaves out (e.g. "-super") so an Overloaded set code doesn't pull in rarities you don't want.
_Avoid_: Filter, negative keyword

**Per-copy price**:
What one Copy from a Listing costs you landed: price plus shipping and import fees, divided by the number of Copies in the Listing.
_Avoid_: Unit price, total

**Reference price**:
What a Printing usually sells for on one marketplace, used to judge that marketplace's Listings. Each Printing has an eBay Reference price and a TCGplayer Reference price, kept separate.
_Avoid_: Market price (that is TCGplayer's own figure), blended price

**Lowest acceptable condition**:
The most-played condition you'd accept for a Card in a Deck (Near Mint, Lightly Played, Moderately Played or Heavily Played).
_Avoid_: Min grade (grading is a different thing)

**Qualifying Listing**:
A Listing that counts toward prices, deals and cost estimates: matched to a Printing you want, English, not graded, and at or above the Card's Lowest acceptable condition (or of unknown condition).
_Avoid_: Valid listing, eligible listing

**Deal grade**:
How a Listing's Per-copy price compares to its Printing's Reference price: Great, Good, Fair or Poor.
_Avoid_: Score, rating

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

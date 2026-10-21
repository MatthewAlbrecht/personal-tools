# Seeding a Deck from Matt's list

Runbook for the agent that loads a Deck into `/yugioh` from Matt's card list. There is no import screen: you turn the list into a JSON payload and run one internal Convex mutation, `yugioh/seed:loadDeck`. Terms (Card, Printing, Candidate Printing, Overloaded set code, Section, Lowest acceptable condition) are defined in `src/app/yugioh/GLOSSARY.md`; use them when you talk to Matt.

## The load in one paragraph

`loadDeck` matches the Deck by exact name (creating it if missing) and each Card by name + Section, case- and space-insensitively; a Card listed in a different Section from the saved one is moved, keeping its Copies owned and Chosen Printing. Listed Cards are added or updated; listed Candidate Printings are added if the Card lacks them. Printings are shared across Decks by set code + rarity, so a Printing already saved for another Deck is reused and any new Overloaded rarities are merged into it. The mutation is all-or-nothing: any error writes nothing. Re-running the same payload changes nothing, so it's safe to run again after a fix. The one thing a re-run overwrites is `copiesOwned` or `lowestAcceptableCondition` when the payload sets them, even if Matt changed them in the app since.

What it never does: pick a Chosen Printing, set Custom order, or touch Listings and prices.

## Payload

```json
{
  "name": "Snake-Eye",
  "cards": [
    {
      "cardName": "Ash Blossom & Joyous Spring",
      "section": "main",
      "copiesNeeded": 3,
      "copiesOwned": 1,
      "lowestAcceptableCondition": "nearMint",
      "candidates": [
        { "setCode": "RA01-EN008", "rarity": "Quarter Century Secret Rare", "overloadedRarities": ["Super Rare", "Ultra Rare"] },
        { "setCode": "MP23-EN001", "rarity": "Starlight Rare", "overloadedRarities": [] }
      ]
    }
  ],
  "removeUnlisted": false
}
```

| Field | Rule |
|---|---|
| `name` | The Deck name. Re-runs find the Deck by this exact name, so keep it identical. |
| `section` | `"main"`, `"extra"` or `"side"`. A Card in two Sections is two entries; one Section never lists a Card twice. |
| `copiesNeeded` | 1 to 3. |
| `copiesOwned` | Optional, 0 to `copiesNeeded`. **Omit it unless Matt told you**: an omitted value keeps whatever he set in the app (0 for a new Card). |
| `lowestAcceptableCondition` | Optional: `"nearMint"`, `"lightlyPlayed"`, `"moderatelyPlayed"`, `"heavilyPlayed"`. Omitted keeps the saved value (Near Mint for a new Card). |
| `candidates` | 1 to 10 Printings Matt would accept. Set code and rarity are normalised (`ra01-en008` → `RA01-EN008`, `qcsr` → `Quarter Century Secret Rare`). |
| `overloadedRarities` | The other rarities printed under the same set code, so eBay Searches can exclude them. `[]` when the code has one rarity. |
| `removeUnlisted` | Optional. `true` deletes Cards and Candidates the Deck has but the payload lacks. Only with Matt's go-ahead (step 3). |

## Steps

### 1. Get the list

Ask Matt for his list: a pasted list or a `.ydk` export, plus the Deck name. Each step below ends when its criterion holds.

- **Pasted list**: read Card names, copies, Sections and any set codes and rarities he wrote.
- **`.ydk` file**: lines under `#main`, `#extra` and `!side` are card passcodes, one line per Copy. Count repeats for `copiesNeeded`. Resolve each passcode to a name with `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=<passcode>`. A `.ydk` has no set codes or rarities: every Card's Candidates come from step 2.

Done when every Card has a name, a Section and `copiesNeeded`.

### 2. Fill in the Printings

For each Card, list its Printings with `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=<url-encoded name>`: `card_sets[]` gives `set_code` and `set_rarity`.

- **Candidates**: the Printings Matt named. Where he didn't name one, propose the max-rarity ones (Quarter Century Secret, Starlight and so on; prize order is `RARITIES` in `src/lib/yugioh/deck.ts`) and let him pick in step 3.
- **Overloaded rarities**: every other `set_rarity` in `card_sets[]` with the same `set_code`. YGOPRODeck calls the RA01 rarities "Collector's Rare" and "Ultimate Rare"; keep its names.
- Use the full card name exactly as YGOPRODeck spells it.

Done when every Card has at least one Candidate with set code, rarity and Overloaded rarities.

### 3. Confirm with Matt before writing

Show Matt the Deck as a table (Section, Card, copies needed / owned, Candidates with set code and rarity), then ask about each **ambiguity**:

- a name that matched no card, or several;
- a Card with no Printing named, where you proposed Candidates;
- a set code or rarity YGOPRODeck doesn't know (likely a typo);
- the same Card in two Sections;
- copies over 3, or a Section count outside Main 40-60, Extra 0-15, Side 0-15;
- Copies owned or a Lowest acceptable condition other than Near Mint, if his list mentions them;
- a Deck with this name already in the app (`npx convex run yugioh/decks:listDecks`): updating it, and whether Cards no longer on his list should go (`removeUnlisted: true`).

Done when Matt has answered every ambiguity and said the table is right.

### 4. Load into dev

Write the payload to a file outside the repo, then run it on the dev deployment (the default):

```sh
npx convex run --push yugioh/seed:loadDeck "$(cat /tmp/yugioh-seed/snake-eye.json)"
```

`--push` deploys local code first; drop it if `npx convex dev` is already running. Small payloads can go inline: `npx convex run yugioh/seed:loadDeck '{"name": …}'`.

The mutation returns a report:

| Field | Meaning |
|---|---|
| `deckId`, `deckCreated` | The Deck, and whether this run created it. |
| `cardsAdded`, `cardsChanged`, `candidatesAdded` | What this run wrote. All 0 on a re-run of the same payload. |
| `cardsRemoved`, `candidatesRemoved` | Only with `removeUnlisted: true`. |
| `unlistedCards`, `unlistedCandidates` | In the Deck but not the payload, and kept. Tell Matt. |

On an error nothing was written. Fix the payload and run again. The errors you'll meet:

- `… is already saved as <name>`: that set code + rarity belongs to another Card. One of the two is a typo; ask Matt.
- `… listed twice in <section>`: merge the entries and add up the copies.
- `Copies needed …` or `Copies owned …`: out of range.
- `More than one Deck is named …`: dev has duplicate Decks with that name; ask Matt which to remove in the dashboard, or pick a new name.

Done when the run succeeds and `npx convex run yugioh/decks:getDeck '{"deckId": "<deckId>"}'` shows every Card, Candidate, copy count and Section from the confirmed table. Then ask Matt to open `/yugioh` on dev and check it.

New Printings get a TCGplayer product lookup in the background. Without `TYPESAFE_API_KEY` set on the deployment, they show "paste a link" instead; that's expected.

### 5. Load into prod: only on Matt's explicit go-ahead

Prod holds Matt's real data. Ask him in so many words ("Load this into prod now?") after he has checked dev, and wait for a yes. Then run the same payload file with `--prod`:

```sh
npx convex run --prod yugioh/seed:loadDeck "$(cat /tmp/yugioh-seed/snake-eye.json)"
```

Only use `--push` on prod if Matt also agrees to deploying the current code. Without it, the prod deployment must already have `yugioh/seed:loadDeck`. Verify with `getDeck --prod` as in step 4.

Done when the prod report matches the dev one (same counts on a first load) and Matt has confirmed the Deck in the app.

# Opptra Discount Engine

A checkout prototype with item and cart discounts, plain-English rule creation, and CSV or PDF cart import.

[Live demo](https://opptra-discount-engine.vercel.app)

## Running locally

Use Node.js 22.13 or later in the 22.x series, or Node.js 24.x. For plain-English
rules, copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` before
starting the server. `GEMINI_MODEL` defaults to Gemini 3.1 Flash-Lite, which
is available on the [Gemini API free tier](https://ai.google.dev/gemini-api/docs/pricing).

1. Run `npm install`.
2. Run `npm run dev` and open http://localhost:5173.

Run `npm test` to check pricing, cart imports, and rule validation.

## Deploying

```bash
npm run build
```

On Vercel, import the full repository. The Vite build produces `dist/`, and
`api/parse-rule.js` deploys alongside it as a function. Set `GEMINI_API_KEY` in
the project's server-side environment and optionally set `GEMINI_MODEL`. The
function keeps the provider key on the server and sends only the offer
description to Gemini.

## How to use

1. Upload `sample-data/rules.csv` as the discount rules input
2. Upload `sample-data/cart.csv` as the cart input
3. Click **Calculate Discounts**

You can also upload `sample-data/cart.pdf` from the cart picker. A valid PDF
replaces the cart and immediately applies the active rules. Use a text-based PDF
with one item per line under Product, Brand, Platform, and Base Price headers.
The parser reports the first malformed row and keeps the current cart and totals.
Image-only scans and wrapped cells are outside the supported table format.

To add a rule in plain English, enter a description and click **Preview rule**.
Review the fields, then click **Confirm** to apply the rule and recalculate the
current cart, or **Discard** to leave the cart as it is. Ambiguous descriptions
ask for specific details. Cart rules interpret “more than” as an inclusive
minimum to match the assignment’s threshold requirement.

## Project structure

```
src/
  engine/
    discountEngine.js   ← pure discount logic (no UI)
    csvParser.js        ← CSV → typed objects
  cart/                 ← browser PDF extraction and cart table parser
  rules/                ← shared schema for natural-language rule proposals
  components/
    CsvUploader.jsx     ← file upload area
    DataTable.jsx       ← reusable table
    ErrorBanner.jsx     ← parse error display
    RuleComposer.jsx    ← rule description and confirmation
  App.jsx               ← main UI + state
  main.jsx              ← entry point

api/                    ← Vercel rule parser entry point
server/                 ← server-side LLM request and validation

sample-data/
  rules.csv             ← sample discount rules
  cart.csv              ← sample cart items
  cart.pdf              ← the same cart as a text-based PDF
```

## CSV formats

**rules.csv**

| Column     | Type              | Example          |
|------------|-------------------|------------------|
| rule_id    | string            | RULE-01          |
| scope      | brand \| platform \| cart | platform |
| applies_to | string (blank for cart rules) | Amazon India |
| type       | percentage \| flat| percentage       |
| value      | number            | 15               |
| stackable  | true \| false     | false            |
| min_cart_value | number (required for cart rules) | 4000 |

**cart.csv**

| Column     | Type   | Example      |
|------------|--------|--------------|
| item_id    | string | ITEM-01      |
| product    | string | Cushion Cover|
| brand      | string | Natura Casa  |
| platform   | string | Amazon India |
| base_price | number | 1299         |

## Discount logic

- When multiple non-stackable rules match an item, the one giving the **largest saving in rupees** is applied.
- Rules marked `stackable: true` apply **on top of** the winning non-stackable rule.
- Each discount is capped at the remaining item or cart price.
- If no rules match, the base price is returned with a "No offers available" note.
- Cart offers are non-stackable percentages. Eligibility uses the subtotal after item discounts, and a subtotal equal to the threshold qualifies. If several cart offers qualify, the largest saving wins. Equal savings use the first rule in input order.

## Expected results for the sample data

| Item    | Base Price | Final Price | Reasoning                              |
|---------|-----------|-------------|----------------------------------------|
| ITEM-01 | Rs.1,299  | Rs.1,104    | Platform offer: 15% off (beats Rs.150) |
| ITEM-02 | Rs.849    | Rs.629      | Brand offer: Rs.150 off + Platform 10% |
| ITEM-03 | Rs.599    | Rs.509      | Platform offer: 15% off                |
| ITEM-04 | Rs.2,499  | Rs.2,499    | No offers available                    |
| ITEM-05 | Rs.449    | Rs.382      | Platform offer: 15% off                |
| ITEM-06 | Rs.899    | Rs.809      | Platform offer: 10% off                |

The discounted items total Rs.5,932. RULE-04 takes 10% off qualifying carts at or above Rs.4,000, saving Rs.593 and bringing the final total to Rs.5,339.

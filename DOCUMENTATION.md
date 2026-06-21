# Trip Expense Tracker — Business Logic & Functional Specification

> **Purpose of this document:** This is the definitive specification for what the Trip Expense Tracker application does, how it calculates, and how it behaves. It is intended for rebuilding the application in Version 2 with complete functional accuracy. Only pure business rules, calculations, data handling, and functional behavior are described here. Design, theming, and implementation structure are intentionally excluded.

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Data Model](#2-data-model)
3. [Trip Management](#3-trip-management)
4. [Participants Management](#4-participants-management)
5. [Currencies Management](#5-currencies-management)
6. [Expenses Management](#6-expenses-management)
7. [Live Balances (Calculation Engine)](#7-live-balances-calculation-engine)
8. [Settlement](#8-settlement)
9. [Import / Export](#9-import--export)
10. [Settings](#10-settings)
11. [Calculation Engine — Detailed Formulas](#11-calculation-engine--detailed-formulas)
12. [Settlement Algorithm — Detailed Logic](#12-settlement-algorithm--detailed-logic)
13. [Validation Rules](#13-validation-rules)
14. [Data Integrity & Normalization](#14-data-integrity--normalization)
15. [Calendar System (Gregorian & Jalali)](#15-calendar-system-gregorian--jalali)
16. [Routing](#16-routing)
17. [Edge Cases & Important Behaviors](#17-edge-cases--important-behaviors)

---

## 1. Application Overview

The **Trip Expense Tracker** is a multi-trip application for group travel expense accounting and settlement. Users create named trips (e.g., "China 2026", "Dubai Trip") and each trip contains its own independent set of participants, currencies, expenses, and settlement data.

### Core Use Case

A group of people goes on a trip together. During the trip, different people pay for shared expenses (meals, transport, accommodation, etc.) in potentially different currencies. At the end of the trip, the application calculates who owes whom and produces a minimal set of payment transactions to settle all debts in a single chosen settlement currency.

Users can manage multiple trips simultaneously, switching between them. Completed trips can be archived.

### Key Capabilities

- Create, edit, duplicate, archive, and delete trips
- Manage a list of trip participants (per trip)
- Define and manage multiple currencies (with predefined quick-add options)
- Record expenses with flexible splitting options (equal, custom amounts, percentage-based)
- View live per-currency balance breakdowns for all participants
- Convert all balances into a single settlement currency using user-provided exchange rates
- Calculate the minimum number of transactions needed to settle all debts
- Support for Gregorian and Jalali (Persian/Solar Hijri) calendar systems
- Per-trip data export (JSON) and import capability
- Full backup/restore of all trips
- Search across all trips by name, description, participants, or expenses
- Hash-based URL routing with browser back/forward support
- All data persisted in browser localStorage

### Application Structure

The application has two levels:

**Trip List (home screen):**
- Grid of trip cards with stats (participants, expenses, currencies, totals)
- Search bar for filtering across all trips
- Sort controls (newest, oldest, name A–Z/Z–A, last updated)
- Archive toggle to show/hide archived trips
- Create, edit, duplicate, archive, and delete trips

**Trip Detail (6 tabs):**
1. **Participants** — Manage the list of people
2. **Currencies** — Define which currencies are used
3. **Expenses** — Record and manage shared expenses
4. **Balances** — View live per-currency balance breakdown
5. **Settlement** — Convert to one currency and calculate final payments
6. **Settings** — Calendar preference, per-trip import/export, full backup/restore, clear trip data

---

## 2. Data Model

### Top-Level State

All application data is stored as a single `AppState` object:

```javascript
{
    trips: [
        {
            id: "uuid-string",
            name: "China 2026",
            description: "Summer vacation",
            archived: false,
            createdAt: "2026-06-15T10:30:00.000Z",
            updatedAt: "2026-06-20T14:00:00.000Z",
            data: { /* AppData - see below */ }
        }
    ],
    activeTripId: "uuid-string" | null
}
```

### Per-Trip Data Object (AppData)

Each trip contains its own independent data:

```javascript
{
    participants: [
        { id: "uuid-string", name: "Person Name" }
    ],
    currencies: [
        { code: "USD", symbol: "$" }
    ],
    expenses: [
        {
            id: "uuid-string",
            date: "2026-01-15",
            description: "Lunch",
            currencyCode: "USD",
            amount: 100.00,
            paidBy: "participant-id",
            splitType: "equal",
            beneficiaries: [
                {
                    participantId: "participant-id",
                    customAmount: null,
                    customPercentage: null
                }
            ]
        }
    ],
    exchangeRates: {
        "EUR": 0.92
    },
    settlementCurrency: "USD"
}
```

### Settings (stored separately)

```javascript
{
    calendar: "gregorian",  // or "jalali"
    theme: "light"          // or "dark"
}
```

### Storage Keys

| Key | Contents |
|-----|----------|
| `trip-expense-tracker-state` | Full `AppState` (all trips) |
| `trip-expense-tracker-settings` | Theme + calendar preference |

### Migration

On first load, if the new `trip-expense-tracker-state` key does not exist but the old `trip-expense-tracker-data` key does, the old data is automatically wrapped into a trip named "My Trip" and migrated.

### ID Generation

IDs are UUIDs. Generation uses `crypto.randomUUID()` when available, otherwise a fallback composite of `Date.now().toString(36)` + `Math.random().toString(36).substr(2, 9)`.

### Amount Formatting

All monetary amounts are displayed with exactly 2 decimal places and locale-appropriate thousand separators:
```javascript
num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
```

---

## 3. Trip Management

### Data Structure

```javascript
{
    id: "unique-uuid",
    name: "China 2026",
    description: "Summer vacation with friends",
    archived: false,
    createdAt: "2026-06-15T10:30:00.000Z",
    updatedAt: "2026-06-20T14:00:00.000Z",
    data: { /* AppData */ }
}
```

### Operations

| Operation | Behavior |
|-----------|----------|
| **Create** | Name is required. Creates trip with empty AppData and navigates into it. |
| **Edit** | Update name and/or description. |
| **Duplicate** | Deep-clones the trip's data. New trip is named "{original} (Copy)". Does not navigate into it. |
| **Archive** | Sets `archived: true`. If it was the active trip, exits to trip list. |
| **Unarchive** | Sets `archived: false`. Trip returns to the active list. |
| **Delete** | Permanently removes the trip and all its data. Requires confirmation. |

### Trip List Features

- **Search:** Filters trips by name, description, participant names, and expense descriptions. Search is case-insensitive.
- **Sort:** Options are Newest first (default), Oldest first, Name A–Z, Name Z–A, Last updated.
- **Archive toggle:** Shows either active or archived trips. Archived trip count is shown in the toggle.
- **Trip cards** display: name, description, participant/expense/currency counts, total expense amounts per currency, and creation date.
- **Action buttons** (edit, duplicate, archive, delete) are always visible on mobile, hover-reveal on desktop.
- Archived trips show a muted style and only offer Unarchive and Delete actions. Clicking an archived trip does nothing.

---

## 4. Participants Management

### Data Structure

```javascript
{ id: "unique-uuid", name: "Person Name" }
```

### Business Rules

1. **Name is required** — Empty/whitespace-only names are rejected.
2. **Names must be unique** — Case-insensitive comparison. "Alice" and "alice" are considered duplicates.
3. **Participants cannot be deleted if they are used in any expense** — Either as the payer (`paidBy`) or as a beneficiary. Deletion must be blocked.
4. **Participants can always be edited (renamed)** — Even if used in expenses. The ID doesn't change, only the name.
5. **No limit on participant count.**

### Functional Behavior

- **Add:** User provides a name. System trims whitespace, validates uniqueness, generates an ID, saves.
- **Edit:** User selects a participant to edit, provides a new name. System trims, validates uniqueness (excluding self), updates.
- **Delete:** Only allowed if participant is not referenced in any expense. Requires user confirmation.

### Side Effects

- **Deletion:** No cascading needed (only unreferenced participants can be deleted).
- **Rename:** No data-level side effects. Expenses reference participants by ID, not name.

---

## 5. Currencies Management

### Data Structure

```javascript
{ code: "USD", symbol: "$" }
```

- `code` is always stored in UPPERCASE (auto-converted on input).
- Maximum length: 5 characters for both code and symbol.

### Predefined Currencies (Quick-Add)

The application provides 24 predefined currencies that users can quickly add with one click:

| Code | Symbol | Name |
|------|--------|------|
| USD | $ | US Dollar |
| EUR | € | Euro |
| GBP | £ | British Pound |
| JPY | ¥ | Japanese Yen |
| CNY | ¥ | Chinese Yuan |
| KRW | ₩ | South Korean Won |
| INR | ₹ | Indian Rupee |
| IRR | ﷼ | Iranian Rial |
| TRY | ₺ | Turkish Lira |
| RUB | ₽ | Russian Ruble |
| AED | د.إ | UAE Dirham |
| SAR | ﷼ | Saudi Riyal |
| CAD | C$ | Canadian Dollar |
| AUD | A$ | Australian Dollar |
| CHF | Fr | Swiss Franc |
| SEK | kr | Swedish Krona |
| THB | ฿ | Thai Baht |
| MYR | RM | Malaysian Ringgit |
| BRL | R$ | Brazilian Real |
| MXN | Mex$ | Mexican Peso |
| GEL | ₾ | Georgian Lari |
| AMD | ֏ | Armenian Dram |
| IQD | ع.د | Iraqi Dinar |
| PKR | ₨ | Pakistani Rupee |

### Business Rules

1. **Both code and symbol are required** for custom currencies.
2. **Currency codes must be unique** — Cannot add a currency whose code already exists. During edit, the check excludes the currency being edited.
3. **Currencies cannot be deleted if used in any expense** — Deletion must be blocked.
4. **Currencies can be edited** even if used in expenses — The system cascades the code change to all related data.
5. **Predefined quick-add behavior:**
   - If the currency is NOT yet added: one-click adds it instantly.
   - If the currency IS already added: one-click triggers removal (with confirmation). However, if the currency is used in expenses, removal is blocked with a message.

### Side Effects of Currency Deletion

- The currency is removed from the currencies list.
- Its exchange rate entry (if any) is deleted.
- If the deleted currency was the `settlementCurrency`, it is cleared to `""`.

### Side Effects of Currency Code Update (Edit)

When a currency code changes from `oldCode` to `newCode`:
1. All expenses with `currencyCode === oldCode` are updated to `newCode`.
2. The exchange rate entry is migrated: `exchangeRates[newCode] = exchangeRates[oldCode]`, then the old entry is deleted.
3. If `settlementCurrency === oldCode`, it is updated to `newCode`.

---

## 6. Expenses Management

### Data Structure

```javascript
{
    id: "unique-uuid",
    date: "2026-01-15",
    description: "Lunch at restaurant",
    currencyCode: "USD",
    amount: 150.00,
    paidBy: "participant-id",
    splitType: "equal",
    beneficiaries: [
        {
            participantId: "participant-id",
            customAmount: null,
            customPercentage: null
        }
    ]
}
```

### Business Rules

1. **Cannot add expenses without at least one participant AND at least one currency existing.**
2. **All fields are required:** date, description, currency, amount, paid by, at least one beneficiary.
3. **Amount must be positive** (greater than 0) and is rounded to 2 decimal places on save: `Math.round(amount * 100) / 100`.
4. **At least one beneficiary must be selected.**
5. **The payer does NOT have to be a beneficiary** — A person can pay for an expense without being among those who benefit from it.
6. **Expenses are displayed sorted by date descending** (most recent first). Storage order is unspecified.

### Split Types

#### Equal Split

- The total amount is divided equally among all selected beneficiaries.
- Uses **integer-cent arithmetic** to avoid floating-point errors:
  - `totalCents = Math.round(amount * 100)`
  - `perPersonCents = Math.floor(totalCents / beneficiaryCount)`
  - `remainderCents = totalCents - perPersonCents * beneficiaryCount`
- Remainder cents distribution priority:
  - If the payer is among the beneficiaries, the payer gets the first remainder cent.
  - Remaining extra cents are given sequentially to other beneficiaries (skipping the payer's position).
  - If the payer is NOT a beneficiary, extra cents go to beneficiaries at indices 0, 1, 2... sequentially.
- **Example:** $100.00 split among 3 people → payer gets 33.34, others get 33.33 each.

#### Custom Amounts Split

- Each beneficiary is assigned a specific monetary amount.
- **Validation:** The sum of all custom amounts MUST equal the total expense amount (tolerance: difference < 0.01).
- **No amount can be negative.**
- The `customAmount` field stores the value; `customPercentage` is null.

#### Percentage Split

- Each beneficiary is assigned a percentage of the total.
- **Validation:** The sum of all percentages MUST equal 100% (tolerance: difference < 0.01).
- **No percentage can be negative.**
- The `customPercentage` field stores the percentage value (e.g., 33.33 for 33.33%); `customAmount` is null.
- When computing actual amounts from percentages, rounding differences are absorbed by the payer (if they are a beneficiary) or the last beneficiary.

### Functional Behavior

- **Add:** Opens a form. Date defaults to today. All participants are pre-selected as beneficiaries. Split type defaults to "Equal".
- **Edit:** Opens a form pre-populated with all existing values including split type, custom amounts/percentages, and beneficiary selections.
- **Delete:** Requires user confirmation. No cascading effects.
- **Live preview (Equal):** While user fills the form, shows the per-person amount (e.g., "33.33 each (3 people)" or "33.33 each, payer pays 33.34 (3 people)").
- **Live validation (Custom/Percentage):** Shows running sum vs. required total with valid/invalid indicator.
- **Beneficiary changes during Custom/Percentage mode:** Custom input fields are rebuilt for the currently selected beneficiaries.

---

## 7. Live Balances (Calculation Engine)

### What It Shows

A breakdown **per currency** showing each participant's:
- **Total Paid** — Sum of all expense amounts where this participant is the payer, in this currency
- **Total Owed** — Sum of this participant's computed share across all expenses in this currency
- **Net Balance** — `Total Paid - Total Owed`
- **Status** — "Creditor" (net > 0.005), "Debtor" (net < -0.005), or "Settled" (within ±0.005)

### Calculation Logic (Per Currency)

For each expense in a given currency:

1. The **payer's** `paid` accumulator is increased by the full `expense.amount`.
2. Each **beneficiary's** `owed` accumulator is increased by their computed share (see Section 11 for detailed share computation).
3. After all expenses are processed: `net = Math.round((paid - owed) * 100) / 100`

### Display Rules

- Only participants who have `paid > 0` OR `owed > 0` in a given currency appear in that currency's breakdown.
- If no expenses exist or no participants exist, show an empty state message.
- Balances update automatically (reactively) whenever any expense, participant, or currency data changes.

### Threshold for Status Classification

- **Creditor:** net > 0.005
- **Debtor:** net < -0.005
- **Settled:** -0.005 ≤ net ≤ 0.005

This 0.005 threshold accounts for floating-point rounding, so values like 0.004 or -0.003 are treated as zero.

---

## 8. Settlement

### Purpose

Converts multi-currency balances into a single currency and computes the minimum number of transactions needed to settle all debts.

### Workflow (4 Steps)

#### Step 1: Choose Settlement Currency

The user selects one of the defined currencies as the target settlement currency. All balances will be converted to this currency.

#### Step 2: Set Exchange Rates

For each currency OTHER than the settlement currency, the user must provide an exchange rate. The rate format is:

```
1 [Settlement Currency] = X [Other Currency]
```

For example, if settlement is USD and you have EUR expenses:
- User enters: `1 USD = 0.92 EUR`
- This means 1 USD equals 0.92 EUR
- Therefore: `amount_in_EUR / 0.92 = amount_in_USD`

**The exchange rate represents:** how many units of the foreign currency equal 1 unit of the settlement currency.

**Conversion formula:**
```
conversionRate = 1 / rates[foreignCurrency]
unified_balance += per_currency_net_balance * conversionRate
```

#### Step 3: Calculate — Unified Balances

1. All per-currency net balances are computed.
2. For each participant, their net balances across all currencies are summed after conversion:
   - For the settlement currency itself: `conversionRate = 1`
   - For other currencies: `conversionRate = 1 / exchangeRate[currencyCode]`
   - `unifiedBalance[participant] += netBalance[currency] * conversionRate`
3. The unified balance is rounded to 2 decimal places: `Math.round(balance * 100) / 100`
4. Each participant is classified as Creditor/Debtor/Settled using the same 0.005 threshold.

#### Step 4: Final Settlement Transactions

The system computes the minimum number of payment transactions needed so that all debts are cleared. Transactions are in the form:

```
[Debtor Name] → [Creditor Name]: [Amount in Settlement Currency]
```

If all balances are within ±0.005, the result is "Everyone is settled — no transactions needed!"

### Validation Before Calculation

- A settlement currency must be selected.
- All exchange rates for non-settlement currencies must be provided (positive numbers > 0).
- If validation fails, an error message is shown and calculation is aborted.

### Behavioral Rules

- Exchange rate inputs persist their values (saved immediately on change).
- When data changes (expenses added/removed, participants changed, etc.), the settlement results are automatically hidden (user must recalculate).
- If only one currency exists, no exchange rates are needed ("Only one currency — no conversion needed.").

---

## 9. Import / Export

### Per-Trip Export

- Generates a JSON file download containing the trip's data plus metadata (`tripName`, `tripDescription`).
- Filename format: `{trip-name-slug}-YYYY-MM-DD.json` (using current date in current calendar format).
- JSON is formatted with 2-space indentation.

### Per-Trip Import

- User pastes or uploads JSON and triggers import.
- **Two import modes:**
  - **Replace Current Trip** — replaces the active trip's data. Requires confirmation (destructive).
  - **Create New Trip** — creates a new trip from the imported data. Uses `tripName` and `tripDescription` fields from the JSON if present, otherwise defaults to "Imported Trip".
- Validation:
  - Must be valid JSON object
  - Must have `participants` array
  - Must have `currencies` array
  - Must have `expenses` array
- Data is normalized after parsing (see Section 14).

### Full Backup Export

- Exports the entire `AppState` (all trips) as a single JSON file.
- Filename format: `trip-expense-backup-YYYY-MM-DD.json`.

### Full Backup Restore

- Imports a full `AppState` JSON, replacing ALL trips.
- Validation: must have a `trips` array.
- **Requires confirmation** — this replaces every trip in the system.
- Data is normalized after parsing.

### Import Template

A pre-formatted JSON template showing the expected per-trip structure:

```javascript
{
    "tripName": "My Trip",
    "tripDescription": "Optional description",
    "participants": [
        { "id": "participant-id-1", "name": "Person A" },
        { "id": "participant-id-2", "name": "Person B" }
    ],
    "currencies": [
        { "code": "USD", "symbol": "$" }
    ],
    "expenses": [{
        "id": "expense-id-1",
        "date": "2026-01-15",
        "description": "Example expense",
        "currencyCode": "USD",
        "amount": 100.00,
        "paidBy": "participant-id-1",
        "splitType": "equal",
        "beneficiaries": [
            { "participantId": "participant-id-1", "customAmount": null },
            { "participantId": "participant-id-2", "customAmount": null }
        ]
    }],
    "exchangeRates": {},
    "settlementCurrency": ""
}
```

---

## 10. Settings

### Calendar

- **Options:** Gregorian (default), Jalali (Persian/Solar Hijri)
- **Effect:** When set to Jalali, dates in the expense list are displayed converted from Gregorian to Jalali format.
- **Important:** Dates are ALWAYS stored internally in Gregorian format (YYYY-MM-DD). The Jalali option only affects display and the default date in the expense form.
- Changing the calendar setting triggers a re-render of all date displays.

### Theme

- **Options:** Light (default), Dark
- The theme system supports light and dark modes with distinct color palettes.

### Clear Trip Data

- Clears all data (participants, currencies, expenses) in the **current trip only**.
- Requires user confirmation.
- Does not delete the trip itself.

---

## 11. Calculation Engine — Detailed Formulas

### Balance Computation Algorithm

```
Input: All expenses, all participants

Output: {
    [currencyCode]: {
        [participantId]: { paid: Number, owed: Number, net: Number }
    }
}

Algorithm:
1. For each expense:
    a. Identify the currency (exp.currencyCode)
    b. If this currency hasn't been seen yet, initialize all participants
       with { paid: 0, owed: 0, net: 0 }
    c. Add exp.amount to payer's `paid` field for this currency
    d. Compute beneficiary shares using getBeneficiaryShares(exp)
    e. For each beneficiary at index i:
        - Add shares[i] to beneficiary's `owed` field

2. For each currency, for each participant:
    net = Math.round((paid - owed) * 100) / 100
```

### getBeneficiaryShares — Complete Algorithm

This is the critical function that determines how much each beneficiary owes for a single expense.

```
Input: expense object
Output: Array of numbers (one per beneficiary, in same order as expense.beneficiaries)

═══════════════════════════════════════════════════════
CASE splitType === "custom":
═══════════════════════════════════════════════════════

    Return: [b.customAmount for each beneficiary b] (use 0 if customAmount is null)

═══════════════════════════════════════════════════════
CASE splitType === "percentage":
═══════════════════════════════════════════════════════

    Step 1: For each beneficiary b at index i:
        shares[i] = Math.round(exp.amount * b.customPercentage) / 100

    Step 2: Compute the sum of all shares in cents:
        pctSum = Math.round( (shares[0] + shares[1] + ... + shares[n-1]) * 100 )

    Step 3: Compute the difference from the total expense amount in cents:
        pctDiff = Math.round(exp.amount * 100) - pctSum

    Step 4: If pctDiff !== 0 (there's a rounding discrepancy):
        - Find the payer's index in the beneficiaries array (payerIdx)
        - If payer IS a beneficiary (payerIdx >= 0):
            adjustIdx = payerIdx
        - If payer is NOT a beneficiary:
            adjustIdx = last index (shares.length - 1)
        - Adjust: shares[adjustIdx] = (Math.round(shares[adjustIdx] * 100) + pctDiff) / 100

    Return: shares

═══════════════════════════════════════════════════════
CASE splitType === "equal":
═══════════════════════════════════════════════════════

    Step 1: totalCents = Math.round(exp.amount * 100)

    Step 2: perPersonCents = Math.floor(totalCents / beneficiaryCount)

    Step 3: remainderCents = totalCents - perPersonCents * beneficiaryCount

    Step 4: Find payerIdx = index of the payer in the beneficiaries array
            (or -1 if payer is NOT a beneficiary)

    Step 5: For each beneficiary at index i, determine extra cents:
        extra = 0
        if remainderCents > 0:
            if payerIdx >= 0:
                if i === payerIdx:
                    extra = 1
                else:
                    pos = (i < payerIdx) ? i : i - 1
                    if pos < (remainderCents - 1):
                        extra = 1
            else:
                if i < remainderCents:
                    extra = 1

    Step 6: Each beneficiary's share = (perPersonCents + extra) / 100

    Return: shares
```

### Numerical Precision Strategy

- All internal arithmetic uses integer cents (`Math.round(value * 100)`) to avoid floating-point errors.
- Division uses `Math.floor` for the base per-person amount to ensure no overallocation.
- Results are converted back to decimal only at the final step (`/ 100`).
- Net balances are rounded: `Math.round((paid - owed) * 100) / 100`.

---

## 12. Settlement Algorithm — Detailed Logic

### Unified Balance Computation

```
Input:
    - Per-currency balances (from the calculation engine)
    - Settlement currency code
    - Exchange rates map { currencyCode: rate }

Algorithm:
1. Initialize unifiedBalances = { [participantId]: 0 } for all participants

2. For each currency that has balance data:
    - If currency === settlementCurrency:
        conversionRate = 1
    - Else:
        conversionRate = 1 / exchangeRates[currency]

    - For each participant who has balance data in this currency:
        unifiedBalances[participant] += balances[currency][participant].net * conversionRate

3. Round each unified balance to 2 decimal places:
    unifiedBalances[participant] = Math.round(unifiedBalances[participant] * 100) / 100
```

### Minimum Transactions Algorithm

```
Input: Array of { id, name, balance } for each participant
Output: Array of { from, fromName, to, toName, amount } transactions

Algorithm:

Step 1: Separate into creditors and debtors

    Creditors: participants where balance > 0.005
    Debtors: participants where balance < -0.005

Step 2: First pass — Exact matches (optimization)

    For each debtor (iterating from LAST to FIRST):
        For each creditor (iterating from LAST to FIRST):
            If |debtor.amount - creditor.amount| < 0.005:
                Create transaction: debtor → creditor for debtor.amount
                Remove BOTH from their arrays
                Break inner loop

Step 3: Second pass — Greedy largest-first matching

    Sort creditors DESCENDING by amount
    Sort debtors DESCENDING by amount

    While both arrays are non-empty:
        c = creditors[0], d = debtors[0]
        transfer = Math.round(Math.min(c.amount, d.amount) * 100) / 100

        Create transaction: d → c for transfer amount

        c.amount = Math.round((c.amount - transfer) * 100) / 100
        d.amount = Math.round((d.amount - transfer) * 100) / 100

        If c.amount < 0.005: remove creditor
        If d.amount < 0.005: remove debtor

Return: all collected transactions from both passes
```

### Exchange Rate Semantics — Summary

| What the user enters | What it means | Conversion formula |
|---------------------|---------------|-------------------|
| `1 USD = 0.92 EUR` | 1 unit of settlement = 0.92 units of foreign | `foreign_amount / rate = settlement_amount` |
| `1 USD = 7.25 CNY` | 1 unit of settlement = 7.25 units of foreign | `7.25 CNY / 7.25 = 1 USD` |

---

## 13. Validation Rules

### Participant Validation

| Rule | Behavior |
|------|----------|
| Name is empty/whitespace | Reject with error: "Name is required." |
| Duplicate name (case-insensitive) | Reject with error: "A participant with this name already exists." |
| Delete while used in any expense | Block deletion (cannot proceed) |

### Currency Validation

| Rule | Behavior |
|------|----------|
| Code or symbol is empty | Reject with error: "Both code and symbol are required." |
| Duplicate code (excluding self during edit) | Reject with error: "A currency with this code already exists." |
| Delete while used in any expense | Block deletion (cannot proceed) |

### Expense Validation

| Rule | Behavior |
|------|----------|
| Any required field empty | Reject: "All fields are required." |
| Amount is zero, negative, or NaN | Reject: "Amount must be a positive number." |
| No beneficiary selected | Reject: "Select at least one beneficiary." |
| Custom amounts: any negative | Reject: "Custom amounts cannot be negative." |
| Custom amounts: sum differs from total by ≥ 0.01 | Reject with sum info |
| Percentages: any negative | Reject: "Percentages cannot be negative." |
| Percentages: sum differs from 100 by ≥ 0.01 | Reject with sum info |

### Trip Validation

| Rule | Behavior |
|------|----------|
| Trip name is empty/whitespace | Reject: "Trip name is required" |

### Settlement Validation

| Rule | Behavior |
|------|----------|
| No settlement currency selected | Reject: "Please select a settlement currency." |
| Missing or invalid (≤0) exchange rate | Reject with currency code info |

---

## 14. Data Integrity & Normalization

### When Normalization Occurs

Data normalization runs on:
1. Initial load from storage
2. Import of external JSON data (per-trip or full backup)

### AppState Normalization

1. `trips` must be an array (default: `[]`)
2. `activeTripId` must be a string referencing a valid trip ID, or `null`
3. Each trip must have a valid `id` (string) and `name` (string) and `data` (object)
4. Each trip's `archived` field defaults to `false` if not a boolean
5. Each trip's `createdAt` and `updatedAt` default to current ISO timestamp if not strings
6. Each trip's `data` is normalized using the AppData normalization rules below

### AppData Normalization Rules (per trip)

1. **Structure validation:**
   - `participants` must be an array (default: `[]`)
   - `currencies` must be an array (default: `[]`)
   - `expenses` must be an array (default: `[]`)
   - `exchangeRates` must be a non-array object (default: `{}`)
   - `settlementCurrency` must be a string (default: `""`)

2. **Participant filtering:** Keep only entries where `id` is a string AND `name` is a string

3. **Currency filtering:** Keep only entries where `code` is a string AND `symbol` is a string

4. **Expense validation (multi-step):**
   - First filter: Keep only expenses with valid `id` and `beneficiaries` array
   - Beneficiary filtering: Keep only beneficiaries with valid `participantId` that exists in validated participants
   - SplitType normalization: Default invalid splitType to `"equal"`
   - Second filter: Keep only expenses where `paidBy` exists, `currencyCode` exists, and at least one beneficiary remains

5. **Exchange rate cleaning:** Only keep rates for existing currencies with positive number values

6. **Settlement currency cleaning:** Clear to `""` if not a valid currency code

---

## 15. Calendar System (Gregorian & Jalali)

### Gregorian

Standard western calendar. Dates stored as `YYYY-MM-DD`.

### Jalali (Persian / Solar Hijri)

Used in Iran and Afghanistan. The conversion is pure mathematical (no library dependencies).

### Where Calendar Affects Behavior

1. **Expense list display:** Dates are shown converted to Jalali when calendar is set to "jalali".
2. **Default date in expense form:** Pre-filled with today's date in the selected calendar format.
3. **Export filename:** Includes current date in the active calendar format.
4. **Date display guard:** Only converts dates where year ≥ 1900.

### Critical Storage Rule

**Dates are ALWAYS stored in Gregorian format internally** (YYYY-MM-DD). The Jalali conversion is purely for display.

---

## 16. Routing

### Hash-Based URL Routing

The application uses hash-based routing for browser navigation:

| URL Hash | State |
|----------|-------|
| `#/` or empty | Trip list (home screen) |
| `#/trip/{tripId}` | Inside a trip (default tab) |
| `#/trip/{tripId}/{tabId}` | Inside a trip at a specific tab |

### Behavior

- On app load, the hash is parsed and the corresponding trip/tab is activated.
- When the user navigates (enters a trip, switches tabs, exits to trip list), the hash is updated via `pushState`.
- Browser back/forward buttons work correctly by listening to the `hashchange` event.
- If a hash references a non-existent trip ID, the user is redirected to the trip list.
- Valid tab IDs: `participants`, `currencies`, `expenses`, `balances`, `settlement`, `settings`.

---

## 17. Edge Cases & Important Behaviors

1. **Payer not in beneficiaries:** A person can pay for an expense without benefiting from it.

2. **Single beneficiary equal split:** When there's only 1 beneficiary, they owe the full amount.

3. **All participants settled:** If all unified balances are within ±0.005, the settlement shows "Everyone is settled — no transactions needed!"

4. **Currency used only for settlement:** A currency can exist without any expenses in that currency.

5. **Exchange rates persist:** Previously entered exchange rates are preserved across changes.

6. **Expense sort is display-only:** Expenses are displayed sorted by date descending.

7. **Per-trip data isolation:** Each trip has completely independent data. Participants, currencies, and expenses do not cross trip boundaries.

8. **Amount rounding on save:** `Math.round(amount * 100) / 100`.

9. **Deletion protection:** Participants/currencies cannot be deleted if referenced by expenses.

10. **Reactivity model:** Any data mutation immediately persists to storage and triggers re-render.

11. **Only one currency — no exchange rates needed.**

12. **Settlement results invalidated on data change.**

13. **Archived trips cannot be entered:** Clicking an archived trip card does nothing. Users must unarchive first.

14. **Duplicate trip creates independent copy:** Deep-cloned data, new ID, no shared references.

15. **Search is local only:** Search on the trip list filters across trip names, descriptions, participant names, and expense descriptions. It does not search within amounts or dates.

---

*End of Documentation*

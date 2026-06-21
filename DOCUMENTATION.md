# Trip Expense Tracker — Business Logic & Functional Specification

> **Purpose of this document:** This is the definitive specification for what the Trip Expense Tracker application does, how it calculates, and how it behaves. It is intended for rebuilding the application in Version 2 with complete functional accuracy. Only pure business rules, calculations, data handling, and functional behavior are described here. Design, theming, and implementation structure are intentionally excluded.

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Data Model](#2-data-model)
3. [Participants Management](#3-participants-management)
4. [Currencies Management](#4-currencies-management)
5. [Expenses Management](#5-expenses-management)
6. [Live Balances (Calculation Engine)](#6-live-balances-calculation-engine)
7. [Settlement](#7-settlement)
8. [Import / Export](#8-import--export)
9. [Settings](#9-settings)
10. [Calculation Engine — Detailed Formulas](#10-calculation-engine--detailed-formulas)
11. [Settlement Algorithm — Detailed Logic](#11-settlement-algorithm--detailed-logic)
12. [Validation Rules](#12-validation-rules)
13. [Data Integrity & Normalization](#13-data-integrity--normalization)
14. [Calendar System (Gregorian & Jalali)](#14-calendar-system-gregorian--jalali)
15. [Edge Cases & Important Behaviors](#15-edge-cases--important-behaviors)

---

## 1. Application Overview

The **Trip Expense Tracker** is an application for group travel expense accounting and settlement. It solves the problem of tracking shared expenses among a group of travelers who may pay in multiple currencies, and then calculates the minimum number of transactions needed to settle all debts.

### Core Use Case

A group of people goes on a trip together. During the trip, different people pay for shared expenses (meals, transport, accommodation, etc.) in potentially different currencies. At the end of the trip, the application calculates who owes whom and produces a minimal set of payment transactions to settle all debts in a single chosen settlement currency.

### Key Capabilities

- Manage a list of trip participants
- Define and manage multiple currencies (with predefined quick-add options)
- Record expenses with flexible splitting options (equal, custom amounts, percentage-based)
- View live per-currency balance breakdowns for all participants
- Convert all balances into a single settlement currency using user-provided exchange rates
- Calculate the minimum number of transactions needed to settle all debts
- Support for Gregorian and Jalali (Persian/Solar Hijri) calendar systems
- Full data export (JSON) and import capability
- All data persisted in browser localStorage

### Application Sections

The application has 6 main sections (tabs):
1. **Participants** — Manage the list of people
2. **Currencies** — Define which currencies are used
3. **Expenses** — Record and manage shared expenses
4. **Balances** — View live per-currency balance breakdown
5. **Settlement** — Convert to one currency and calculate final payments
6. **Settings** — Calendar preference, import/export, clear data

---

## 2. Data Model

### Primary Data Object

All application data is stored as a single object with this structure:

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
            date: "2026-01-15",          // ISO date string (YYYY-MM-DD), always stored in Gregorian
            description: "Lunch",
            currencyCode: "USD",
            amount: 100.00,              // Total amount of the expense (positive number)
            paidBy: "participant-id",    // ID of the participant who paid
            splitType: "equal",          // One of: "equal", "custom", "percentage"
            beneficiaries: [
                {
                    participantId: "participant-id",
                    customAmount: null,       // Used when splitType === "custom"
                    customPercentage: null    // Used when splitType === "percentage"
                }
            ]
        }
    ],
    exchangeRates: {
        "EUR": 0.92,   // How many units of this currency equal 1 unit of settlement currency
        "JPY": 149.5
    },
    settlementCurrency: "USD"  // The chosen settlement currency code (or empty string)
}
```

### Settings (stored separately)

```javascript
{
    calendar: "gregorian",  // or "jalali"
    theme: "light"          // or "dark"
}
```

### ID Generation

IDs are UUIDs. Generation uses `crypto.randomUUID()` when available, otherwise a fallback composite of `Date.now().toString(36)` + `Math.random().toString(36).substr(2, 9)`.

### Amount Formatting

All monetary amounts are displayed with exactly 2 decimal places and locale-appropriate thousand separators:
```javascript
num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
```

---

## 3. Participants Management

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

## 4. Currencies Management

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

## 5. Expenses Management

### Data Structure

```javascript
{
    id: "unique-uuid",
    date: "2026-01-15",             // Gregorian ISO date (YYYY-MM-DD)
    description: "Lunch at restaurant",
    currencyCode: "USD",            // References a currency code
    amount: 150.00,                 // Total expense amount, positive, rounded to 2 decimals
    paidBy: "participant-id",       // The person who physically paid
    splitType: "equal",             // "equal" | "custom" | "percentage"
    beneficiaries: [                // The people who benefited from this expense
        {
            participantId: "participant-id",
            customAmount: null,       // Number or null. Used only when splitType === "custom"
            customPercentage: null    // Number or null. Used only when splitType === "percentage"
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

## 6. Live Balances (Calculation Engine)

### What It Shows

A breakdown **per currency** showing each participant's:
- **Total Paid** — Sum of all expense amounts where this participant is the payer, in this currency
- **Total Owed** — Sum of this participant's computed share across all expenses in this currency
- **Net Balance** — `Total Paid - Total Owed`
- **Status** — "Creditor" (net > 0.005), "Debtor" (net < -0.005), or "Settled" (within ±0.005)

### Calculation Logic (Per Currency)

For each expense in a given currency:

1. The **payer's** `paid` accumulator is increased by the full `expense.amount`.
2. Each **beneficiary's** `owed` accumulator is increased by their computed share (see Section 10 for detailed share computation).
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

## 7. Settlement

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

**Example:**
- Settlement currency: USD
- Rate for EUR: 0.92 (meaning 1 USD = 0.92 EUR)
- A person has a net balance of +10 EUR
- Converted: 10 / 0.92 = 10.87 USD

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

## 8. Import / Export

### Export

- Generates a JSON file download containing the complete data object (participants, currencies, expenses, exchangeRates, settlementCurrency).
- Filename format: `trip-expenses-YYYY-MM-DD.json` (using current date in current calendar format).
- JSON is formatted with 2-space indentation.

### Import Template

A pre-formatted JSON template showing the exact expected structure:
- 2 example participants with IDs and names
- 1 currency (USD)
- 1 expense demonstrating equal split with all fields
- Empty exchangeRates and settlementCurrency

Template content:
```javascript
{
    participants: [
        { id: "participant-id-1", name: "Person A" },
        { id: "participant-id-2", name: "Person B" }
    ],
    currencies: [
        { code: "USD", symbol: "$" }
    ],
    expenses: [{
        id: "expense-id-1",
        date: "2026-01-15",
        description: "Example expense",
        currencyCode: "USD",
        amount: 100.00,
        paidBy: "participant-id-1",
        splitType: "equal",
        beneficiaries: [
            { participantId: "participant-id-1", customAmount: null },
            { participantId: "participant-id-2", customAmount: null }
        ]
    }],
    exchangeRates: {},
    settlementCurrency: ""
}
```

### Import

- User pastes JSON and triggers import.
- **Requires confirmation** because import is destructive (replaces ALL current data).
- Validation:
  - Must be valid JSON object
  - Must have `participants` array
  - Must have `currencies` array
  - Must have `expenses` array
- Data is normalized after parsing (see Section 13).
- On success: all data is replaced and the UI fully re-renders.
- On error: error message displayed with the specific error.

---

## 9. Settings

### Calendar

- **Options:** Gregorian (default), Jalali (Persian/Solar Hijri)
- **Effect:** When set to Jalali, dates in the expense list are displayed converted from Gregorian to Jalali format.
- **Important:** Dates are ALWAYS stored internally in Gregorian format (YYYY-MM-DD). The Jalali option only affects display and the default date in the expense form.
- Changing the calendar setting triggers a re-render of all date displays.

### Theme

- **Options:** Light (default), Dark
- V2 will have a new design — the theme system should support light and dark modes but with new colors/design.

### Clear All Data

- Requires user confirmation with warning: "Are you sure you want to delete ALL data? This action cannot be undone."
- On confirm: resets all data to empty defaults (empty arrays, empty objects, empty strings) and reloads.

---

## 10. Calculation Engine — Detailed Formulas

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
        (Note: customPercentage is a number like 33.33, meaning 33.33%)

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
                // Payer is a beneficiary
                if i === payerIdx:
                    extra = 1    // Payer gets the first extra cent
                else:
                    // Calculate position excluding payer
                    pos = (i < payerIdx) ? i : i - 1
                    if pos < (remainderCents - 1):
                        extra = 1
            else:
                // Payer is NOT a beneficiary
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

## 11. Settlement Algorithm — Detailed Logic

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

This algorithm takes the unified balance list and produces the minimum number of payment transactions to settle all debts.

```
Input: Array of { id, name, balance } for each participant
Output: Array of { from, fromName, to, toName, amount } transactions

Algorithm:

═══════════════════════════════════════════════════════
Step 1: Separate into creditors and debtors
═══════════════════════════════════════════════════════

    Creditors: participants where balance > 0.005
        → stored as { id, name, amount: Math.round(balance * 100) / 100 }

    Debtors: participants where balance < -0.005
        → stored as { id, name, amount: Math.round(-balance * 100) / 100 }
        (amount is stored as a POSITIVE number representing what they owe)

═══════════════════════════════════════════════════════
Step 2: First pass — Exact matches (optimization)
═══════════════════════════════════════════════════════

    For each debtor (iterating from LAST to FIRST):
        For each creditor (iterating from LAST to FIRST):
            If |debtor.amount - creditor.amount| < 0.005:
                Create transaction: debtor → creditor for debtor.amount
                Remove BOTH the debtor and creditor from their arrays
                Break inner loop (move to next debtor)

═══════════════════════════════════════════════════════
Step 3: Second pass — Greedy largest-first matching
═══════════════════════════════════════════════════════

    Sort creditors DESCENDING by amount
    Sort debtors DESCENDING by amount

    While both creditors array AND debtors array are non-empty:
        c = creditors[0] (largest remaining creditor)
        d = debtors[0] (largest remaining debtor)
        transfer = Math.round(Math.min(c.amount, d.amount) * 100) / 100

        Create transaction: d → c for transfer amount

        c.amount = Math.round((c.amount - transfer) * 100) / 100
        d.amount = Math.round((d.amount - transfer) * 100) / 100

        If c.amount < 0.005: remove creditor from array (fully paid)
        If d.amount < 0.005: remove debtor from array (fully settled)

═══════════════════════════════════════════════════════

Return: all collected transactions from both passes
```

### Why Two Passes?

The "exact match" first pass is an optimization. When a debtor owes exactly the same amount that a creditor is owed, matching them in one transaction is optimal. Without this pass, the greedy algorithm might split these into multiple transactions via intermediate parties. This reduces the total transaction count.

### Exchange Rate Semantics — Summary

| What the user enters | What it means | Conversion formula |
|---------------------|---------------|-------------------|
| `1 USD = 0.92 EUR` | 1 unit of settlement = 0.92 units of foreign | `foreign_amount / rate = settlement_amount` |
| `1 USD = 7.25 CNY` | 1 unit of settlement = 7.25 units of foreign | `7.25 CNY / 7.25 = 1 USD` |

Stored rate for a currency X = how many units of X you get for 1 unit of settlement currency.

---

## 12. Validation Rules

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
| Remove via quick-add while used in expenses | Show message: "Currency X is used in expenses and cannot be removed." |

### Expense Validation

| Rule | Behavior |
|------|----------|
| Any required field empty (date, description, currency, amount, paidBy) | Reject: "All fields are required." |
| Amount is zero, negative, or NaN | Reject: "Amount must be a positive number." |
| No beneficiary selected | Reject: "Select at least one beneficiary." |
| Custom amounts: any value is negative | Reject: "Custom amounts cannot be negative." |
| Custom amounts: sum differs from total by ≥ 0.01 | Reject: "Custom amounts must sum to [total]. Current sum: [sum]." |
| Percentages: any value is negative | Reject: "Percentages cannot be negative." |
| Percentages: sum differs from 100 by ≥ 0.01 | Reject: "Percentages must sum to 100%. Current sum: [sum]%." |

### Settlement Validation

| Rule | Behavior |
|------|----------|
| No settlement currency selected | Reject: "Please select a settlement currency." |
| Missing or invalid (≤0) exchange rate for any non-settlement currency | Reject: "Please enter a valid exchange rate for [CODE]." |

---

## 13. Data Integrity & Normalization

### When Normalization Occurs

Data normalization runs on:
1. Initial load from storage
2. Import of external JSON data

### Normalization Rules (executed in this exact order)

1. **Structure validation:**
   - `participants` must be an array (default: `[]`)
   - `currencies` must be an array (default: `[]`)
   - `expenses` must be an array (default: `[]`)
   - `exchangeRates` must be a non-array object (default: `{}`)
   - `settlementCurrency` must be a string (default: `""`)

2. **Participant filtering:**
   - Keep only entries where `id` is a string AND `name` is a string

3. **Currency filtering:**
   - Keep only entries where `code` is a string AND `symbol` is a string

4. **Expense validation (multi-step):**
   - **First filter:** Keep only expenses where `id` is a string AND `beneficiaries` is an array
   - **Beneficiary filtering:** For each expense, filter beneficiaries to only those where:
     - `participantId` is a string AND
     - `participantId` exists in the current (validated) participant ID list
   - **SplitType normalization:** If `splitType` is not one of `"equal"`, `"custom"`, `"percentage"` → default to `"equal"`
   - **Second filter:** Keep only expenses where ALL of these are true:
     - `paidBy` exists in participant IDs
     - `currencyCode` exists in currency codes
     - `beneficiaries.length > 0` (at least one valid beneficiary remains)

5. **Exchange rate cleaning:**
   - Only keep entries where the currency code exists in the currencies list
   - Only keep entries where the rate is a positive number (`typeof rate === 'number' && rate > 0`)

6. **Settlement currency cleaning:**
   - If `settlementCurrency` doesn't match any known currency code, clear it to `""`

### Referential Integrity Guarantees

After normalization:
- No expense references a non-existent participant (as payer or beneficiary)
- No expense references a non-existent currency
- No exchange rate exists for a non-existent currency
- Settlement currency always references a valid currency or is empty
- Every expense has at least one valid beneficiary

---

## 14. Calendar System (Gregorian & Jalali)

### Gregorian

Standard western calendar. Dates stored as `YYYY-MM-DD`.

### Jalali (Persian / Solar Hijri)

Used in Iran and Afghanistan. The conversion is pure mathematical (no library dependencies).

### Conversion Algorithm (Gregorian → Jalali)

```
Input: gy (Gregorian year), gm (Gregorian month 1-12), gd (Gregorian day)
Output: [jy (Jalali year), jm (Jalali month 1-12), jd (Jalali day)]

Algorithm:
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = (gm > 2) ? (gy + 1) : gy
    days = 355666 + (365 * gy) + floor((gy2 + 3) / 4) - floor((gy2 + 99) / 100)
           + floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1]
    jy = -1595 + (33 * floor(days / 12053))
    days = days % 12053
    jy += 4 * floor(days / 1461)
    days = days % 1461
    if (days > 365):
        jy += floor((days - 1) / 365)
        days = (days - 1) % 365
    jm = (days < 186) ? 1 + floor(days / 31) : 7 + floor((days - 186) / 30)
    jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30))
    return [jy, jm, jd]
```

### Where Calendar Affects Behavior

1. **Expense list display:** Dates are shown converted to Jalali when calendar is set to "jalali".
2. **Default date in expense form:** Pre-filled with today's date in the selected calendar format.
3. **Export filename:** Includes current date in the active calendar format.
4. **Date display guard:** Only converts dates where year ≥ 1900 (to prevent double-conversion of already-Jalali dates).

### Critical Storage Rule

**Dates are ALWAYS stored in Gregorian format internally** (YYYY-MM-DD). The Jalali conversion is purely for display.

---

## 15. Edge Cases & Important Behaviors

1. **Payer not in beneficiaries:** A person can pay for an expense without benefiting from it. Their `paid` increases but their `owed` does not. This results in a positive net balance (creditor) for the payer.

2. **Single beneficiary equal split:** When there's only 1 beneficiary, they owe the full amount. The remainder logic produces 0 remainder cents.

3. **All participants settled:** If all unified balances are within ±0.005, the settlement shows "Everyone is settled — no transactions needed!"

4. **Currency used only for settlement:** A currency can exist in the system without any expenses in that currency. It can still be selected as the settlement currency.

5. **Exchange rates persist:** When the user changes the settlement currency or modifies currencies, previously entered exchange rates for currencies that still exist are preserved.

6. **Expense sort is display-only:** Expenses are displayed sorted by date descending, but the underlying storage order is unspecified.

7. **Data import replaces everything:** Import is destructive — it completely replaces all data including exchange rates and settlement currency. There is no merge mode.

8. **Amount rounding on save:** When an expense is saved, the amount is explicitly rounded: `Math.round(amount * 100) / 100`. This prevents issues from floating-point input.

9. **Deletion protection is enforced at data level:** A participant or currency cannot be deleted if `isParticipantUsed(id)` or `isCurrencyUsed(code)` returns true. These checks examine all expenses for references.

10. **Reactivity model:** Any data mutation immediately persists to storage and triggers a re-render of all dependent UI sections. There should never be stale displayed data.

11. **Only one currency — no exchange rates needed:** If only one currency exists in the system, the settlement step skips exchange rate entry entirely.

12. **Settlement results invalidated on data change:** Any change to expenses, participants, or currencies hides the previously calculated settlement results. The user must click "Calculate" again.

---

*End of Documentation*

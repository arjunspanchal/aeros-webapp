# Auth scope verification — Phase 1.3 Block B

Manual SQL verification for `lib/auth/scope.js`. The project has no test
framework, so each behaviour ships as a paste-ready Supabase SQL query plus the
expected result. Run these against the live Supabase project (SQL Editor or
`psql`).

Arjun's user id is `5a1de20d-53ac-4a9d-a936-ac15af164f40` (referenced below as
`:arjun`). Substitute as needed for the other fixtures.

## Prep — pick fixtures once

```sql
-- 1. An AM with a non-empty portfolio (Arjun, by spec — confirms the seed).
SELECT id, name, factoryos_role
FROM users
WHERE id = '5a1de20d-53ac-4a9d-a936-ac15af164f40';

-- 2. An AM with no portfolio. Pick any one of the 3 returned rows for the
--    "empty portfolio" fixture below; substitute its id for `:empty_am`.
SELECT id, name
FROM users
WHERE factoryos_role = 'account_manager'
  AND id NOT IN (
    SELECT account_manager_id FROM clients
    WHERE account_manager_id IS NOT NULL
  );

-- 3. A user with rows in user_clients (used by tests 1 + 7). Pick any id;
--    substitute its id for `:linked_user`.
SELECT user_id, COUNT(*) AS link_count
FROM user_clients
GROUP BY user_id
ORDER BY link_count DESC
LIMIT 5;

-- 4. A user with NO rows in user_clients (test 2). Pick any id; substitute
--    its id for `:unlinked_user`.
SELECT u.id, u.email
FROM users u
LEFT JOIN user_clients uc ON uc.user_id = u.id
WHERE uc.user_id IS NULL
LIMIT 5;

-- 5. One user per role for tests 5 + 7. Substitute ids for `:admin`,
--    `:fmgr`, `:fexec`, `:client_user`, `:customer_user`.
SELECT factoryos_role, id, email
FROM users
WHERE factoryos_role IN ('admin','factory_manager','factory_executive','client','customer')
ORDER BY factoryos_role, email;
```

## Test 1 — `getClientIdsForUser` returns linked client_ids

```sql
SELECT client_id
FROM user_clients
WHERE user_id = ':linked_user';
```

**Expected**: one row per link. The set of `client_id` values is what
`getClientIdsForUser(':linked_user')` must return (order-independent).

## Test 2 — `getClientIdsForUser` returns `[]` for an unlinked user

```sql
SELECT client_id
FROM user_clients
WHERE user_id = ':unlinked_user';
```

**Expected**: zero rows. `getClientIdsForUser(':unlinked_user')` returns `[]`.

## Test 3 — `getPortfolioClientIdsForAM` returns AM's portfolio (Arjun)

```sql
SELECT id, name
FROM clients
WHERE account_manager_id = '5a1de20d-53ac-4a9d-a936-ac15af164f40';
```

**Expected**: 3 rows — Akshay, Dipack, Lal Masand.
`getPortfolioClientIdsForAM('5a1de20d-…')` returns those 3 `id` values.

## Test 4 — `getPortfolioClientIdsForAM` returns `[]` for an empty-portfolio AM

```sql
SELECT id
FROM clients
WHERE account_manager_id = ':empty_am';
```

**Expected**: zero rows. `getPortfolioClientIdsForAM(':empty_am')` returns `[]`.

## Test 5 — `effectiveJobScope` → `{mode:'all'}` for admin / FM / FExec

```sql
SELECT id, factoryos_role
FROM users
WHERE id IN (':admin', ':fmgr', ':fexec');
```

**Expected**: three rows with the matching `factoryos_role`. For each user
object built from these rows, `effectiveJobScope({id, factoryos_role})` must
return `{ mode: 'all' }` exactly.

## Test 6 — `effectiveJobScope` → `{mode:'portfolio', clientIds:[3]}` for Arjun

```sql
SELECT
  (SELECT factoryos_role FROM users WHERE id = '5a1de20d-53ac-4a9d-a936-ac15af164f40') AS role,
  ARRAY(
    SELECT id FROM clients
    WHERE account_manager_id = '5a1de20d-53ac-4a9d-a936-ac15af164f40'
    ORDER BY id
  ) AS portfolio_ids;
```

**Expected**: `role = 'account_manager'`, `portfolio_ids` = 3 uuids.
`effectiveJobScope({id:'5a1de20d-…', factoryos_role:'account_manager'})` must
return `{ mode: 'portfolio', clientIds: [<same 3 ids>] }`.

## Test 7 — `effectiveJobScope` → `{mode:'own', clientIds}` for client + customer

```sql
-- For ':client_user' (factoryos_role='client'):
SELECT client_id FROM user_clients WHERE user_id = ':client_user';

-- For ':customer_user' (factoryos_role='customer'):
SELECT client_id FROM user_clients WHERE user_id = ':customer_user';
```

**Expected**: each query returns the user's linked client_ids (possibly
empty). `effectiveJobScope({id, factoryos_role:'client'})` and
`effectiveJobScope({id, factoryos_role:'customer'})` must each return
`{ mode: 'own', clientIds: [<same ids>] }`.

## Test 8 — `effectiveJobScope` → `{mode:'none'}` for null role / missing user

No SQL needed — pure input handling:

| Input                              | Expected                |
| ---------------------------------- | ----------------------- |
| `null`                             | `{ mode: 'none' }`      |
| `undefined`                        | `{ mode: 'none' }`      |
| `{}`                               | `{ mode: 'none' }`      |
| `{id:'…', factoryos_role:null}`    | `{ mode: 'none' }`      |
| `{id:'…', factoryos_role:undefined}` | `{ mode: 'none' }`    |
| `{id:'…', factoryos_role:''}`      | `{ mode: 'none' }`      |
| `{factoryos_role:'admin'}` (no id) | `{ mode: 'none' }`      |
| `{id:'…', factoryos_role:'unknown'}` | `{ mode: 'none' }`    |

## Test 9 — `effectivePOScope` mirrors `effectiveJobScope`

For every input from tests 5–8, `effectivePOScope(input)` must return the same
object shape and values as `effectiveJobScope(input)`. No separate SQL — same
expectations as the corresponding job-scope row.

## How to actually run these against the running module

Quick Node REPL after `npm install`, with `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` set in `.env.local`:

```js
// from aeros-catalog/
import("dotenv/config");
const { effectiveJobScope, effectivePOScope, getClientIdsForUser, getPortfolioClientIdsForAM } =
  await import("./lib/auth/scope.js");

console.log(await effectiveJobScope({ id: "5a1de20d-53ac-4a9d-a936-ac15af164f40", factoryos_role: "account_manager" }));
console.log(await getPortfolioClientIdsForAM("5a1de20d-53ac-4a9d-a936-ac15af164f40"));
console.log(await effectiveJobScope(null));
```

Compare the printed output to the SQL expectations above.

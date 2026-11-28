---
layout: post
title: "Idempotency Keys for POST Endpoints: A Retry Needs a Database"
date: 2026-11-28
excerpt_separator: <!--more-->
cover-img: assets/images/idempotency-keys-for-post-endpoints-a-retry-needs.svg
linkedin-img: assets/images/idempotency-keys-for-post-endpoints-a-retry-needs.png
tags: architecture postgresql nodejs webdevelopment
comments: true
---
{% raw %}
A client retried a POST because the first response never arrived, and my endpoint created the same order twice. I had wrapped the handler in what I thought was a guard, and it did nothing, because the retry landed on a second instance a few hundred milliseconds later.

<!--more-->

## Why a try/catch is not idempotency

A retry is not an error inside one call stack. It is a second HTTP request, possibly on a different process, possibly arriving while the first one is still committing. A `try/catch` sees nothing of that. An in-memory `Set` of seen keys sees nothing of it either, once there is more than one instance. A client-side retry wrapper makes it worse: it hides the duplicate from the caller while the server happily writes two rows.

The only thing shared by all instances, survives a restart, and can participate in the same transaction as the write is the database. So the key and the response belong there.

## The table that makes the key real

I keep one row per key. The **unique constraint is the concurrency control**, not the application code. Two concurrent requests with the same key race to insert; exactly one wins, the other blocks on the index until the first commits and then fails with a unique violation.

```sql
CREATE TABLE idempotency_keys (
  key           text        PRIMARY KEY,
  request_hash  text        NOT NULL,
  status_code   integer,
  response_body jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

`status_code` and `response_body` stay `NULL` while the work is in flight. That is the marker for "someone is doing this right now, and you cannot borrow their result yet".

## The handler flow

In Node.js with `pg`, the shape is: claim the key, do the work, store the response, all in one transaction. If the claim fails because the row already exists, read it back and decide.

```ts
import type { Pool, PoolClient } from 'pg';

export interface Item { id: string; name: string; }

export async function claimKey(
  client: PoolClient, key: string, requestHash: string
): Promise<boolean> {
  const res = await client.query(
    `INSERT INTO idempotency_keys (key, request_hash)
     VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
    [key, requestHash]
  );
  return res.rowCount === 1;
}
```

ON CONFLICT DO NOTHING` makes the race cheap: no exception to catch, just a boolean. The caller then branches on it.

```ts
import type { Pool } from 'pg';

export async function createItem(
  pool: Pool, key: string, requestHash: string, name: string
): Promise<{ status: number; body: unknown }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimed = await claimKey(client, key, requestHash);
    if (!claimed) {
      const prior = await client.query(
        'SELECT request_hash, status_code, response_body FROM idempotency_keys WHERE key = $1',
        [key]
      );
      await client.query('COMMIT');
      return prior.rows[0] as { status: number; body: unknown };
    }
    const inserted = await client.query(
      'INSERT INTO items (name) VALUES ($1) RETURNING id, name', [name]
    );
    const body = inserted.rows[0];
    await client.query(
      'UPDATE idempotency_keys SET status_code = $1, response_body = $2 WHERE key = $3',
      [201, body, key]
    );
    await client.query('COMMIT');
    return { status: 201, body };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
```

Three details matter more than the happy path.

**The response is written inside the transaction that writes the item.** If the item commits, the stored response commits with it. There is no window where the work exists but the key does not.

**A missing `status_code` on a replayed key means in flight.** Returning a fabricated response there is wrong; the right answer is a `409` telling the client to retry later, or blocking on the row until it resolves. I have done both, and the `409` is easier to reason about.

**The request hash must match.** If a client reuses a key with a different body, that is a bug on their side. Comparing a hash of the relevant fields and rejecting the mismatch beats silently substituting the old response for a request that was never executed.

### What a conflict looks like on the wire

```ts
export function conflict(requestHash: string, storedHash: string) {
  if (requestHash !== storedHash) {
    return { status: 422, body: { error: 'key reused with a different payload' } };
  }
  return { status: 409, body: { error: 'request in progress, retry shortly' } };
}
```

Small, boring, and it saves an afternoon of debugging duplicates in a table nobody expected to grow.

## The caveats I have learned to state up front

This does not make a side effect transactional. If the handler charges a card or publishes to a queue and then the transaction rolls back, the key is released and the side effect has happened anyway. Keep the transactional write as the last step, or move the side effect behind an outbox row that the same transaction commits.

Keys need a retention policy. I do not keep them forever: a row older than the maximum plausible retry window is dead weight, and a scheduled delete on `created_at` is enough.

Finally, the database is now on the hot path of every POST that needs a key. That is a real cost, and it is the price of correctness. A cache in front of it is fine for reads; it must never be the authority on whether a key was claimed.

## Conclusion

Idempotency is a **storage problem**, not a control-flow problem. If the record of "this request already happened, and here is what it returned" is not in the same transactional store as the write, concurrent retries and multiple instances will find the gap. Put the key in a table, let the unique index do the arbitration, and store the response beside the effect it describes. The rest is error handling you can read.

Happy coding!
{% endraw %}

---
layout: post
title: "Postgres Indexes Are Not Being Ignored, Your Query Is"
date: 2026-11-28
excerpt_separator: <!--more-->
cover-img: assets/images/postgres-index-not-used.svg
linkedin-img: assets/images/postgres-index-not-used.png
tags: postgresql architecture fundamentals
comments: true
---
{% raw %}
A query that used to come back in milliseconds starts taking seconds after a data reload, and the first thing I hear is that the index is broken or that the planner is ignoring it. Almost every time I have chased one of these, the index was used exactly as designed, by a different query than the one anybody meant to write.

<!--more-->

The temptation is to reach for `SET enable_seqscan = off` and declare victory. That hides the disagreement instead of resolving it. What I do instead is read `EXPLAIN ANALYZE` in a fixed order, and only then decide whether to reshape the query or the index.

## The composite index answers a prefix question

A composite index on `(customer_id, created_at)` is sorted by customer first, then by time. It can serve a predicate on `customer_id` alone, on `customer_id` and `created_at` together, but not on `created_at` alone. If the query filters only by date range, the index is not the right tool and the planner correctly skips it.

```sql
CREATE INDEX idx_item_customer_created
  ON item (customer_id, created_at);

-- Uses the index: the leading column is present.
SELECT id, customer_id, created_at
FROM item
WHERE customer_id = 42
  AND created_at >= '2024-01-01';

-- Skips it: nothing constrains customer_id.
SELECT id, customer_id, created_at
FROM item
WHERE created_at >= '2024-01-01';
```

The fix is not to force anything. Either add a second index starting with `created_at`, or rewrite the access pattern so it always carries the customer. Adding indexes has a cost on every write, so I only add one when I can see the read pattern that needs it.

## Selectivity and the cost estimate

The planner is a cost model, not a truth oracle. It uses statistics about how values are distributed. If a column is heavily skewed and the statistics are stale, the estimate of how many rows match can be wrong by orders of magnitude, and the chosen plan follows the wrong estimate.

When `EXPLAIN ANALYZE` shows an estimated row count that is wildly different from the actual row count at the same node, I stop looking at the index and start looking at the statistics. `ANALYZE item` is the first thing to try, and a higher statistics target on a skewed column is the second.

```sql
ALTER TABLE item ALTER COLUMN customer_id SET STATISTICS 500;
ANALYZE item;
```

I want to be clear about the trade-off: a higher statistics target means more work during `ANALYZE`, and more catalog storage. It is worth it on the columns that decide plan shape, and wasteful on the ones that do not.

## Functions and casts defeat a plain index

A b-tree index on `created_at` supports comparisons against a value of the same type. Wrap the column in a function, or compare it to a differently typed literal, and the index cannot be used for that expression without additional help.

```sql
-- The function on the column blocks the plain index.
SELECT id FROM item
WHERE date_trunc('day', created_at) = DATE '2024-05-01';

-- The same intent, expressed as a range on the bare column.
SELECT id FROM item
WHERE created_at >= TIMESTAMP '2024-05-01 00:00:00'
  AND created_at <  TIMESTAMP '2024-05-02 00:00:00';
```

The second form is not a trick; it is a more honest description of what I want. When I genuinely need the function, an expression index on `date_trunc('day', created_at)` is the matching shape.

### Reading the plan before changing anything

My order of operations on a slow query is short. Run `EXPLAIN (ANALYZE, BUFFERS)` and read it bottom-up. Find the node where the estimated rows and actual rows diverge most. Check whether the predicate on that node can be answered by the leading columns of an existing index. Only after those two checks do I consider a new index or a rewrite. Forcing `enable_seqscan` off tells me whether an index path exists, but not whether it is cheaper, so I treat it as a diagnostic and never as a fix.

## Why the planner sometimes prefers a scan

On a small table, or when the predicate matches a large fraction of the rows, a sequential scan really is cheaper than walking an index and then fetching rows from the heap. That is not a bug. If the query returns most of a table, the index path loses, and the right answer is often to return fewer rows or to reconsider what the query is for.

This is where I see the most damage done: someone disables a scan type at the session or database level, the plan changes on one machine, and six months later nobody can explain why plans differ between environments. The configuration outlives the query that motivated it.

## Conclusion

Postgres indexes are rarely ignored. They are chosen according to column order, statistics and cost, and when the plan surprises me it is usually because one of those three does not match what I assumed. Read `EXPLAIN ANALYZE` with `BUFFERS`, compare estimated and actual rows, and fix the shape of the query or the index. Forcing the planner's hand moves the problem somewhere quieter.

Happy coding!
{% endraw %}

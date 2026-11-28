---
layout: post
title: "Why Postgres Ignores Your Index and How to Read the Plan"
date: 2026-11-28
excerpt_separator: <!--more-->
cover-img: assets/images/postgres-index-planner-pitfalls.svg
linkedin-img: assets/images/postgres-index-planner-pitfalls.png
tags: postgresql architecture fundamentals
comments: true
---
{% raw %}
Twice in the same week I opened a ticket that read, roughly, "the index exists and the query still does a sequential scan". Both times the index was fine and the query was fine; the *shape* of one didn't match the shape of the other, and nobody had read the plan.

<!--more-->

## The planner is not being stubborn

PostgreSQL devises a plan for every query it receives, and it picks the plan with the lowest estimated cost. A sequential scan is often genuinely the cheapest option: if the predicate matches a large fraction of the table, walking the heap once beats chasing a million index entries back to random pages. So when I see `Seq Scan` on a table that has a matching index, my first assumption is no longer "the planner is broken". It is that the planner has decided the index does not narrow the row set enough to pay for itself.

That decision rests on statistics from `ANALYZE`. If the statistics are stale, the estimated row count is wrong, and the cost model is fed garbage. Before touching anything else, I check whether the estimate is anywhere near reality.

## Read EXPLAIN ANALYZE, not EXPLAIN

`EXPLAIN` shows the plan and the estimates. `EXPLAIN ANALYZE` actually runs the query and adds the real timings and row counts. The interesting part is the gap between the two.

```sql
EXPLAIN ANALYZE
SELECT id, customer_id, total_cents
FROM orders
WHERE customer_id = 42
  AND status = 'open';
```

The output is a tree of plan nodes, one line per node, each showing `cost=startup..total rows=N width=W`. The `rows=` figure is an *estimate*. With `ANALYZE` you also get `actual time=... rows=N loops=L` per node. When estimated rows are 10 and actual rows are 50000, the planner is working from a picture of the data that no longer exists, and every choice above that scan inherits the error.

That mismatch is my signal. It tells me the problem is statistics or predicate selectivity, not the index definition.

## Shape mismatches: the index doesn't fit the predicate

An index is only usable when the query's predicate is expressible in terms of what the index stores. A few mismatches I've hit and had to reason through:

**Column order in a composite index.** For a B-tree on `(customer_id, status)`, a predicate on `customer_id` alone can use it; a predicate on `status` alone generally cannot, because `status` is not the leading column. If the query filters on `status` first and `customer_id` second, I either reorder the index or add a second one.

**Expressions versus plain columns.** If the query says `WHERE lower(email) = $1`, an index on `email` does not help. The documentation is explicit that an index on `upper(col)` enables `WHERE upper(col) = 'JIM'` — the expression in the index must match the expression in the predicate.

**Partial indexes must be implied.** A partial index created with `WHERE status = 'open'` is only eligible when the planner can prove the query's predicate implies that condition. If the query says `status IN ('open', 'pending')`, the implication does not hold and the partial index is out.

**Type and operator mismatches.** If the literal is a different type than the column, an implicit cast can land you in a comparison the index's operator class does not support. It looks like the same query; it isn't.

### A worked example

Suppose I want the open orders for one customer, and most rows in the table are closed.

```sql
CREATE INDEX orders_customer_open_idx
  ON orders (customer_id)
  WHERE status = 'open';
```

The query must then be written in a form the planner can prove implies `status = 'open'`.

```sql
EXPLAIN ANALYZE
SELECT id, total_cents
FROM orders
WHERE customer_id = 42
  AND status = 'open';
```

If I instead pass the status as a parameter and the plan cache produces a generic plan where the implication is not obvious, I get a sequential scan and a plan that looks like the index was never there. The fix is to reshape the index or the query, not to reach for a hint.

## Covering and the cost of reading the heap

Sometimes the index *is* used but a heap fetch dominates the runtime. An index-only scan avoids visiting the table when every column the query needs is present in the index. `INCLUDE` lets me add payload columns to a B-tree without making them part of the search key.

```sql
CREATE INDEX orders_customer_open_covering_idx
  ON orders (customer_id)
  INCLUDE (total_cents)
  WHERE status = 'open';
```

Whether the planner can skip the heap depends on the visibility map: rows must be known all-visible, which is `VACUUM`'s job. Without that, it falls back to checking the table anyway, and the win evaporates. I've spent longer than I'd like to admit on "why isn't my covering index covering" before remembering to look at vacuum state.

## What I do instead of forcing it

When the plan is wrong, the useful levers are: refresh statistics, reshape the index to match the predicate, rewrite the query into an equivalent form the planner can reason about, or accept the sequential scan because it really is faster. Settings that push the planner toward indexes are a last resort and usually mask a modelling problem. If I find myself wanting a hint, it is a sign I have not understood the plan yet.

## Conclusion

"The planner won't use my index" is almost always a mismatch between the index's shape and the query's predicate, selectivity or types. The way out is to read `EXPLAIN ANALYZE`, compare estimated and actual rows, and fix the shape of the index or the query. The planner is doing arithmetic; my job is to make sure it's doing it on the right numbers.

Happy coding!
{% endraw %}

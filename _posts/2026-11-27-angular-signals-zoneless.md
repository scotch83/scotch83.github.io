---
layout: post
title: "Angular Signals and Zoneless Change Detection: What Changes in Your Code"
date: 2026-11-27
excerpt_separator: <!--more-->
cover-img: assets/images/angular-signals-zoneless.svg
linkedin-img: assets/images/angular-signals-zoneless.png
tags: angular architecture frontend
comments: true
---
{% raw %}
I once spent an afternoon hunting a stale list view: a component updated its data, logged the new state, and still rendered the old values until an unrelated click happened to trigger a change-detection pass. In a zoneless application, that kind of bug stops being a vague suspicion and becomes a direct consequence of how state reaches the template. The migration to signals and zoneless change detection is mostly a mental-model shift: the API is small, the discipline is not, and most of the pain sits in the code you never thought of as stateful.

<!--more-->

## Why dropping ZoneJS changes what you have to prove

ZoneJS does not know whether your state actually changed. It patches browser APIs and async scheduling, then triggers synchronization whenever it thinks something might have happened, so change detection runs more often than necessary. Zoneless removes the guesswork: Angular relies on notifications from core APIs and on the tracking that signals provide, and it renders when it has a reason to render. That is better for performance and debugging, but it means the framework no longer props up mutations it cannot see.

My rule of thumb: if a value is read by a template and it can change, it must live in a signal, a computed, or an observable Angular is subscribed to. Anything else is a bet against the renderer.

The practical move is to make signals the source of truth in the service and keep templates reading them directly.

```typescript
import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ItemsState {
  private readonly _items = signal<string[]>([]);
  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().length);

  add(item: string): void {
    this._items.update((current) => [...current, item]);
  }
}
```

The `asReadonly()` matters more than it looks. Exposing the writable signal invites callers to `set()` from anywhere, which recreates the exact hidden-mutation problem zoneless is supposed to surface.

## The template is no longer a passive reader

In zone-based Angular, you could get away with a surprising amount of mutation because the framework kept re-checking. In zoneless, a template expression that calls a method still runs when change detection is triggered by something else, but a value that changes outside a tracked signal will not by itself schedule a render.

This is where `OnPush`-style reasoning becomes the default rather than an optimization. Two patterns survive:

1. Read signals directly in the template: `{{ state.items().length }}`.
2. Bind to observables with `async` and let Angular manage subscription and scheduling.

What does not survive is the habit of mutating a plain array on the component, calling `push`, and expecting the view to follow. The code compiles; the screen does not necessarily update.

## Effects are not a substitute for computed state

When a value stops updating, the quickest fix is to reach for an `effect()` that writes to a different signal. I have done it, and it reliably produces loops and ordering surprises. Computed signals are lazy and memoized, so a derived value should be a `computed`, not an effect.

Effects are for side effects that leave the signal graph: writing to storage, logging, syncing a form control. The distinction is worth enforcing in review, because it is the place where a zoneless migration quietly turns into an event-bus of effects.

### A worked example: deriving a total

Consider an invoice summary where the total depends on line items. The derived value should recompute only when the items change:

```typescript
import { Component, signal, computed } from '@angular/core';

@Component({
  selector: 'app-invoice-summary',
  template: `
    <p>Lines: {{ lineCount() }}</p>
    <p>Total: {{ total() }}</p>
  `,
})
export class InvoiceSummaryComponent {
  readonly lines = signal<number[]>([10, 25, 5]);
  readonly lineCount = computed(() => this.lines().length);
  readonly total = computed(() => this.lines().reduce((sum, n) => sum + n, 0));
}
```

The template calls the computed directly. No subscription to tear down, no effect to schedule, and no possibility of reading a stale total because a mutation happened outside the framework's view.

## Third-party callbacks and async code you do not own

Most of the migration pain I have hit is not in our own components. It is in code triggered by libraries: a chart callback, a map event, a file reader, a WebSocket handler. In a zone-based app, an update from those callbacks was usually caught by the patched APIs. In zoneless, the update is only rendered if it lands in a signal or in a tracked subscription.

The fix is to treat every external callback as a boundary. Inside the callback, write into a signal rather than mutating component fields.

```typescript
import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-event-panel',
  template: `<p>Received: {{ events().length }}</p>`,
})
export class EventPanelComponent {
  readonly events = signal<string[]>([]);

  onExternalEvent(name: string): void {
    this.events.update((current) => [...current, name]);
  }
}
```

If a third-party library calls `onExternalEvent`, the signal write is the notification Angular needs. If instead the handler did `this.events.push(name)` on a plain array, the template would have no reason to update.

The same reasoning applies to `await` in code you cannot downlevel or patch. Treat the result of an async call as data that has to enter the signal graph explicitly.

## Testing without the zone

Removing ZoneJS also affects tests. ZoneJS is typically loaded through the `polyfills` option in `angular.json` for both the build and test targets, so a zoneless migration usually means removing `zone.js` and `zone.js/testing` from the test setup as well. `TestBed` still works, but `fixture.detectChanges()` no longer has a zone to lean on. I found it more reliable to assert on the signal state and let the fixture render after writing into the signal, rather than expecting a microtask to flush on its own.

When tests fail, the failure is usually honest: some producer was never a signal, so nothing scheduled the render. Fixing that fixes the test, and it is the same fix the running application needed.

## Conclusion

Zoneless change detection does not ask you to learn many new APIs; it asks you to make state explicit. The places that hurt are the boundaries: third-party callbacks, async code outside the framework's control, and any state still living in mutable fields. Signals and `computed` give you a contract the renderer can trust, and the migration is a good excuse to tighten that contract everywhere it was previously implicit.

Happy coding!
{% endraw %}

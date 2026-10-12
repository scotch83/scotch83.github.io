---
layout: post
title: "Angular Signals and Zoneless Change Detection: What Changes"
date: 2026-10-12
excerpt_separator: <!--more-->
cover-img: assets/images/angular-signals-zoneless.svg
linkedin-img: assets/images/angular-signals-zoneless.png
tags: angular architecture frontend
comments: true
---
{% raw %}
The first time I turned off Zone.js in a real application, the build went green, the unit tests passed, and one screen quietly stopped updating. The data was there. The template was correct. The component just never re-rendered, because the thing that used to schedule change detection for me was gone.

<!--more-->

## Zone.js was a scheduler you never had to think about

For most of Angular's life, the contract was implicit: click a button, resolve a promise, fire a `setTimeout`, and something in a library monkey-patched enough browser APIs to know it happened. Angular then walked the tree from the root and checked bindings.

That model is forgiving. It is also the reason a slow component can drag a whole page down, and the reason a hot `mousemove` handler can trigger a change detection pass per pixel. Zone.js does not know which state changed. It only knows that *something* happened.

Signals invert this. A signal is a value with a declared read. When the template reads a signal, Angular records the dependency. When the signal is written, Angular knows exactly which views consumed it, and it can mark those views dirty instead of the whole tree.

That is the mental model shift. **Zone.js told Angular that something happened. Signals tell Angular what changed.** Everything uncomfortable about the migration comes from that sentence.

## Prerequisites and the shape of a zoneless app

The plumbing is small. You bootstrap without Zone.js and you do not need to call `ApplicationRef.tick()` yourself - Angular schedules change detection for you as long as the notifications it receives come from signals, inputs, events bound in templates, or the async pipe.

```typescript
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection()],
}).catch((err) => console.error(err));
```

Remove `zone.js` from `polyfills`. If you are on NgModule-based bootstrapping, the same provider goes into the root module providers, but honestly, this is a sign it is time to finish the standalone migration first.

Here is the part nobody warns you about: **the compiler will not tell you which of your components were relying on Zone.js.** There is no migration schematic for "this code was implicitly scheduled by a patched `setTimeout`." You find those by clicking around the application and noticing what stopped moving.

## Where the pain actually lives

The failure mode is always the same shape. State changes outside Angular's awareness, and a view that used to update does not.

### Third-party callbacks and imperative libraries

A map library, a charting library, a WebSocket client, a native plugin bridged through Capacitor - anything that hands you a callback has no idea Angular exists. Under Zone.js, the patch made that callback a change detection trigger. Without it, you have a dead view.

```typescript
@Component({
  selector: 'app-realtime-panel',
  standalone: true,
  template: `<p>Last tick: {{ lastTick() }}</p>`,
})
export class RealtimePanelComponent implements OnDestroy {
  private readonly socket = new WebSocket('wss://example.invalid/feed');
  private readonly lastTickSignal = signal<string>('none');

  readonly lastTick = this.lastTickSignal.asReadonly();

  constructor() {
    this.socket.onmessage = (event: MessageEvent<string>) => {
      // Under Zone.js this just worked. Zoneless, it still does -
      // but only because we are writing to a signal.
      this.lastTickSignal.set(event.data);
    };
  }

  ngOnDestroy(): void {
    this.socket.close();
  }
}
```

The fix is not `ChangeDetectorRef.detectChanges()`. The fix is to route the event into a signal, or into `ApplicationRef.tick()` if you genuinely have no state to model - which is rarer than it feels when you are under pressure. Reaching for `detectChanges()` in a zoneless app is how you end up with a codebase that still thinks in Zone.js but pays the zoneless tax.

### Async work that mutates fields directly

A resolved promise that assigns `this.rows = data` produces a view that does not update. This is not a bug in Angular; it is the model working as designed. The field is not observable.

```typescript
// Broken under zoneless: nothing reads 'rows' as a dependency.
rows: Row[] = [];

async load(): Promise<void> {
  this.rows = await this.service.fetchRows();
}
```

```typescript
// Working: the template read creates the dependency,
// and '.set' schedules the view that read it.
readonly rows = signal<Row[]>([]);

async load(): Promise<void> {
  this.rows.set(await this.service.fetchRows());
}
```

In components that mix signals and plain fields - and during a migration there will be many - it is worth being explicit about which half of the component is observable. A comment at the top of the class is cheap and it saves a debugging session six months from now.

### `OnPush` components that were relying on the tree walk

I have seen this pattern more than I would like: a component marked `OnPush` with mutable state and no `markForCheck` call, which worked only because an ancestor's event forced a full pass. Zoneless removes the safety net. Either the state becomes a signal, or you call `markForCheck()` in the right place, and "the right place" is now something you must reason about instead of inherit.

## What gets easier, honestly

Not everything about this migration is a cost.

- **`OnPush` stops being a rule to remember.** With signals, a component with signal inputs and signal state is effectively push-based by construction. The distinction between `Default` and `OnPush` blurs, because the dependency graph does the work.
- **Profiling results become legible.** When a view renders, it is because something it read changed. That is a much shorter causal chain to follow than "the tree was walked because a patched API fired."
- **Test doubles get simpler.** No zone to flush, no `fakeAsync` gymnastics for code paths that never needed them. Tests that assert on signal values are plain assertions.

The caveat I would give a team considering this: **do not start here.** Finish the standalone migration, get your components onto signal inputs and `input()`/`output()`, replace imperative field mutation with signals where it is cheap, and then flip the provider. Turning off Zone.js first is a debugging exercise, not a migration.

The other caveat: this is a deliberate trade of convenience for explicitness. You gain a precise change detection graph and you lose the ambient safety net. Teams that have never had to think about when a view updates will feel that loss most.

## Conclusion

Zoneless change detection is not primarily an API change. It is a change in who is responsible for telling Angular that state moved - and the answer becomes you, via signals. The small failures are the ones that matter: a third-party callback into a plain field, an async method that assigns instead of sets, an `OnPush` component that was leaning on an ancestor. Find those before you remove the polyfill, because after you remove it, they find you.

Happy coding!
{% endraw %}

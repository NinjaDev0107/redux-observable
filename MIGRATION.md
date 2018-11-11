# Migration to 1.0.0 of redux-observable

# Upgrading

## RxJS v6

Version 1.0.0 of redux-observable requires v6.0.0 of RxJS. They have their own migration guide, and there's even a `rxjs-compat` compatiblity layer allowing you to use the old v5 import paths and APIs to aid in migrating progressively. Check out their guide here:

https://github.com/ReactiveX/rxjs/blob/master/docs_app/content/guide/v6/migration.md

## Redux v4

We now also require Redux v4, which only has minor breaking changes outlined here: https://github.com/reduxjs/redux/releases/tag/v4.0.0

## Setting up the middleware

### rootEpic

In 1.0.0 you no longer provide your root Epic to `createEpicMiddleware`. Instead, you call `epicMiddleware.run(rootEpic)` on the instance of the middleware _after_ you have created your store with it.

```ts
const epicMiddleware = createEpicMiddleware();
const store = createStore(rootReducer, applyMiddleware(epicMiddleware));

epicMiddleware.run(rootEpic);
```

This change was necessary because in redux v4 you are no longer supposed to dispatch actions while middleware is still being setup, which an Epic could have done with the previous API.

This new API also gives you the ability to easily add Epics later, as in async lazy loading. Subsequent calls of `epicMiddleware.run(epic)` do not replace the previous ones, they are merged together.

The optional configuration/options argument to `createEpicMiddleware` for providing dependencies, adapters, etc is now the first and only argument to `createEpicMiddleware(options)`.

### Adapters

Adapters are no longer supported, but you can achieve the same behavior by applying the transforms in a custom root Epic.

Here's an example of converting the Observables to Most.js streams:

```js
import most from 'most';
import { from } from 'rxjs';

// a Most.js implementatin of combineEpics
const combineEpics = (...epics) => (...args) =>
  most.merge(
    ...epics.map(epic => epic(...args))
  );

const rootEpic = (action$, state$, ...rest) => {
  const epic = combineEpics(epic1, epic2, ...etc);
  // action$ and state$ are converted from Observables to Most.js streams
  const output = epic(
    most.from(action$),
    most.from(state$),
    ...rest
  );

  // convert Most.js stream back to Observable
  return from(output);
};
```

## Actions emitted by your epics are now scheduled on a queue

In 1.0.0 we now subscribe to your root Epic, and dispatch actions emitted by it, using the queueScheduler from RxJS. This is a bit hard to explain (and understand) but as the name suggests, a queue is used. If the queue is empty, the action is emitted as usual, but if that action synchronously causes other actions to be emitted they will be queued up until the call stack of the first action returns.

In a large majority of cases this will have no perceivable impact, but it may affect the order of any complex epic-to-epic communication you have.

One benefit is that actions which are emitted by an epic on start up are not missed by epics which come after it. e.g. With `combineEpics(epic1, epic2)` previously if epic1 emitted on startup, epic2 would not receive that action because it had not yet been set up. It also changes the potential order of complex epic-to-epic communication in a way that most may find more intuitive.

Take this example:

```ts
const epic1 = action$ =>
  action$.pipe(
    ofType('FIRST'),
    mergeMap(() =>
      of({ type: 'SECOND' }, { type: 'THIRD' })
    )
  );

const epic2 = action$ =>
  action$.pipe(
    ofType('SECOND'),
    map(() => ({ type: 'FOURTH' })),
    startWith({ type: 'FIRST' })
  );

// notice that epic2 comes *after* epic1
const rootEpic = combineEpics(epic1, epic2);
```

In older version of redux-observable, your reducers would have been missing the FOURTH:

```
FIRST
SECOND
THIRD
```

However in 1.0.0 it now would see it as the last one:
```
FIRST
SECOND
THIRD
FOURTH
```

In that example, the SECOND action is now seen by epic2 because it is queued on the same schedule as subscribing (setting up) the Epics themselves is. Since the middleware will try to subscribe to the Epics first, it now always will finish doing so before any action is emitted--so epic2 doesn't miss any actions.

Another way of looking at it is that when an individual Epic is synchronously emitting actions, they will always be emitted in the sequence provided, without any other Epics being able to sneak another action in-between. When we did `of({ type: 'SECOND' }, { type: 'THIRD' })`, we now know _for sure_ that THIRD will immediately follow SECOND; in older versions of redux-observable this wasn't guaranteed as another Epic could have been listening for SECOND and emitted some other action before THIRD, because they shared the same call-stack.

Because this is dealing with very complex recursion, call stacks, and sequences, this may be tough to fully wrap your head around. We hope that what actually happens in practice is itself more intuitive, even if truly understanding how things are queued is now.

## `epicMiddleware.replaceEpic` was removed

If you were using `epicMiddleware.replaceEpic`, you can achieve similar behavior by dispatching your own `END` action that your root Epic listens for with a `takeUntil`, directing it to terminate. You then call `epicMiddleware.run(nextEpic)` with the next root Epic you wish to run.

```ts
// Your root Epic uses function composition to add the takeUntil.
// It combines your epics together, but instead of returning that new combined epic
// it calls it, providing the action$, state$, etc so that we can pipe the takeUntil
// on the result
const rootEpic = (action$, ...rest) =>
  combineEpics(epic1, epic2, ...etc)(action$, ...rest).pipe(
    takeUntil(action$.pipe(
      ofType('END')
    ))
  );

function replaceRootEpic(nextRootEpic) {
  store.dispatch({ type: 'END' });
  epicMiddleware.run(nextRootEpic);
}
```

## Dispatching an action

The ability to call `store.dispatch()` inside your Epics was originally provided as an escape hatch, to be used rarely, if ever. Unfortunately in practice we've seen a large number of people using it extensively. Instead, Epics should emit actions through the Observable the Epic returns, using idiomatic RxJS. To remove that common footgun we've removed the functionality entirely.

If you're looking for the ability to directly call dispatch yourself (rather than emit through streams) you may be interested in using an alternative middleware that is less opinionated around RxJS.

> **This is unrelated to usage of store.dispatch inside your UI components or anywhere outside of redux-observable--you will continue to use it there**

[Learn More](https://github.com/redux-observable/redux-observable/pull/346)

#### Before

```js
const somethingEpic = action$ =>
  action$.ofType(SOMETHING)
    .switchMap(() =>
      ajax('/something')
        .do(() => store.dispatch({ type: SOMETHING_ELSE }))
        .map(response => ({ type: SUCCESS, response }))
    );
```

#### After

```js
// Now uses rxjs v6 pipeable operators
const somethingEpic = action$ =>
  action$.pipe(
    ofType(SOMETHING),
    switchMap(() =>
      getJSON('/something').pipe(
        mergeMap(response => of(
          { type: SOMETHING_ELSE },
          { type: SUCCESS, response }
        ))
      )
    )
  );
```

## Accessing state

As `store.dispatch` is removed, and since redux-observable has had several years to be used and mature in the wild, it became clear that calling `store.getState()` is useful but there are also use cases to having an Observable of state$ too.

In v1.0.0 of redux-observable, the second argument to your Epics is now a custom StateObservable, referred to from now on as `state$`. It has a `value` property that always contains the latest value of your redux state. This can be used in the same imperative way you used to use `store.getState()`.

Since `state$` is also an Observable you can now compose it into other streams as you might expect and react to state changes--you can also call `state$.subscribe()` directly, but it's usually more idiomatic to compose it with other operators rather than explicitly calling `subscribe` yourself.

I expect a majority of people to use the imperative `state$.value` form most of the time simply because it's more terse and a majority of the time you don't actually want to react to changes in the state.

#### Before

```js
const fetchUserEpic = (action$, store) =>
  action$.ofType(FETCH_USER)
    .mergeMap(action =>
      ajax(`/users/${action.id}`, { 'Authorization': `Bearer ${store.getState().authToken}` }) // <----- here
        .map(response => fetchUserFulfilled(response))
    );
```

#### After

```js
// Also now using v6 pipe operators
const fetchUserEpic = (action$, state$) =>
  action$.pipe(
    ofType(FETCH_USER),
    mergeMap(action =>
      ajax(`/users/${action.id}`, { 'Authorization': `Bearer ${state$.value.authToken}` })).pipe( // <----- here
        map(response => fetchUserFulfilled(response))
      )
    )
  );

// or the "reactive" way, but more verbose.

const fetchUserEpic = (action$, state$) =>
  action$.pipe(
    ofType(FETCH_USER),
    withLatestFrom(state$),
    mergeMap(([action, state]) =>
      getJson(`/users/${action.id}`, { 'Authorization': `Bearer ${state.authToken}` }).pipe(
        map(respose => fetchUserFulfilled(response))
      )
    )
  );
```

Since it's a stream, you can do all sorts of cool things:

```js
// This code is UNTESTED and likely has bugs, just here to give you the gist.
// It shows one possible way of having an auto-save feature based on the state
// changing instead of needing to know all the possible actions that could change
// that state.
const autoSaveEpic = (action$, state$) =>
  action$.pipe(
    ofType(AUTO_SAVE_ENABLE),
    exhaustMap(() =>
      state$.pipe(
        pluck('googleDocument'),
        distinctUntilChanged(),
        throttleTime(500, { leading: false, trailing: true }),
        concatMap(googleDocument =>
          saveGoogleDoc(googleDocument).pipe(
            map(() => saveGoogleDocFulfilled()),
            catchError(e => of(saveGoogleDocRejected(e)))
          )
        ),
        takeUntil(action$.pipe(
          ofType(AUTO_SAVE_DISABLE)
        ))
      )
    )
  );
```

[Learn More](https://github.com/redux-observable/redux-observable/pull/410)

> Have a cool use case for state$? Please let us know by opening an issue ticket so we can feature it!

***

Are we missing something about the migration? Open an issue or open a PR if possible!

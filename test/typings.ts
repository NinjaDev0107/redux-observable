import { expect } from 'chai';
import { createStore, applyMiddleware, MiddlewareAPI, Action } from 'redux';
import { Observable } from 'rxjs/Observable';
import { ajax } from 'rxjs/observable/dom/ajax';
import { map } from 'rxjs/operators/map';
import { asap } from 'rxjs/scheduler/asap';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/mapTo';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mergeMap';

import { createEpicMiddleware, Epic, combineEpics,
  EpicMiddleware, ActionsObservable, ofType } from '../';

interface State {
  foo: string
}

interface FluxStandardAction {
  type: string | symbol | any;
  payload?: any;
  error?: boolean | any;
  meta?: any
}

interface Dependencies {
  func(value: string): string;
}

const epic1: Epic<FluxStandardAction, State> = (action$, store) =>
  action$.ofType('FIRST')
    .mapTo({
      type: 'first',
      payload: store.getState()
    });

const epic2: Epic<FluxStandardAction, State> = (action$, store) =>
  action$.ofType('SECOND', 'NEVER')
    .mapTo('second')
    .mergeMap(type => Observable.of({ type }));

const epic3: Epic<FluxStandardAction, State> = action$ =>
  action$.ofType('THIRD')
    .mapTo({
      type: 'third'
    });

const epic4: Epic<FluxStandardAction, State> = () =>
  Observable.of({
    type: 'fourth'
  });

const epic5: Epic<FluxStandardAction, State> = (action$, store) =>
  action$.ofType('FIFTH')
    .mergeMap(({ type, payload }) => Observable.of({
      type: 'fifth',
      payload
    }));

const epic6: Epic<FluxStandardAction, State> = (action$, store) =>
  action$.ofType('SIXTH')
    .map(({ type, payload }) => ({
      type: 'sixth',
      payload
    }));

const epic7: Epic<FluxStandardAction, State, Dependencies> = (action$, store, dependencies) =>
  action$.ofType('SEVENTH')
    .map(({ type, payload}) => ({
      type: 'seventh',
      payload: dependencies.func(payload)
    }));

const epic8: Epic<FluxStandardAction, State, Dependencies> = (action$, store, dependencies) =>
    action$.pipe(
      ofType('EIGHTH'),
      map(({ type, payload }) => ({
        type: 'eighth',
        payload
      }))
    )

interface Epic9_Input {
  type: "NINTH",
  payload: string,
}
interface Epic9_Output {
  type: "ninth",
  payload: string,
}

const epic9_1: Epic<FluxStandardAction, State, Dependencies, Epic9_Output> = (action$, store, dependencies) =>
  action$.pipe(
    ofType<FluxStandardAction, Epic9_Input>('NINTH'),
    map(({ type, payload }) => ({
      type: 'ninth' as 'ninth',
      payload: dependencies.func("ninth-" + payload),
    }))
  );
const epic9_2 = (action$: ActionsObservable<FluxStandardAction>, store: MiddlewareAPI<State>, dependencies: Dependencies) =>
  action$.pipe(
    ofType<FluxStandardAction, Epic9_Input>('NINTH'),
    map(({ type, payload }) => ({
      type: 'ninth',
      payload: dependencies.func("ninth-" + payload),
    } as Epic9_Output))
  );
const rootEpic1: Epic<FluxStandardAction, State> = combineEpics<FluxStandardAction, State>(epic1, epic2, epic3, epic4, epic5, epic6, epic7, epic8, epic9_1);
const rootEpic2 = combineEpics(epic1, epic2, epic3, epic4, epic5, epic6, epic7, epic8, epic9_2);

const dependencies: Dependencies = {
  func(value: string) { return `func-${value}`}
}

const epicMiddleware1: EpicMiddleware<FluxStandardAction, State> = createEpicMiddleware<FluxStandardAction, State>(rootEpic1, { dependencies });
const epicMiddleware2 = createEpicMiddleware(rootEpic2, { dependencies });

interface CustomEpic<T extends Action, S, U> {
  (action$: ActionsObservable<T>, store: MiddlewareAPI<S>, api: U): Observable<T>;
}

const customEpic: CustomEpic<FluxStandardAction, State, number> = (action$, store, some) =>
  action$.ofType('CUSTOM1')
    .map(({ type, payload }) => ({
      type: 'custom1',
      payload
    }));

const customEpic2: CustomEpic<FluxStandardAction, State, number> = (action$, store, some) =>
  action$.ofType('CUSTOM2')
    .map(({ type, payload }) => ({
      type: 'custom2',
      payload
    }));

const customEpicMiddleware: EpicMiddleware<FluxStandardAction, State> = createEpicMiddleware<FluxStandardAction, State>(rootEpic1, {
  dependencies: { getJSON: ajax.getJSON }
});

const combinedCustomEpics = combineEpics<CustomEpic<FluxStandardAction, State, number>>(customEpic, customEpic2);

const reducer = (state: Array<FluxStandardAction> = [], action: FluxStandardAction) => state.concat(action);
const store = createStore(
  reducer,
  applyMiddleware(epicMiddleware1, epicMiddleware2)
);

epicMiddleware1.replaceEpic(rootEpic2);
epicMiddleware2.replaceEpic(rootEpic1)

store.dispatch({ type: 'FIRST' });
store.dispatch({ type: 'SECOND' });
store.dispatch({ type: 'FIFTH', payload: 'fifth-payload' });
store.dispatch({ type: 'SIXTH', payload: 'sixth-payload' });
store.dispatch({ type: 'SEVENTH', payload: 'seventh-payload' });
store.dispatch({ type: 'EIGHTH', payload: 'eighth-payload' });
store.dispatch({ type: 'NINTH', payload: 'ninth-payload' });

expect(store.getState()).to.deep.equal([
  { "type": "@@redux/INIT" },
  { "type": "fourth" },
  { "type": "fourth" },
  { "type": "@@redux-observable/EPIC_END" },
  { "type": "fourth" },
  { "type": "@@redux-observable/EPIC_END" },
  { "type": "fourth" },
  { "type": "FIRST" },
  { "type": "first",
    "payload": [
      { "type": "@@redux/INIT" },
      { "type": "fourth" },
      { "type": "fourth" },
      { "type": "@@redux-observable/EPIC_END" },
      { "type": "fourth" },
      { "type": "@@redux-observable/EPIC_END" }
    ]
  },
  { "type": "first",
    "payload": [
      { "type": "@@redux/INIT" },
      { "type": "fourth" },
      { "type": "fourth" },
      { "type": "@@redux-observable/EPIC_END" }
    ]
  },
  { "type": "SECOND" },
  { "type": "second" },
  { "type": "second" },
  { "type": "FIFTH", "payload": "fifth-payload" },
  { "type": "fifth", "payload": "fifth-payload" },
  { "type": "fifth", "payload": "fifth-payload" },
  { "type": "SIXTH", "payload": "sixth-payload" },
  { "type": "sixth", "payload": "sixth-payload" },
  { "type": "sixth", "payload": "sixth-payload" },
  { "type": "SEVENTH", "payload": "seventh-payload" },
  { "type": "seventh", "payload": "func-seventh-payload" },
  { "type": "seventh", "payload": "func-seventh-payload" },
  { "type": "EIGHTH", "payload": "eighth-payload" },
  { "type": "eighth", "payload": "eighth-payload" },
  { "type": "eighth", "payload": "eighth-payload" },
  { "type": "NINTH", "payload": "ninth-payload" },
  { "type": "ninth", "payload": "func-ninth-ninth-payload" },
  { "type": "ninth", "payload": "func-ninth-ninth-payload" },
]);

const input$ = Observable.create(() => {});
const action$1: ActionsObservable<FluxStandardAction> = new ActionsObservable<FluxStandardAction>(input$);
const action$2: ActionsObservable<FluxStandardAction> = ActionsObservable.of<FluxStandardAction>({ type: 'SECOND' }, { type: 'FIRST' }, asap);
const action$3: ActionsObservable<FluxStandardAction> = ActionsObservable.from<FluxStandardAction>([{ type: 'SECOND' }, { type: 'FIRST' }], asap);

{
  // proper type narrowing
  const enum ActionTypes {
    One = 'ACTION_ONE',
    Two = 'ACTION_TWO',
  }
  const doOne = (myStr: string): One => ({type: ActionTypes.One, myStr})
  const doTwo = (myBool: boolean): Two => ({type: ActionTypes.Two, myBool})

  interface One extends Action {
    type: ActionTypes.One
    myStr: string
  }
  interface Two extends Action {
    type: ActionTypes.Two
    myBool: boolean
  }
  type Actions = One | Two

  // Explicitly set generics fixes the issue
const epic = (action$: ActionsObservable<Actions>) =>
  action$
    .ofType<One>(ActionTypes.One)
    // action is correctly narrowed to One
    .map((action) => { console.log(action.myStr) })

// Explicitly set generics fixes the issue
const epicLettable = (action$: ActionsObservable<Actions>) =>
  action$.pipe(
    ofType<Actions,One>(ActionTypes.One),
    // action is correctly narrowed to One
    map((action) => { console.log(action.myStr) })
  );

}

console.log('typings.ts: OK');

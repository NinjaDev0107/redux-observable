import { merge } from 'rxjs';

/**
  Merges all epics into a single one.
 */
export const combineEpics = (...epics) => {
  const merger = (...args) => merge(
    ...epics.map(epic => {
      const output$ = epic(...args);
      if (!output$) {
        throw new TypeError(`combineEpics: one of the provided Epics "${epic.name || '<anonymous>'}" does not return a stream. Double check you\'re not missing a return statement!`);
      }
      return output$;
    })
  );

  return Object.defineProperty(merger, 'name', {
    value: `combineEpics(${epics.map(epic => epic.name || '<anonymous>').join(', ')})`,
  });
};

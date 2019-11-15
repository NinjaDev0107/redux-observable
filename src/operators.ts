import { Action } from 'redux';
import { OperatorFunction } from 'rxjs';
import { filter } from 'rxjs/operators';

const keyHasType = (type: unknown, key: unknown) => {
  return type === key || (typeof key === 'function' && type === key.toString());
};

/**
 * Inferring the types of this is a bit challenging, and only works in newer
 * versions of TypeScript.
 *
 * @param ...types One or more Redux action types you want to filter for, variadic.
 */
export function ofType<
  // All possible actions your app can dispatch
  Input extends Action,
  // The types you want to filter for
  Type extends Input['type'],
  // The resulting actions that match the above types
  Output extends Input = Extract<Input, Action<Type>>
>(...types: [Type, ...Type[]]): OperatorFunction<Input, Output> {
  return filter((action): action is Output => {
    const { type } = action;
    const len = types.length;

    if (len === 1) {
      return keyHasType(type, types[0]);
    } else {
      for (let i = 0; i < len; i++) {
        if (keyHasType(type, types[i])) {
          return true;
        }
      }
    }

    return false;
  });
}

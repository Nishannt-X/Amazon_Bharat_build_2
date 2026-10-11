import * as React from "react";

type UseControlledStateProps<T> = {
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
};

export function useControlledState<T>({
  value,
  defaultValue,
  onChange,
}: UseControlledStateProps<T>) {
  const [state, setState] = React.useState<T>(
    value !== undefined ? value : (defaultValue as T)
  );

  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : state;

  const setValue = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      const nextValue =
        typeof next === "function" ? (next as (prev: T) => T)(currentValue) : next;

      if (!isControlled) {
        setState(nextValue);
      }
      onChange?.(nextValue);
    },
    [isControlled, currentValue, onChange]
  );

  return [currentValue, setValue] as const;
}

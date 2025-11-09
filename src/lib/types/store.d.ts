export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type ResetFunction = () => void;

export type StateObject = Record<string, unknown>;

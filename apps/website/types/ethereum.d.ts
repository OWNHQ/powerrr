export {};

declare global {
  interface Window {
    ethereum?: {
      request<T = unknown>(args: {
        method: string;
        params?: readonly unknown[] | object;
      }): Promise<T>;
      on?: (event: string, listener: (...args: unknown[]) => void) => void;
      removeListener?: (
        event: string,
        listener: (...args: unknown[]) => void,
      ) => void;
    };
  }
}

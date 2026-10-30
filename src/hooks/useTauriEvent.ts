import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";

/** Subscribe to a Tauri event for the component lifetime; always unlistens, even if unmounted mid-setup. */
export function useTauriEvent<T>(subscribe: (cb: (payload: T) => void) => Promise<UnlistenFn>, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | null = null;
    subscribe((p) => handlerRef.current(p)).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

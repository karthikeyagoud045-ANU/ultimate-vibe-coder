"use client";

import { useState, useCallback, useRef } from "react";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastOptions {
  duration?: number;
}

let globalAddToast: ((message: string, variant: ToastVariant, options?: ToastOptions) => void) | null = null;

/**
 * Fire-and-forget toast from anywhere (outside React tree).
 * Falls back to console if no ToastProvider is mounted.
 */
export function showToast(message: string, variant: ToastVariant = "info", options?: ToastOptions): void {
  if (globalAddToast) {
    globalAddToast(message, variant, options);
  } else {
    // Fallback for SSR / before mount
    const method = variant === "error" ? "error" : variant === "warning" ? "warn" : "log";
    console[method](`[Toast/${variant}] ${message}`);
  }
}

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  success: 3000,
  info: 4000,
  warning: 5000,
  error: 6000,
};

let idCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant, options?: ToastOptions) => {
      const id = `toast-${++idCounter}-${Date.now()}`;
      const duration = options?.duration ?? DEFAULT_DURATIONS[variant];
      const toast: Toast = { id, message, variant, duration };

      setToasts((prev) => [...prev.slice(-4), toast]); // Keep max 5

      const timer = setTimeout(() => {
        removeToast(id);
      }, duration);
      timersRef.current.set(id, timer);
    },
    [removeToast]
  );

  // Register global bridge
  globalAddToast = addToast;

  return { toasts, addToast, removeToast };
}

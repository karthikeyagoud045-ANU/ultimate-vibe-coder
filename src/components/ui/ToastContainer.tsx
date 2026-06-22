"use client";

import { useEffect, useRef } from "react";
import type { Toast, ToastVariant } from "@/hooks/useToast";

const VARIANT_CONFIG: Record<
  ToastVariant,
  { icon: string; borderColor: string; iconBg: string }
> = {
  success: {
    icon: "✓",
    borderColor: "hsla(152, 69%, 52%, 0.3)",
    iconBg: "hsla(152, 69%, 52%, 0.15)",
  },
  error: {
    icon: "✕",
    borderColor: "hsla(0, 72%, 58%, 0.3)",
    iconBg: "hsla(0, 72%, 58%, 0.15)",
  },
  warning: {
    icon: "⚠",
    borderColor: "hsla(28, 92%, 60%, 0.3)",
    iconBg: "hsla(28, 92%, 60%, 0.15)",
  },
  info: {
    icon: "ℹ",
    borderColor: "hsla(217, 91%, 60%, 0.3)",
    iconBg: "hsla(217, 91%, 60%, 0.15)",
  },
};

const VARIANT_TEXT_COLOR: Record<ToastVariant, string> = {
  success: "var(--accent-green)",
  error: "var(--accent-red)",
  warning: "var(--accent-orange)",
  info: "var(--accent-blue)",
};

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      style={{
        position: "fixed",
        bottom: "var(--space-xl)",
        right: "var(--space-xl)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column-reverse",
        gap: "var(--space-sm)",
        pointerEvents: "none",
        maxWidth: 380,
        width: "100%",
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const config = VARIANT_CONFIG[toast.variant];
  const textColor = VARIANT_TEXT_COLOR[toast.variant];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger enter animation
    const el = ref.current;
    if (el) {
      requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "translateX(0)";
      });
    }
  }, []);

  return (
    <div
      ref={ref}
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-md)",
        padding: "var(--space-md) var(--space-lg)",
        background: "var(--glass-bg)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: `1px solid ${config.borderColor}`,
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--glass-shadow)",
        pointerEvents: "auto",
        opacity: 0,
        transform: "translateX(24px)",
        transition: "all var(--transition-slow)",
        cursor: "pointer",
        minHeight: 48,
      }}
      onClick={() => onDismiss(toast.id)}
    >
      {/* Icon */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--radius-sm)",
          background: config.iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "var(--font-size-sm)",
          fontWeight: 700,
          color: textColor,
          flexShrink: 0,
        }}
      >
        {config.icon}
      </div>

      {/* Text */}
      <span
        style={{
          flex: 1,
          fontSize: "var(--font-size-sm)",
          color: "var(--text-primary)",
          lineHeight: 1.4,
        }}
      >
        {toast.message}
      </span>

      {/* Close */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(toast.id);
        }}
        aria-label="Dismiss notification"
        style={{
          background: "none",
          border: "none",
          color: "var(--text-tertiary)",
          cursor: "pointer",
          fontSize: "var(--font-size-xs)",
          padding: "var(--space-xs)",
          lineHeight: 1,
          flexShrink: 0,
          borderRadius: "var(--radius-sm)",
          transition: "color var(--transition-fast)",
        }}
      >
        ✕
      </button>
    </div>
  );
}

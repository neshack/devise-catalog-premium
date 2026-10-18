import { useEffect } from "react";
import { useCatalog } from "../stores/catalog";
import type { Toast } from "../stores/catalog";
import { IconAlert, IconCheck, IconInfo, IconX } from "./icons";

function ToastItem({ toast }: { toast: Toast }) {
  const { dismissToast } = useCatalog();
  useEffect(() => {
    const t = setTimeout(() => dismissToast(toast.id), 6000);
    return () => clearTimeout(t);
  }, [toast.id, dismissToast]);

  const Icon = toast.kind === "success" ? IconCheck : toast.kind === "error" ? IconAlert : IconInfo;

  return (
    <div className={`toast toast--${toast.kind}`} role="status">
      <span className="toast__icon">
        <Icon size={15} />
      </span>
      <span className="toast__body">{toast.text}</span>
      <button className="toast__close" aria-label="Descartar aviso" onClick={() => dismissToast(toast.id)}>
        <IconX size={12} />
      </button>
    </div>
  );
}

export default function Toasts() {
  const { toasts } = useCatalog();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

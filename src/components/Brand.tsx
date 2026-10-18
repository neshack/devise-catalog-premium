import { useId } from "react";

/**
 * La marca: un disco leído por un arco espectral. Es la misma geometría que el
 * icono de la aplicación (assets/icon-source.svg), así que la identidad se ve
 * igual en el sistema operativo y dentro de la app.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff4d6d" />
          <stop offset="0.35" stopColor="#ffb02e" />
          <stop offset="0.62" stopColor="#8fd96a" />
          <stop offset="0.8" stopColor="#35c6d6" />
          <stop offset="1" stopColor="#6a7cf5" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10.2" fill="none" stroke="currentColor" strokeOpacity="0.45" />
      <path
        d="M12 3.2a8.8 8.8 0 0 1 8.8 8.8"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="2.6"
      />
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeOpacity="0.6" />
    </svg>
  );
}

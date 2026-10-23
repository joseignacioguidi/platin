# 0003 — Tokens de diseño completos y tipografías

Fecha: 2026-10-23 · Estado: aceptada

## Contexto

La arquitectura define 9 colores (`brand`, `brand-strong`, `ink`, `muted`, `expense`, `pending`, `transfer`, `card`, `savings`). Los mockups usan alrededor de 29: fondos, bordes, tintes suaves y estados hover. Como `CLAUDE.md` prohíbe hex sueltos en los componentes, esos colores necesitan nombre. También había que confirmar la licencia de Uncut Sans.

## Decisión

Los tokens viven en `libs/web-ui/src/styles/theme.css` (Tailwind 4, configurado en CSS) como variables CSS, y se redefinen bajo la clase `.dark`:

| Grupo | Tokens |
| --- | --- |
| Marca y significado | `brand`, `brand-strong`, `brand-hover`, `brand-soft`, `expense`, `expense-soft`, `pending`, `pending-soft`, `pending-ink`, `transfer`, `transfer-soft`, `card`, `card-muted`, `card-soft`, `savings`, `savings-soft` |
| Neutros | `ink`, `muted`, `canvas` (fondo, #F5F5F3), `surface` (tarjetas, #FFFFFF), `field` (teclas y segmentados), `line` (bordes), `line-soft` (divisores), `on-ink`, `on-card` |
| Solo landing | `coral`, `sky`, `rose` |

- La paleta por defecto de Tailwind se desactiva (`--color-*: initial`), así un color fuera de los tokens no compila.
- Los montos usan la utilidad `font-amount` (JetBrains Mono con `tabular-nums`).
- **Uncut Sans** tiene licencia SIL OFL 1.1, que permite autoalojarla; se sirve desde `@fontsource/uncut-sans`. JetBrains Mono, desde `@fontsource-variable/jetbrains-mono`.
- Los valores del modo oscuro (fondo Tinta #181818) no estaban en los mockups: son una propuesta inicial que se revisa en la fase 8.

## Consecuencias

La lista de colores de `CLAUDE.md` queda corta: la fuente de verdad pasa a ser `theme.css`.

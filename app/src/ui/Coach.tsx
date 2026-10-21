import type { ComponentChildren } from 'preact';
import { help, welcome } from '../state';

interface Props { n: number; side?: 'left' | 'right' | 'below' | 'above'; children: ComponentChildren; }

/** A numbered callout shown while hints are on. Positioned by the parent via CSS class. */
export function Coach({ n, side = 'below', children }: Props) {
  if (!help.value || welcome.value) return null;
  return (
    <span class={`coach ${side}`} role="note">
      <b aria-hidden="true">{n}</b>
      <span>{children}</span>
    </span>
  );
}

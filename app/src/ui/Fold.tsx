import type { ComponentChildren } from 'preact';

interface Props { title: string; current?: string; open?: boolean; children: ComponentChildren; }

/** A collapsible section whose summary line shows the choice currently in use. */
export function Fold({ title, current, open, children }: Props) {
  return (
    <details class="fold" open={open}>
      <summary>
        <span class="fold-title">{title}</span>
        {current && <span class="fold-current">{current}</span>}
      </summary>
      <div class="fold-body">{children}</div>
    </details>
  );
}

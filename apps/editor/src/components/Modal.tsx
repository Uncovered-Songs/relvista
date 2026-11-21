/** Native `<dialog>` with `showModal()` (focus trap, Esc), labelled by its heading. */
import { useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react';
import { CloseIcon } from './icons.js';

export interface ModalProps {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'small' | 'medium' | 'large';
  /** Element (selector inside the dialog) to focus first; default: the first focusable. */
  initialFocus?: string;
  className?: string;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'medium',
  initialFocus,
  className,
}: ModalProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const mounted = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    if (initialFocus) d.querySelector<HTMLElement>(initialFocus)?.focus();
    return () => {
      mounted.current = false;
      if (d.open) d.close();
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [initialFocus]);

  return (
    <dialog
      ref={ref}
      className={`ed-dialog ed-dialog--${size} ${className ?? ''}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      // Chrome's close watcher may close the dialog on Esc without a cancel event.
      onClose={() => {
        if (mounted.current) closeRef.current();
      }}
      onMouseDown={(e) => {
        // Click on the backdrop (the dialog element itself, outside its box) closes.
        if (e.target !== ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const inside =
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom;
        if (!inside) closeRef.current();
      }}
    >
      <div className="ed-dialog__header">
        <h2 id={id} className="ed-dialog__title">
          {title}
        </h2>
        <button
          type="button"
          className="ed-iconbtn"
          aria-label="Close"
          onClick={() => closeRef.current()}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="ed-dialog__body">{children}</div>
      {footer && <div className="ed-dialog__footer">{footer}</div>}
    </dialog>
  );
}

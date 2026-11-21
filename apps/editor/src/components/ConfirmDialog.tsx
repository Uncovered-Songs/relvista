import type { ReactElement } from 'react';
import { Modal } from './Modal.js';

export function ConfirmDialog(props: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onResult(ok: boolean): void;
}): ReactElement {
  return (
    <Modal
      title={props.title}
      size="small"
      onClose={() => props.onResult(false)}
      initialFocus=".ed-dialog__footer .ed-btn--primary"
      footer={
        <>
          <button type="button" className="ed-btn" onClick={() => props.onResult(false)}>
            Cancel
          </button>
          <button
            type="button"
            className={`ed-btn ed-btn--primary${props.danger ? ' ed-btn--danger' : ''}`}
            onClick={() => props.onResult(true)}
          >
            {props.confirmLabel}
          </button>
        </>
      }
    >
      <p>{props.message}</p>
    </Modal>
  );
}

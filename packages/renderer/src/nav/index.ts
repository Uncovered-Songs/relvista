// Navigation components (docs/design/phase3-v1.md §4.7): used by DbmlViewer and mounted by the
// editor's diagram pane. Styles: src/styles/nav.css (part of '@relvista/renderer/styles.css').
export { SearchPanel, type SearchPanelMode, type SearchPanelProps } from './SearchPanel.js';
export { DetailSwitch, DETAIL_LEVELS, type DetailSwitchProps } from './DetailSwitch.js';
export { FocusControl, type FocusControlProps } from './FocusControl.js';
export {
  PdfDialog,
  MAX_PDF_OVERLAP_MM,
  MAX_PDF_SCALE,
  MIN_PDF_SCALE,
  isViewEmpty,
  tiledPageCount,
  type PdfDialogProps,
} from './PdfDialog.js';
export { pathOrder, pathText, type TablePath } from './path.js';

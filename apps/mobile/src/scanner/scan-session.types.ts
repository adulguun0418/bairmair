export interface ScanSessionProps {
  /** Called once the scan is exported and saved on the phone. */
  onSaved: (scanId: string) => void;
  onCancel: () => void;
}

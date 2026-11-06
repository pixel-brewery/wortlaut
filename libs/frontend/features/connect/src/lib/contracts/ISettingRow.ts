/**
 * A row of the effective settings.
 */
export interface ISettingRow {
  key: string;
  label: string;
  value: string;
  from: string;
  variant: 'neutral' | 'info' | 'success';
}

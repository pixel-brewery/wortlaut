/**
 * The tile of a key figure.
 */
export interface IFigure {
  label: string;
  value: string;
  note: string;
}

/**
 * A next step as the view shows it.
 */
export interface INextStepCard {
  title: string;
  text: string;
  action: string;
  route: string;
}

/**
 * A row of the locale coverage.
 */
export interface ILocaleRow {
  code: string;
  name: string;
  file: string;
  done: number;
  total: number;
  count: string;
  state: string;
  variant: 'neutral' | 'success' | 'warning';
}

/**
 * A rule as the view shows it.
 */
export interface IRuleRow {
  id: string;
  passed: boolean;
  result: string;
  detail: string;
  resultLocale: string | null;
}

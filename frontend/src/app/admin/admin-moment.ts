import { displayDateFormat } from '../shared/display-format';

const MOMENT = displayDateFormat('day-month-year-time', 'Europe/Tirane');

/** An ISO instant as the moment an admin reads it — Europe/Tirane, the platform's civil zone. */
export function formatMoment(isoInstant: string): string {
  return MOMENT(new Date(isoInstant));
}

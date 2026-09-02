/** An ISO instant as the moment an admin reads it — Europe/Tirane, the platform's civil zone. */
export function formatMoment(isoInstant: string): string {
  return new Date(isoInstant).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Tirane',
  });
}

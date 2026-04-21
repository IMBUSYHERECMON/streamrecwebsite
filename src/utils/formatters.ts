import { format, formatDistanceToNow } from 'date-fns';

export const formatRelative = (value?: string | null) =>
  value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : '—';

export const formatDateTime = (value?: string | null, pattern = 'MMM dd, yyyy HH:mm') =>
  value ? format(new Date(value), pattern) : '—';

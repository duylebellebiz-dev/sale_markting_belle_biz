// Default day-offset schedules from CLAUDE.md §7
// Invoice reminders: days after dateSent → 1, 2, 4, ...
// Renewal reminders: days before expiryDate → 30, 14, 7, 3, 1
export const DEFAULT_INVOICE_REMINDER_DAYS = [1, 2, 4, 7, 14];
export const DEFAULT_RENEWAL_REMINDER_DAYS = [30, 14, 7, 3, 1];

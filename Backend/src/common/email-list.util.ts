import { BadRequestException } from '@nestjs/common';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parses a comma-separated email list, trimming and validating each address. */
export function parseEmailList(raw: string | undefined, label: string): string[] {
  if (!raw) return [];
  const emails = raw
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  const invalid = emails.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length) {
    throw new BadRequestException(
      `${label} contains invalid email address(es): ${invalid.join(', ')}`,
    );
  }
  return emails;
}

/** True if `candidate` matches any address in a customer's comma-separated email field. */
export function emailListContains(commaSeparated: string | null | undefined, candidate: string): boolean {
  if (!commaSeparated) return false;
  const target = candidate.trim().toLowerCase();
  return commaSeparated
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .includes(target);
}

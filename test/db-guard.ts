/** DB name must end with `_test` (e.g. .../ummah_test?schema=public). */
export const TEST_DB_URL_PATTERN = /\/[^/?]*_test(\?|$)/;

/** Hard stop so destructive test helpers can never touch the development database. */
export function assertTestDatabase(url: string | undefined): void {
  if (!url || !TEST_DB_URL_PATTERN.test(url)) {
    throw new Error('Refusing to run: DATABASE_URL must target a database whose name ends with "_test".');
  }
}

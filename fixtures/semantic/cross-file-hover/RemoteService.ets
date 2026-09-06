/**
 * Remote greeting service.
 *
 * Keeps greeting behavior in a reusable module.
 * @since 1.2.3
 */
export class RemoteService {
  /**
   * Formats a greeting for one recipient.
   * @param name Recipient display name.
   * @returns A formatted greeting.
   */
  formatGreeting(name: string): string {
    return `Hello ${name}`
  }
}

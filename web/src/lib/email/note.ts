import type { SendResult } from "./mailer";

/** How to describe an email's fate next to a link the admin can also copy. */
export function emailNote(r: SendResult): string {
  switch (r.status) {
    case "sent":
      return "emailed. You can also copy the link below";
    case "preview":
      return "email recorded in preview mode (not actually sent; see Emails). Copy the link below and send it privately";
    case "failed":
      return `the email couldn't be sent (${r.error ?? "unknown error"}). Copy the link below and send it privately`;
    case "off":
      return "email is off. Copy the link below and send it privately";
  }
}

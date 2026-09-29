/**
 * `SmtpConnection` sur les sockets TCP de Cloudflare. Rien à tester ici hors
 * du runtime Workers : toute la logique est dans `smtp.ts`.
 *
 * Port 587 obligatoire : Cloudflare bloque le port 25 en sortie.
 */
import { connect } from "cloudflare:sockets";
import { ReplyReader, type SmtpConnection, type SmtpReply } from "./smtp";

export function openSmtp(hostname: string, port = 587): SmtpConnection {
  let socket = connect(
    { hostname, port },
    { secureTransport: "starttls", allowHalfOpen: false },
  );
  let reader = socket.readable.getReader();
  let writer = socket.writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const parser = new ReplyReader();
  const ready: SmtpReply[] = [];

  return {
    async send(line) {
      await writer.write(encoder.encode(`${line}\r\n`));
    },

    async reply() {
      while (ready.length === 0) {
        const { value, done } = await reader.read();

        if (done) {
          throw new Error("SMTP : connexion fermée par le serveur.");
        }

        ready.push(...parser.push(decoder.decode(value, { stream: true })));
      }

      return ready.shift() as SmtpReply;
    },

    async startTls() {
      reader.releaseLock();
      writer.releaseLock();
      socket = socket.startTls();
      reader = socket.readable.getReader();
      writer = socket.writable.getWriter();
    },

    async close() {
      await socket.close();
    },
  };
}

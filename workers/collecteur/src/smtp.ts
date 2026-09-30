/**
 * Un client SMTP minimal, pour le relais de Brevo (`smtp-relay.brevo.com:587`,
 * STARTTLS). Minimal à dessein : un envoi, en texte, à un destinataire.
 *
 * Pourquoi SMTP et pas l'API de Brevo : le compte filtre les IP sur l'API
 * (seule la VM y a droit), pas sur le relais SMTP. Un Worker change d'IP.
 *
 * Le dialogue est écrit contre `SmtpConnection`, sans rien savoir du réseau :
 * les tests le rejouent avec une fausse connexion, et `smtp-socket.ts` le
 * branche sur les sockets TCP de Cloudflare.
 */

export interface SmtpReply {
  readonly code: number;
  readonly lines: readonly string[];
}

export interface SmtpConnection {
  /** Envoie une ligne de commande ; la fin de ligne CRLF est ajoutée. */
  send(line: string): Promise<void>;
  /** Lit une réponse complète, multi-ligne comprise. */
  reply(): Promise<SmtpReply>;
  /** Passe la connexion en TLS, après la commande STARTTLS. */
  startTls(): Promise<void>;
  close(): Promise<void>;
}

export interface SmtpCredentials {
  readonly login: string;
  readonly key: string;
}

export interface Envelope {
  /** Adresse nue, pour `MAIL FROM`. */
  readonly from: string;
  readonly to: string;
}

/**
 * Lit les réponses dans un flux de lignes. Une réponse multi-ligne répète son
 * code suivi d'un tiret (`250-…`) et se termine par le code suivi d'une espace.
 */
export class ReplyReader {
  private buffer = "";
  private readonly pending: string[] = [];

  /** Ajoute un morceau reçu ; renvoie les réponses devenues complètes. */
  push(chunk: string): SmtpReply[] {
    this.buffer += chunk;
    const replies: SmtpReply[] = [];
    let end = this.buffer.indexOf("\r\n");

    while (end !== -1) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      this.pending.push(line);

      if (line.charAt(3) !== "-") {
        replies.push({
          code: Number(line.slice(0, 3)),
          lines: this.pending.splice(0).map(entry => entry.slice(4)),
        });
      }

      end = this.buffer.indexOf("\r\n");
    }

    return replies;
  }
}

export class SmtpError extends Error {
  constructor(
    readonly step: string,
    readonly reply: SmtpReply,
  ) {
    super(`SMTP ${step} : ${reply.code} ${reply.lines.join(" ")}`);
    this.name = "SmtpError";
  }
}

async function expect(
  connection: SmtpConnection,
  step: string,
  accepted: number,
): Promise<void> {
  const reply = await connection.reply();

  if (reply.code !== accepted) {
    throw new SmtpError(step, reply);
  }
}

async function command(
  connection: SmtpConnection,
  line: string,
  step: string,
  accepted: number,
): Promise<void> {
  await connection.send(line);
  await expect(connection, step, accepted);
}

/** Base64 d'une chaîne UTF-8 (`btoa` ne connaît que Latin-1). */
export function base64Utf8(text: string): string {
  let binary = "";

  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCodePoint(byte);
  }

  return btoa(binary);
}

/**
 * Dialogue complet d'un envoi. `data` est le message déjà formé
 * (`buildMessage`) ; son corps en base64 ne contient aucune ligne commençant
 * par un point, donc pas de « dot-stuffing » à faire.
 */
export async function deliver(
  connection: SmtpConnection,
  credentials: SmtpCredentials,
  envelope: Envelope,
  data: string,
): Promise<void> {
  try {
    await expect(connection, "accueil", 220);
    await command(connection, "EHLO house-mate.app", "EHLO", 250);
    await command(connection, "STARTTLS", "STARTTLS", 220);
    await connection.startTls();
    // Tout ce qui a été annoncé avant TLS est oublié : on se présente à nouveau.
    await command(connection, "EHLO house-mate.app", "EHLO chiffré", 250);
    const plain = base64Utf8(
      ["", credentials.login, credentials.key].join("\0"),
    );
    await command(connection, `AUTH PLAIN ${plain}`, "authentification", 235);
    await command(
      connection,
      `MAIL FROM:<${envelope.from}>`,
      "expéditeur",
      250,
    );
    await command(connection, `RCPT TO:<${envelope.to}>`, "destinataire", 250);
    await command(connection, "DATA", "DATA", 354);
    await command(connection, `${data}\r\n.`, "message", 250);
    await connection.send("QUIT");
  } finally {
    await connection.close();
  }
}

export interface Message {
  /** « Nom <adresse> ». */
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly date: Date;
  readonly messageId: string;
}

/** Un en-tête hors ASCII, encodé selon la RFC 2047. */
function encodedWord(text: string): string {
  // Le nom d'expéditeur et le sujet contiennent des accents : on encode tout
  // ce qui n'est pas de l'ASCII imprimable.
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${base64Utf8(text)}?=`;
}

/** « Nom <adresse> » : seul le nom est encodé, l'adresse reste telle quelle. */
function encodedAddress(address: string): string {
  const open = address.lastIndexOf("<");

  if (open === -1 || !address.endsWith(">")) {
    return address;
  }

  const name = address.slice(0, open).trim();

  return `${encodedWord(name)} ${address.slice(open)}`;
}

/** Le message complet, en-têtes et corps, lignes terminées par CRLF. */
export function buildMessage(message: Message): string {
  const body = base64Utf8(message.text.replace(/\r?\n/g, "\r\n"));
  const lines = body.match(/.{1,76}/g) ?? [];

  return [
    `From: ${encodedAddress(message.from)}`,
    `To: ${message.to}`,
    `Subject: ${encodedWord(message.subject)}`,
    `Date: ${message.date.toUTCString()}`,
    `Message-ID: <${message.messageId}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    ...lines,
  ].join("\r\n");
}

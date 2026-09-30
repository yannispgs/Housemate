import { describe, expect, it } from "vitest";
import {
  base64Utf8,
  buildMessage,
  deliver,
  ReplyReader,
  type SmtpConnection,
  SmtpError,
  type SmtpReply,
} from "./smtp";

function reply(code: number, text = "ok"): SmtpReply {
  return { code, lines: [text] };
}

/** Une connexion qui rejoue des réponses et note ce qu'on lui envoie. */
function fakeConnection(replies: SmtpReply[]) {
  const sent: string[] = [];
  const events: string[] = [];
  const connection: SmtpConnection = {
    async send(line) {
      sent.push(line);
    },
    async reply() {
      const next = replies.shift();

      if (next === undefined) {
        throw new Error("plus de réponse");
      }

      return next;
    },
    async startTls() {
      events.push("tls");
    },
    async close() {
      events.push("close");
    },
  };

  return { connection, sent, events };
}

const HAPPY = [220, 250, 220, 250, 235, 250, 250, 354, 250].map(code =>
  reply(code),
);

function decode(base64: string): string {
  return new TextDecoder().decode(
    Uint8Array.from(atob(base64), char => char.charCodeAt(0)),
  );
}

describe("ReplyReader", () => {
  it("assemble une réponse multi-ligne, même reçue en morceaux", () => {
    const reader = new ReplyReader();

    expect(reader.push("250-smtp-relay.brevo.com\r\n250-8BIT")).toEqual([]);
    expect(reader.push("MIME\r\n250 STARTTLS\r\n")).toEqual([
      {
        code: 250,
        lines: ["smtp-relay.brevo.com", "8BITMIME", "STARTTLS"],
      },
    ]);
  });

  it("rend plusieurs réponses arrivées d'un coup", () => {
    const reader = new ReplyReader();

    const replies = reader.push("220 prêt\r\n250 ok\r\n");

    expect(replies.map(entry => entry.code)).toEqual([220, 250]);
  });
});

describe("deliver", () => {
  it("dialogue dans l'ordre, passe en TLS avant de s'authentifier", async () => {
    const { connection, sent, events } = fakeConnection([...HAPPY]);

    await deliver(
      connection,
      { login: "compte@smtp-brevo.com", key: "clé" },
      { from: "noreply@house-mate.app", to: "moi@example.org" },
      "Subject: essai\r\n\r\ncorps",
    );

    expect(sent.map(line => line.split(" ")[0])).toEqual([
      "EHLO",
      "STARTTLS",
      "EHLO",
      "AUTH",
      "MAIL",
      "RCPT",
      "DATA",
      "Subject:",
      "QUIT",
    ]);
    expect(sent[3]).toBe(
      `AUTH PLAIN ${base64Utf8("\0compte@smtp-brevo.com\0clé")}`,
    );
    expect(sent[4]).toBe("MAIL FROM:<noreply@house-mate.app>");
    expect(sent[5]).toBe("RCPT TO:<moi@example.org>");
    expect(sent[7]?.endsWith("\r\n.")).toBe(true);
    expect(events).toEqual(["tls", "close"]);
  });

  it("s'arrête à la première réponse refusée, en le disant, et ferme", async () => {
    const replies = [...HAPPY];
    replies[4] = { code: 535, lines: ["5.7.8 Authentication failed"] };
    const { connection, events } = fakeConnection(replies);

    const sending = deliver(
      connection,
      { login: "compte", key: "périmée" },
      { from: "a@b.c", to: "d@e.f" },
      "x",
    );

    await expect(sending).rejects.toThrow(SmtpError);
    await expect(sending).rejects.toThrow(
      "SMTP authentification : 535 5.7.8 Authentication failed",
    );
    expect(events).toEqual(["tls", "close"]);
  });
});

describe("buildMessage", () => {
  const message = buildMessage({
    from: "HouseMate <noreply@house-mate.app>",
    to: "moi@example.org",
    subject: "Gel possible dans la véranda",
    text: "Chauffer ce soir.\n−2,5 °C",
    date: new Date("2026-12-14T19:02:00Z"),
    messageId: "abc@house-mate.app",
  });
  const [head = "", body = ""] = message.split("\r\n\r\n");

  it("encode le sujet accentué et garde les adresses lisibles", () => {
    expect(head).toContain("From: HouseMate <noreply@house-mate.app>");
    expect(head).toContain(
      `Subject: =?UTF-8?B?${base64Utf8("Gel possible dans la véranda")}?=`,
    );
    expect(head).toContain("Date: Mon, 14 Dec 2026 19:02:00 GMT");
    expect(head).toContain("Content-Transfer-Encoding: base64");
  });

  it("transporte le texte à l'identique, fins de ligne en CRLF", () => {
    expect(decode(body.split("\r\n").join(""))).toBe(
      "Chauffer ce soir.\r\n−2,5 °C",
    );
  });

  it("accepte un corps vide et une adresse sans nom", () => {
    const empty = buildMessage({
      from: "noreply@house-mate.app",
      to: "d@e.f",
      subject: "s",
      text: "",
      date: new Date(0),
      messageId: "m",
    });

    expect(empty).toContain("From: noreply@house-mate.app\r\n");
    // En-têtes, puis la ligne vide qui les sépare d'un corps vide.
    expect(empty.endsWith("Content-Transfer-Encoding: base64\r\n")).toBe(true);
  });

  it("coupe le corps en lignes de 76 caractères au plus", () => {
    const long = buildMessage({
      from: "a@b.c",
      to: "d@e.f",
      subject: "s",
      text: "x".repeat(500),
      date: new Date(0),
      messageId: "m",
    });

    const lines = (long.split("\r\n\r\n")[1] ?? "").split("\r\n");

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every(line => line.length <= 76)).toBe(true);
  });
});

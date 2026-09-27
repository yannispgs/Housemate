import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseMeterStatus, SwitchBotError, signedHeaders } from "./switchbot";

describe("signedHeaders", () => {
  it("signe token + t + nonce en HMAC-SHA256, encodé en base64", async () => {
    const credentials = { token: "jeton", secret: "secret" };
    const headers = await signedHeaders(credentials, 1_700_000_000_000, "n-1");
    // Même calcul par une autre implémentation, celle de Node.
    const expected = createHmac("sha256", "secret")
      .update("jeton1700000000000n-1")
      .digest("base64");

    expect(headers).toEqual({
      Authorization: "jeton",
      sign: expected,
      t: "1700000000000",
      nonce: "n-1",
    });
  });
});

describe("parseMeterStatus", () => {
  it("lit température et humidité", () => {
    const reading = parseMeterStatus({
      statusCode: 100,
      message: "success",
      body: { temperature: 20.4, humidity: 58 },
    });

    expect(reading).toEqual({ temperature: 20.4, humidity: 58 });
  });

  it("garde une température négative", () => {
    const reading = parseMeterStatus({
      statusCode: 100,
      body: { temperature: -3.2, humidity: 91 },
    });

    expect(reading.temperature).toBe(-3.2);
  });

  it("refuse un échec déguisé en HTTP 200", () => {
    expect(() =>
      parseMeterStatus({ statusCode: 161, message: "device offline" }),
    ).toThrow(SwitchBotError);
  });

  it("refuse une réponse sans température", () => {
    expect(() => parseMeterStatus({ statusCode: 100, body: {} })).toThrow(
      /sans température/,
    );
  });

  it("écarte une humidité aberrante sans perdre la température", () => {
    const reading = parseMeterStatus({
      statusCode: 100,
      body: { temperature: 5, humidity: 140 },
    });

    expect(reading).toEqual({ temperature: 5, humidity: null });
  });
});

import { describe, expect, it } from "vitest";
import { keyToBytes } from "./push.js";

describe("keyToBytes", () => {
  it("decodifica una chiave base64url (senza riempimento) in byte", () => {
    const bytes = keyToBytes(Buffer.from([4, 250, 251, 252, 253, 254, 255]).toString("base64url"));
    expect([...bytes]).toEqual([4, 250, 251, 252, 253, 254, 255]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: null }));
const { api, ApiError } = await import("./api.js");

// Risposta del server in streaming, divisa in pezzi di `size` byte (righe e
// lettere accentate spezzate a metà, come in rete).
function sse(events, { size = 5, cut = false } = {}) {
  const bytes = new TextEncoder().encode(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""));
  let at = 0;
  return new Response(
    new ReadableStream({
      pull(c) {
        if (at < bytes.length) c.enqueue(bytes.slice(at, (at += size)));
        else if (cut) c.error(new Error("rete"));
        else c.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } },
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("domanda in streaming", () => {
  it("i pezzi della risposta arrivano a onDelta; alla fine il risultato completo", async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { type: "delta", answer: "Città", sources: [] },
        { type: "delta", answer: "Città è [1]", sources: ["a"] },
        { type: "done", answer: "Città è bella [1].", sufficient: true, sources: [{ id: "a", quote: "" }], consulted: 2 },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const deltas = [];
    const r = await api.ask("q", [{ id: "a" }], [], 1, [], (d) => deltas.push(d.answer));
    expect(deltas).toEqual(["Città", "Città è [1]"]);
    expect(r).toEqual({ answer: "Città è bella [1].", sufficient: true, sources: [{ id: "a", quote: "" }], consulted: 2 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ action: "ask", stream: true });
  });

  it("errore del servizio AI durante lo streaming: errore con il messaggio del server", async () => {
    vi.stubGlobal("fetch", async () => sse([{ type: "error", status: 429, error: "Limite gratuito del servizio AI raggiunto: riprova più tardi." }]));
    const e = await api.ask("q", [{ id: "a" }], [], 1, [], () => {}).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 429, message: "Limite gratuito del servizio AI raggiunto: riprova più tardi." });
  });

  it("connessione caduta prima della fine: lo dice, senza risultato a metà", async () => {
    vi.stubGlobal("fetch", async () => sse([{ type: "delta", answer: "Uno", sources: [] }], { cut: true }));
    await expect(api.ask("q", [{ id: "a" }], [], 1, [], () => {})).rejects.toThrow("Risposta interrotta: riprova.");
    vi.stubGlobal("fetch", async () => sse([{ type: "delta", answer: "Uno", sources: [] }]));
    await expect(api.ask("q", [{ id: "a" }], [], 1, [], () => {})).rejects.toThrow("Risposta interrotta: riprova.");
  });

  it("risposta JSON (errore prima dello streaming o server precedente): vale come sempre", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "Accesso non autorizzato." }), { status: 401, headers: { "content-type": "application/json" } }));
    await expect(api.ask("q", [{ id: "a" }], [], 1, [], () => {})).rejects.toMatchObject({ status: 401, message: "Accesso non autorizzato." });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ answer: "Sì [1].", sufficient: true, sources: [] }), { headers: { "content-type": "application/json" } }));
    await expect(api.ask("q", [{ id: "a" }], [], 1, [], () => {})).resolves.toEqual({ answer: "Sì [1].", sufficient: true, sources: [] });
  });

  it("senza onDelta: domanda normale, senza streaming", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ answer: "x", sufficient: false, sources: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await api.ask("q", [{ id: "a" }]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("stream");
  });
});

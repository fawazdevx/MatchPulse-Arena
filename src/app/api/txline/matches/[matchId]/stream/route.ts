import { getTxLineAdapter } from "@/services/txline";
import { getTxLineReadiness } from "@/lib/server/env";
import { TxLineSetupError } from "@/services/txline";

const encoder = new TextEncoder();

function encodeEvent(event: string, payload: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export async function GET(request: Request, context: { params: { matchId: string } }) {
  const readiness = getTxLineReadiness();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encodeEvent("connected", {
          mode: new URL(request.url).searchParams.get("mode") ?? "replay",
          provider: readiness.provider,
          adapter: readiness.adapter,
          network: readiness.network,
          liveReady: readiness.ready,
          connectedAt: new Date().toISOString()
        })
      );

      try {
        for await (const tick of getTxLineAdapter().getReplayTicks(context.params.matchId)) {
          controller.enqueue(encodeEvent("tick", tick));
        }

        controller.enqueue(
          encodeEvent("complete", {
            completedAt: new Date().toISOString()
          })
        );
      } catch (error) {
        controller.enqueue(
          encodeEvent("error", {
            message:
              error instanceof TxLineSetupError
                ? "TxLINE live mode needs server credentials. Set TXLINE_ADAPTER=mock for replay mode or configure live credentials."
                : error instanceof Error
                  ? error.message
                  : "Stream failed"
          })
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

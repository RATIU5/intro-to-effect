import { Effect, Schedule, Duration, Schema } from "effect";
import {
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";

export const makeJsonHttpClient = Effect.gen(function* () {
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest((request) =>
      HttpClientRequest.setHeaders(request, {
        "Accept": "application/json",
        "User-Agent": "EffectIntroduction/1.0.0"
      })
    ),
    HttpClient.tapRequest((request) =>
      Effect.logDebug("Attempting HTTP Request", {
        url: request.url,
        method: request.method,
        headers: {
          Accept: request.headers?.["Accept"] ?? request.headers?.["accept"],
        },
      }),
    ),
    HttpClient.retryTransient({
      times: 3,
      schedule: Schedule.exponential(Duration.seconds(1)).pipe(
        Schedule.jittered,
        Schedule.tapOutput((delayAmount) =>
          Effect.logWarning(
            `HTTP request transient failure. Next retry will be after a delay of ~${Duration.toMillis(
              delayAmount,
            )}ms.`,
          ),
        ),
      ),
    }),
  );

  const finalClient = HttpClient.make(
    (request: HttpClientRequest.HttpClientRequest) => {
      return client.execute(request).pipe(
        Effect.timeoutFail({
          duration: Duration.seconds(15),
          onTimeout: () =>
            new HttpClientError.RequestError({
              request,
              reason: "Transport",
              description:
                "Request timed out after all retry attempts or during initial attempt.",
            }),
        }),
        Effect.filterOrFail(
          (response: HttpClientResponse.HttpClientResponse) =>
            response.status >= 200 && response.status < 300,
          (response: HttpClientResponse.HttpClientResponse) =>
            new HttpClientError.ResponseError({
              request,
              response,
              reason: "StatusCode",
              description: `Request failed with status ${response.status}`,
            }),
        ),
        Effect.tap((response) =>
          Effect.logDebug("HTTP Request Succeeded", {
            status: response.status,
            url: request.url,
          }),
        ),
        Effect.tapErrorCause((cause) =>
          Effect.logError("HTTP Request Failed", {
            cause,
            url: request.url,
          }),
        ),
      );
    },
  );

  return {
    httpClient: finalClient,
  } as const;
});
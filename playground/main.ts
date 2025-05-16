import { Effect, Layer, Logger, LogLevel } from "effect";
import { NodeHttpClient, NodeRuntime } from "@effect/platform-node";
import { JokeClient } from "./joke-effect.js";

const program = JokeClient.program.pipe(
  Effect.tap((dadJoke) =>
    Effect.logDebug("Successfully fetched and parsed dad joke:", {
      id: dadJoke.id,
      joke: dadJoke.joke,
    }),
  ),

  Effect.catchTags({
    ParseError: Effect.fn(() => {
      Effect.logError("Failed to parse dad joke. Returning fallback joke.");
      return Effect.succeed(JokeClient.fallbackJoke);
    }),
    RequestError: Effect.fn(() => {
      Effect.logError("Failed to fetch dad joke. Returning fallback joke.");
      return Effect.succeed(JokeClient.fallbackJoke);
    }),
    ResponseError: Effect.fn((e) => {
      Effect.logError("Failed to fetch dad joke. Returning fallback joke.", {
        cause: e.cause,
      });
      return Effect.succeed(JokeClient.fallbackJoke);
    }),
  }),

  Effect.tap((finalJoke) =>
    console.log(finalJoke.joke),
  ),
);

const AppLayer = JokeClient.layer.pipe(
  Layer.provide(NodeHttpClient.layer),
  Layer.provide(Logger.minimumLogLevel(LogLevel.Debug)),
);

NodeRuntime.runMain(program.pipe(Effect.provide(AppLayer)));

import { Effect, Layer, Schema } from "effect";
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { makeJsonHttpClient } from "./request-effect";

const DadJokeSchema = Schema.Struct({
  id: Schema.String,
  joke: Schema.String,
  status: Schema.Number,
});

type DadJoke = typeof DadJokeSchema.Type;

export const JokeClient = {
  layer: Layer.effect(
    HttpClient.HttpClient,
    makeJsonHttpClient.pipe(Effect.map(({ httpClient }) => httpClient)),
  ),

  program: Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const request = HttpClientRequest.get("https://icanhazdadjoke.com/");
    const response = yield* client.execute(request);
    const dadJoke = yield* HttpClientResponse.schemaBodyJson(DadJokeSchema)(
      response,
    );
    return dadJoke;
  }),

  fallbackJoke: {
    id: "0000000000",
    joke: "Why don't skeletons fight each other? They don't have the guts.",
    status: 200,
  } as DadJoke,
}
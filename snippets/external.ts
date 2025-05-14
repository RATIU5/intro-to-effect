/* eslint-disable no-console */

// #region joke1
export async function getJoke() {
  const response = await fetch("https://icanhazdadjoke.com", {
    headers: {
      Accept: "application/json",
    },
  });
  const json = await response.json();
  return json.joke;
}
// #endregion joke1

// #region joke2
const DEBUG_LOGGING: boolean = true;
const MAX_FETCH_RETRIES: number = 2;
const INITIAL_RETRY_DELAY_MS: number = 1000;
const EXPONENTIAL_BACKOFF_FACTOR: number = 2;
const REQUEST_TIMEOUT_MS: number = 8000;
const FALLBACK_JOKE: string = "No joke found";
const JOKE_API_URL: string = "https://icanhazdadjoke.com";

let isCurrentlyRateLimited: boolean = false;
let rateLimitReleaseTime: number = 0;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS: number = 60 * 1000;

type LogLevel = "info" | "warn" | "error" | "debug";

type JokeResult = {
  joke: string;
  error: string | null;
  success: boolean;
};

type ApiJoke = {
  id: string;
  joke: string;
};

function log(level: LogLevel, ...args: any[]): void {
  if (DEBUG_LOGGING || level === "error" || level === "warn") {
    const timestamp: string = new Date().toISOString();
    if (typeof console[level] === "function") {
      console[level](
        `[${timestamp}] [JOKE_API] [${level.toUpperCase()}]`,
        ...args,
      );
    } else {
      console.log(
        `[${timestamp}] [JOKE_API] [${level.toUpperCase()}]`,
        ...args,
      );
    }
  }
}

export async function getJoke2(): Promise<JokeResult> {
  log("info", "Attempting to fetch a new joke.");

  if (isCurrentlyRateLimited && Date.now() < rateLimitReleaseTime) {
    const timeLeft: number = Math.ceil(
      (rateLimitReleaseTime - Date.now()) / 1000,
    );
    const errorMessage: string = `Rate limited by a previous request. Please try again in about ${timeLeft} seconds.`;
    log("warn", errorMessage);
    return { joke: FALLBACK_JOKE, error: errorMessage, success: false };
  }

  if (isCurrentlyRateLimited && Date.now() >= rateLimitReleaseTime) {
    log("info", "Rate limit cooldown has passed. Resetting flag.");
    isCurrentlyRateLimited = false;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt++) {
    log(
      "info",
      `Workspace attempt ${attempt + 1} of ${MAX_FETCH_RETRIES + 1}.`,
    );

    const controller = new AbortController();
    const timeoutId: NodeJS.Timeout = setTimeout(() => {
      controller.abort();
      log(
        "warn",
        `Attempt ${
          attempt + 1
        }: Request timed out after ${REQUEST_TIMEOUT_MS}ms.`,
      );
    }, REQUEST_TIMEOUT_MS);

    try {
      const response: Response = await fetch(JOKE_API_URL, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      log(
        "debug",
        `Attempt ${attempt + 1}: Received response status ${response.status}.`,
      );

      if (response.status === 429) {
        log(
          "warn",
          `Attempt ${attempt + 1}: Rate limited by API (status 429).`,
        );
        isCurrentlyRateLimited = true;
        const retryAfterHeader: string | null =
          response.headers.get("Retry-After");
        let cooldownSeconds: number = DEFAULT_RATE_LIMIT_COOLDOWN_MS / 1000;
        if (retryAfterHeader) {
          const parsedRetryAfter: number = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsedRetryAfter)) {
            cooldownSeconds = parsedRetryAfter;
          }
        }
        rateLimitReleaseTime = Date.now() + cooldownSeconds * 1000;
        const errorMessage: string = `API rate limit hit. Try again after ${cooldownSeconds} seconds.`;
        log(
          "warn",
          errorMessage,
          `Retry-After header: ${retryAfterHeader || "not provided"}`,
        );
        return { joke: FALLBACK_JOKE, error: errorMessage, success: false };
      }

      if (!response.ok) {
        lastError = new Error(
          `API request failed with status ${response.status}: ${response.statusText}`,
        );
        log("warn", `Attempt ${attempt + 1}: ${lastError.message}`);
        if (response.status >= 400 && response.status < 500) {
          log(
            "error",
            `Client error ${response.status}. Not retrying this specific error.`,
          );
          return {
            joke: FALLBACK_JOKE,
            error: lastError.message,
            success: false,
          };
        }
        throw lastError;
      }

      let jsonData: ApiJoke;
      try {
        jsonData = (await response.json()) as ApiJoke;
        log(
          "debug",
          `Attempt ${attempt + 1}: JSON response parsed successfully.`,
        );
      } catch (jsonError: any) {
        clearTimeout(timeoutId);
        lastError = new Error(
          `Failed to parse JSON response: ${jsonError.message}`,
        );
        log("warn", `Attempt ${attempt + 1}: ${lastError.message}`);
        throw lastError;
      }

      if (
        jsonData &&
        typeof jsonData.joke === "string" &&
        jsonData.joke.trim().length > 0
      ) {
        log("info", "Joke fetched and validated successfully!", jsonData.joke);
        return { joke: jsonData.joke, error: null, success: true };
      } else {
        lastError = new Error("Invalid or empty joke format in API response.");
        log(
          "warn",
          `Attempt ${attempt + 1}: ${lastError.message}`,
          "Received data:",
          jsonData,
        );
        throw lastError;
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error.name === "AbortError") {
        log("warn", `Attempt ${attempt + 1} aborted due to timeout.`);
      } else if (error.message?.toLowerCase().includes("failed to fetch")) {
        log(
          "warn",
          `Attempt ${
            attempt + 1
          }: Network error (failed to fetch). This might be a temporary issue.`,
          error.message,
        );
      } else {
        log(
          "warn",
          `Attempt ${attempt + 1} encountered an error: ${error.message}`,
        );
      }

      if (attempt >= MAX_FETCH_RETRIES) {
        log("error", "All fetch attempts failed.");
        break;
      }

      const retryDelay: number =
        INITIAL_RETRY_DELAY_MS * Math.pow(EXPONENTIAL_BACKOFF_FACTOR, attempt);
      log(
        "info",
        `Waiting ${retryDelay}ms before next attempt (attempt ${attempt + 2}).`,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  const finalErrorMessage: string = `Failed to fetch joke after ${
    MAX_FETCH_RETRIES + 1
  } attempts. Last error: ${lastError ? lastError.message : "Unknown error"}`;
  log("error", finalErrorMessage);
  return { joke: FALLBACK_JOKE, error: finalErrorMessage, success: false };
}
// #endregion joke2
declare namespace Cloudflare {
  interface Env {
    RELAY_OVERVIEW_PASSWORD_HASH?: string;
    RELAY_OVERVIEW_SESSION_SECRET?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    RELAY_READ_ONLY?: string;
    RELAY_REDIRECT_URL?: string;
    RELAY_PUBLIC_URL?: string;
    RELAY_RUNTIME?: string;
    RELAY_RELEASE_SHA?: string;
  }
}

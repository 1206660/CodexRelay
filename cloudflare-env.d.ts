declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    RELAY_READ_ONLY?: string;
    RELAY_REDIRECT_URL?: string;
    RELAY_PUBLIC_URL?: string;
    RELAY_RUNTIME?: string;
    RELAY_RELEASE_SHA?: string;
  }
}

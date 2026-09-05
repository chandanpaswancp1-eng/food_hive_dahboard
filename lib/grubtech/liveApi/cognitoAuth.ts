import { AuthenticationDetails, CognitoUser, CognitoUserPool, type CognitoUserSession } from "amazon-cognito-identity-js";

interface CachedToken {
  token: string;
  expiresAt: number;
}

declare global {
  var __grubcenterTokenCache: CachedToken | undefined;
}

// Re-authenticate this long before the real 1-hour expiry so a slow tick
// never starts a fetch with a token that expires mid-request.
const REFRESH_MARGIN_MS = 5 * 60_000;

function decodeJwtExpiry(token: string): number {
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  return payload.exp * 1000;
}

function authenticate(): Promise<string> {
  const email = process.env.GRUBCENTER_EMAIL;
  const password = process.env.GRUBCENTER_PASSWORD;
  const userPoolId = process.env.GRUBCENTER_COGNITO_USER_POOL_ID;
  const clientId = process.env.GRUBCENTER_COGNITO_CLIENT_ID;

  if (!email || !password || !userPoolId || !clientId) {
    throw new Error(
      "Missing one of GRUBCENTER_EMAIL/GRUBCENTER_PASSWORD/GRUBCENTER_COGNITO_USER_POOL_ID/GRUBCENTER_COGNITO_CLIENT_ID",
    );
  }

  const pool = new CognitoUserPool({ UserPoolId: userPoolId, ClientId: clientId });
  const user = new CognitoUser({ Username: email, Pool: pool });
  const details = new AuthenticationDetails({ Username: email, Password: password });

  return new Promise((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: (session: CognitoUserSession) => {
        // GrubCenter's internal-api reads partner_id/brandIds/app_schema off
        // this token — those are custom claims that only exist on the ID
        // token (added via a Cognito pre-token-generation trigger), not the
        // access token. Confirmed by decoding a real captured bearer token
        // from the live portal, which carried exactly those claims.
        resolve(session.getIdToken().getJwtToken());
      },
      onFailure: (err) => {
        reject(
          new Error(
            `GrubCenter Cognito auth failed (${err?.message ?? err}). If this is an auth-flow-not-enabled error, ` +
              `the app client may require USER_PASSWORD_AUTH instead of SRP — run \`npm run discover:grubcenter\` ` +
              `to log in by hand and re-capture the real auth flow.`,
          ),
        );
      },
    });
  });
}

export async function getGrubCenterToken(): Promise<string> {
  const cached = globalThis.__grubcenterTokenCache;
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached.token;
  }

  const token = await authenticate();
  globalThis.__grubcenterTokenCache = { token, expiresAt: decodeJwtExpiry(token) };
  return token;
}

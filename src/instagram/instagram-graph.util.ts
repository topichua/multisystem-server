export const INSTAGRAM_OAUTH_PROVIDER = {
  facebook: "facebook",
  instagram: "instagram",
} as const;

export type InstagramOAuthProvider =
  (typeof INSTAGRAM_OAUTH_PROVIDER)[keyof typeof INSTAGRAM_OAUTH_PROVIDER];

export const INSTAGRAM_GRAPH_VERSION = "v25.0";

export function instagramGraphOrigin(
  provider?: string | null,
): "https://graph.instagram.com" | "https://graph.facebook.com" {
  return provider === INSTAGRAM_OAUTH_PROVIDER.instagram
    ? "https://graph.instagram.com"
    : "https://graph.facebook.com";
}

export function instagramGraphUrl(
  provider: string | null | undefined,
  resourcePath: string,
  version = INSTAGRAM_GRAPH_VERSION,
): string {
  const path = resourcePath.startsWith("/")
    ? resourcePath
    : `/${resourcePath}`;
  return `${instagramGraphOrigin(provider)}/${version}${path}`;
}

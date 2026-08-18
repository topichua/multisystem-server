export const INSTAGRAM_OAUTH_PROVIDER = {
  facebook: "facebook",
  instagram: "instagram",
} as const;

export type InstagramOAuthProvider =
  (typeof INSTAGRAM_OAUTH_PROVIDER)[keyof typeof INSTAGRAM_OAUTH_PROVIDER];

export const INSTAGRAM_GRAPH_VERSION = "v25.0";
export const INSTAGRAM_GRAPH_ORIGIN = "https://graph.instagram.com";

export function instagramGraphUrl(
  resourcePath: string,
  version = INSTAGRAM_GRAPH_VERSION,
): string {
  const path = resourcePath.startsWith("/")
    ? resourcePath
    : `/${resourcePath}`;
  return `${INSTAGRAM_GRAPH_ORIGIN}/${version}${path}`;
}

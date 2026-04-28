export interface InstagramWebhookPayload {
  object: 'instagram';
  entry: InstagramWebhookEntry[];
}

export interface InstagramWebhookEntry {
  time: number;
  id: string;
  messaging: InstagramWebhookMessagingItem[];
}

export interface InstagramWebhookReaction {
  mid?: string;
  action?: 'react' | 'unreact' | string;
  reaction?: string;
  emoji?: string;
}

export interface InstagramWebhookMessagingItem {
  timestamp?: number;
  read?: {
    mid: string;
  };
  message_edit?: {
    mid: string;
    num_edit: number;
  };
  sender?: { id: string };
  recipient?: { id: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
  };
  reaction?: InstagramWebhookReaction;
}

export function isInstagramWebhookPayload(
  value: unknown,
): value is InstagramWebhookPayload {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const o = value as Record<string, unknown>;
  if (o.object !== 'instagram') {
    return false;
  }
  if (!Array.isArray(o.entry)) {
    return false;
  }
  return true;
}

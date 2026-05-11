export type ContentType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'file'
  | 'sticker'
  | 'location'
  | 'contact_card'
  | 'ad'
  | 'view_once'
  | 'reaction'
  | 'poll'
  | 'unsupported';

export type ChannelType = 'whatsapp' | 'webchat' | 'instagram' | 'facebook' | 'api';

export type MessageDirection = 'incoming' | 'outgoing' | 'activity';

export interface MediaInfo {
  url: string;
  mimeType: string;
  filename?: string;
  size?: number;
  duration?: number;
  caption?: string;
  viewOnce: boolean;
  error?: string;
}

export interface InternalMessage {
  event: string;
  messageId: string;
  conversationId: number;
  contactId?: number;
  phone: string;
  inboxId: number;
  channelType: ChannelType;
  contentType: ContentType;
  botCode: string;
  messageType: MessageDirection;
  isPrivate: boolean;
  senderType?: string;
  labels: string[];
  text?: string;
  media?: MediaInfo;
  location?: { latitude: number; longitude: number; label?: string };
  contactCard?: { name: string; phone: string };
  adContext?: { title: string; sourceUrl: string };
  reaction?: { emoji: string; targetMessageId: string };
  timestamp: number;
}

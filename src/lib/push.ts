import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

const expo = new Expo();

/**
 * Send push notifications to one or more Expo push tokens.
 * Silently skips invalid tokens and logs errors per ticket.
 */
export async function sendPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  const valid = tokens.filter(t => Expo.isExpoPushToken(t));
  if (valid.length === 0) return;

  const messages: ExpoPushMessage[] = valid.map(to => ({
    to,
    sound: 'default',
    title,
    body,
    data,
    badge: 1,
    channelId: 'default',
  }));

  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);

      for (const ticket of tickets) {
        if (ticket.status === 'error') {
          console.error(`[PUSH] Ticket error: ${ticket.message}`);
        }
      }
    } catch (err) {
      console.error('[PUSH] Failed to send chunk:', err);
    }
  }
}

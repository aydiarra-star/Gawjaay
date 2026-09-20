import db, { cuid } from '../../lib/db';

/**
 * Canaux de notification (cahier §23) — abstraction UNIQUE pour INTERNAL / EMAIL / SMS / WHATSAPP / PUSH.
 *
 * Règle absolue : aucun envoi n'est jamais simulé. Un canal externe sans fournisseur réel
 * configuré est déclaré `NOT_CONNECTED` : `dispatch()` renvoie `NOT_SENT` pour ce canal, ne
 * marque rien comme envoyé et ne lève pas d'exception (le canal interne, lui, est toujours écrit).
 *
 * Brancher un fournisseur réel = implémenter `NotificationChannel.send()` pour ce canal avec ses
 * identifiants (variables d'environnement), puis l'enregistrer dans `CHANNELS` — sans toucher
 * aux appelants (`notify()`).
 */
export type ChannelName = 'INTERNAL' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';
export const CHANNEL_NAMES: ReadonlyArray<ChannelName> = ['INTERNAL', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'];

export interface NotificationMessage {
  userId: string;
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown> | null;
}

export interface ChannelResult {
  channel: ChannelName;
  status: 'SENT' | 'NOT_SENT';
  reason?: 'NOT_CONNECTED' | 'ERROR';
  notificationId?: string;
}

export interface ChannelStatus {
  channel: ChannelName;
  status: 'ACTIVE' | 'NOT_CONNECTED';
  provider: string | null;
  description: string;
}

export interface NotificationChannel {
  readonly name: ChannelName;
  readonly description: string;
  readonly provider: string | null;
  isConnected(): boolean;
  send(message: NotificationMessage): Promise<ChannelResult>;
}

/** Canal interne : ligne `notifications` lue par l'application (le seul canal branché en V3). */
class InternalChannel implements NotificationChannel {
  readonly name: ChannelName = 'INTERNAL';
  readonly description = 'Centre de notifications intégré (table notifications)';
  readonly provider = 'gawjaay-db';
  isConnected() { return true; }
  async send(m: NotificationMessage): Promise<ChannelResult> {
    const id = cuid();
    db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
      .run(id, m.userId, m.title, m.body, m.type, m.data ? JSON.stringify(m.data) : null, new Date().toISOString());
    return { channel: this.name, status: 'SENT', notificationId: id };
  }
}

/** Canal externe SANS fournisseur : jamais « envoyé », jamais d'exception. */
class NotConnectedChannel implements NotificationChannel {
  readonly provider = null;
  constructor(readonly name: ChannelName, readonly description: string) {}
  isConnected() { return false; }
  async send(): Promise<ChannelResult> {
    return { channel: this.name, status: 'NOT_SENT', reason: 'NOT_CONNECTED' };
  }
}

const CHANNELS: Record<ChannelName, NotificationChannel> = {
  INTERNAL: new InternalChannel(),
  EMAIL: new NotConnectedChannel('EMAIL', 'E-mail transactionnel — aucun fournisseur SMTP/API configuré'),
  SMS: new NotConnectedChannel('SMS', 'SMS — aucun agrégateur configuré'),
  WHATSAPP: new NotConnectedChannel('WHATSAPP', 'WhatsApp Business API — aucun compte configuré (les liens wa.me de partage restent disponibles)'),
  PUSH: new NotConnectedChannel('PUSH', 'Notifications push navigateur/mobile — aucune clé configurée'),
};

export function getChannel(name: ChannelName): NotificationChannel {
  return CHANNELS[name];
}

/** État des canaux, exposé à l'administration et au frontend (rien n'est présenté comme actif à tort). */
export function listChannels(): ChannelStatus[] {
  return CHANNEL_NAMES.map((n) => {
    const c = CHANNELS[n];
    return { channel: n, status: c.isConnected() ? 'ACTIVE' : 'NOT_CONNECTED', provider: c.provider, description: c.description };
  });
}

/**
 * Point d'entrée unique : écrit toujours le canal INTERNAL, puis tente les canaux externes demandés.
 * Retourne le résultat par canal (un canal NOT_CONNECTED renvoie NOT_SENT, sans exception).
 */
export async function notify(message: NotificationMessage, channels: ChannelName[] = ['INTERNAL']): Promise<ChannelResult[]> {
  const wanted = Array.from(new Set<ChannelName>(['INTERNAL', ...channels]));
  const results: ChannelResult[] = [];
  for (const name of wanted) {
    const channel = CHANNELS[name];
    if (!channel) continue;
    try {
      results.push(await channel.send(message));
    } catch (e) {
      if (name === 'INTERNAL') throw e; // l'écriture interne fait partie de la transaction métier
      results.push({ channel: name, status: 'NOT_SENT', reason: 'ERROR' });
    }
  }
  return results;
}

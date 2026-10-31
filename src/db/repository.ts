import { monotonicFactory } from 'ulid';
import type { Hlc } from './hlc';
import type { Chat2KnowDB } from './schema';
import type { Ask } from './types';

const stripHash = (url: string) => url.replace(/#.*$/, '');

/** The only write path to the database. */
export class Repository {
  private readonly ulid = monotonicFactory();

  constructor(
    private readonly db: Chat2KnowDB,
    readonly clock: Hlc,
    private readonly now: () => number = Date.now,
  ) {}

  // ------------------------------------------------------------ recorded questions (local only, not logged)

  async recordAsk(input: Omit<Ask, 'id' | 'sentAt'>): Promise<Ask> {
    const at = this.now();
    const ask: Ask = { ...input, conversationUrl: stripHash(input.conversationUrl), id: this.ulid(at), sentAt: at };
    await this.db.asks.add(ask);
    return ask;
  }

  /** Recorded questions, newest first. */
  async listAsks(): Promise<Ask[]> {
    return this.db.asks.orderBy('sentAt').reverse().toArray();
  }

  /** Deleting a question also deletes what was inferred from it. */
  private async deleteAsks(ids: string[]): Promise<void> {
    await this.db.transaction('rw', this.db.asks, this.db.askTags, async () => {
      await this.db.askTags.where('askId').anyOf(ids).delete();
      await this.db.asks.bulkDelete(ids);
    });
  }

  async deleteAsk(id: string): Promise<void> {
    await this.deleteAsks([id]);
  }

  async clearAsks(): Promise<void> {
    await this.deleteAsks(await this.db.asks.toCollection().primaryKeys());
  }

  async deleteConversationAsks(conversationUrl: string): Promise<void> {
    await this.deleteAsks(await this.db.asks.where('conversationUrl').equals(stripHash(conversationUrl)).primaryKeys());
  }

  async setAskVectors(rows: { id: string; vector: number[]; vectorModel: string }[]): Promise<void> {
    await this.db.transaction('rw', this.db.asks, async () => {
      for (const { id, vector, vectorModel } of rows) await this.db.asks.update(id, { vector, vectorModel });
    });
  }
}

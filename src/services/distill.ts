import type { LlmClient } from '@/src/llm/client';
import { distillPrompt, parseDistillation } from '@/src/llm/prompts';
import type { Repository } from '@/src/db/repository';

/**
 * Distills captured knowledge cards into a statement plus three question-title
 * candidates. Runs in the background after capture; the raw text is already
 * stored, so a failure only records the error on the card for a retry.
 */
export class Distiller {
  private readonly running = new Set<string>();

  constructor(
    private readonly repo: Repository,
    private readonly client: () => Promise<LlmClient | null>,
    private readonly onChange: () => void,
  ) {}

  async distill(nodeId: string): Promise<void> {
    if (this.running.has(nodeId)) return;
    this.running.add(nodeId); // claim before any await so concurrent calls cannot both run
    const client = await this.client();
    if (!client) {
      this.running.delete(nodeId); // model not configured yet: the card stays pending until settings are saved
      return;
    }
    try {
      const node = await this.repo.getNode(nodeId);
      if (!node?.body) throw new Error('Card has no text to distill');
      const result = await client.json(distillPrompt(node.body), parseDistillation);
      await this.repo.setDistillation(nodeId, result.summary, result.titles);
    } catch (err) {
      await this.repo.setDistillError(nodeId, err instanceof Error ? err.message : String(err));
    } finally {
      this.running.delete(nodeId);
      this.onChange();
    }
  }

  async retry(nodeId: string): Promise<void> {
    await this.repo.setDistillError(nodeId, undefined);
    this.onChange();
    await this.distill(nodeId);
  }

  /** Processes every card still waiting, one at a time. */
  async drain(): Promise<void> {
    for (const node of await this.repo.pendingDistills()) await this.distill(node.id);
  }
}

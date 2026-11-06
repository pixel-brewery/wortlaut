// #region Imports

import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type {
  McpActivity,
  McpClient,
  McpLevel,
  McpStatus,
  McpTool,
} from '@pixel-brewery/wortlaut-contracts';
import {
  AsyncValue,
  DesktopApi,
  formatInstant,
  RunCenter,
} from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * How long a copy button says so.
 */
const COPIED_MS = 2000;

/**
 * How many entries Recent activity shows.
 */
const ACTIVITY_LIMIT = 8;

/**
 * The levels in their order, with what each of them says. A level includes the ones before it.
 */
const LEVELS: ReadonlyArray<{
  id: McpLevel;
  label: string;
  badge: string;
  variant: 'neutral' | 'info' | 'warning';
  text: string;
}> = [
  {
    id: 'read',
    label: 'Read only',
    badge: 'Read',
    variant: 'neutral',
    text: 'Assistants can look and check. They cannot change anything.',
  },
  {
    id: 'propose',
    label: 'Propose changes',
    badge: 'Propose',
    variant: 'info',
    text: 'Assistants can look, check and suggest. Suggestions wait in the review list until you approve them.',
  },
  {
    id: 'write',
    label: 'Write',
    badge: 'Write',
    variant: 'warning',
    text: 'Assistants can also write to catalogs: they approve their own changes. Every change still appears in Runs.',
  },
];

/**
 * Owns MCP and plugins: what assistants may do, how to connect one, the tools and what assistants did. The server is another
 * process, so this view runs nothing: it sets the level and reads what the server left behind.
 */
@Injectable()
export class McpViewPresenter {
  // #region Fields

  private readonly _api = inject(DesktopApi);
  private readonly _center = inject(RunCenter);
  private readonly _clientId = signal<McpClient['id']>('claude-code');
  private readonly _copied = signal<string | null>(null);
  private readonly _message = signal<string | null>(null);
  private readonly _now = signal(new Date());
  private _seenFinished = 0;

  // #endregion

  // #region Ctor

  /**
   * Constructs a new instance of the `McpViewPresenter` class.
   */
  public constructor() {
    // A tool call of another process joins Recent activity as it happens, and proves that a client is connected.
    effect(() => {
      const finished = this._center.finished();

      untracked(() => {
        if (finished !== this._seenFinished) {
          this._seenFinished = finished;
          void this.refreshActivity();
        }
      });
    });
  }

  // #endregion

  // #region Properties

  /**
   * Gets what the app knows about the server.
   *
   * @readonly
   */
  public readonly status = new AsyncValue<McpStatus>(() => this._api.request('mcp.status', {}));

  /**
   * Gets how to connect each assistant.
   *
   * @readonly
   */
  public readonly clients = new AsyncValue<Array<McpClient>>(() =>
    this._api.request('mcp.clients', {}),
  );

  /**
   * Gets the tools of the server.
   *
   * @readonly
   */
  public readonly tools = new AsyncValue<Array<McpTool>>(() => this._api.request('mcp.tools', {}));

  /**
   * Gets what assistants did.
   *
   * @readonly
   */
  public readonly activity = new AsyncValue<Array<McpActivity>>(() =>
    this._api.request('mcp.activity', { limit: ACTIVITY_LIMIT }),
  );

  /**
   * Gets why the last action failed.
   *
   * @readonly
   */
  public readonly message = this._message.asReadonly();

  /**
   * Gets the code that was just copied.
   *
   * @readonly
   */
  public readonly copied = this._copied.asReadonly();

  /**
   * Gets the choices of the level.
   *
   * @readonly
   */
  public readonly levels = computed(() =>
    LEVELS.map(({ id, label }) => ({ id, label, isChecked: id === this.level() })),
  );

  /**
   * Gets what the active level means.
   *
   * @readonly
   */
  public readonly levelText = computed(
    () => LEVELS.find(({ id }) => id === this.level())?.text ?? '',
  );

  /**
   * Gets the tabs of the assistants.
   *
   * @readonly
   */
  public readonly clientTabs = computed(() =>
    (this.clients.value() ?? []).map(({ id, label }) => ({
      id,
      label,
      isSelected: id === this._clientId(),
    })),
  );

  /**
   * Gets the selected assistant.
   *
   * @readonly
   */
  public readonly client = computed(
    () => (this.clients.value() ?? []).find(({ id }) => id === this._clientId()) ?? null,
  );

  /**
   * Gets the rows of the table of tools. A tool above the level is dimmed.
   *
   * @readonly
   */
  public readonly toolRows = computed(() => {
    const rank = LEVELS.findIndex(({ id }) => id === this.level());

    return (this.tools.value() ?? []).map((tool) => {
      const needed = LEVELS.findIndex(({ id }) => id === tool.level);

      return {
        id: tool.id,
        description: tool.description,
        badge: LEVELS[needed].badge,
        variant: LEVELS[needed].variant,
        isAvailable: needed <= rank,
      };
    });
  });

  /**
   * Gets the count above the table of tools.
   *
   * @readonly
   */
  public readonly availability = computed(() => {
    const rows = this.toolRows();

    return `${rows.filter((row) => row.isAvailable).length} of ${rows.length} available`;
  });

  /**
   * Gets the rows of Recent activity.
   *
   * @readonly
   */
  public readonly activityRows = computed(() =>
    (this.activity.value() ?? []).map((entry) => ({
      id: entry.runId,
      tool: entry.tool,
      when: formatInstant(entry.startedAt, this._now()),
      line: `${entry.client} · ${entry.result}`,
    })),
  );

  // #endregion

  // #region Methods

  /**
   * Reads everything the view shows.
   *
   * @returns When it is read.
   */
  public async load(): Promise<void> {
    await this._center.connect();
    this._seenFinished = this._center.finished();
    this._now.set(new Date());
    await Promise.all([
      this.status.reload(),
      this.clients.reload(),
      this.tools.reload(),
      this.activity.reload(),
    ]);
  }

  /**
   * Sets what assistants may do. It holds for the next call of a server that is already running.
   *
   * @param level The level.
   * @returns When it is stored.
   */
  public async setLevel(level: McpLevel): Promise<void> {
    if (level === this.level()) {
      return;
    }

    this._message.set(null);

    try {
      await this._api.request('mcp.setLevel', { level });
      await this.status.reload();
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Opens the steps of an assistant.
   *
   * @param id The assistant.
   */
  public pickClient(id: McpClient['id']): void {
    this._clientId.set(id);
  }

  /**
   * Copies a command or a block of configuration.
   *
   * @param code The text.
   * @returns When it is copied.
   */
  public async copy(code: string): Promise<void> {
    try {
      await this._api.request('clipboard.writeText', { text: code });
      this._copied.set(code);
      setTimeout(() => {
        this._copied.set(null);
      }, COPIED_MS);
    } catch (error) {
      this._message.set(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * @private
   */
  private level(): McpLevel {
    return this.status.value()?.level ?? 'read';
  }

  /**
   * @private
   */
  private async refreshActivity(): Promise<void> {
    this._now.set(new Date());
    await Promise.all([this.activity.reload(), this.clients.reload()]);
  }

  // #endregion
}

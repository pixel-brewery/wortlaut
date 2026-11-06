// #region Imports

import { z } from 'zod';
import { RuleSeveritySchema } from '../rulepacks/RulePack.js';
import {
  AiDefaultsChangesSchema,
  AiDefaultsSchema,
  AiKeyNamesSchema,
  AiKeyTestSchema,
  AiModelsSchema,
  AiNameKeysRequestSchema,
  AiPatternProposalsSchema,
  AiProviderIdSchema,
  AiProviderSchema,
  AiSetKeyRequestSchema,
  AiSuggestPatternsRequestSchema,
  AiSuggestValueRequestSchema,
  AiValueProposalSchema,
  GenerateCommandSchema,
  GenerateDraftRequestSchema,
  GenerateEstimateSchema,
  GenerateOverviewSchema,
  GenerateRowChangeSchema,
  GenerateRowSchema,
  GenerateRunSchema,
  TestSampleRequestSchema,
  TestSampleSchema,
  TestTranslateRequestSchema,
  TestTranslationSchema,
} from './dto/AiDtos.js';
import {
  AppInfoSchema,
  AppSettingsSchema,
  AppSettingsViewSchema,
  FolderChoiceSchema,
  IdSchema,
  SavedFileSchema,
  ShellStateSchema,
} from './dto/ShellDtos.js';
import {
  CatalogKeyDetailSchema,
  CatalogKeysRequestSchema,
  CatalogKeysSchema,
  CatalogOverviewSchema,
} from './dto/CatalogDtos.js';
import {
  ActiveRunSchema,
  AnalyzeOverviewSchema,
  DetectApplyRequestSchema,
  DetectSettingsSchema,
  ExceptionListNameSchema,
  ExceptionsSchema,
  RunAllRequestSchema,
  RunBatchSchema,
  RunResultSchema,
  RunStartRequestSchema,
  TransformOverviewSchema,
  WriteOutcomeSchema,
} from './dto/CommandDtos.js';
import {
  EffectiveSettingsSchema,
  LabeledCommandSchema,
  NxTargetsSchema,
  SettingsSourceFileSchema,
} from './dto/ConfigDtos.js';
import {
  McpActivitySchema,
  McpClientSchema,
  McpLevelRequestSchema,
  McpStatusSchema,
  McpToolSchema,
} from './dto/McpDtos.js';
import { LocaleTagSchema } from '../settings/ProjectOptions.js';
import {
  ProjectInspectionSchema,
  ProjectInspectRequestSchema,
  ProjectListSchema,
  ProjectRegisterRequestSchema,
  ProjectRegisterResultSchema,
  ProjectSettingsChangesSchema,
  ProjectSettingsSchema,
  ProjectSummarySchema,
} from './dto/ProjectDtos.js';
import {
  ReviewDetailRequestSchema,
  ReviewDetailSchema,
  ReviewItemSchema,
} from './dto/ReviewDtos.js';
import {
  RulePackAvailableSchema,
  RulePackCheckSchema,
  RulePackEntrySchema,
  RulePackSourceRequestSchema,
  RulePackTargetSchema,
  RulePackUpdateSchema,
  RulePackWriteSchema,
} from './dto/RulePackDtos.js';
import { RunDetailSchema, RunSummarySchema } from './dto/RunDtos.js';
import { SearchQueryRequestSchema, SearchResultsSchema } from './dto/SearchDtos.js';
import {
  TestDetectRequestSchema,
  TestDetectResultSchema,
  TestPatternRequestSchema,
  TestPatternResultSchema,
  TestPresetSchema,
} from './dto/TestLabDtos.js';
import {
  WorkspaceCardSchema,
  WorkspaceCreateRequestSchema,
  WorkspaceCreateResultSchema,
  WorkspaceDetailSchema,
  WorkspaceExportResultSchema,
  WorkspaceImportChoiceSchema,
  WorkspaceImportRequestSchema,
  WorkspaceImportResultSchema,
  WorkspaceOpenResultSchema,
  WorkspaceRecentSchema,
  WorkspaceUpdateRequestSchema,
} from './dto/WorkspaceDtos.js';

// #endregion

/**
 * A request without a payload.
 */
const EmptySchema = z.strictObject({});

/**
 * A request about one project.
 */
const ProjectIdSchema = z.strictObject({ projectId: IdSchema });

/**
 * A request about one workspace.
 */
const WorkspaceIdSchema = z.strictObject({ workspaceId: IdSchema });

/**
 * A request about one run.
 */
const RunIdSchema = z.strictObject({ runId: IdSchema });

/**
 * A request about one change set.
 */
const ChangeSetIdSchema = z.strictObject({ id: IdSchema });

/**
 * A key of a catalog.
 */
const KeySchema = z.string().min(1).max(1000);

/**
 * Every request of the desktop app with its response. Each side validates what it receives: main the requests, the
 * preload the responses. No payload names a path: folders are opaque tokens from a native dialog, and stored things are
 * ids.
 *
 * @public
 */
export const IPC_CONTRACT = {
  'app.getInfo': { request: EmptySchema, response: AppInfoSchema },
  'app.getSettings': { request: EmptySchema, response: AppSettingsViewSchema },
  'app.saveSettings': { request: AppSettingsSchema, response: AppSettingsViewSchema },
  'search.query': { request: SearchQueryRequestSchema, response: SearchResultsSchema },
  'search.openFile': { request: z.strictObject({ id: IdSchema }), response: EmptySchema },
  'shell.state': { request: EmptySchema, response: ShellStateSchema },
  'shell.setProject': {
    request: z.strictObject({ projectId: IdSchema.nullable() }),
    response: ShellStateSchema,
  },
  'clipboard.writeText': {
    request: z.strictObject({ text: z.string().max(65536) }),
    response: EmptySchema,
  },
  'dialog.chooseFolder': {
    request: z.strictObject({
      insideToken: z.uuid().nullable(),
      insideProjectId: IdSchema.optional(),
    }),
    response: FolderChoiceSchema,
  },
  'ai.providers': { request: EmptySchema, response: z.array(AiProviderSchema) },
  'ai.checkLogin': {
    request: z.strictObject({ providerId: AiProviderIdSchema }),
    response: AiProviderSchema,
  },
  'ai.installHint': {
    request: z.strictObject({ providerId: AiProviderIdSchema }),
    response: z.strictObject({ text: z.string() }),
  },
  'ai.setKey': { request: AiSetKeyRequestSchema, response: AiProviderSchema },
  'ai.clearKey': {
    request: z.strictObject({ providerId: z.enum(['openai', 'google']) }),
    response: AiProviderSchema,
  },
  'ai.testKey': {
    request: z.strictObject({ providerId: z.enum(['openai', 'google']) }),
    response: AiKeyTestSchema,
  },
  'ai.models': {
    request: z.strictObject({ providerId: AiProviderIdSchema }),
    response: AiModelsSchema,
  },
  'ai.defaults': { request: ProjectIdSchema, response: AiDefaultsSchema },
  'ai.saveDefaults': {
    request: z.strictObject({ projectId: IdSchema, changes: AiDefaultsChangesSchema }),
    response: WriteOutcomeSchema,
  },
  'ai.setDefaultProvider': {
    request: z.strictObject({ providerId: AiProviderIdSchema.nullable() }),
    response: ShellStateSchema,
  },
  'ai.suggestValue': { request: AiSuggestValueRequestSchema, response: AiValueProposalSchema },
  'ai.nameKeys': { request: AiNameKeysRequestSchema, response: AiKeyNamesSchema },
  'ai.suggestPatterns': {
    request: AiSuggestPatternsRequestSchema,
    response: AiPatternProposalsSchema,
  },
  'ai.cancel': { request: z.strictObject({ requestId: z.uuid() }), response: EmptySchema },
  'generate.overview': { request: ProjectIdSchema, response: GenerateOverviewSchema },
  'generate.estimate': { request: GenerateDraftRequestSchema, response: GenerateEstimateSchema },
  'generate.prompt': {
    request: GenerateDraftRequestSchema,
    response: z.strictObject({ text: z.string() }),
  },
  'generate.command': { request: GenerateDraftRequestSchema, response: GenerateCommandSchema },
  'generate.addLocale': {
    request: z.strictObject({ projectId: IdSchema, locale: LocaleTagSchema }),
    response: WriteOutcomeSchema,
  },
  'generate.get': {
    request: z.strictObject({ runId: IdSchema, locale: z.string().max(40).nullable() }),
    response: GenerateRunSchema,
  },
  'generate.pause': { request: RunIdSchema, response: EmptySchema },
  'generate.resume': { request: RunIdSchema, response: EmptySchema },
  'generate.stop': { request: RunIdSchema, response: EmptySchema },
  'generate.again': { request: RunIdSchema, response: ActiveRunSchema },
  'generate.setRow': { request: GenerateRowChangeSchema, response: GenerateRowSchema },
  'generate.write': {
    request: z.strictObject({ runId: IdSchema, locale: z.string().max(40) }),
    response: WriteOutcomeSchema,
  },
  'test.sample': { request: TestSampleRequestSchema, response: TestSampleSchema },
  'test.translate': { request: TestTranslateRequestSchema, response: TestTranslationSchema },
  'test.translation': {
    request: z.strictObject({ id: IdSchema.nullable() }),
    response: TestTranslationSchema.nullable(),
  },
  'test.cancelTranslation': { request: z.strictObject({ id: IdSchema }), response: EmptySchema },
  'workspace.recent': { request: EmptySchema, response: z.array(WorkspaceRecentSchema) },
  'workspace.list': { request: EmptySchema, response: z.array(WorkspaceCardSchema) },
  'workspace.get': { request: WorkspaceIdSchema, response: WorkspaceDetailSchema },
  'workspace.create': {
    request: WorkspaceCreateRequestSchema,
    response: WorkspaceCreateResultSchema,
  },
  'workspace.open': { request: WorkspaceIdSchema, response: WorkspaceOpenResultSchema },
  'project.inspectFolder': {
    request: ProjectInspectRequestSchema,
    response: ProjectInspectionSchema,
  },
  'project.register': {
    request: ProjectRegisterRequestSchema,
    response: ProjectRegisterResultSchema,
  },
  'project.list': { request: WorkspaceIdSchema, response: ProjectListSchema },
  'project.summary': { request: ProjectIdSchema, response: ProjectSummarySchema },
  'project.settings': { request: ProjectIdSchema, response: ProjectSettingsSchema },
  'config.getEffective': { request: ProjectIdSchema, response: EffectiveSettingsSchema },
  'config.getSourceFile': { request: ProjectIdSchema, response: SettingsSourceFileSchema },
  'config.openSourceFile': { request: ProjectIdSchema, response: EmptySchema },
  'config.exportRun': {
    request: z.strictObject({ workspaceId: IdSchema, projectId: IdSchema.nullable() }),
    response: SavedFileSchema,
  },
  'nx.targets': { request: ProjectIdSchema, response: NxTargetsSchema },
  'cli.commands': {
    request: z.strictObject({ projectId: IdSchema.nullable() }),
    response: z.array(LabeledCommandSchema),
  },
  'mcp.status': { request: EmptySchema, response: McpStatusSchema },
  'mcp.setLevel': { request: McpLevelRequestSchema, response: McpStatusSchema },
  'mcp.clients': { request: EmptySchema, response: z.array(McpClientSchema) },
  'mcp.tools': { request: EmptySchema, response: z.array(McpToolSchema) },
  'mcp.activity': {
    request: z.strictObject({ limit: z.number().int().positive().max(50) }),
    response: z.array(McpActivitySchema),
  },
  'run.list': {
    request: z.strictObject({
      projectId: IdSchema.nullable(),
      limit: z.number().int().positive().max(200).nullable(),
    }),
    response: z.array(RunSummarySchema),
  },
  'run.get': { request: RunIdSchema, response: RunDetailSchema },
  'app.setDryRun': { request: z.strictObject({ dryRun: z.boolean() }), response: ShellStateSchema },
  'run.start': { request: RunStartRequestSchema, response: ActiveRunSchema },
  'run.startAll': { request: RunAllRequestSchema, response: z.array(ActiveRunSchema) },
  'run.batch': { request: WorkspaceIdSchema, response: RunBatchSchema.nullable() },
  'run.cancelBatch': { request: z.strictObject({ batchId: IdSchema }), response: EmptySchema },
  'run.cancel': { request: RunIdSchema, response: EmptySchema },
  'run.repeat': { request: RunIdSchema, response: ActiveRunSchema },
  'run.active': { request: EmptySchema, response: z.array(ActiveRunSchema) },
  'run.result': { request: RunIdSchema, response: RunResultSchema.nullable() },
  'run.latest': {
    request: z.strictObject({
      projectId: IdSchema,
      command: z.enum(['detect', 'analyze', 'transform', 'sort', 'generate']),
    }),
    response: RunResultSchema.nullable(),
  },
  'run.print': {
    request: RunStartRequestSchema,
    response: z.strictObject({ command: z.string() }),
  },
  'detect.settings': { request: ProjectIdSchema, response: DetectSettingsSchema },
  'detect.apply': { request: DetectApplyRequestSchema, response: WriteOutcomeSchema },
  'analyze.overview': { request: ProjectIdSchema, response: AnalyzeOverviewSchema },
  'transform.overview': { request: ProjectIdSchema, response: TransformOverviewSchema },
  'config.exceptions': { request: ProjectIdSchema, response: ExceptionsSchema },
  'config.addException': {
    request: z.strictObject({
      projectId: IdSchema,
      list: ExceptionListNameSchema,
      entry: z.string().min(1).max(2000),
    }),
    response: WriteOutcomeSchema,
  },
  'config.addRuleException': {
    request: z.strictObject({ projectId: IdSchema, rule: z.string().max(120), key: KeySchema }),
    response: WriteOutcomeSchema,
  },
  'config.update': {
    request: z.strictObject({ projectId: IdSchema, changes: ProjectSettingsChangesSchema }),
    response: WriteOutcomeSchema,
  },
  'rulePack.check': {
    request: z.strictObject({ source: RulePackSourceRequestSchema }),
    response: RulePackCheckSchema,
  },
  'rulePack.install': {
    request: z.strictObject({ checkId: IdSchema, target: RulePackTargetSchema }),
    response: RulePackWriteSchema,
  },
  'rulePack.list': { request: WorkspaceIdSchema, response: z.array(RulePackEntrySchema) },
  'rulePack.available': { request: WorkspaceIdSchema, response: z.array(RulePackAvailableSchema) },
  'rulePack.setEnabled': {
    request: z.strictObject({ workspaceId: IdSchema, packId: IdSchema, enabled: z.boolean() }),
    response: RulePackWriteSchema,
  },
  'rulePack.setSeverity': {
    request: z.strictObject({
      workspaceId: IdSchema,
      ruleId: IdSchema,
      severity: RuleSeveritySchema,
    }),
    response: RulePackWriteSchema,
  },
  'rulePack.checkUpdate': {
    request: z.strictObject({ workspaceId: IdSchema, packId: IdSchema }),
    response: RulePackUpdateSchema,
  },
  'rulePack.update': {
    request: z.strictObject({ workspaceId: IdSchema, updateId: IdSchema }),
    response: RulePackWriteSchema,
  },
  'catalog.overview': {
    request: z.strictObject({ projectId: IdSchema, refresh: z.boolean() }),
    response: CatalogOverviewSchema,
  },
  'catalog.keys': { request: CatalogKeysRequestSchema, response: CatalogKeysSchema },
  'catalog.keyDetail': {
    request: z.strictObject({
      projectId: IdSchema,
      key: KeySchema,
      targetLocale: z.string().max(40).nullable(),
    }),
    response: CatalogKeyDetailSchema,
  },
  'catalog.setValue': {
    request: z.strictObject({
      projectId: IdSchema,
      key: KeySchema,
      locale: z.string().max(40),
      value: z.string().max(100000),
    }),
    response: WriteOutcomeSchema,
  },
  'catalog.setComment': {
    request: z.strictObject({
      projectId: IdSchema,
      key: KeySchema,
      locale: z.string().max(40),
      comment: z.string().max(10000),
    }),
    response: WriteOutcomeSchema,
  },
  'catalog.deleteKey': {
    request: z.strictObject({ projectId: IdSchema, key: KeySchema }),
    response: WriteOutcomeSchema,
  },
  'catalog.mergeKeys': {
    request: z.strictObject({
      projectId: IdSchema,
      keep: KeySchema,
      remove: z.array(KeySchema).min(1).max(256),
    }),
    response: WriteOutcomeSchema,
  },
  'catalog.addLocale': {
    request: z.strictObject({ projectId: IdSchema, locale: LocaleTagSchema }),
    response: WriteOutcomeSchema,
  },
  'catalog.openFile': {
    request: z.strictObject({ projectId: IdSchema, locale: z.string().max(40) }),
    response: EmptySchema,
  },
  'test.presets': {
    request: z.strictObject({ projectId: IdSchema.nullable() }),
    response: z.array(TestPresetSchema),
  },
  'test.detect': { request: TestDetectRequestSchema, response: TestDetectResultSchema },
  'test.pattern': { request: TestPatternRequestSchema, response: TestPatternResultSchema },
  'changes.list': { request: WorkspaceIdSchema, response: z.array(ReviewItemSchema) },
  'changes.get': { request: ReviewDetailRequestSchema, response: ReviewDetailSchema },
  'changes.apply': { request: ChangeSetIdSchema, response: WriteOutcomeSchema },
  'changes.discard': { request: ChangeSetIdSchema, response: EmptySchema },
  'changes.recovered': {
    request: EmptySchema,
    response: z.array(
      z.strictObject({
        outcome: z.enum(['finished', 'restored', 'nothing-written', 'failed']),
        message: z.string(),
      }),
    ),
  },
  'workspace.update': { request: WorkspaceUpdateRequestSchema, response: WorkspaceDetailSchema },
  'workspace.remove': { request: WorkspaceIdSchema, response: EmptySchema },
  'workspace.export': { request: WorkspaceIdSchema, response: WorkspaceExportResultSchema },
  'workspace.chooseImport': { request: EmptySchema, response: WorkspaceImportChoiceSchema },
  'workspace.import': {
    request: WorkspaceImportRequestSchema,
    response: WorkspaceImportResultSchema,
  },
} as const;

/**
 * The name of a request.
 *
 * @public
 */
export type IpcMethod = keyof typeof IPC_CONTRACT;

/**
 * The payload of a request.
 *
 * @public
 */
export type IpcRequest<M extends IpcMethod> = z.input<(typeof IPC_CONTRACT)[M]['request']>;

/**
 * The payload of a request after validation, as a handler in main receives it.
 *
 * @public
 */
export type IpcPayload<M extends IpcMethod> = z.output<(typeof IPC_CONTRACT)[M]['request']>;

/**
 * The response to a request.
 *
 * @public
 */
export type IpcResponse<M extends IpcMethod> = z.output<(typeof IPC_CONTRACT)[M]['response']>;

/**
 * A request as it crosses the boundary, with the id its response must carry.
 *
 * @public
 */
export const IpcRequestEnvelopeSchema = z.strictObject({
  correlationId: z.uuid(),
  method: z.enum(Object.keys(IPC_CONTRACT) as [IpcMethod, ...Array<IpcMethod>]),
  payload: z.unknown(),
});

/**
 * The reason of a failed request. Its message is safe to show: it holds no secret and paths only as display values.
 *
 * @public
 */
export const IpcFailureSchema = z.strictObject({
  code: z.string(),
  message: z.string().max(2000),
});

/**
 * @public
 */
export type IpcFailure = z.output<typeof IpcFailureSchema>;

/**
 * A response as it crosses the boundary.
 *
 * @public
 */
export const IpcResponseEnvelopeSchema = z.discriminatedUnion('ok', [
  z.strictObject({ correlationId: z.uuid(), ok: z.literal(true), data: z.unknown() }),
  z.strictObject({ correlationId: z.uuid(), ok: z.literal(false), error: IpcFailureSchema }),
]);

/**
 * @public
 */
export type IpcResponseEnvelope = z.output<typeof IpcResponseEnvelopeSchema>;

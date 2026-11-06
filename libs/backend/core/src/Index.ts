export type { IFormatter, IFormatterResult } from './formatters/interfaces/IFormatter.js';
export { Formatters } from './formatters/Formatters.js';
export { JsonFormatter } from './formatters/JSONFormatter.js';
export { PoFormatter } from './formatters/POFormatter.js';
export { ResxFormatter } from './formatters/RESXFormatter.js';
export { BaseDetector } from './detectors/abstracts/BaseDetector.js';
export type {
  IDetector,
  IDetectorPosition,
  IDetectorResult,
} from './detectors/interfaces/IDetector.js';
export { AngularHTMLDetector } from './detectors/AngularHTMLDetector.js';
export { JSXDetector } from './detectors/JSXDetector.js';
export { JavaScriptDetector } from './detectors/JavaScriptDetector.js';
export { TSXDetector } from './detectors/TSXDetector.js';
export { TypeScriptDetector } from './detectors/TypeScriptDetector.js';
export { VueDetector } from './detectors/VueDetector.js';
export type { IFrameworkPreset } from './presets/interfaces/IFrameworkPreset.js';
export { AngularPreset } from './presets/AngularPreset.js';
export { LitPreset } from './presets/LitPreset.js';
export { ReactPreset } from './presets/ReactPreset.js';
export { StencilPreset } from './presets/StencilPreset.js';
export { VuePreset } from './presets/VuePreset.js';
export { Presets } from './presets/Presets.js';
export type {
  ILocalizationProcessorEventMap,
  ILocalizationProcessorResult,
  IProcessOptions,
} from './services/LocalizationProcessor.js';
export { LocalizationProcessor } from './services/LocalizationProcessor.js';
export {
  UsedKeysFinder,
  type IKeyUsage,
  type IUsedKeysFinderOptions,
} from './services/UsedKeysFinder.js';
export { createKeyPattern } from './services/KeyPattern.js';
export { KeyGenerator, type IKeyAffixes } from './services/KeyGenerator.js';
export { KeyMatcher } from './services/KeyMatcher.js';
export { isTestFile } from './services/SourceText.js';
export {
  comparePlaceholders,
  placeholdersOf,
  protectedTokensOf,
  removePlaceholders,
} from './services/Placeholders.js';
export { matchesKeyGlob } from './services/KeyGlob.js';
export { rewriteSource, type ISourceEdit } from './services/SourceRewriter.js';
export { CatalogEditor } from './resources/editing/CatalogEditor.js';
export { CatalogComments, COMMENTS_FILE_NAME } from './resources/comments/CatalogComments.js';
export { PoText } from './resources/text/PoText.js';
export { ResxText } from './resources/text/ResxText.js';
export { ResourceFactory } from './resources/ResourceFactory.js';
export { ResourceMode } from './resources/ResourceMode.js';
export { ResourceReader } from './resources/readers/ResourceReader.js';
export type {
  IResourceSorterOptions,
  IResourceSortPlan,
} from './resources/sorting/ResourceSorter.js';
export { ResourceSorter } from './resources/sorting/ResourceSorter.js';
export { ResourceTransformer } from './resources/transformers/ResourceTransformer.js';
export type { IResourceTransformerResult } from './resources/transformers/interfaces/IResourceTransformerResult.js';
export type { IResourceSerializer } from './resources/transformers/serializers/interfaces/IResourceSerializer.js';
export { JsonResourceSerializer } from './resources/transformers/serializers/JsonResourceSerializer.js';
export { PoResourceSerializer } from './resources/transformers/serializers/PoResourceSerializer.js';
export { ResxResourceSerializer } from './resources/transformers/serializers/ResxResourceSerializer.js';
export { TypescriptResourceSerializer } from './resources/transformers/serializers/TypescriptResourceSerializer.js';
export type { IResourceTransformerAdapter } from './resources/transformers/adapters/interfaces/IResourceTransformerAdapter.js';
export { JsonResourceTransformerAdapter } from './resources/transformers/adapters/JsonResourceTransformerAdapter.js';
export { ResxResourceTransformerAdapter } from './resources/transformers/adapters/ResxResourceTransformerAdapter.js';
export { ResxResourceInfo } from './resources/models/ResxResourceInfo.js';
export { JsonResourceInfo } from './resources/models/JsonResourceInfo.js';
export { PoResourceInfo } from './resources/models/PoResourceInfo.js';
export { TypeScriptResourceInfo } from './resources/models/TypeScriptResourceInfo.js';
export type { IJsonResourceInfo } from './resources/models/interfaces/IJsonResourceInfo.js';
export type { IPoResourceInfo } from './resources/models/interfaces/IPoResourceInfo.js';
export type { ITypeScriptResourceInfo } from './resources/models/interfaces/ITypeScriptResourceInfo.js';
export type {
  IResourceInfo,
  ResourceContentFn,
} from './resources/models/interfaces/IResourceInfo.js';
export type { IResxResourceInfo } from './resources/models/interfaces/IResxResourceInfo.js';
export type { IResourceModel } from './resources/models/interfaces/IResourceModel.js';
export { ResourceType, resourceTypeFormFile } from './resources/models/interfaces/ResourceType.js';
export { ResxResourceReaderAdapter } from './resources/readers/adapter/ResxResourceReaderAdapter.js';
export { JsonResourceReaderAdapter } from './resources/readers/adapter/JsonResourceReaderAdapter.js';
export { PoResourceReaderAdapter } from './resources/readers/adapter/PoResourceReaderAdapter.js';
export type { IResourceReaderAdapter } from './resources/readers/adapter/interfaces/IResourceReaderAdapter.js';
export { ResourceAnalyzer } from './resources/analyzers/ResourceAnalyzer.js';
export { findCatalogLocale, getResourceCatalog } from './resources/analyzers/ResourceCatalog.js';
export type {
  IAnalyzerRule,
  IAnalyzerRuleExecutionContext,
  IAnalyzerRuleResult,
  IRulePresentation,
} from './resources/analyzers/tasks/interfaces/IAnalyzerRule.js';
export {
  BUILT_IN_RULE_SEVERITIES,
  createRuleFindings,
  foundItemsOf,
  severityOfRule,
  type IRuleFinding,
  type RuleSeverity,
} from './resources/analyzers/findings/RuleFinding.js';
export {
  DeclarativeRule,
  fillRuleMessage,
  type IDeclarativeRuleData,
  type IDeclarativeRuleDefinition,
  type IDeclarativeRuleOptions,
  type NamedCheck,
} from './resources/analyzers/declarative/DeclarativeRule.js';
export {
  PatternGuard,
  type IPatternGuardOptions,
  type PatternOutcome,
} from './resources/analyzers/declarative/PatternGuard.js';
export { findIcuProblem } from './resources/analyzers/declarative/IcuMessage.js';
export {
  DuplicateKeysRule,
  type IDuplicateKeysRuleData,
} from './resources/analyzers/tasks/DuplicateKeysRule.js';
export {
  EmptyValuesRule,
  type IEmptyValuesRuleResultData,
} from './resources/analyzers/tasks/EmptyValuesRule.js';
export {
  KeyConsistencyRule,
  type IKeyConsistencyRuleResultData,
} from './resources/analyzers/tasks/KeyConsistencyRule.js';
export {
  MissingTranslationsRule,
  type IMissingTranslationsRuleParameters,
  type IMissingTranslationsRuleResultData,
} from './resources/analyzers/tasks/MissingTranslationsRule.js';
export {
  UnusedKeysRule,
  type IUnusedKeysRuleResultData,
} from './resources/analyzers/tasks/UnusedKeysRule.js';
export {
  MultipleKeyUsageRule,
  type IMultipleKeyUsageRuleResultData,
} from './resources/analyzers/tasks/MultipleKeyUsageRule.js';
export type { IDuplicateValuesRuleData } from './resources/analyzers/tasks/DuplicateValuesRule.js';
export { DuplicateValuesRule } from './resources/analyzers/tasks/DuplicateValuesRule.js';

export { ResourceProcessor } from './resources/ResourceProcessor.js';

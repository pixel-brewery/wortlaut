// #region Imports

import {
  lobeClaudecode,
  lobeCodex,
  lobeGemini,
  lobeOpenai,
  lobeOpencode,
} from '@pixel-brewery/mosaik-icons/lobe-icons';
import {
  reiconAdd,
  reiconAlertTriangle,
  reiconArrowRight,
  reiconArrowRightUp,
  reiconCheckCircle,
  reiconCheck,
  reiconChevronRight,
  reiconClipboardCheck,
  reiconComment,
  reiconCopy,
  reiconCpu,
  reiconFlask,
  reiconFolder,
  reiconFolderOpen,
  reiconHistory,
  reiconHome,
  reiconInfoCircle,
  reiconPlay,
  reiconPuzzle,
  reiconRefresh,
  reiconSearch,
  reiconSettings,
  reiconSparkle,
} from '@pixel-brewery/mosaik-icons/reicon';
import { localeFlagIcons } from '../locales/localeFlagIcons';

// #endregion

/**
 * The icons of the app under the names the design uses.
 */
export const wortlautIcons = {
  ...localeFlagIcons,
  add: reiconAdd,
  aiClaude: lobeClaudecode,
  aiCodex: lobeCodex,
  aiGemini: lobeGemini,
  aiOpenAI: lobeOpenai,
  aiOpenCode: lobeOpencode,
  arrowRight: reiconArrowRight,
  bot: reiconCpu,
  checkmarkCircle: reiconCheckCircle,
  chevronRight: reiconChevronRight,
  clipboardTask: reiconClipboardCheck,
  comment: reiconComment,
  copy: reiconCopy,
  checkmark: reiconCheck,
  review: reiconClipboardCheck,
  executionOutline: reiconFlask,
  flow: reiconHistory,
  folder: reiconFolder,
  folderOpen: reiconFolderOpen,
  homeOutline: reiconHome,
  info: reiconInfoCircle,
  open: reiconArrowRightUp,
  play: reiconPlay,
  search: reiconSearch,
  settings: reiconSettings,
  skills: reiconPuzzle,
  sparkle: reiconSparkle,
  sync: reiconRefresh,
  warning: reiconAlertTriangle,
};

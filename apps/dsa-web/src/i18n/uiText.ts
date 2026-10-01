import { zhCommon, enCommon } from './domains/common';
import { zhShell, enShell } from './domains/shell';
import { zhLogin, enLogin } from './domains/login';
import { zhHome, enHome } from './domains/home';
import { zhRunFlow, enRunFlow } from './domains/runFlow';
import { zhDecisionSignals, enDecisionSignals } from './domains/decisionSignals';
import { zhSettings, enSettings } from './domains/settings';
import { zhChat, enChat } from './domains/chat';
import { zhUsage, enUsage } from './domains/usage';

export type UiLanguage = 'zh' | 'en';

const zh = {
  ...zhCommon,
  ...zhShell,
  ...zhLogin,
  ...zhHome,
  ...zhRunFlow,
  ...zhDecisionSignals,
  ...zhSettings,
  ...zhChat,
  ...zhUsage,
} as const;

export type UiTextKey = keyof typeof zh;

const en: Record<UiTextKey, string> = {
  ...enCommon,
  ...enShell,
  ...enLogin,
  ...enHome,
  ...enRunFlow,
  ...enDecisionSignals,
  ...enSettings,
  ...enChat,
  ...enUsage,
};

export const UI_TEXT: Record<UiLanguage, Record<UiTextKey, string>> = {
  zh,
  en,
};

export type UiTextParams = Record<string, string | number>;

export function formatUiText(template: string, params?: UiTextParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

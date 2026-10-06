import type { UnlockRequirement } from '../gameplay/MiniGame';
import { ACHIEVEMENTS } from '../progression/Achievements';
import { t } from '../i18n/i18n';
import type { UIData } from './types';

export function requirementLabel(req: UnlockRequirement, _data?: UIData): string {
  switch (req.type) {
    case 'none':
      return '';
    case 'runs':
      return t('unlock.runs', { count: req.count });
    case 'bestScore':
      return t('unlock.bestScore', { points: req.points });
    case 'achievement': {
      const ach = ACHIEVEMENTS.find((a) => a.id === req.id);
      return t('unlock.achievement', { name: ach ? t(ach.nameKey) : req.id });
    }
  }
}

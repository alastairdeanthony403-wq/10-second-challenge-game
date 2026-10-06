import type { MiniGameDefinition } from '../MiniGame';
import { tapTheTargetDef } from './TapTheTarget';
import { dontTapRedDef } from './DontTapRed';
import { bullseyeDef } from './Bullseye';
import { rememberTheOrderDef } from './RememberTheOrder';
import { whatsMissingDef } from './WhatsMissing';
import { typeThisDef } from './TypeThis';
import { stopTheMeterDef } from './StopTheMeter';
import { collectEverythingDef } from './CollectEverything';
import { sortItDef } from './SortIt';
import { saveTheEggDef } from './SaveTheEgg';
import { lightningTapDef } from './LightningTap';
import { oddOneOutDef } from './OddOneOut';
import { buttonMashDef } from './ButtonMash';
import { stackPerfectlyDef } from './StackPerfectly';
import { biggestNumberDef } from './BiggestNumber';
import { dodgeDef } from './Dodge';
import { feedTheMonsterDef } from './FeedTheMonster';

/**
 * The content list. To add a mini-game: create the class + definition, then add
 * it here (and its strings to the locale). No core system needs to change.
 */
export const ALL_MINIGAMES: readonly MiniGameDefinition[] = [
  tapTheTargetDef,
  dontTapRedDef,
  bullseyeDef,
  rememberTheOrderDef,
  whatsMissingDef,
  typeThisDef,
  stopTheMeterDef,
  collectEverythingDef,
  sortItDef,
  saveTheEggDef,
  lightningTapDef,
  oddOneOutDef,
  buttonMashDef,
  stackPerfectlyDef,
  biggestNumberDef,
  dodgeDef,
  feedTheMonsterDef,
];

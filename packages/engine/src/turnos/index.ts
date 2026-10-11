export * from './types';
export * from './rules';
export { createTurnos, currentActorId, nameOf, slotOf, isOn, playersOn, keeperOf, holderOf, manh, reach, turnOrder, kickoff, dirOf, other } from './core';
export { legalActions, hasAny, passOptions, dribbleLanding } from './legal';
export { applyAction, needsKeeperGuess, botKeeperGuess, TurnosError } from './resolve';
export { chooseAction, autoAction, pBeat as winChance } from './ai';
export { slotOf as slot, goalDistance } from './core';

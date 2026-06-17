export interface HexCoord {
  q: number;
  r: number;
}

export enum HexType {
  EMPTY = 'empty',
  NUTRIENT = 'nutrient',
  POLLUTED = 'polluted',
  MYCELIUM = 'mycelium',
  START = 'start',
}

export interface HexCell {
  coord: HexCoord;
  type: HexType;
  nutrientId?: string;
}

export interface GameRules {
  allowDiagonalJump: boolean;
  allowPurifyPollution: boolean;
  enableStepBudget: boolean;
}

export interface GameState {
  id: string;
  level: number;
  gridRadius: number;
  cells: Record<string, HexCell>;
  nutrients: string[];
  connectedNutrients: string[];
  startCoord: HexCoord;
  myceliumCells: HexCoord[];
  steps: number;
  optimalSteps: number;
  status: 'playing' | 'won' | 'lost';
  createdAt: number;
  updatedAt: number;
  rules: GameRules;
  diagonalJumpUsed: boolean;
  purifyUsed: boolean;
  stepBudget: number;
}

export interface CreateGameRequest {
  level?: number;
  gridRadius?: number;
  rules?: Partial<GameRules>;
}

export interface ExtendMyceliumRequest {
  coord: HexCoord;
}

export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

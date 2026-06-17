import './styles.css';
import { GameState, HexCoord, HexType, GameRules } from './types';
import { HexGridRenderer } from './hexGrid';
import { createGame, getGame, extendMycelium, undoMove, resetGame, findPath, purifyPollution, diagonalJump } from './api';
import { coordKey, findPathAStar, PixelCoord, hexDistance } from './hexUtils';

type MessageType = 'info' | 'success' | 'error';

interface GameUI {
  hexContainer: HTMLElement;
  panelContainer: HTMLElement;
}

export class FungiGame {
  private ui: GameUI;
  private gameState: GameState | null = null;
  private hexGrid: HexGridRenderer;
  private selectedLevel = 1;
  private message: { text: string; type: MessageType } | null = null;
  private tooltipEl: HTMLElement | null = null;
  private messageTimeout: any = null;
  private isProcessing = false;
  private previewPathCoord: HexCoord | null = null;
  private gameRules: GameRules = {
    allowDiagonalJump: false,
    allowPurifyPollution: false,
    enableStepBudget: false,
  };
  private abilityMode: 'none' | 'purify' | 'diagonalJump' = 'none';

  constructor() {
    const hexContainer = document.getElementById('hex-container')!;
    const panelContainer = document.getElementById('panel-container')!;

    this.ui = { hexContainer, panelContainer };

    this.hexGrid = new HexGridRenderer({
      container: hexContainer,
      size: 38,
      onCellClick: (coord) => this.handleCellClick(coord),
      onCellHover: (coord, pixel) => this.handleCellHover(coord, pixel),
    });

    this.initUI();
  }

  private initUI(): void {
    this.renderPanel();
  }

  private renderPanel(): void {
    this.ui.panelContainer.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'app-header';
    header.innerHTML = `
      <h1>🍄 真菌网络扩增</h1>
      <div class="subtitle">用最少步数连接所有腐木营养源</div>
    `;
    document.getElementById('app-header')!.innerHTML = '';
    document.getElementById('app-header')!.appendChild(header);

    const levelSection = this.createLevelSection();
    this.ui.panelContainer.appendChild(levelSection);

    if (!this.gameState) {
      const rulesSection = this.createRulesSection();
      this.ui.panelContainer.appendChild(rulesSection);
    }

    if (this.message) {
      const msgBox = document.createElement('div');
      msgBox.className = `message-box message-${this.message.type}`;
      msgBox.textContent = this.message.text;
      this.ui.panelContainer.appendChild(msgBox);
    }

    if (this.gameState) {
      const statsSection = this.createStatsSection();
      this.ui.panelContainer.appendChild(statsSection);

      const abilitiesSection = this.createAbilitiesSection();
      this.ui.panelContainer.appendChild(abilitiesSection);

      const controlsSection = this.createControlsSection();
      this.ui.panelContainer.appendChild(controlsSection);

      const legendSection = this.createLegendSection();
      this.ui.panelContainer.appendChild(legendSection);
    }

    if (this.gameState?.status === 'won') {
      this.showWinModal();
    }
  }

  private createLevelSection(): HTMLElement {
    const section = document.createElement('div');
    section.innerHTML = `<div class="section-title">选择关卡</div>`;

    const levelSelector = document.createElement('div');
    levelSelector.className = 'level-selector';

    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.className = `level-btn${i === this.selectedLevel ? ' active' : ''}`;
      btn.textContent = String(i);
      btn.onclick = () => {
        this.selectedLevel = i;
        this.startNewGame(i);
      };
      levelSelector.appendChild(btn);
    }

    section.appendChild(levelSelector);
    return section;
  }

  private createRulesSection(): HTMLElement {
    const section = document.createElement('div');
    section.innerHTML = `<div class="section-title">规则实验</div>`;

    const rulesList = document.createElement('div');
    rulesList.className = 'rules-list';

    const rules = [
      {
        key: 'allowDiagonalJump',
        label: '斜向跳孢',
        desc: '允许一次跳过2格距离',
        icon: '🦘',
      },
      {
        key: 'allowPurifyPollution',
        label: '净化污染',
        desc: '允许一次净化相邻污染区',
        icon: '✨',
      },
      {
        key: 'enableStepBudget',
        label: '步数预算',
        desc: '限定步数内完成挑战',
        icon: '⏱️',
      },
    ];

    for (const rule of rules) {
      const ruleItem = document.createElement('div');
      ruleItem.className = 'rule-item';

      const isEnabled = this.gameRules[rule.key as keyof GameRules];

      ruleItem.innerHTML = `
        <div class="rule-info">
          <span class="rule-icon">${rule.icon}</span>
          <div>
            <div class="rule-label">${rule.label}</div>
            <div class="rule-desc">${rule.desc}</div>
          </div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" ${isEnabled ? 'checked' : ''} data-rule="${rule.key}">
          <span class="toggle-slider"></span>
        </label>
      `;

      const checkbox = ruleItem.querySelector('input')!;
      checkbox.onchange = (e) => {
        const target = e.target as HTMLInputElement;
        const ruleKey = target.dataset.rule as keyof GameRules;
        this.gameRules[ruleKey] = target.checked;
      };

      rulesList.appendChild(ruleItem);
    }

    section.appendChild(rulesList);

    const startBtn = document.createElement('button');
    startBtn.className = 'btn btn-primary btn-full';
    startBtn.innerHTML = '🎮 开始游戏';
    startBtn.style.marginTop = '12px';
    startBtn.onclick = () => {
      this.startNewGame(this.selectedLevel);
    };
    section.appendChild(startBtn);

    return section;
  }

  private createAbilitiesSection(): HTMLElement {
    const section = document.createElement('div');

    const hasAnyAbility = this.gameState!.rules.allowDiagonalJump || this.gameState!.rules.allowPurifyPollution;
    if (!hasAnyAbility) return section;

    section.innerHTML = `<div class="section-title">特殊能力</div>`;

    const abilities = document.createElement('div');
    abilities.className = 'abilities';

    if (this.gameState!.rules.allowDiagonalJump) {
      const btn = document.createElement('button');
      const used = this.gameState!.diagonalJumpUsed;
      btn.className = `ability-btn${this.abilityMode === 'diagonalJump' ? ' active' : ''}${used ? ' used' : ''}`;
      btn.innerHTML = `🦘 斜向跳孢${used ? ' (已用)' : ''}`;
      btn.disabled = used || this.isProcessing || this.gameState!.status !== 'playing';
      btn.onclick = () => {
        this.abilityMode = this.abilityMode === 'diagonalJump' ? 'none' : 'diagonalJump';
        this.showMessage(
          this.abilityMode === 'diagonalJump' ? '选择2格外的目标进行跳孢' : '已取消斜向跳孢',
          'info'
        );
        this.renderPanel();
      };
      abilities.appendChild(btn);
    }

    if (this.gameState!.rules.allowPurifyPollution) {
      const btn = document.createElement('button');
      const used = this.gameState!.purifyUsed;
      btn.className = `ability-btn${this.abilityMode === 'purify' ? ' active' : ''}${used ? ' used' : ''}`;
      btn.innerHTML = `✨ 净化污染${used ? ' (已用)' : ''}`;
      btn.disabled = used || this.isProcessing || this.gameState!.status !== 'playing';
      btn.onclick = () => {
        this.abilityMode = this.abilityMode === 'purify' ? 'none' : 'purify';
        this.showMessage(
          this.abilityMode === 'purify' ? '选择相邻的污染区进行净化' : '已取消净化',
          'info'
        );
        this.renderPanel();
      };
      abilities.appendChild(btn);
    }

    section.appendChild(abilities);
    return section;
  }

  private createStatsSection(): HTMLElement {
    const section = document.createElement('div');

    section.innerHTML = `<div class="section-title">游戏进度</div>`;

    const grid = document.createElement('div');
    grid.className = 'stats-grid';

    const progress = this.gameState!.nutrients.length > 0
      ? (this.gameState!.connectedNutrients.length / this.gameState!.nutrients.length) * 100
      : 0;

    const stepsRatio = this.gameState!.steps / Math.max(1, this.gameState!.optimalSteps);
    let stepsClass = '';
    if (stepsRatio <= 1.2) stepsClass = '';
    else if (stepsRatio <= 1.5) stepsClass = 'warning';
    else stepsClass = 'danger';

    const showStepBudget = this.gameState!.rules.enableStepBudget;
    const budgetRemaining = showStepBudget ? this.gameState!.stepBudget - this.gameState!.steps : 0;
    let budgetClass = '';
    if (showStepBudget) {
      const budgetRatio = this.gameState!.steps / Math.max(1, this.gameState!.stepBudget);
      if (budgetRatio <= 0.6) budgetClass = '';
      else if (budgetRatio <= 0.85) budgetClass = 'warning';
      else budgetClass = 'danger';
    }

    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">当前步数</div>
        <div class="stat-value ${stepsClass}">${this.gameState!.steps}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">最优步数</div>
        <div class="stat-value info">${this.gameState!.optimalSteps}</div>
      </div>
      ${showStepBudget ? `
      <div class="stat-card">
        <div class="stat-label">步数预算</div>
        <div class="stat-value ${budgetClass}">${budgetRemaining}/${this.gameState!.stepBudget}</div>
      </div>
      ` : ''}
      <div class="stat-card">
        <div class="stat-label">营养源</div>
        <div class="stat-value">${this.gameState!.connectedNutrients.length}/${this.gameState!.nutrients.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">关卡</div>
        <div class="stat-value info">${this.gameState!.level}</div>
      </div>
    `;

    section.appendChild(grid);

    const progressWrap = document.createElement('div');
    progressWrap.style.marginBottom = '24px';
    progressWrap.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: #8a8a9a; margin-bottom: 4px;">
      <span>连接进度</span>
      <span>${Math.round(progress)}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${progress}%"></div>
    </div>
    `;
    section.appendChild(progressWrap);

    return section;
  }

  private createControlsSection(): HTMLElement {
    const section = document.createElement('div');
    section.innerHTML = `<div class="section-title">操作</div>`;

    const controls = document.createElement('div');
    controls.className = 'controls';

    const undoBtn = document.createElement('button');
    undoBtn.className = 'btn btn-secondary';
    undoBtn.innerHTML = '↩️ 撤销上一步';
    undoBtn.disabled = this.gameState!.myceliumCells.length <= 1 || this.isProcessing;
    undoBtn.onclick = () => this.handleUndo();
    controls.appendChild(undoBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-secondary';
    resetBtn.innerHTML = '🔄 重置关卡';
    resetBtn.disabled = this.isProcessing;
    resetBtn.onclick = () => this.handleReset();
    controls.appendChild(resetBtn);

    const newGameBtn = document.createElement('button');
    newGameBtn.className = 'btn btn-secondary';
    newGameBtn.innerHTML = '⚙️ 更改规则';
    newGameBtn.onclick = () => this.backToRules();
    controls.appendChild(newGameBtn);

    section.appendChild(controls);
    return section;
  }

  private createLegendSection(): HTMLElement {
    const section = document.createElement('div');
    section.innerHTML = `<div class="section-title">图例说明</div>`;

    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.innerHTML = `
      <div class="legend-item">
        <div class="legend-color" style="background: #5fa8d3;"></div>
        <div class="legend-text">🏠 菌丝起点（菌落）</div>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #6ab04c;"></div>
        <div class="legend-text">🍄 菌丝区域</div>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #c68642;"></div>
        <div class="legend-text">🪵 腐木营养源（需连接）</div>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #8b0000;"></div>
        <div class="legend-text">☢️ 重金属污染区（禁止）</div>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: #2a2a4a; border: 1px dashed #7ed957;"></div>
        <div class="legend-text">⬜ 可蔓延区域（虚线框）</div>
      </div>
    `;

    section.appendChild(legend);
    return section;
  }

  private showWinModal(): void {
    if (document.querySelector('.win-modal')) return;

    const modal = document.createElement('div');
    modal.className = 'win-modal';

    const steps = this.gameState!.steps;
    const optimal = this.gameState!.optimalSteps;
    const ratio = steps / optimal;

    let stars = 3;
    let starText = '⭐⭐⭐';
    if (ratio > 1.5) {
      stars = 1;
      starText = '⭐☆☆';
    } else if (ratio > 1.2) {
      stars = 2;
      starText = '⭐⭐☆';
    }

    modal.innerHTML = `
      <div class="win-modal-content">
        <div class="win-title">🎉 连接成功！</div>
        <div style="margin: 16px 0;">${starText.split('').map((s, i) => `<span class="star ${s === '⭐' ? 'filled' : ''}" style="animation-delay: ${i * 0.15}s">${s}</span>`).join('')}</div>
        <div class="win-stats">
          <div class="win-stat">
            <div class="win-stat-label">你的步数</div>
            <div class="win-stat-value">${steps}</div>
          </div>
          <div class="win-stat">
            <div class="win-stat-label">最优步数</div>
            <div class="win-stat-value">${optimal}</div>
          </div>
        </div>
        <div style="color: #8a8a9a; font-size: 13px; margin-bottom: 24px;">
          ${stars === 3 ? '完美！你找到了最优解！' : stars === 2 ? '表现不错，还能更优！' : '再接再厉，寻找更短的路径！'}
        </div>
        <div style="display: flex; gap: 10px; flex-direction: column;">
          ${this.selectedLevel < 5 ? `<button class="btn btn-primary" id="next-level-btn">🚀 下一关</button>` : ''}
          <button class="btn btn-secondary" id="replay-btn">🔄 再玩一次</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const nextBtn = modal.querySelector('#next-level-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      this.selectedLevel = Math.min(5, this.selectedLevel + 1);
      this.startNewGame(this.selectedLevel);
    });
    }

    const replayBtn = modal.querySelector('#replay-btn')!;
    replayBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      this.startNewGame(this.selectedLevel);
    });
  }

  private async startNewGame(level: number): Promise<void> {
    this.setProcessing(true);
    this.showMessage('正在生成新地图...', 'info');
    this.abilityMode = 'none';

    try {
      this.gameState = await createGame(level, undefined, this.gameRules);
      this.hexGrid.setGameState(this.gameState);
      this.showMessage(`第 ${level} 关开始！连接所有腐木营养源`, 'success');
      this.renderPanel();
    } catch (e) {
      this.showMessage('创建游戏失败：' + (e instanceof Error ? e.message : '未知错误'), 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private async handleCellClick(coord: HexCoord): Promise<void> {
    if (this.isProcessing || !this.gameState || this.gameState.status !== 'playing') return;

    const key = coordKey(coord);
    const cell = this.gameState.cells[key];
    if (!cell) return;

    if (this.abilityMode === 'purify') {
      if (cell.type !== HexType.POLLUTED) {
        this.showMessage('⚠️ 只能选择污染区进行净化！', 'error');
        return;
      }
      await this.handlePurify(coord);
      return;
    }

    if (this.abilityMode === 'diagonalJump') {
      const lastCoord = this.gameState.myceliumCells[this.gameState.myceliumCells.length - 1];
      const dist = hexDistance(lastCoord, coord);
      if (dist !== 2) {
        this.showMessage('⚠️ 斜向跳孢只能选择2格距离的目标！', 'error');
        return;
      }
      if (cell.type === HexType.POLLUTED) {
        this.showMessage('⚠️ 不能跳孢到重金属污染区！', 'error');
        return;
      }
      await this.handleDiagonalJump(coord);
      return;
    }

    if (cell.type === HexType.POLLUTED) {
      if (this.gameState.rules.allowPurifyPollution && !this.gameState.purifyUsed) {
        this.showMessage('💡 点击"净化污染"按钮后再点击污染区可净化', 'info');
      } else {
        this.showMessage('⚠️ 不能蔓延到重金属污染区！', 'error');
      }
      return;
    }

    this.setProcessing(true);

    try {
      this.gameState = await extendMycelium(this.gameState.id, coord);
      this.hexGrid.setGameState(this.gameState);
      this.hexGrid.showPathPreview(null);
      this.previewPathCoord = null;

      if (this.gameState.status === 'won') {
        this.showMessage('🎊 恭喜！成功连接所有营养源！', 'success');
      } else if (this.gameState.status === 'lost') {
        this.showMessage('💔 步数预算已用完，游戏结束！', 'error');
      } else if (cell.type === HexType.NUTRIENT && cell.nutrientId && this.gameState.connectedNutrients.includes(cell.nutrientId)) {
        this.showMessage('✅ 成功连接一个营养源！', 'success');
      }

      this.renderPanel();
    } catch (e) {
      this.showMessage(e instanceof Error ? e.message : '操作失败', 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private async handlePurify(coord: HexCoord): Promise<void> {
    if (!this.gameState) return;

    this.setProcessing(true);

    try {
      this.gameState = await purifyPollution(this.gameState.id, coord);
      this.hexGrid.setGameState(this.gameState);
      this.abilityMode = 'none';
      this.showMessage('✨ 成功净化污染区！', 'success');
      this.renderPanel();
    } catch (e) {
      this.showMessage(e instanceof Error ? e.message : '净化失败', 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private async handleDiagonalJump(coord: HexCoord): Promise<void> {
    if (!this.gameState) return;

    this.setProcessing(true);

    try {
      this.gameState = await diagonalJump(this.gameState.id, coord);
      this.hexGrid.setGameState(this.gameState);
      this.hexGrid.showPathPreview(null);
      this.previewPathCoord = null;
      this.abilityMode = 'none';

      if (this.gameState.status === 'won') {
        this.showMessage('🎊 恭喜！成功连接所有营养源！', 'success');
      } else if (this.gameState.status === 'lost') {
        this.showMessage('💔 步数预算已用完，游戏结束！', 'error');
      } else {
        this.showMessage('🦘 斜向跳孢成功！', 'success');
      }

      this.renderPanel();
    } catch (e) {
      this.showMessage(e instanceof Error ? e.message : '跳孢失败', 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private handleCellHover(coord: HexCoord | null, pixel: PixelCoord | null): void {
    if (!this.gameState) return;

    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }

    if (!coord || !pixel) {
      this.hexGrid.showPathPreview(null);
      this.previewPathCoord = null;
      return;
    }

    const key = coordKey(coord);
    const cell = this.gameState.cells[key];
    if (!cell) return;

    const myceliumSet = new Set(this.gameState.myceliumCells.map(coordKey));
    if (!myceliumSet.has(key)) {
      if (cell.type !== HexType.POLLUTED) {
        const fromCoord = this.gameState.myceliumCells[this.gameState.myceliumCells.length - 1];
        const path = findPathAStar(fromCoord, coord, this.gameState.cells, this.gameState.gridRadius, [HexType.POLLUTED]);
        if (path) {
          this.hexGrid.showPathPreview(path);
          this.previewPathCoord = coord;

          this.tooltipEl = document.createElement('div');
          this.tooltipEl.className = 'hex-tooltip';
          this.tooltipEl.style.left = `${pixel.x}px`;
          this.tooltipEl.style.top = `${pixel.y}px`;
          const cellName = this.getCellDisplayName(cell);
          const reachable = this.hexGrid['reachableKeys']?.has(key) ? '（可直接蔓延）' : '';
          this.tooltipEl.textContent = `${cellName} ${reachable} • 路径长度: ${path.length - 1} 步`;
          document.body.appendChild(this.tooltipEl);
        }
      }
    }
  }

  private getCellDisplayName(cell: any): string {
    switch (cell.type) {
      case HexType.EMPTY: return '空白区域';
      case HexType.NUTRIENT: return '🪵 腐木营养源';
      case HexType.POLLUTED: return '☢️ 污染区';
      case HexType.MYCELIUM: return '🍄 菌丝区';
      case HexType.START: return '🏠 起点菌落';
      default: return '未知';
    }
  }

  private async handleUndo(): Promise<void> {
    if (!this.gameState) return;
    this.setProcessing(true);

    try {
      this.gameState = await undoMove(this.gameState.id);
      this.hexGrid.setGameState(this.gameState);
      this.hexGrid.showPathPreview(null);
      this.showMessage('↩️ 已撤销上一步', 'info');
      this.renderPanel();
    } catch (e) {
      this.showMessage(e instanceof Error ? e.message : '撤销失败', 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private async handleReset(): Promise<void> {
    if (!this.gameState) return;
    this.setProcessing(true);
    this.showMessage('正在重置...', 'info');
    this.abilityMode = 'none';

    try {
      this.gameState = await resetGame(this.gameState.id);
      this.hexGrid.setGameState(this.gameState);
      this.hexGrid.showPathPreview(null);
      this.showMessage('🔄 关卡已重置', 'info');
      this.renderPanel();
    } catch (e) {
      this.showMessage(e instanceof Error ? e.message : '重置失败', 'error');
    } finally {
      this.setProcessing(false);
    }
  }

  private backToRules(): void {
    this.gameState = null;
    this.abilityMode = 'none';
    this.hexGrid.clear();
    this.renderPanel();
  }

  private showMessage(text: string, type: MessageType = 'info'): void {
    this.message = { text, type };
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }
    this.renderPanel();

    if (!(type === 'success' && this.gameState?.status === 'won')) {
      this.messageTimeout = setTimeout(() => {
        this.message = null;
        this.renderPanel();
      }, 3000);
    }
  }

  private setProcessing(processing: boolean): void {
    this.isProcessing = processing;
    if (processing || this.gameState) {
      this.renderPanel();
    }
  }
}

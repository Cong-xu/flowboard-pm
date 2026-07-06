const { ItemView, Modal, Notice, Plugin, Setting, TFile, normalizePath } = require("obsidian");

const VIEW_TYPE = "flowboard-pm-view";
const EXTENSION = "pmboard";
const DEFAULT_BOARD_PATH = "5.项目管理/自定义看板/项目看板.pmboard";

const DEFAULT_BOARD = {
  version: 1,
  title: "项目看板",
  description: "轻量项目管理看板",
  lanes: [
    { id: "backlog", title: "Backlog", status: "backlog", cards: [] },
    { id: "todo", title: "Todo", status: "todo", cards: [] },
    { id: "progress", title: "In Progress", status: "progress", cards: [] },
    { id: "done", title: "Done", status: "done", cards: [] }
  ]
};

const SAMPLE_CARDS = [
  {
    laneId: "backlog",
    title: "MT门店新增PS code",
    context: "",
    project: "MT",
    type: "Feature",
    stage: "需求调研",
    priority: "P1",
    owner: "Justin",
    due: "",
    tags: ["需求调研", "Feature"]
  },
  {
    laneId: "todo",
    title: "MT 数据归档机制建设",
    context: "6月运维",
    project: "MT",
    type: "Feature",
    stage: "方案设计",
    priority: "P2",
    owner: "Justin",
    due: "",
    tags: ["方案设计", "Feature"]
  },
  {
    laneId: "progress",
    title: "研究如何通过AI抓取微信聊天记录",
    context: "",
    project: "AI",
    type: "方案",
    stage: "方案设计",
    priority: "P1",
    owner: "Justin",
    due: "",
    tags: ["AI", "方案设计"]
  },
  {
    laneId: "done",
    title: "SFA 数据同步准备及 LZH MT 系统重启",
    context: "6月运维",
    project: "MT",
    type: "operations",
    stage: "发布上线",
    priority: "P2",
    owner: "Justin",
    due: "",
    tags: ["operations"]
  }
];

module.exports = class PMLinearKanbanPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new PMKanbanView(leaf, this));
    this.registerExtensions([EXTENSION], VIEW_TYPE);

    this.addRibbonIcon("layout-dashboard", "创建项目看板", async () => {
      await this.createBoard(DEFAULT_BOARD_PATH, true);
    });

    this.addCommand({
      id: "create-flowboard-pm-board",
      name: "创建 FlowBoard PM 看板",
      callback: async () => {
        await this.createBoard(DEFAULT_BOARD_PATH, true);
      }
    });

    this.addCommand({
      id: "create-flowboard-pm-sample-board",
      name: "创建 FlowBoard PM 示例看板",
      callback: async () => {
        await this.createBoard("5.项目管理/自定义看板/示例项目看板.pmboard", true, true);
      }
    });
  }

  async createBoard(path, openAfterCreate, withSampleCards) {
    const targetPath = normalizePath(path);
    await this.ensureFolder(targetPath);

    let file = this.app.vault.getAbstractFileByPath(targetPath);
    if (!file) {
      const board = cloneBoard(DEFAULT_BOARD);
      if (withSampleCards) {
        for (const card of SAMPLE_CARDS) {
          addCardToBoard(board, card.laneId, card);
        }
      }
      file = await this.app.vault.create(targetPath, JSON.stringify(board, null, 2));
      new Notice("已创建项目看板");
    } else {
      new Notice("项目看板已存在，已直接打开");
    }

    if (openAfterCreate && file instanceof TFile) {
      await this.app.workspace.getLeaf(true).openFile(file);
    }
  }

  async ensureFolder(filePath) {
    const folderPath = filePath.split("/").slice(0, -1).join("/");
    if (!folderPath) return;
    const parts = folderPath.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
};

class PMKanbanView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.file = null;
    this.board = cloneBoard(DEFAULT_BOARD);
    this.query = "";
    this.draggedCardId = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return this.file ? this.file.basename : "FlowBoard PM";
  }

  getIcon() {
    return "layout-dashboard";
  }

  async setState(state, result) {
    await super.setState(state, result);
    if (state.file) {
      const file = this.app.vault.getAbstractFileByPath(state.file);
      if (file instanceof TFile) {
        this.file = file;
      }
    }
    await this.loadBoard();
    this.render();
  }

  getState() {
    const state = super.getState();
    if (this.file) state.file = this.file.path;
    return state;
  }

  async onOpen() {
    await this.loadBoard();
    this.render();
  }

  async loadBoard() {
    if (!this.file) return;
    try {
      const raw = await this.app.vault.cachedRead(this.file);
      const parsed = JSON.parse(raw || "{}");
      this.board = normalizeBoard(parsed);
    } catch (error) {
      this.board = cloneBoard(DEFAULT_BOARD);
      new Notice("看板文件无法读取，已显示空看板");
      console.error(error);
    }
  }

  async saveBoard() {
    if (!this.file) return;
    await this.app.vault.modify(this.file, JSON.stringify(this.board, null, 2));
  }

  render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("pmk-root");

    const toolbar = container.createDiv({ cls: "pmk-toolbar" });
    const titleWrap = toolbar.createDiv({ cls: "pmk-title-wrap" });
    titleWrap.createEl("h2", { cls: "pmk-title", text: this.board.title || "项目看板" });
    titleWrap.createDiv({
      cls: "pmk-subtitle",
      text: this.board.description || "拖拽卡片即可更新状态"
    });

    const actions = toolbar.createDiv({ cls: "pmk-actions" });
    const search = actions.createEl("input", {
      cls: "pmk-search",
      attr: { type: "search", placeholder: "搜索卡片、项目、标签" }
    });
    search.value = this.query;
    search.addEventListener("input", () => {
      this.query = search.value.trim().toLowerCase();
      this.applyFilter(container);
    });

    const addButton = actions.createEl("button", { cls: "pmk-btn", text: "+ 新建卡片" });
    addButton.addEventListener("click", () => {
      new CardModal(this.app, null, async (card) => {
        addCardToBoard(this.board, this.board.lanes[0].id, card);
        await this.saveBoard();
        this.render();
      }).open();
    });

    const boardEl = container.createDiv({ cls: "pmk-board" });
    for (const lane of this.board.lanes) {
      this.renderLane(boardEl, lane);
    }
    this.applyFilter(container);
  }

  renderLane(boardEl, lane) {
    const laneEl = boardEl.createDiv({ cls: "pmk-lane" });
    laneEl.dataset.laneId = lane.id;

    laneEl.addEventListener("dragover", (event) => {
      event.preventDefault();
      laneEl.addClass("is-drag-over");
    });
    laneEl.addEventListener("dragleave", () => laneEl.removeClass("is-drag-over"));
    laneEl.addEventListener("drop", async (event) => {
      event.preventDefault();
      laneEl.removeClass("is-drag-over");
      if (!this.draggedCardId) return;
      moveCard(this.board, this.draggedCardId, lane.id);
      await this.saveBoard();
      this.render();
    });

    const header = laneEl.createDiv({ cls: "pmk-lane-header" });
    header.createSpan({ cls: `pmk-status-dot ${lane.status || lane.id}` });
    header.createSpan({ text: lane.title });
    header.createSpan({ cls: "pmk-lane-count", text: String(lane.cards.length) });
    header.createSpan({ cls: "pmk-lane-spacer" });
    const add = header.createEl("button", { cls: "pmk-icon-btn", text: "+" });
    add.addEventListener("click", () => {
      new CardModal(this.app, null, async (card) => {
        addCardToBoard(this.board, lane.id, card);
        await this.saveBoard();
        this.render();
      }).open();
    });

    const list = laneEl.createDiv({ cls: "pmk-card-list" });
    for (const card of lane.cards) {
      this.renderCard(list, lane, card);
    }
    if (!lane.cards.length) {
      laneEl.createDiv({ cls: "pmk-empty", text: "暂无卡片" });
    }
  }

  renderCard(list, lane, card) {
    const cardEl = list.createDiv({ cls: "pmk-card", attr: { draggable: "true" } });
    cardEl.dataset.cardId = card.id;
    cardEl.dataset.search = [
      card.title,
      card.context,
      card.project,
      card.type,
      card.stage,
      card.owner,
      ...(card.tags || [])
    ].filter(Boolean).join(" ").toLowerCase();

    cardEl.addEventListener("dragstart", () => {
      this.draggedCardId = card.id;
    });
    cardEl.addEventListener("dragend", () => {
      this.draggedCardId = null;
    });
    cardEl.addEventListener("click", () => {
      new CardModal(this.app, card, async (updated, action) => {
        if (action === "delete") {
          removeCard(this.board, card.id);
        } else {
          Object.assign(card, updated);
        }
        await this.saveBoard();
        this.render();
      }).open();
    });

    if (card.context) {
      cardEl.createDiv({ cls: "pmk-card-context", text: card.context });
    }

    const title = cardEl.createDiv({ cls: "pmk-card-title" });
    title.createSpan({ cls: `pmk-card-check ${lane.status || lane.id}` });
    title.createSpan({ text: card.title || "未命名卡片" });

    const footer = cardEl.createDiv({ cls: "pmk-card-footer" });
    if (card.project) footer.createSpan({ cls: "pmk-chip project", text: card.project });
    if (card.owner) footer.createSpan({ cls: "pmk-chip owner", text: card.owner });
    if (card.stage) footer.createSpan({ cls: "pmk-chip", text: card.stage });
    if (card.type) footer.createSpan({ cls: "pmk-chip", text: card.type });
    if (card.priority) footer.createSpan({ cls: `pmk-chip ${priorityClass(card.priority)}`, text: card.priority });
    if (card.due) footer.createSpan({ cls: `pmk-chip ${dueClass(card.due)}`, text: card.due });
    for (const tag of card.tags || []) {
      if (![card.stage, card.type].includes(tag)) footer.createSpan({ cls: "pmk-chip", text: tag });
    }
  }

  applyFilter(container) {
    const cards = container.querySelectorAll(".pmk-card");
    for (const card of cards) {
      const matched = !this.query || card.dataset.search.includes(this.query);
      card.toggleClass("is-hidden", !matched);
    }
  }
}

class CardModal extends Modal {
  constructor(app, card, onSubmit) {
    super(app);
    this.card = card ? { ...card } : {};
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.card.id ? "编辑卡片" : "新建卡片" });

    const grid = contentEl.createDiv({ cls: "pmk-modal-grid" });
    const fields = {};
    fields.title = addText(grid, "标题", this.card.title || "", "pmk-modal-wide");
    fields.context = addText(grid, "上下文", this.card.context || "");
    fields.project = addText(grid, "项目", this.card.project || "");
    fields.owner = addText(grid, "负责人", this.card.owner || "");
    fields.stage = addText(grid, "阶段", this.card.stage || "");
    fields.type = addText(grid, "类型", this.card.type || "");
    fields.priority = addText(grid, "优先级", this.card.priority || "P2");
    fields.due = addText(grid, "截止日期", this.card.due || "");
    fields.tags = addText(grid, "标签，逗号分隔", (this.card.tags || []).join(", "), "pmk-modal-wide");

    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    if (this.card.id) {
      const deleteButton = buttons.createEl("button", { text: "删除" });
      deleteButton.addEventListener("click", async () => {
        await this.onSubmit(this.card, "delete");
        this.close();
      });
    }
    const saveButton = buttons.createEl("button", { text: "保存", cls: "mod-cta" });
    saveButton.addEventListener("click", async () => {
      const next = {
        ...this.card,
        id: this.card.id || createId(),
        title: fields.title.value.trim() || "未命名卡片",
        context: fields.context.value.trim(),
        project: fields.project.value.trim(),
        owner: fields.owner.value.trim(),
        stage: fields.stage.value.trim(),
        type: fields.type.value.trim(),
        priority: fields.priority.value.trim(),
        due: fields.due.value.trim(),
        tags: fields.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean)
      };
      await this.onSubmit(next, "save");
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

function addText(container, name, value, cls) {
  let inputEl;
  const wrapper = container.createDiv({ cls: cls || "" });
  new Setting(wrapper)
    .setName(name)
    .addText((text) => {
      inputEl = text.inputEl;
      text.setValue(value);
    });
  return inputEl;
}

function normalizeBoard(board) {
  const next = { ...cloneBoard(DEFAULT_BOARD), ...board };
  next.lanes = Array.isArray(board.lanes) && board.lanes.length ? board.lanes : cloneBoard(DEFAULT_BOARD).lanes;
  for (const lane of next.lanes) {
    lane.id = lane.id || createId();
    lane.title = lane.title || "未命名";
    lane.status = lane.status || lane.id;
    lane.cards = Array.isArray(lane.cards) ? lane.cards : [];
    for (const card of lane.cards) {
      card.id = card.id || createId();
      card.tags = Array.isArray(card.tags) ? card.tags : [];
    }
  }
  return next;
}

function cloneBoard(board) {
  return JSON.parse(JSON.stringify(board));
}

function addCardToBoard(board, laneId, card) {
  const lane = board.lanes.find((item) => item.id === laneId) || board.lanes[0];
  lane.cards.push({
    id: card.id || createId(),
    title: card.title || "未命名卡片",
    context: card.context || "",
    project: card.project || "",
    type: card.type || "",
    stage: card.stage || "",
    priority: card.priority || "P2",
    owner: card.owner || "",
    due: card.due || "",
    tags: Array.isArray(card.tags) ? card.tags : []
  });
}

function moveCard(board, cardId, targetLaneId) {
  let found = null;
  for (const lane of board.lanes) {
    const index = lane.cards.findIndex((card) => card.id === cardId);
    if (index >= 0) {
      found = lane.cards.splice(index, 1)[0];
      break;
    }
  }
  if (!found) return;
  const targetLane = board.lanes.find((lane) => lane.id === targetLaneId);
  if (targetLane) targetLane.cards.push(found);
}

function removeCard(board, cardId) {
  for (const lane of board.lanes) {
    lane.cards = lane.cards.filter((card) => card.id !== cardId);
  }
}

function priorityClass(priority) {
  if (/P0|P1|高|紧急/i.test(priority)) return "priority-high";
  if (/P2|中/i.test(priority)) return "priority-medium";
  return "priority-low";
}

function dueClass(due) {
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = date.getTime() - today.getTime();
  if (diff < 0) return "overdue";
  if (diff <= 3 * 24 * 60 * 60 * 1000) return "due-soon";
  return "";
}

function createId() {
  return `card-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

# FlowBoard PM

FlowBoard PM is a lightweight project-management board for Obsidian. It provides Linear-style lanes, cards, tags, drag-and-drop status changes, and local `.pmboard` files.

它适合在 Obsidian 中管理需求、任务、阶段和交付状态。

## Features

- Local `.pmboard` files.
- Backlog, Todo, In Progress, and Done lanes.
- Cards with title, context, project, owner, stage, type, priority, due date, and tags.
- Project configuration for project name, color, owner, and description.
- Drag-and-drop status updates with automatic saving.
- Card search.
- Create, edit, and delete cards.
- Commands for creating a blank board or sample board.

## Usage

1. Enable `FlowBoard PM` in Obsidian community plugins.
2. Open the command palette.
3. Run `创建 FlowBoard PM 示例看板` or `创建 FlowBoard PM 看板`.
4. Open the created `.pmboard` file.

## Data

FlowBoard PM stores board data in plain local `.pmboard` files inside your vault. The plugin does not require an external service.

## Project Configuration

Use the `项目配置` button at the top of a board to edit board-level project metadata.

Project format:

```text
MT | #13a38b | Justin | 门店与运维相关项目
AI | #f5b700 | Justin | AI 自动化与数据处理
```

## Author

Created by [Cong-xu](https://github.com/Cong-xu).

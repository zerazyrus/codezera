import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const NOTE = 'Runs through the Codezera desktop app with the PMS account connected in Settings.'

export const CODEZERA_PMS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['pms', 'whoami'],
    summary: 'Show the connected PMS account',
    usage: 'codezera pms whoami [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [NOTE]
  },
  {
    path: ['pms', 'show'],
    summary: 'Read a PMS ticket or task: fields, sections, images, next statuses',
    usage: 'codezera pms show <id> [--kind ticket|task] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'kind'],
    positionalArgs: ['id'],
    examples: ['codezera pms show 1596498', 'codezera pms show 28073 --kind task --json']
  },
  {
    path: ['pms', 'list'],
    summary: 'List PMS tickets or tasks',
    usage:
      'codezera pms list [--kind ticket|task] [--status <s>] [--search <text>] [--owner <userId|all>] [--offset <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'kind', 'status', 'search', 'owner', 'offset']
  },
  {
    path: ['pms', 'queue'],
    summary: 'List open tickets as the PMS Ticket Dashboard ranks them',
    usage:
      'codezera pms queue [--role all|processing|verification|reception|owner] [--status <s>] [--search <text>] [--user <userId>] [--page <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'role', 'status', 'search', 'user', 'page']
  },
  {
    path: ['pms', 'comment', 'list'],
    summary: 'List comments and replies on a ticket or task',
    usage: 'codezera pms comment list <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    positionalArgs: ['id']
  },
  {
    path: ['pms', 'comment', 'add'],
    summary: 'Comment on a ticket or task as the connected user',
    usage:
      'codezera pms comment add <id> (--body <text> | --body-file <path|->) [--reply-to <commentId>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'body', 'body-file', 'reply-to'],
    positionalArgs: ['id']
  },
  {
    path: ['pms', 'images'],
    summary: "Download a ticket's attached images to a local temp folder",
    usage: 'codezera pms images <ticketId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    positionalArgs: ['id'],
    notes: ['Prints each local file path; open the files to view the images.']
  },
  {
    path: ['pms', 'users'],
    summary: 'List PMS users (ids for --owner, --user and report --to)',
    usage: 'codezera pms users [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['pms', 'status', 'options'],
    summary: 'List the status picklist of tickets or tasks',
    usage: 'codezera pms status options [--kind ticket|task] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'kind']
  },
  {
    path: ['pms', 'task', 'status'],
    summary: 'Set a task status (dates and progress follow PMS rules)',
    usage: 'codezera pms task status <taskId> --to <status> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'to'],
    positionalArgs: ['id']
  },
  {
    path: ['pms', 'ticket', 'options'],
    summary: 'List picklist values of a ticket field',
    usage: 'codezera pms ticket options --field <name> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'field']
  },
  {
    path: ['pms', 'ticket', 'tasks'],
    summary: 'List tasks linked to a ticket with logged hours',
    usage: 'codezera pms ticket tasks <ticketId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    positionalArgs: ['id']
  },
  {
    path: ['pms', 'ticket', 'take'],
    summary: 'Take a ticket: move it to In Progress and create the linked task',
    usage:
      'codezera pms ticket take <ticketId> [--task-type <type>] [--no-task] [--fields-json <json>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'task-type', 'no-task', 'fields-json'],
    positionalArgs: ['id'],
    notes: ['When PMS needs more fields or a task type, the result lists them; rerun with them.']
  },
  {
    path: ['pms', 'ticket', 'update'],
    summary: 'Change a ticket status and/or fields',
    usage: 'codezera pms ticket update <ticketId> [--status <s>] [--fields-json <json>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'status', 'fields-json'],
    positionalArgs: ['id']
  },
  {
    path: ['pms', 'ticket', 'finish'],
    summary: 'Finish a ticket: write cause and solution, set status, close linked tasks',
    usage:
      'codezera pms ticket finish <ticketId> --status <s> (--cause <text> | --cause-file <path|->) (--solution <text> | --solution-file <path|->) [--commit <text>] [--fields-json <json>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'id',
      'status',
      'cause',
      'cause-file',
      'solution',
      'solution-file',
      'commit',
      'fields-json'
    ],
    positionalArgs: ['id']
  },
  {
    path: ['pms', 'ticket', 'add-task'],
    summary: 'Create another task linked to a ticket',
    usage: 'codezera pms ticket add-task <ticketId> [--title <text>] [--task-type <type>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'title', 'task-type'],
    positionalArgs: ['id']
  },
  {
    path: ['pms', 'logtime', 'add'],
    summary: 'Log time on a ticket or task',
    usage:
      'codezera pms logtime add <id> --kind ticket|task [--hours <n>] [--minutes <n>] --category <value> [--date YYYY-MM-DD] (--body <text> | --body-file <path|->) [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'id',
      'kind',
      'hours',
      'minutes',
      'category',
      'date',
      'body',
      'body-file'
    ],
    positionalArgs: ['id'],
    examples: [
      'codezera pms logtime add 28073 --kind task --hours 1 --category coding --body "Fix"'
    ]
  },
  {
    path: ['pms', 'logtime', 'categories'],
    summary: 'List time-log categories',
    usage: 'codezera pms logtime categories [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['pms', 'logtime', 'hours'],
    summary: 'Show hours logged on a day',
    usage: 'codezera pms logtime hours [--date YYYY-MM-DD] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'date']
  },
  {
    path: ['pms', 'report', 'preview'],
    summary: 'Preview the daily or weekly report from logged time',
    usage: 'codezera pms report preview --type day|week [--date YYYY-MM-DD] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'type', 'date']
  },
  {
    path: ['pms', 'report', 'submit'],
    summary: 'Submit a daily or weekly report',
    usage:
      'codezera pms report submit --type day|week [--date YYYY-MM-DD] --name <title> (--body <text> | --body-file <path|->) [--to <userId>...] [--draft] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'type', 'date', 'name', 'body', 'body-file', 'to', 'draft'],
    repeatableFlags: ['to'],
    notes: ['The report always goes to your PMS managers; --to adds more recipients.']
  }
]

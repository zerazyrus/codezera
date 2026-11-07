import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from './pms-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PmsPicker } from './pms-picker'
import type {
  PmsItemDetail,
  PmsLinkedTask,
  PmsStatusOption
} from '../../../../shared/codezera/pms-types'
import { pmsErrorText, pmsToday, usePmsStore } from './pms-store'

const DEFAULT_CATEGORY = 'coding'
const TICKET_TARGET = '__ticket__'
const NEW_TASK_TARGET = '__new_task__'
const CLOSED_TASK_STATUSES = ['Completed', 'Completed Late', 'Canceled', 'Canceled ']

let cachedCategories: PmsStatusOption[] | null = null

export function PmsLogTimeForm({
  item,
  onDone
}: {
  item: PmsItemDetail
  onDone: () => void
}): React.JSX.Element {
  const refreshTodayHours = usePmsStore((s) => s.refreshTodayHours)
  const [categories, setCategories] = useState<PmsStatusOption[]>(cachedCategories ?? [])
  const [hours, setHours] = useState('1')
  const [minutes, setMinutes] = useState('0')
  const [category, setCategory] = useState(DEFAULT_CATEGORY)
  const [date, setDate] = useState(pmsToday)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Tickets: time goes on a linked task by team rule (an open one, else a new one); the ticket
  // itself stays possible.
  const [tasks, setTasks] = useState<PmsLinkedTask[] | null>(null)
  const [target, setTarget] = useState(item.kind === 'ticket' ? NEW_TASK_TARGET : TICKET_TARGET)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [taskTypes, setTaskTypes] = useState<PmsStatusOption[] | null>(null)
  const [taskType, setTaskType] = useState<string | null>(null)

  useEffect(() => {
    if (item.kind !== 'ticket') {
      return
    }
    let cancelled = false
    window.api.codezera.pms
      .ticketTasks(item.id)
      .then((linked) => {
        if (cancelled) {
          return
        }
        setTasks(linked)
        const open = linked.find((task) => !CLOSED_TASK_STATUSES.includes(task.status))
        if (open) {
          setTarget(open.id)
        }
      })
      .catch(() => !cancelled && setTasks([]))
    return () => {
      cancelled = true
    }
  }, [item.kind, item.id])

  useEffect(() => {
    if (cachedCategories) {
      return
    }
    window.api.codezera.pms
      .logTimeCategories()
      .then((options) => {
        cachedCategories = options
        setCategories(options)
      })
      .catch((err: unknown) => setError(pmsErrorText(err)))
  }, [])

  const hoursValue = Number(hours)
  const minutesValue = Number(minutes)
  const valid =
    Number.isInteger(hoursValue) &&
    Number.isInteger(minutesValue) &&
    hoursValue >= 0 &&
    hoursValue <= 24 &&
    minutesValue >= 0 &&
    minutesValue <= 59 &&
    hoursValue * 60 + minutesValue > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date)

  const logOn = (kind: PmsItemDetail['kind'], id: string, label: string): Promise<void> =>
    window.api.codezera.pms
      .logTime({ kind, id, hours: hoursValue, minutes: minutesValue, category, date, description })
      .then(() => {
        toast.success(
          translate('codezera.pms.logged', 'Logged {{hours}}h {{minutes}}m on {{item}}', {
            hours: hoursValue,
            minutes: minutesValue,
            item: label
          })
        )
        void refreshTodayHours().catch(() => undefined)
        onDone()
      })

  const createTaskThenLog = async (): Promise<void> => {
    const created = await window.api.codezera.pms.createTicketTask({
      ticketId: item.id,
      title: newTaskTitle,
      taskType
    })
    if (created.needs === 'taskType') {
      setTaskTypes(created.options)
      setError(translate('codezera.pms.chooseTaskType', 'Choose a task type for the new task.'))
      return
    }
    const title = newTaskTitle.trim() || item.title
    // A failed log must not create a second task on retry.
    setTasks((current) => [
      { id: created.taskId, number: '', title, status: 'In Progress', hours: 0 },
      ...(current ?? [])
    ])
    setTarget(created.taskId)
    await logOn('task', created.taskId, title)
  }

  const submit = (): void => {
    setSaving(true)
    setError(null)
    const run =
      target === NEW_TASK_TARGET
        ? createTaskThenLog()
        : target === TICKET_TARGET
          ? logOn(item.kind, item.id, item.number || item.title)
          : logOn('task', target, tasks?.find((task) => task.id === target)?.number || item.number)
    run.catch((err: unknown) => setError(pmsErrorText(err))).finally(() => setSaving(false))
  }

  return (
    <form
      className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/30 p-3 text-[13px]"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) {
          submit()
        }
      }}
    >
      {item.kind === 'ticket' ? (
        <PmsPicker
          value={target}
          onChange={setTarget}
          disabled={tasks === null}
          display={targetLabel(target, tasks)}
          className="w-full"
          options={[...(tasks ?? []).map((task) => task.id), NEW_TASK_TARGET, TICKET_TARGET].map(
            (id) => ({ value: id, label: targetLabel(id, tasks) })
          )}
        />
      ) : null}
      {target === NEW_TASK_TARGET ? (
        <div className="flex items-center gap-1.5">
          <Input
            value={newTaskTitle}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            placeholder={item.title}
            className="h-8 min-w-0 flex-1 text-[13px]"
            aria-label={translate('codezera.pms.newTaskTitle', 'New task title')}
          />
          {taskTypes ? (
            <PmsPicker
              value={taskType ?? ''}
              onChange={setTaskType}
              placeholder={translate('codezera.pms.taskType', 'Task type')}
              options={taskTypes}
              className="w-44"
            />
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={0}
          max={24}
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          className="h-8 w-16 text-[13px]"
          aria-label={translate('codezera.pms.hours', 'Hours')}
        />
        <span className="text-muted-foreground">h</span>
        <Input
          type="number"
          min={0}
          max={59}
          step={5}
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          className="h-8 w-16 text-[13px]"
          aria-label={translate('codezera.pms.minutes', 'Minutes')}
        />
        <span className="text-muted-foreground">m</span>
        <Input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="h-8 min-w-0 flex-1 text-[13px]"
          aria-label={translate('codezera.pms.date', 'Date')}
        />
      </div>
      <PmsPicker
        value={category}
        onChange={setCategory}
        options={
          categories.length > 0
            ? categories
            : [{ value: DEFAULT_CATEGORY, label: DEFAULT_CATEGORY }]
        }
        className="w-full"
      />
      <Textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder={translate(
          'codezera.pms.logDescription',
          'What did you do? (defaults to the title)'
        )}
        className="min-h-20 text-[13px]"
      />
      {error ? <p className="break-words text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {translate('codezera.pms.cancel', 'Cancel')}
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={saving || !valid || (target === NEW_TASK_TARGET && !!taskTypes && !taskType)}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {target === NEW_TASK_TARGET
            ? translate('codezera.pms.createTaskAndLog', 'Create task & log time')
            : translate('codezera.pms.logTime', 'Log time')}
        </Button>
      </div>
    </form>
  )
}

function targetLabel(target: string, tasks: PmsLinkedTask[] | null): string {
  if (target === NEW_TASK_TARGET) {
    return translate('codezera.pms.logOnNewTask', 'New task under this ticket')
  }
  const task = tasks?.find((entry) => entry.id === target)
  if (!task) {
    return translate('codezera.pms.logOnTicket', 'The ticket itself')
  }
  return translate('codezera.pms.logOnTask', 'Task {{number}} · {{status}} · {{hours}}h', {
    number: task.number || task.id,
    status: task.status.trim(),
    hours: task.hours
  })
}

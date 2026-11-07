import { describe, expect, it } from 'vitest'
import { pmsHtmlToText, taskStatusFields, toPmsItem } from './pms-records'

describe('pmsHtmlToText', () => {
  it('turns CKEditor markup into readable lines', () => {
    const html =
      '<html><head><title></title></head><body><p>Data test:</p><ul><li>Tổ chức &quot;A&quot;</li>' +
      '<li>SĐT&nbsp;0123</li></ul>Line&#39;s end<br />next &amp; &#x41;</body></html>'
    expect(pmsHtmlToText(html)).toBe(
      'Data test:\n\n- Tổ chức "A"\n- SĐT 0123\nLine\'s end\nnext & A'
    )
  })
})

describe('taskStatusFields', () => {
  it('starts the task today when it moves to In Progress', () => {
    expect(taskStatusFields('In Progress', '2026-11-03')).toEqual({
      projecttaskstatus: 'In Progress',
      startdate: '2026-11-03',
      start_date_plan: '2026-11-03'
    })
  })

  it('closes the task at 100% when completed', () => {
    expect(taskStatusFields('Completed', '2026-11-03')).toEqual({
      projecttaskstatus: 'Completed',
      enddate: '2026-11-03',
      end_date_plan: '2026-11-03',
      projecttaskprogress: '100%'
    })
  })

  // The PMS picklist value is "Canceled " with a trailing space; the stored value must stay exact.
  it('ends a canceled task without marking progress, keeping the picklist value verbatim', () => {
    expect(taskStatusFields('Canceled ', '2026-11-03')).toEqual({
      projecttaskstatus: 'Canceled ',
      enddate: '2026-11-03',
      end_date_plan: '2026-11-03'
    })
  })

  it('leaves dates alone for other moves', () => {
    expect(taskStatusFields('Testing', '2026-11-03')).toEqual({ projecttaskstatus: 'Testing' })
  })
})

describe('toPmsItem', () => {
  it('maps a ticket retrieve payload, treating project "0" as none', () => {
    const item = toPmsItem('https://pms.example', 'ticket', {
      id: '15',
      ticket_no: '#27353',
      ticket_title: 'Popup',
      label: 'ignored',
      ticketstatus: 'Assigned',
      ticketpriorities: 'High',
      related_project: '0',
      hours: '1.50'
    })
    expect(item).toEqual({
      kind: 'ticket',
      id: '15',
      number: '#27353',
      title: 'Popup',
      status: 'Assigned',
      priority: 'High',
      projectId: null,
      projectLabel: null,
      hours: 1.5,
      url: 'https://pms.example/index.php?module=HelpDesk&view=Detail&record=15'
    })
  })

  it('maps a task list row with its project label', () => {
    const item = toPmsItem('https://pms.example', 'task', {
      projecttaskid: '99',
      projecttaskname: 'Fix cron',
      projecttaskstatus: 'In Progress',
      projectid: '7',
      projectid_label: 'Ái Nghĩa',
      projecttaskhours: '0'
    })
    expect(item).toMatchObject({ id: '99', number: '', projectId: '7', projectLabel: 'Ái Nghĩa' })
  })
})

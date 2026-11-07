import { describe, expect, it } from 'vitest'
import {
  autofillErrorCause,
  linkedTaskStatusFor,
  syncTicketOwners,
  ticketFormMissing
} from './pms-ticket-rules'

const fields = (values: Record<string, string>): string[] =>
  ticketFormMissing(values).map((field) => field.field)

describe('ticketFormMissing', () => {
  it('requires the bug analysis fields and the processing date when a bug moves to In Progress', () => {
    expect(
      fields({
        ticketcategories: 'Bug',
        ticketstatus: 'In Progress',
        ticketpriorities: 'Normal',
        description: 'x',
        related_project: '12',
        related_cpinstance: '34',
        processing_user_id: '1460',
        verification_user_id: '0'
      })
    ).toEqual([
      'ticketseverities',
      'helpdesk_bug_type',
      'steps_to_reproduce',
      'expected_result',
      'actual_result',
      'helpdesk_detection_phase',
      'helpdesk_error_cause',
      'verification_user_id',
      'expected_doneline'
    ])
  })

  it('asks an assigned support ticket for its people and dates, and a cancel for its reason', () => {
    expect(
      fields({ ticketcategories: 'support', ticketstatus: 'Assigned', ticketpriorities: 'High' })
    ).toEqual(['expected_date', 'verification_user_id', 'processing_user_id'])
    expect(
      fields({ ticketcategories: 'support', ticketstatus: 'Cancel', ticketpriorities: 'Low' })
    ).toEqual(['cancel_reason'])
  })

  it('treats Reopen like Open, before the verification step', () => {
    expect(fields({ ticketcategories: 'support', ticketstatus: 'Reopen' })).toEqual([])
  })
})

describe('autofillErrorCause', () => {
  it('derives the cause from the detection phase only while it is empty', () => {
    const data: Record<string, string> = {}
    autofillErrorCause({ ticketcategories: 'Bug', helpdesk_detection_phase: 'dp_uat' }, data)
    expect(data).toEqual({ helpdesk_error_cause: 'ec_testing_missed' })

    const kept: Record<string, string> = {}
    autofillErrorCause(
      {
        ticketcategories: 'Bug',
        helpdesk_detection_phase: 'dp_uat',
        helpdesk_error_cause: 'ec_requirement'
      },
      kept
    )
    expect(kept).toEqual({})
  })
})

describe('syncTicketOwners', () => {
  it('puts the assignment users first and keeps hand-added owners', () => {
    const data: Record<string, string> = { processing_user_id: '1460' }
    syncTicketOwners(
      { processing_user_id: '0', verification_user_id: '6012', reception_user_id: '6012' },
      ['Users:6012', 'Users:77'],
      data
    )
    expect(data.assigned_user_id).toBe('Users:1460,Users:6012,Users:77')
  })

  it('drops the replaced assignee', () => {
    const data: Record<string, string> = { processing_user_id: '1460' }
    syncTicketOwners(
      { processing_user_id: '999', verification_user_id: '6012' },
      ['Users:999', 'Users:6012'],
      data
    )
    expect(data.assigned_user_id).toBe('Users:1460,Users:6012')
  })
})

describe('linkedTaskStatusFor', () => {
  it('closes the task once the ticket leaves processing and cancels it with the ticket', () => {
    expect(linkedTaskStatusFor('In Progress')).toBeNull()
    expect(linkedTaskStatusFor('Testing')).toBe('Completed')
    expect(linkedTaskStatusFor('Wait Close')).toBe('Completed')
    expect(linkedTaskStatusFor('Reject')).toBe('Canceled ')
  })
})

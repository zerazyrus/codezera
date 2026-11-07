import { describe, expect, it } from 'vitest'
import type { PmsItem } from '../../../../shared/codezera/pms-types'
import { pmsBranchName, pmsWorkspaceName } from './pms-workspace-link'

const ticket: PmsItem = {
  kind: 'ticket',
  id: '1585978',
  number: '#27353',
  title: '[TĐP] Popup "Tìm kiếm" không trả kết quả đối với Tổ chức khi có số lạ gọi vào',
  status: 'Assigned',
  priority: 'High',
  projectId: null,
  projectLabel: null,
  hours: 0,
  url: ''
}

describe('pmsWorkspaceName', () => {
  it('names tickets by number with an ASCII slug cut at a word boundary', () => {
    expect(pmsWorkspaceName(ticket)).toBe('ticket-27353-popup-tim-kiem-khong-tra-ket-qua-doi-voi')
  })

  it('names tasks by record id and folds đ', () => {
    expect(
      pmsWorkspaceName({ ...ticket, kind: 'task', id: '1587399', number: '', title: 'Đồng bộ' })
    ).toBe('task-1587399-dong-bo')
  })
})

describe('pmsBranchName', () => {
  it('follows git-flow by ticket category', () => {
    expect(pmsBranchName(ticket, 'Bug')).toBe('bug/#27353-popup-tim-kiem-khong-tra-ket-qua-doi-voi')
    expect(pmsBranchName({ ...ticket, title: 'Đồng bộ' }, 'Improve')).toBe('feature/#27353-dong-bo')
    expect(pmsBranchName({ ...ticket, title: 'Đồng bộ' }, 'support')).toBe('task/#27353-dong-bo')
  })
})

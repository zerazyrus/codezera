import type { HandlerGroup } from '../dispatch/handler-group-manifest'
import { CODEZERA_PMS_COMMAND_SPECS } from '../specs/codezera-pms'

export const CODEZERA_PMS_HANDLER_GROUP: HandlerGroup = {
  name: 'codezera-pms',
  keys: CODEZERA_PMS_COMMAND_SPECS.map((spec) => spec.path.join(' ')),
  load: async () => (await import('./codezera-pms.js')).CODEZERA_PMS_HANDLERS
}

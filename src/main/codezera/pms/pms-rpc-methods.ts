import { CodezeraPmsCall } from '../../../shared/rpc-contract/codezera-pms-params'
import { defineMethod } from '../../runtime/rpc/core'

type PmsDispatcher = (action: string, args: unknown) => Promise<unknown>

let dispatcher: PmsDispatcher | null = null

/** The desktop app installs the PMS actions; the RPC layer stays free of Electron imports. */
export function setPmsAgentDispatcher(next: PmsDispatcher): void {
  dispatcher = next
}

export const CODEZERA_PMS_METHODS = [
  defineMethod({
    name: 'codezera.pms',
    permission: 'workspace',
    params: CodezeraPmsCall,
    handler: async (params) => {
      if (!dispatcher) {
        throw new Error('PMS is only available from the Codezera desktop app.')
      }
      return dispatcher(params.action, params.args)
    }
  })
]

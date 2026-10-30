export type OrcaImportProbe =
  | { available: true; sourcePath: string; projectCount: number }
  | { available: false }

export type OrcaImportResult = { status: 'relaunching' } | { status: 'cancelled' }

export type OrcaImportApi = {
  probe: () => Promise<OrcaImportProbe>
  /** Asks for confirmation, stages Orca's config, and relaunches to apply it. */
  run: () => Promise<OrcaImportResult>
}

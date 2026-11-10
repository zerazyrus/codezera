import React, { useCallback } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { IntegrationCardDetails } from '@/components/integrations/presentation/integration-card-shell'
import { SkillUnsupportedStatusPill } from '@/components/skills/SkillFreshnessStatusPill'
import { BundledSkillInstallStatus } from '@/components/skills/setup/BundledSkillInstallStatus'
import { useActiveProjectSkillRuntime } from '@/hooks/useActiveProjectSkillRuntime'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkillNames
} from '@/hooks/useInstalledAgentSkills'
import { useBundledSkillInstallAction } from '@/hooks/use-bundled-skill-install-action'
import {
  bundledSkillInstallNeedsAttention,
  useBundledSkillInstall
} from '@/hooks/use-bundled-skill-install'
import { recheckSurfacesAfterAgentSkillInstall } from '@/hooks/agent-skill-recheck-surface-sync'
import { translate } from './pms-i18n'

const PMS_SKILL_NAMES = ['orca-pms'] as const

/** Installs the bundled `orca-pms` skill so any agent, even in a blank chat, knows `orca pms`. */
export function PmsAgentSkillSetting(): React.JSX.Element {
  const runtime = useActiveProjectSkillRuntime()
  const skill = useInstalledAgentSkillNames(PMS_SKILL_NAMES, {
    discoveryTarget: runtime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const { refresh } = skill
  const onFinished = useCallback(() => recheckSurfacesAfterAgentSkillInstall(refresh), [refresh])
  const skillInstall = useBundledSkillInstall({ onFinished, target: runtime.bundledSkillTarget })
  const { state, ready, install } = skillInstall
  const action = useBundledSkillInstallAction(PMS_SKILL_NAMES, {
    enabled: true,
    refreshKey: state.kind,
    target: runtime.bundledSkillTarget
  })
  const unsupported = action.kind === 'unsupported' ? action.reason : undefined
  const needsAttention = action.kind === 'attention'
  const replacePaths = action.kind === 'replace' ? action.paths : undefined
  const outdated = action.kind === 'run' || action.kind === 'unknown' || Boolean(replacePaths)
  const showButton =
    !skill.loading &&
    !unsupported &&
    !needsAttention &&
    action.kind !== 'none' &&
    (!skill.installed || outdated) &&
    state.kind !== 'unsupported' &&
    !bundledSkillInstallNeedsAttention(state)
  const installing = state.kind === 'installing'

  return (
    <IntegrationCardDetails>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">
          {translate('codezera.pms.agentSkill.title', 'Agent skill')}{' '}
          <span className="font-mono text-xs text-muted-foreground">orca-pms</span>
        </p>
        {unsupported ? (
          <SkillUnsupportedStatusPill reason={unsupported} />
        ) : skill.loading ? (
          <IntegrationStatusPill tone="neutral">
            {translate('codezera.pms.agentSkill.checking', 'Checking...')}
          </IntegrationStatusPill>
        ) : (
          <IntegrationStatusPill tone={skill.installed ? 'connected' : 'attention'}>
            {skill.installed
              ? translate('codezera.pms.agentSkill.installed', 'Installed')
              : translate('codezera.pms.agentSkill.notInstalled', 'Not installed')}
          </IntegrationStatusPill>
        )}
        {showButton ? (
          <Button
            variant="outline"
            size="xs"
            className="ml-auto gap-1.5"
            disabled={installing || !ready || action.kind === 'loading'}
            onClick={() => void install(PMS_SKILL_NAMES, replacePaths)}
          >
            {installing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Download className="size-3" />
            )}
            {skill.installed
              ? translate('codezera.pms.agentSkill.update', 'Update')
              : translate('codezera.pms.agentSkill.install', 'Install')}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(
          'codezera.pms.agentSkill.hint',
          'Lets Claude, Codex, omp and other agents read and update PMS tickets and tasks with this account through the orca pms command, even in a chat not started from a ticket. Replaces the /pms skill.'
        )}
      </p>
      {skill.error ? <p className="text-xs text-destructive">{skill.error}</p> : null}
      <BundledSkillInstallStatus
        install={skillInstall}
        unsupported={unsupported}
        attention={
          needsAttention
            ? { retry: () => void install(PMS_SKILL_NAMES), message: action.attentionMessage }
            : undefined
        }
        buttonSize="xs"
      />
    </IntegrationCardDetails>
  )
}

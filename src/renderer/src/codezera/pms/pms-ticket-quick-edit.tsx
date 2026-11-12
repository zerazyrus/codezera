import React, { useState } from 'react'
import { ChevronDown, Expand, Lightbulb } from 'lucide-react'
import { translate } from './pms-i18n'
import { Input } from '@/components/ui/input'
import { PmsPicker } from './pms-picker'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/class-names'
import type {
  PmsDetailSectionKey,
  PmsItemDetail,
  PmsStatusOption,
  PmsTicketEditField,
  PmsTicketExtras
} from '../../../../shared/codezera/pms-types'
import { PmsImageViewer } from './pms-image-viewer'

export type PmsTicketDraft = Record<PmsTicketEditField, string>

function sectionTitle(key: PmsDetailSectionKey): string {
  switch (key) {
    case 'description':
      return translate('codezera.pms.section.description', 'Description')
    case 'steps':
      return translate('codezera.pms.section.steps', 'Steps to reproduce')
    case 'expected':
      return translate('codezera.pms.section.expected', 'Expected result')
    case 'actual':
      return translate('codezera.pms.section.actual', 'Actual result')
    case 'solution':
      return translate('codezera.pms.section.solution', 'Solution')
  }
}

/** When each ticket category applies, as the PMS status modal explains it under the chips. */
function categoryHint(category: string): string | null {
  switch (category) {
    case 'Bug':
      return translate(
        'codezera.pms.categoryHint.bug',
        'A feature behaves wrongly. Project: a bug in the customer’s customization. R&D: a core bug that affects every site.'
      )
    case 'Change Request':
      return translate(
        'codezera.pms.categoryHint.changeRequest',
        'The customer asks for a new feature or a business change outside the agreed scope. Project only.'
      )
    case 'Improve':
      return translate(
        'codezera.pms.categoryHint.improve',
        'A feature works but should work better. Project: an improvement for the customer. R&D: a product improvement that goes into core.'
      )
    case 'Feedback':
      return translate(
        'codezera.pms.categoryHint.feedback',
        'An opinion or idea that is not a concrete request yet. Once agreed, move it to Improvement or Change request.'
      )
    case 'Setup':
      return translate(
        'codezera.pms.categoryHint.setup',
        'Site rollout, license upgrade or environment setup for a customer. Project only.'
      )
    case 'support':
      return translate(
        'codezera.pms.categoryHint.support',
        'Guidance, training, renewal or data fixes for a customer, with no code change. Project only.'
      )
    case 'portal_mini_app':
      return translate(
        'codezera.pms.categoryHint.portalMiniApp',
        'Requests about the customer’s Portal / Mini app, e.g. a Portal account.'
      )
    case 'Other':
      return translate(
        'codezera.pms.categoryHint.other',
        'Internal work, or anything the other categories do not cover.'
      )
    default:
      return null
  }
}

function Block({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Collapsible defaultOpen className="rounded-lg border border-border/60 bg-background/60">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-foreground">
        <ChevronDown className="size-4 transition-transform group-data-[state=closed]:-rotate-90" />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border/50 px-4 py-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

function Field({
  label,
  className,
  children
}: {
  label: string
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function ReadOnly({ value }: { value: string | null }): React.JSX.Element {
  return (
    <span className="flex h-8 items-center truncate rounded-md border border-border/50 bg-muted/30 px-3 text-[13px] text-foreground">
      {value || <span className="text-muted-foreground">—</span>}
    </span>
  )
}

function Dot({ color }: { color: string | null }): React.JSX.Element | null {
  return color && color !== '#ffffff' ? (
    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
  ) : null
}

function PicklistSelect({
  value,
  options,
  disabled,
  onChange,
  label
}: {
  value: string
  options: PmsStatusOption[] | undefined
  disabled: boolean
  onChange: (value: string) => void
  label: string
}): React.JSX.Element {
  return (
    <PmsPicker
      value={value}
      onChange={onChange}
      disabled={disabled}
      ariaLabel={label}
      className="w-full"
      options={(options ?? []).map((option) => ({
        value: option.value,
        label: option.label,
        node: (
          <span className="flex min-w-0 items-center gap-2">
            <Dot color={option.color} />
            <span className="truncate">{option.label}</span>
          </span>
        )
      }))}
    />
  )
}

function Segmented({
  value,
  options,
  disabled,
  onChange,
  label
}: {
  value: string
  options: PmsStatusOption[] | undefined
  disabled: boolean
  onChange: (value: string) => void
  label: string
}): React.JSX.Element {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      disabled={disabled}
      aria-label={label}
      className="w-full"
      onValueChange={(next) => next && onChange(next)}
    >
      {(options ?? []).map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} className="flex-1 text-[13px]">
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** The PMS ticket status modal's blocks: category, ticket info, customer, problem, assignment. */
export function PmsTicketQuickEdit({
  detail,
  ticket,
  draft,
  disabled,
  onChange
}: {
  detail: PmsItemDetail
  ticket: PmsTicketExtras
  draft: PmsTicketDraft
  disabled: boolean
  onChange: (field: PmsTicketEditField, value: string) => void
}): React.JSX.Element {
  const category = draft.ticketcategories
  const hint = categoryHint(category)
  const [imageIndex, setImageIndex] = useState<number | null>(null)
  const picklist = (field: PmsTicketEditField, label: string): React.JSX.Element => (
    <Field label={label}>
      <PicklistSelect
        label={label}
        value={draft[field]}
        options={ticket.options[field]}
        disabled={disabled}
        onChange={(value) => onChange(field, value)}
      />
    </Field>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm font-semibold text-foreground">
            {translate('codezera.pms.field.category', 'Type')}
          </span>
          {(ticket.options.ticketcategories ?? []).map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange('ticketcategories', option.value)}
              className={cn(
                'flex h-8 items-center gap-2 rounded-md border px-3 text-[13px] transition',
                option.value === category
                  ? 'border-primary bg-primary/10 font-medium text-foreground'
                  : 'border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Dot color={option.color} />
              {option.label}
            </button>
          ))}
        </div>
        {hint ? (
          <p className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            <span>{hint}</span>
          </p>
        ) : null}
      </div>

      <Block title={translate('codezera.pms.block.ticket', 'Ticket')}>
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
          <Field label={translate('codezera.pms.field.title', 'Title')} className="@2xl:col-span-2">
            <Input
              value={draft.ticket_title}
              disabled={disabled}
              onChange={(event) => onChange('ticket_title', event.target.value)}
              className="h-8 text-[13px]"
            />
          </Field>
          <Field label={translate('codezera.pms.field.projectType', 'Track')}>
            <Segmented
              label={translate('codezera.pms.field.projectType', 'Track')}
              value={draft.helpdesk_project_type}
              options={ticket.options.helpdesk_project_type}
              disabled={disabled}
              onChange={(value) => onChange('helpdesk_project_type', value)}
            />
          </Field>
          {picklist('helpdesk_subcategory', translate('codezera.pms.field.subcategory', 'Area'))}
          {picklist('ticketpriorities', translate('codezera.pms.field.priority', 'Priority'))}
          <Field label={translate('codezera.pms.field.importance', 'Importance')}>
            <Segmented
              label={translate('codezera.pms.field.importance', 'Importance')}
              value={draft.importance_level}
              options={ticket.options.importance_level}
              disabled={disabled}
              onChange={(value) => onChange('importance_level', value)}
            />
          </Field>
          {category === 'Bug'
            ? picklist('ticketseverities', translate('codezera.pms.field.severity', 'Severity'))
            : null}
          {category === 'Bug'
            ? picklist('helpdesk_bug_type', translate('codezera.pms.field.bugType', 'Bug type'))
            : null}
          <Field label={translate('codezera.pms.field.expectedDate', 'Wanted by')}>
            <Input
              type="date"
              value={draft.expected_date}
              disabled={disabled}
              onChange={(event) => onChange('expected_date', event.target.value)}
              className="h-8 text-[13px]"
            />
          </Field>
        </div>
      </Block>

      <Block title={translate('codezera.pms.block.customer', 'Customer')}>
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
          {picklist(
            'helpdesk_customer_group',
            translate('codezera.pms.field.customerGroup', 'Customer group')
          )}
          <Field label={translate('codezera.pms.field.install', 'Install link')}>
            <ReadOnly value={ticket.install} />
          </Field>
          <Field label={translate('codezera.pms.project', 'Project')}>
            <ReadOnly value={detail.projectLabel} />
          </Field>
          <Field label={translate('codezera.pms.field.account', 'Organization')}>
            <ReadOnly value={ticket.account} />
          </Field>
          <Field label={translate('codezera.pms.field.contact', 'Contact')}>
            <ReadOnly value={ticket.contact} />
          </Field>
          <Field label={translate('codezera.pms.field.source', 'Source')}>
            <ReadOnly value={ticket.source} />
          </Field>
        </div>
      </Block>

      <Block title={translate('codezera.pms.block.problem', 'Problem details')}>
        <div className="flex flex-col gap-4">
          {detail.sections.map((section) => (
            <section key={section.key} className="flex flex-col gap-1.5">
              <h4 className="text-xs text-muted-foreground">{sectionTitle(section.key)}</h4>
              <p className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[13px] leading-relaxed break-words whitespace-pre-wrap text-foreground select-text">
                {section.text}
              </p>
            </section>
          ))}
          {ticket.images.length > 0 ? (
            <section className="flex flex-col gap-1.5">
              <h4 className="text-xs text-muted-foreground">
                {translate('codezera.pms.field.images', 'Images')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {ticket.images.map((image, index) => (
                  <button
                    key={image.url}
                    type="button"
                    title={image.name}
                    onClick={() => setImageIndex(index)}
                    className="group relative size-20 overflow-hidden rounded-md border border-border/60"
                  >
                    <img src={image.url} alt={image.name} className="size-full object-cover" />
                    <Expand className="absolute top-1 right-1 size-3.5 text-white opacity-0 drop-shadow group-hover:opacity-100" />
                  </button>
                ))}
              </div>
              <PmsImageViewer
                images={ticket.images}
                index={imageIndex}
                onIndexChange={setImageIndex}
              />
            </section>
          ) : null}
        </div>
      </Block>

      <Block title={translate('codezera.pms.block.assignment', 'Assignment')}>
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
          <Field label={translate('codezera.pms.field.reception', 'Received by')}>
            <ReadOnly value={ticket.reception} />
          </Field>
          <Field label={translate('codezera.pms.field.verification', 'Verified by')}>
            <ReadOnly value={ticket.verification} />
          </Field>
          <Field label={translate('codezera.pms.field.processing', 'Handled by')}>
            <ReadOnly value={ticket.processing} />
          </Field>
          <Field
            label={translate('codezera.pms.field.followers', 'Followers')}
            className="@2xl:col-span-3"
          >
            <ReadOnly value={ticket.followers.join(', ')} />
          </Field>
        </div>
      </Block>
    </div>
  )
}

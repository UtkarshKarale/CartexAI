import type { ReactNode } from 'react'
import { Clock3, Database, FileText, ShieldAlert, Workflow } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { ScrollArea } from '../../components/ui/scroll-area'
import { Separator } from '../../components/ui/separator'
import type {
  ActivityRecord,
  IndexedFileRecord,
  PermissionRecord,
  ToolExecutionRecord,
  WorkflowRecord,
} from '../../shared/contracts'
import { formatDateTime } from '../../lib/utils'

interface ActivityPanelProps {
  activity: ActivityRecord[]
  workflows: WorkflowRecord[]
  toolExecutions: ToolExecutionRecord[]
  indexedFiles: IndexedFileRecord[]
  permissions: PermissionRecord[]
}

export function ActivityPanel({
  activity,
  workflows,
  toolExecutions,
  indexedFiles,
  permissions,
}: ActivityPanelProps) {
  return (
    <Card className="h-full border-white/8 bg-slate-950/55">
      <CardHeader>
        <Badge variant="muted">Activity and memory</Badge>
        <CardTitle className="mt-3 text-xl">Operational state</CardTitle>
        <CardDescription className="text-slate-400">
          Indexed files, tool runs, permissions, and recent events.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Section title="Recent activity" icon={Clock3} count={activity.length}>
          <ScrollArea className="max-h-52 pr-1">
            <div className="space-y-3">
              {activity.map((item) => (
                <ActivityItem key={item.id} item={item} />
              ))}
            </div>
          </ScrollArea>
        </Section>

        <Separator />

        <Section title="Workflows" icon={Workflow} count={workflows.length}>
          <div className="space-y-3">
            {workflows.map((workflow) => (
              <div key={workflow.id} className="rounded-2xl border border-white/8 bg-white/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">{workflow.name}</div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{workflow.description}</p>
                  </div>
                  <Badge variant={workflow.status === 'active' ? 'success' : 'muted'}>{workflow.status}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <span>{workflow.stepCount} steps</span>
                  <span>{workflow.lastRunAt ? formatDateTime(workflow.lastRunAt) : 'Never run'}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Separator />

        <Section title="Tool executions" icon={Database} count={toolExecutions.length}>
          <div className="space-y-3">
            {toolExecutions.map((tool) => (
              <div key={tool.id} className="rounded-2xl border border-white/8 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">{tool.toolName}</div>
                  <Badge variant={tool.status === 'success' ? 'success' : 'muted'}>{tool.status}</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{tool.inputSummary}</p>
                <p className="mt-1 text-xs leading-5 text-slate-300">{tool.outputSummary}</p>
              </div>
            ))}
          </div>
        </Section>

        <Separator />

        <Section title="Indexed files" icon={FileText} count={indexedFiles.length}>
          <div className="space-y-3">
            {indexedFiles.map((file) => (
              <div key={file.id} className="rounded-2xl border border-white/8 bg-white/5 p-3">
                <div className="text-sm font-medium text-white">{file.name}</div>
                <div className="mt-1 break-all text-xs leading-5 text-slate-400">{file.path}</div>
              </div>
            ))}
          </div>
        </Section>

        <Separator />

        <Section title="Permissions" icon={ShieldAlert} count={permissions.length}>
          <div className="space-y-3">
            {permissions.map((permission) => (
              <div key={permission.id} className="rounded-2xl border border-white/8 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">{permission.resource}</div>
                  <Badge variant={permission.granted ? 'success' : 'danger'}>{permission.action}</Badge>
                </div>
                <div className="mt-1 text-xs text-slate-400">{permission.scope}</div>
              </div>
            ))}
          </div>
        </Section>
      </CardContent>
    </Card>
  )
}

function Section({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string
  icon: typeof Clock3
  count: number
  children: ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-cyan-200" />
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <Badge variant="muted">{count}</Badge>
      </div>
      {children}
    </div>
  )
}

function ActivityItem({ item }: { item: ActivityRecord }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-white">{item.title}</div>
        <Badge
          variant={
            item.severity === 'success'
              ? 'success'
              : item.severity === 'warning'
                ? 'warning'
                : item.severity === 'error'
                  ? 'danger'
                  : 'muted'
          }
        >
          {item.severity}
        </Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">{item.detail}</p>
      <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
        {item.source} • {formatDateTime(item.createdAt)}
      </div>
    </div>
  )
}

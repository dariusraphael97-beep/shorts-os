import type { ReactNode } from "react"

export interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: ReactNode
  actions?: ReactNode
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-8">
      {breadcrumbs && (
        <div className="mb-2 text-sm text-[var(--text-tertiary)]">
          {breadcrumbs}
        </div>
      )}
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] leading-[var(--leading-display)]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

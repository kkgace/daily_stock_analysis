import { memo } from 'react';
import type React from 'react';
import { TaskPanel } from '@/features/dashboard/components/tasks';
import { HomeStockWorkspace } from '@/features/dashboard/components/watchlist/HomeStockWorkspace';
import type { TaskInfo } from '@/types/analysis';

type HomeStockWorkspaceProps = React.ComponentProps<typeof HomeStockWorkspace>;

type HomeSidebarProps = {
  tasks: TaskInfo[];
  onOpenRunFlow: (task: TaskInfo) => void;
  isTaskPanelCollapsed: boolean;
  onTaskPanelCollapsedChange: (collapsed: boolean) => void;
  workspace: Omit<HomeStockWorkspaceProps, 'className'>;
};

/**
 * Memoized to preserve the previous `useMemo`-cached sidebar JSX semantics:
 * the workspace re-renders only when one of its inputs actually changes.
 */
export const HomeSidebar = memo(function HomeSidebar({
  tasks,
  onOpenRunFlow,
  isTaskPanelCollapsed,
  onTaskPanelCollapsedChange,
  workspace,
}: HomeSidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <TaskPanel
        tasks={tasks}
        onOpenRunFlow={onOpenRunFlow}
        collapsed={isTaskPanelCollapsed}
        onCollapsedChange={onTaskPanelCollapsedChange}
      />
      <HomeStockWorkspace
        {...workspace}
        className="flex-1"
      />
    </div>
  );
});

import { useCallback, useState } from 'react';
import {
  readTaskPanelCollapsedPreference,
  writeTaskPanelCollapsedPreference,
} from '@/features/dashboard/pages/home/homeUtils';

export function useTaskPanelCollapse(activeTaskCount: number) {
  const [isTaskPanelCollapsed, setIsTaskPanelCollapsed] = useState<boolean>(() => (
    readTaskPanelCollapsedPreference() ?? false
  ));
  const [isPreferenceSettled, setIsPreferenceSettled] = useState<boolean>(() => (
    readTaskPanelCollapsedPreference() !== null
  ));

  // One-time auto-collapse for fresh sessions: derive it during render so no
  // synchronous setState happens inside an effect.
  if (!isPreferenceSettled && activeTaskCount > 0) {
    const nextCollapsed = activeTaskCount > 1;
    setIsPreferenceSettled(true);
    setIsTaskPanelCollapsed(nextCollapsed);
    writeTaskPanelCollapsedPreference(nextCollapsed);
  }

  const handleTaskPanelCollapsedChange = useCallback((collapsed: boolean) => {
    setIsTaskPanelCollapsed(collapsed);
    setIsPreferenceSettled(true);
    writeTaskPanelCollapsedPreference(collapsed);
  }, []);

  return { isTaskPanelCollapsed, handleTaskPanelCollapsedChange };
}

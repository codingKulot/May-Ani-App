import {
  LuBookOpen, LuCloudSun, LuLayoutDashboard, LuMessageCircle, LuClipboardList, LuSettings, LuShieldCheck,
  LuSprout, LuStethoscope, LuStore, LuUsers, LuWallet, LuWheat, LuHouse, LuTractor
} from 'react-icons/lu';
import type { AppIcon } from '@/types';

/**
 * Navigation registry. To add a feature: create the page, add a route in App.tsx and add ONE entry here.
 * `tab` places it in the mobile bottom bar; everything else appears in the mobile "More" sheet and the web sidebar.
 */
export interface NavItem {
  id: string;
  label: string;
  path: string;
  /** extra path prefixes that should highlight this item */
  also?: string[];
  Icon: AppIcon;
  tab?: { label: string; Icon: AppIcon; order: number };
}

export const NAV: NavItem[] = [
  { id: 'home', label: 'Dashboard', path: '/', Icon: LuLayoutDashboard, tab: { label: 'Home', Icon: LuHouse, order: 1 } },
  { id: 'farm', label: 'My Farm', path: '/farms', Icon: LuTractor, tab: { label: 'Farm', Icon: LuSprout, order: 2 } },
  { id: 'planning', label: 'Planning', path: '/planner', also: ['/plan'], Icon: LuClipboardList },
  { id: 'health', label: 'Plant & Animal Health', path: '/health', Icon: LuStethoscope },
  { id: 'production', label: 'Production Records', path: '/manage/production', Icon: LuWheat },
  { id: 'finance', label: 'Expenses & Finance', path: '/manage/expenses', also: ['/manage/sales', '/manage/reports', '/manage/tasks'], Icon: LuWallet },
  { id: 'market', label: 'Marketplace', path: '/market', Icon: LuStore, tab: { label: 'Market', Icon: LuStore, order: 3 } },
  { id: 'community', label: 'Community', path: '/community', Icon: LuUsers, tab: { label: 'Chat', Icon: LuMessageCircle, order: 4 } },
  { id: 'permits', label: 'Permits & Compliance', path: '/permits', Icon: LuShieldCheck },
  { id: 'weather', label: 'Weather & Hazards', path: '/weather', Icon: LuCloudSun },
  { id: 'learn', label: 'Learning Center', path: '/learn', Icon: LuBookOpen },
  { id: 'settings', label: 'Settings', path: '/settings', Icon: LuSettings },
];

export function isActive(item: NavItem, path: string): boolean {
  if (item.path === '/') return path === '/';
  const prefixes = [item.path, ...(item.also ?? [])];
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/** "More" sheet on mobile: everything that is not a bottom tab. */
export const MORE_ITEMS = NAV.filter((n) => !n.tab);
export const TABS = NAV.filter((n) => n.tab).sort((a, b) => a.tab!.order - b.tab!.order);

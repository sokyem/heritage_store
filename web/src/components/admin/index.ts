// Barrel exports for the admin component set. New pages should import
// from '@/components/admin' instead of touching individual files.

export { default as AdminPageHeader } from './AdminPageHeader';
export { default as AdminCard } from './AdminCard';
export { default as AdminTable } from './AdminTable';
export { default as AdminModal } from './AdminModal';
export { default as StatusBadge } from './StatusBadge';
export { default as StatCard } from './StatCard';
export { default as AdminEmptyState } from './AdminEmptyState';
export { default as KanbanBoard } from './KanbanBoard';

// New canonical set (Phase 2 of the modernization)
export { default as Icon } from './Icon';
export { ICON_PATHS, type IconName } from './icons';
export { default as IconButton } from './IconButton';
export { default as PaginationFooter } from './PaginationFooter';
export { default as SearchToolbar } from './SearchToolbar';
export { default as SortableHeader } from './SortableHeader';
export { SkeletonBar, SkeletonRow, SkeletonStat, SkeletonBlock } from './Skeleton';
export { buildCrumbs } from './breadcrumbs';
export { AdminErrorBanner } from './AdminErrorBanner';
export { useAdminFetch, type AdminFetchState, type UseAdminFetchOptions } from './useAdminFetch';

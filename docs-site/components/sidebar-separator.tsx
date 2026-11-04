'use client';

import type { ReactNode } from 'react';

export function SidebarSeparator({ item }: { item?: { name?: ReactNode } }) {
  return <div className="ss-sidebar-label">{item?.name}</div>;
}

import { SidebarMenu } from './sidebar-menu';
import { SidebarFooter } from './sidebar-footer';
import { SidebarSearch } from './sidebar-search';

export function Sidebar() {
  return (
    <div className="flex flex-col items-stretch shrink-0 w-(--sidebar-width) border-e border-border">
      <SidebarSearch />
      <SidebarMenu />
      <SidebarFooter />
    </div>
  );
}

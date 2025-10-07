import { SidebarFooter } from './sidebar-footer';
import { SidebarContent } from './sidebar-content';

export function Sidebar() {
  return (
    <aside className="fixed top-(--header-height) start-0 bottom-0 transition-all duration-300 flex flex-col items-stretch flex-shrink-0 w-(--sidebar-width) in-data-[sidebar-open=false]:-start-full border-e border-border">
      <SidebarContent />
      <SidebarFooter />
    </aside>
  );
}

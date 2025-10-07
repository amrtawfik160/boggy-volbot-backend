import { useLayout } from './context';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { Toolbar, ToolbarActions, ToolbarDescription, ToolbarHeading, ToolbarPageTitle } from './toolbar';
import { Button } from '@/components/ui/button';

export function Wrapper({ children }: { children: React.ReactNode }) {
  const {isMobile} = useLayout();

  return (
    <>
      <Header />

      <div className="flex grow pt-(--header-height-mobile) lg:pt-(--header-height)">
        {!isMobile && <Sidebar />}
        <div className="grow lg:overflow-y-auto p-5">
          <main className="grow" role="content">
            <Toolbar>
              <ToolbarHeading>
                <ToolbarPageTitle>Team Settings</ToolbarPageTitle>
                <ToolbarDescription>Some info tells the story</ToolbarDescription>
              </ToolbarHeading>
              <ToolbarActions>
                <Button variant="outline">View Profile</Button>
              </ToolbarActions>
            </Toolbar>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

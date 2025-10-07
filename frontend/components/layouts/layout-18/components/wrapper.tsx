import { Toolbar, ToolbarActions, ToolbarDescription, ToolbarHeading, ToolbarPageTitle } from './toolbar';
import { useLayout } from './context';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { Button } from '@/components/ui/button';

export function Wrapper({ children }: { children: React.ReactNode }) {
  const {isMobile} = useLayout();

  return (
    <>
      <Header />

      <div className="flex flex-col lg:flex-row grow pt-(--header-height)">
        <div className="flex grow rounded-xl bg-background border border-input m-3.5 mt-0">
          {!isMobile && <Sidebar />}
          <div className="grow lg:overflow-y-auto p-5">
            <main className="lg:grow" role="content">
              <Toolbar>
                <ToolbarHeading>
                  <ToolbarPageTitle>Team Settings</ToolbarPageTitle>
                  <ToolbarDescription>Some info tells the story</ToolbarDescription>
                </ToolbarHeading>
                <ToolbarActions>
                  <Button variant="outline">Setup Rules</Button>
                </ToolbarActions>
              </Toolbar>
              {children}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

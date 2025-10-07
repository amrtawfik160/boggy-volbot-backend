import { useLayout } from './context';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { HeaderMenu } from './header-menu';

export function Wrapper({ children }: { children: React.ReactNode }) {
  const {isMobile} = useLayout();

  return (
    <>
      <Header />

      <div className="flex flex-col lg:flex-row grow pt-(--header-height)">
        <div className="flex grow rounded-xl bg-background border border-input m-2.5 mt-0">
          {!isMobile && <Sidebar />}
          <div className="grow overflow-y-auto p-5">
            <main className="grow" role="content">
              {isMobile && <HeaderMenu/>}

              {children}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

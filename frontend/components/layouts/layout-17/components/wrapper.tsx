import { Sidebar } from './sidebar';
import { Header } from './header';
import { Toolbar } from './toolbar';
import { useLayout } from './context';

export function Wrapper({ children }: { children: React.ReactNode }) {
  const { isMobile } = useLayout();

  return (
    <>
      <Header />

      <div className="flex grow pt-(--header-height-mobile) lg:pt-(--header-height)">
        {!isMobile && <Sidebar />}

        <div className="flex flex-col grow lg:ps-(--sidebar-width) lg:[&_.container-fluid]:px-7.5">
          <Toolbar />
          <main className="grow pb-4 lg:pb-7.5" role="content">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

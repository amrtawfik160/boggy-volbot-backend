import { useLayout } from './context';
import { Sidebar } from './sidebar';
import { Header } from './header';

export function Wrapper({ children }: { children: React.ReactNode }) {
  const {isMobile} = useLayout();

  return (
    <>
      <Header />

      <div className="flex grow pt-(--header-height-mobile) lg:pt-(--header-height)">
        {!isMobile && <Sidebar />}
        <main className="lg:ps-(--sidebar-width) lg:in-data-[sidebar-open=false]:ps-0 transition-all duration-300 grow" role="content">
          {children}
        </main>
      </div>
    </>
  );
}

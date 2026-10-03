import { Footer } from '@/components/Footer';
import { MediSenseLanding } from '@/components/MediSenseLanding';
import { SiteHeader } from '@/components/SiteHeader';

export default function HomePage() {
  return (
    <div className="site-shell">
      <div className="site-ambient" aria-hidden="true">
        <span className="ambient-light ambient-light-one" />
        <span className="ambient-light ambient-light-two" />
        <span className="ambient-grid" />
      </div>
      <SiteHeader />
      <MediSenseLanding />
      <Footer />
    </div>
  );
}
